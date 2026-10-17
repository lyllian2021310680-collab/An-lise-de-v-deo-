"""Processos em segundo plano: compilação de vídeo no servidor (ffmpeg) e detecção de ralis com IA (Gemini)."""
import asyncio
import json
import logging
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import imageio_ffmpeg
from fastapi import APIRouter, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from emergentintegrations.llm.chat import LlmChat, UserMessage, FileContentWithMimeType

logger = logging.getLogger("video_jobs")
router = APIRouter(prefix="/api")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1280, 720
DETECT_CHUNK, DETECT_OVERLAP = 300, 15
GEMINI_MODEL = "gemini-3.1-pro-preview"
_deps: Dict[str, Any] = {}
_sem = asyncio.Semaphore(1)


def configure(**deps):
    _deps.update(deps)


def _db():
    return _deps["db"]


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def source_path(video: dict) -> Optional[str]:
    return (video.get("source_type") != "youtube" and video.get("storage_path")) or video.get("original_storage_path")


def action_range(a: dict, duration: Optional[float] = None):
    start = a["clip_start"] if a.get("clip_start") is not None else a.get("timestamp", 0) - (a.get("clip_before") if a.get("clip_before") is not None else 5)
    end = a["clip_end"] if a.get("clip_end") is not None else a.get("timestamp", 0) + (a.get("clip_after") if a.get("clip_after") is not None else 4)
    return max(0.0, float(start)), min(float(duration or 1e9), float(end))


def is_highlight(a: dict) -> bool:
    if a.get("team") == "adv":
        return False
    f = (a.get("fundamento_name") or "").lower()
    c = (a.get("classificacao_label") or "").lower()
    point = "ponto" in c or (a.get("result") or "").lower() == "ponto nosso"
    if "ataque" in f or "bloqueio" in f:
        return point
    if "saque" in f:
        return point or "ace" in c
    return False


# ----------------- Jobs -----------------
async def _new_job(kind: str, title: str, meta: dict) -> dict:
    job = {"id": str(uuid.uuid4()), "kind": kind, "title": title, "status": "queued", "progress": 0.0,
           "message": "Na fila", "results": [], "read": False, "meta": meta, "created_at": now_iso(), "updated_at": now_iso()}
    await _db().jobs.insert_one(dict(job))
    return job


async def _set(job_id: str, **fields):
    fields["updated_at"] = now_iso()
    await _db().jobs.update_one({"id": job_id}, {"$set": fields})


def _launch(job_id: str, coro_fn):
    async def runner():
        async with _sem:
            await _set(job_id, status="running", message="Processando…")
            try:
                await coro_fn(job_id)
            except Exception as e:  # noqa: BLE001
                logger.exception("job %s failed", job_id)
                await _set(job_id, status="error", message=str(e)[:300] or "Falha no processamento", read=False)
    asyncio.create_task(runner())


async def mark_interrupted():
    await _db().jobs.update_many({"status": {"$in": ["queued", "running"]}},
                                 {"$set": {"status": "error", "message": "Interrompido (servidor reiniciado). Gere novamente.", "read": False}})


@router.get("/jobs")
async def list_jobs(limit: int = 30):
    return await _db().jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@router.post("/jobs/read-all")
async def read_all_jobs():
    await _db().jobs.update_many({"status": {"$in": ["done", "error"]}}, {"$set": {"read": True}})
    return {"ok": True}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    await _db().jobs.delete_one({"id": job_id})
    return {"ok": True}


# ----------------- ffmpeg helpers -----------------
async def _run(args: List[str]) -> str:
    proc = await asyncio.create_subprocess_exec(FFMPEG, "-hide_banner", "-y", *args,
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError("Falha no processamento do vídeo (ffmpeg): " + err.decode(errors="ignore")[-300:])
    return err.decode(errors="ignore")


async def _probe(path: Path):
    proc = await asyncio.create_subprocess_exec(FFMPEG, "-hide_banner", "-i", str(path), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    _, err = await proc.communicate()
    txt = err.decode(errors="ignore")
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", txt)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None
    return dur, "Audio:" in txt


async def _download(storage_path: str, dest: Path) -> Path:
    data, _ = await asyncio.to_thread(_deps["get_object"], storage_path)
    dest.write_bytes(data)
    return dest


def _font(size):
    return ImageFont.load_default(size=size)


def _caption_png(text: str, out: Path):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fs = 28
    f = _font(fs)
    tw = d.textlength(text, font=f)
    x0, y1 = 20, H - 24
    y0 = y1 - fs - 20
    d.rectangle([x0, y0, x0 + tw + 40, y1], fill=(0, 0, 0, 170))
    d.rectangle([x0, y0, x0 + 8, y1], fill=(229, 9, 20, 255))
    d.text((x0 + 24, y0 + 8), text, font=f, fill=(255, 255, 255, 255))
    im.save(out)


def _title_png(title: str, subtitle: str, out: Path):
    im = Image.new("RGB", (W, H), (10, 10, 11))
    d = ImageDraw.Draw(im)
    d.rectangle([100, 290, 116, 420], fill=(229, 9, 20))
    d.text((140, 285), title, font=_font(72), fill=(255, 255, 255))
    d.text((142, 380), subtitle, font=_font(30), fill=(190, 190, 190))
    im.save(out)


VCODEC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30",
          "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]
FIT = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30"


async def _encode_segment(src: Path, has_audio: bool, start: float, end: float, caption: str, tmp: Path, idx: int) -> Path:
    cap = tmp / f"cap_{idx}.png"
    _caption_png(caption, cap)
    out = tmp / f"seg_{idx}.mp4"
    dur = max(0.2, end - start)
    args = ["-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", str(src)]
    if not has_audio:
        args += ["-f", "lavfi", "-t", f"{dur:.3f}", "-i", "anullsrc=r=44100:cl=stereo"]
    cap_idx = 1 if has_audio else 2
    args += ["-i", str(cap), "-filter_complex", f"[0:v]{FIT}[b];[b][{cap_idx}:v]overlay=0:0[v]",
             "-map", "[v]", "-map", "0:a:0" if has_audio else "1:a", *VCODEC, "-t", f"{dur:.3f}", str(out)]
    await _run(args)
    return out


async def _encode_title(title: str, subtitle: str, tmp: Path, idx: int) -> Path:
    png = tmp / f"title_{idx}.png"
    _title_png(title, subtitle, png)
    out = tmp / f"title_{idx}.mp4"
    await _run(["-loop", "1", "-t", "2", "-i", str(png), "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=44100:cl=stereo",
                "-vf", FIT, "-map", "0:v", "-map", "1:a", *VCODEC, "-shortest", str(out)])
    return out


async def _concat(parts: List[Path], out: Path):
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    await _run(["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", "-movflags", "+faststart", str(out)])


async def _store(path: Path, name: str) -> dict:
    sp = f"{_deps['app_name']}/compilacoes/{uuid.uuid4()}.mp4"
    res = await asyncio.to_thread(_deps["put_object"], sp, path.read_bytes(), "video/mp4")
    await _db().files.insert_one({"id": str(uuid.uuid4()), "storage_path": res["path"], "original_filename": name,
                                  "content_type": "video/mp4", "size": res.get("size"), "is_deleted": False, "created_at": now_iso()})
    return {"name": name, "storage_path": res["path"], "size": res.get("size")}


# ----------------- Compilação no servidor -----------------
class CompilationIn(BaseModel):
    action_ids: List[str]
    who: str = "Equipe"
    split: str = "one"  # one | fund
    title: Optional[str] = None


def _slug(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFD", t or "video").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-zA-Z0-9]+", "-", t).strip("-").lower() or "video"


async def _plan(action_ids: List[str]):
    acts = await _db().actions.find({"id": {"$in": action_ids}}, {"_id": 0}).to_list(5000)
    vids = {v["id"]: v for v in await _db().videos.find({"id": {"$in": list({a["video_id"] for a in acts})}}, {"_id": 0}).to_list(500)}
    aths = {a["id"]: a["name"] for a in await _db().athletes.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(2000)}
    usable = [a for a in acts if vids.get(a["video_id"]) and source_path(vids[a["video_id"]])]
    usable.sort(key=lambda a: (vids[a["video_id"]].get("match_date") or "", a["video_id"], a.get("timestamp", 0)))
    return usable, vids, aths, len(acts) - len(usable)


async def _compile_job(job_id: str):
    job = await _db().jobs.find_one({"id": job_id}, {"_id": 0})
    meta = job["meta"]
    acts, vids, aths, skipped = await _plan(meta["action_ids"])
    if not acts:
        raise RuntimeError("Nenhum lance com arquivo de vídeo disponível (vídeos do YouTube precisam do arquivo original anexado)")
    groups: Dict[str, list] = {}
    for a in acts:
        groups.setdefault(a.get("fundamento_name") or "Lance", []).append(a)
    tmp = Path(tempfile.mkdtemp(prefix="ava-comp-"))
    try:
        sources: Dict[str, tuple] = {}
        total, done = len(acts), 0
        files: Dict[str, List[Path]] = {}
        idx = 0
        for gname, lst in groups.items():
            parts = [await _encode_title(gname, f"{meta['who']} · {len(lst)} lance(s)", tmp, idx)]
            for a in lst:
                v = vids[a["video_id"]]
                sp = source_path(v)
                if sp not in sources:
                    await _set(job_id, message=f"Baixando vídeo: {v.get('title')}")
                    p = await _download(sp, tmp / f"src_{len(sources)}.bin")
                    sources[sp] = (p, *(await _probe(p)))
                src, dur, has_audio = sources[sp]
                start, end = action_range(a, dur)
                names = ", ".join(aths[i] for i in a.get("athlete_ids", []) if i in aths)
                caption = " · ".join(x for x in [a.get("fundamento_name"), a.get("classificacao_label"), names,
                                                 f"x {v['opponent']}" if v.get("opponent") else None] if x)
                idx += 1
                parts.append(await _encode_segment(src, has_audio, start, end, caption, tmp, idx))
                done += 1
                await _set(job_id, progress=round(done / total * 0.9, 3), message=f"Montando trecho {done}/{total}")
            files[gname] = parts
        await _set(job_id, message="Finalizando e salvando…")
        base = _slug(meta.get("title") or f"compilacao-{meta['who']}")
        results = []
        if meta["split"] == "fund":
            for gname, parts in files.items():
                out = tmp / f"out_{_slug(gname)}.mp4"
                await _concat(parts, out)
                results.append(await _store(out, f"{base}-{_slug(gname)}.mp4"))
        else:
            out = tmp / "out.mp4"
            await _concat([p for ps in files.values() for p in ps], out)
            results.append(await _store(out, f"{base}.mp4"))
        msg = f"{total} lance(s) compilado(s)" + (f" · {skipped} sem arquivo de vídeo ficaram de fora" if skipped else "")
        await _set(job_id, status="done", progress=1.0, results=results, message=msg, read=False)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.post("/compilations")
async def create_compilation(body: CompilationIn):
    if not body.action_ids:
        raise HTTPException(400, "Selecione ao menos um lance")
    if body.split not in ("one", "fund"):
        raise HTTPException(400, "split inválido (one/fund)")
    acts, _, _, skipped = await _plan(body.action_ids)
    if not acts:
        raise HTTPException(400, "Nenhum lance com arquivo de vídeo disponível (anexe o arquivo original dos vídeos do YouTube)")
    title = body.title or f"Compilação — {body.who}"
    job = await _new_job("compilation", title, {**body.model_dump(), "skipped": skipped})
    _launch(job["id"], _compile_job)
    return job


@router.post("/highlights/all-athletes")
async def highlights_all_athletes():
    acts = [a for a in await _db().actions.find({}, {"_id": 0}).to_list(20000) if is_highlight(a)]
    athletes = await _db().athletes.find({"active": {"$ne": False}}, {"_id": 0}).to_list(2000)
    jobs = []
    for ath in athletes:
        ids = [a["id"] for a in acts if ath["id"] in (a.get("athlete_ids") or [])]
        if not ids or not (await _plan(ids))[0]:
            continue
        job = await _new_job("compilation", f"Melhores momentos — {ath['name']}",
                             {"action_ids": ids, "who": ath["name"], "split": "one", "title": f"melhores-momentos-{ath['name']}"})
        _launch(job["id"], _compile_job)
        jobs.append(job)
    if not jobs:
        raise HTTPException(400, "Nenhum atleta tem ataques ponto, bloqueios ponto ou aces com arquivo de vídeo disponível")
    return {"created": len(jobs), "jobs": jobs}


# ----------------- Detecção de ralis com IA -----------------
class DetectIn(BaseModel):
    uniform_color: Optional[str] = None
    notes: Optional[str] = None


DETECT_SYSTEM = (
    "Você é um analista de vídeo de voleibol. Assista ao trecho (imagem e áudio) e identifique CADA rali: "
    "o rali começa no momento do saque e termina quando a bola morre (toca o chão, sai, falta marcada/apito). "
    "Combine movimentação da bola, dos atletas, apito e reorganização das equipes — não dependa só do apito. "
    "Responda SOMENTE com JSON válido, sem texto extra."
)


def _parse_json(txt: str):
    m = re.search(r"\[.*\]", txt, re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(0))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


async def _detect_job(job_id: str):
    job = await _db().jobs.find_one({"id": job_id}, {"_id": 0})
    meta = job["meta"]
    video = await _db().videos.find_one({"id": meta["video_id"]}, {"_id": 0})
    home, away = video.get("equipe_name") or video.get("team") or "AVA", video.get("opponent") or "Adversário"
    tmp = Path(tempfile.mkdtemp(prefix="ava-det-"))
    try:
        await _set(job_id, message="Baixando o vídeo…")
        src = await _download(source_path(video), tmp / "src.bin")
        dur, has_audio = await _probe(src)
        if not dur:
            raise RuntimeError("Não foi possível ler a duração do vídeo")
        starts = list(range(0, int(dur), DETECT_CHUNK - DETECT_OVERLAP)) or [0]
        starts = [s for s in starts if s < dur - 5] or [0]
        found: List[dict] = []
        for i, off in enumerate(starts):
            await _set(job_id, progress=round(i / len(starts) * 0.95, 3), message=f"IA analisando trecho {i + 1}/{len(starts)}")
            chunk = tmp / f"chunk_{i}.mp4"
            await _run(["-ss", str(off), "-t", str(DETECT_CHUNK), "-i", str(src), "-vf", "scale=-2:360,fps=5",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", *(["-c:a", "aac", "-b:a", "48k", "-ac", "1"] if has_audio else ["-an"]), str(chunk)])
            prompt = (
                f"Partida: {home} (equipe analisada, chamada 'nos') x {away} (chamada 'adv'). "
                + (f"Uniforme da equipe analisada: {meta['uniform_color']}. " if meta.get("uniform_color") else "")
                + (f"Observações do treinador: {meta['notes']}. " if meta.get("notes") else "")
                + "Liste todos os ralis deste trecho em ordem. Tempos em SEGUNDOS desde o início DESTE trecho. "
                + 'Formato: [{"start": 12.5, "end": 21.0, "winner": "nos"|"adv"|"incerto", "serving_team": "nos"|"adv"|"incerto", '
                + '"confidence": 0.0-1.0, "reason": "como o rali terminou, em português"}]. '
                + "Use 'incerto' e confiança baixa quando não tiver segurança. Ignore ralis cortados no início do trecho. "
                + "Se não houver ralis, responda []."
            )
            chat = LlmChat(api_key=_deps["emergent_key"], session_id=f"detect-{job_id}-{i}", system_message=DETECT_SYSTEM).with_model("gemini", GEMINI_MODEL)
            resp = await chat.send_message(UserMessage(text=prompt, file_contents=[FileContentWithMimeType(file_path=str(chunk), mime_type="video/mp4")]))
            for r in _parse_json(resp):
                try:
                    s, e = float(r["start"]) + off, float(r["end"]) + off
                except (KeyError, TypeError, ValueError):
                    continue
                if e <= s or s >= dur:
                    continue
                found.append({"start_ts": round(s, 1), "end_ts": round(min(e, dur), 1),
                              "winner_guess": r.get("winner") if r.get("winner") in ("nos", "adv") else "incerto",
                              "serving_team": r.get("serving_team") if r.get("serving_team") in ("nos", "adv") else None,
                              "confidence": max(0.0, min(1.0, float(r.get("confidence") or 0))), "reason": str(r.get("reason") or "")[:300]})
            chunk.unlink(missing_ok=True)
        found.sort(key=lambda x: x["start_ts"])
        merged: List[dict] = []
        for r in found:  # remove duplicados da sobreposição entre trechos
            if merged and r["start_ts"] < merged[-1]["end_ts"] - 1:
                if r["confidence"] > merged[-1]["confidence"]:
                    merged[-1] = r
                continue
            merged.append(r)
        existing = await _db().rallies.find({"video_id": video["id"], "number": {"$ne": None}}, {"_id": 0, "start_ts": 1, "end_ts": 1}).to_list(3000)
        await _db().rally_suggestions.delete_many({"video_id": video["id"], "status": "pending"})
        for r in merged:
            overlap = any(x.get("start_ts") is not None and x.get("end_ts") is not None and x["start_ts"] < r["end_ts"] and x["end_ts"] > r["start_ts"] for x in existing)
            await _db().rally_suggestions.insert_one({"id": str(uuid.uuid4()), "video_id": video["id"], "job_id": job_id, **r,
                                                      "overlaps_existing": overlap, "status": "pending", "created_at": now_iso()})
        low = sum(1 for r in merged if r["confidence"] < 0.6 or r["winner_guess"] == "incerto")
        await _set(job_id, status="done", progress=1.0, read=False, results=[],
                   message=f"{len(merged)} rali(s) sugerido(s) · {low} com baixa confiança para revisar")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.post("/videos/{video_id}/detect-rallies")
async def detect_rallies(video_id: str, body: DetectIn):
    video = await _db().videos.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(404, "Vídeo não encontrado")
    if not source_path(video):
        raise HTTPException(400, "A IA precisa do arquivo do vídeo. Para partidas do YouTube, anexe o arquivo original.")
    running = await _db().jobs.find_one({"kind": "detect", "meta.video_id": video_id, "status": {"$in": ["queued", "running"]}}, {"_id": 0})
    if running:
        return running
    job = await _new_job("detect", f"Ralis automáticos — {video.get('title')}", {"video_id": video_id, **body.model_dump()})
    _launch(job["id"], _detect_job)
    return job


@router.get("/videos/{video_id}/rally-suggestions")
async def list_suggestions(video_id: str, status: str = "pending"):
    return await _db().rally_suggestions.find({"video_id": video_id, "status": status}, {"_id": 0}).sort("start_ts", 1).to_list(3000)
