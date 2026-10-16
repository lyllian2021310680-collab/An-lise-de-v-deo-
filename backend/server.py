from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query, Header, Response, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import logging
import requests
from emergentintegrations.llm.chat import LlmChat, UserMessage
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ----------------- Object Storage -----------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "ava-volei"
storage_key = None

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ----------------- App -----------------
app = FastAPI()
api_router = APIRouter(prefix="/api")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def new_id():
    return str(uuid.uuid4())


def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


# ----------------- Models -----------------
class PositionIn(BaseModel):
    name: str
    order: int = 0
    active: bool = True


class FundamentoIn(BaseModel):
    name: str
    color: str = "#E50914"
    shortcut: Optional[str] = None
    order: int = 0
    active: bool = True
    archived: bool = False
    uses_court: bool = True


class ClassificacaoIn(BaseModel):
    fundamento_id: str
    label: str
    symbol: Optional[str] = None
    color: str = "#10B981"
    order: int = 0
    active: bool = True
    archived: bool = False


class FormationIn(BaseModel):
    name: str
    order: int = 0
    active: bool = True


class AthleteIn(BaseModel):
    name: str
    number: Optional[str] = None
    team: Optional[str] = None
    category: Optional[str] = None
    position_id: Optional[str] = None
    position_name: Optional[str] = None
    photo_url: Optional[str] = None
    notes: Optional[str] = None
    active: bool = True
    external_id: Optional[str] = None  # reservado p/ casar com o atleta do site principal (futuro)


class VideoIn(BaseModel):
    title: str
    opponent: Optional[str] = None
    team: Optional[str] = "AVA"
    category: Optional[str] = None
    match_date: Optional[str] = None
    source_type: str = "youtube"  # youtube | upload
    youtube_id: Optional[str] = None
    storage_path: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    status: str = "pendente"  # pendente | em_analise | concluido
    competition: Optional[str] = None
    equipe_id: Optional[str] = None
    equipe_name: Optional[str] = None
    categoria_id: Optional[str] = None
    categoria_name: Optional[str] = None
    season: Optional[str] = None       # temporada (ex: 2026)
    comp_phase: Optional[str] = None   # fase da competição (ex: Fase de grupos, Semifinal)
    analysis_model: Optional[str] = "B"  # A (K1-K2) | B (K0-K5)


class ActionIn(BaseModel):
    video_id: str
    timestamp: float
    fundamento_id: Optional[str] = None
    fundamento_name: Optional[str] = None
    classificacao_id: Optional[str] = None
    classificacao_label: Optional[str] = None
    athlete_ids: List[str] = []
    tactical_position: Optional[str] = None
    note: Optional[str] = None
    clip_before: float = 10.0
    clip_after: float = 10.0
    annotations: List[Dict[str, Any]] = []
    rally_id: Optional[str] = None
    phase: Optional[str] = None  # situação tática / fase K (K0..K5)
    team: Optional[str] = None   # nos | adv (equipe responsável pela ação)
    set_number: Optional[int] = None
    formation: Optional[str] = None  # rotação/formação (ex: P1)
    result: Optional[str] = None  # resultado da jogada (ponto/erro/continuidade)
    court: Optional[Dict[str, Any]] = None  # {zone, point:{x,y}, arrow:{x1,y1,x2,y2}, kind}
    clip_start: Optional[float] = None  # recorte manual (segundos)
    clip_end: Optional[float] = None
    pending_export: bool = False  # metadados: edição que exige download do arquivo original


class SavedFilterIn(BaseModel):
    name: str
    criteria: Dict[str, Any] = {}


class SettingsIn(BaseModel):
    default_clip_before: float = 10.0
    default_clip_after: float = 10.0


# ----------------- Generic CRUD helpers -----------------
async def insert(coll, payload: dict):
    payload["id"] = new_id()
    payload["created_at"] = now_iso()
    payload["updated_at"] = now_iso()
    await db[coll].insert_one(dict(payload))
    return clean(await db[coll].find_one({"id": payload["id"]}, {"_id": 0}))


async def update(coll, item_id: str, payload: dict):
    payload["updated_at"] = now_iso()
    res = await db[coll].update_one({"id": item_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, f"{coll} not found")
    return clean(await db[coll].find_one({"id": item_id}, {"_id": 0}))


# ----------------- Positions -----------------
@api_router.get("/positions")
async def list_positions():
    return await db.positions.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@api_router.post("/positions")
async def create_position(body: PositionIn):
    return await insert("positions", body.model_dump())


@api_router.put("/positions/{item_id}")
async def update_position(item_id: str, body: PositionIn):
    return await update("positions", item_id, body.model_dump())


@api_router.delete("/positions/{item_id}")
async def delete_position(item_id: str):
    await db.positions.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


# ----------------- Formations -----------------
@api_router.get("/formations")
async def list_formations():
    return await db.formations.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@api_router.post("/formations")
async def create_formation(body: FormationIn):
    return await insert("formations", body.model_dump())


@api_router.put("/formations/{item_id}")
async def update_formation(item_id: str, body: FormationIn):
    return await update("formations", item_id, body.model_dump())


@api_router.delete("/formations/{item_id}")
async def delete_formation(item_id: str):
    await db.formations.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


# ----------------- Fundamentos & Classificacoes -----------------
@api_router.get("/fundamentos")
async def list_fundamentos():
    return await db.fundamentos.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@api_router.post("/fundamentos")
async def create_fundamento(body: FundamentoIn):
    return await insert("fundamentos", body.model_dump())


@api_router.put("/fundamentos/{item_id}")
async def update_fundamento(item_id: str, body: FundamentoIn):
    return await update("fundamentos", item_id, body.model_dump())


@api_router.delete("/fundamentos/{item_id}")
async def delete_fundamento(item_id: str):
    await db.fundamentos.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


@api_router.patch("/fundamentos/{item_id}/archive")
async def archive_fundamento(item_id: str, archived: bool = Query(True)):
    return await update("fundamentos", item_id, {"archived": archived})


@api_router.get("/classificacoes")
async def list_classificacoes(fundamento_id: Optional[str] = None):
    q = {"fundamento_id": fundamento_id} if fundamento_id else {}
    return await db.classificacoes.find(q, {"_id": 0}).sort("order", 1).to_list(1000)


@api_router.post("/classificacoes")
async def create_classificacao(body: ClassificacaoIn):
    return await insert("classificacoes", body.model_dump())


@api_router.put("/classificacoes/{item_id}")
async def update_classificacao(item_id: str, body: ClassificacaoIn):
    return await update("classificacoes", item_id, body.model_dump())


@api_router.delete("/classificacoes/{item_id}")
async def delete_classificacao(item_id: str):
    await db.classificacoes.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


@api_router.patch("/classificacoes/{item_id}/archive")
async def archive_classificacao(item_id: str, archived: bool = Query(True)):
    return await update("classificacoes", item_id, {"archived": archived})


# ----------------- Athletes -----------------
@api_router.get("/athletes")
async def list_athletes():
    return await db.athletes.find({}, {"_id": 0}).sort("number", 1).to_list(1000)


@api_router.get("/athletes/{item_id}")
async def get_athlete(item_id: str):
    a = await db.athletes.find_one({"id": item_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Atleta não encontrado")
    return a


@api_router.post("/athletes")
async def create_athlete(body: AthleteIn):
    return await insert("athletes", body.model_dump())


@api_router.put("/athletes/{item_id}")
async def update_athlete(item_id: str, body: AthleteIn):
    return await update("athletes", item_id, body.model_dump())


@api_router.delete("/athletes/{item_id}")
async def delete_athlete(item_id: str):
    await db.athletes.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


# ----------------- Videos -----------------
@api_router.get("/videos")
async def list_videos():
    vids = await db.videos.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for v in vids:
        v["tag_count"] = await db.actions.count_documents({"video_id": v["id"]})
    return vids


@api_router.get("/videos/{item_id}")
async def get_video(item_id: str):
    v = await db.videos.find_one({"id": item_id}, {"_id": 0})
    if not v:
        raise HTTPException(404, "Vídeo não encontrado")
    v["tag_count"] = await db.actions.count_documents({"video_id": v["id"]})
    return v


@api_router.post("/videos")
async def create_video(body: VideoIn):
    data = body.model_dump()
    if data["source_type"] == "youtube" and data.get("youtube_id") and not data.get("thumbnail_url"):
        data["thumbnail_url"] = f"https://img.youtube.com/vi/{data['youtube_id']}/hqdefault.jpg"
    data["is_deleted"] = False
    return await insert("videos", data)


@api_router.put("/videos/{item_id}")
async def update_video(item_id: str, body: VideoIn):
    v = await update("videos", item_id, body.model_dump())
    # propagate match context to every action of this video (keeps stats consistent)
    await db.actions.update_many({"video_id": item_id}, {"$set": {
        "categoria_id": v.get("categoria_id"), "categoria_name": v.get("categoria_name") or v.get("category"),
        "equipe_id": v.get("equipe_id"), "equipe_name": v.get("equipe_name") or v.get("team"),
        "competition": v.get("competition"), "season": v.get("season"),
        "comp_phase": v.get("comp_phase"), "match_date": v.get("match_date"),
    }})
    return v


@api_router.patch("/videos/{item_id}/status")
async def set_video_status(item_id: str, status: str = Query(...)):
    return await update("videos", item_id, {"status": status})


@api_router.delete("/videos/{item_id}")
async def delete_video(item_id: str):
    await db.videos.update_one({"id": item_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ----------------- Upload / Files -----------------
@api_router.post("/upload")
async def upload(file: UploadFile = File(...), kind: str = Form("video")):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/{kind}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    ctype = file.content_type or "application/octet-stream"
    result = put_object(path, data, ctype)
    await db.files.insert_one({
        "id": new_id(),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ctype,
        "size": result.get("size"),
        "is_deleted": False,
        "created_at": now_iso(),
    })
    return {"storage_path": result["path"], "content_type": ctype, "size": result.get("size")}


@api_router.get("/files/{path:path}")
async def download(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    data, content_type = get_object(path)
    media = record.get("content_type", content_type) if record else content_type
    return Response(content=data, media_type=media, headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"})


# ----------------- Actions (lances) -----------------
@api_router.get("/actions")
async def list_actions(
    video_id: Optional[str] = None,
    athlete_id: Optional[str] = None,
    fundamento_id: Optional[str] = None,
    classificacao_id: Optional[str] = None,
    phase: Optional[str] = None,
    categoria: Optional[str] = None,
    equipe: Optional[str] = None,
    formation: Optional[str] = None,
    competition: Optional[str] = None,
    season: Optional[str] = None,
    comp_phase: Optional[str] = None,
):
    q: Dict[str, Any] = {}
    if video_id:
        q["video_id"] = video_id
    if athlete_id:
        q["athlete_ids"] = athlete_id
    if fundamento_id:
        q["fundamento_id"] = fundamento_id
    if classificacao_id:
        q["classificacao_id"] = classificacao_id
    if phase:
        q["phase"] = phase
    if categoria:
        q["categoria_name"] = categoria
    if equipe:
        q["equipe_name"] = equipe
    if formation:
        q["formation"] = formation
    if competition:
        q["competition"] = competition
    if season:
        q["season"] = season
    if comp_phase:
        q["comp_phase"] = comp_phase
    return await db.actions.find(q, {"_id": 0}).sort("timestamp", 1).to_list(5000)


async def _attach_video_meta(data: dict) -> dict:
    v = await db.videos.find_one({"id": data.get("video_id")}, {"_id": 0})
    if v:
        data["categoria_id"] = v.get("categoria_id")
        data["categoria_name"] = v.get("categoria_name") or v.get("category")
        data["equipe_id"] = v.get("equipe_id")
        data["equipe_name"] = v.get("equipe_name") or v.get("team")
        data["competition"] = v.get("competition")
        data["season"] = v.get("season")
        data["comp_phase"] = v.get("comp_phase")
        data["match_date"] = v.get("match_date")
    return data


@api_router.post("/actions")
async def create_action(body: ActionIn):
    data = await _attach_video_meta(body.model_dump())
    res = await insert("actions", data)
    await db.videos.update_one(
        {"id": body.video_id, "status": "pendente"},
        {"$set": {"status": "em_analise"}},
    )
    return res


@api_router.put("/actions/{item_id}")
async def update_action(item_id: str, body: ActionIn):
    data = await _attach_video_meta(body.model_dump())
    return await update("actions", item_id, data)


@api_router.patch("/actions/{item_id}/annotations")
async def update_annotations(item_id: str, payload: Dict[str, Any]):
    return await update("actions", item_id, {"annotations": payload.get("annotations", [])})


@api_router.delete("/actions/{item_id}")
async def delete_action(item_id: str):
    await db.actions.delete_one({"id": item_id})
    return {"ok": True}


# ----------------- Rallies (sequências / jogadas) -----------------
@api_router.get("/rallies")
async def list_rallies(video_id: Optional[str] = None):
    q = {"video_id": video_id} if video_id else {}
    return await db.rallies.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)


@api_router.post("/rallies/link")
async def link_rally(payload: Dict[str, Any]):
    action_ids = payload.get("action_ids", [])
    situation = payload.get("situation")
    label = payload.get("label")
    video_id = payload.get("video_id")
    if len(action_ids) < 1:
        raise HTTPException(400, "Selecione ações para relacionar")
    rally = await insert("rallies", {"video_id": video_id, "situation": situation, "label": label, "action_ids": action_ids})
    set_fields = {"rally_id": rally["id"]}
    if situation:
        set_fields["phase"] = situation
    await db.actions.update_many({"id": {"$in": action_ids}}, {"$set": set_fields})
    return rally


@api_router.delete("/rallies/{item_id}")
async def delete_rally(item_id: str):
    await db.actions.update_many({"rally_id": item_id}, {"$set": {"rally_id": None}})
    await db.rallies.delete_one({"id": item_id})
    return {"ok": True}


# ----------------- Análise tática: modelos K, rallies, placar -----------------
class KPhaseIn(BaseModel):
    model: str                  # A (K1-K2) | B (K0-K5)
    key: str                    # K0..K5
    name: str
    description: Optional[str] = None
    order: int = 0
    active: bool = True


class PhaseSuggestIn(BaseModel):
    model: str = "B"
    fundamento_name: Optional[str] = None
    team: Optional[str] = None            # nos | adv
    serving_team: Optional[str] = None    # nos | adv
    prior: List[Dict[str, Any]] = []      # ações anteriores do rally atual


@api_router.get("/kphases")
async def list_kphases(model: Optional[str] = None):
    q = {"model": model} if model else {}
    return await db.kphases.find(q, {"_id": 0}).sort("order", 1).to_list(200)


@api_router.post("/kphases")
async def create_kphase(body: KPhaseIn):
    return await insert("kphases", body.model_dump())


@api_router.put("/kphases/{item_id}")
async def update_kphase(item_id: str, body: KPhaseIn):
    return await update("kphases", item_id, body.model_dump())


@api_router.delete("/kphases/{item_id}")
async def delete_kphase(item_id: str):
    await db.kphases.delete_one({"id": item_id})
    return {"ok": True}


def _suggest_phase(model, fundamento, team, serving_team, prior):
    f = (fundamento or "").lower()
    model = (model or "B").upper()
    receiving = (team and serving_team and team != serving_team)
    prior = prior or []
    n_attacks = sum(1 for a in prior if "ataque" in (a.get("fundamento_name") or "").lower() or "contra" in (a.get("fundamento_name") or "").lower())
    had_block = any("bloqueio" in (a.get("fundamento_name") or "").lower() for a in prior)
    if model == "A":
        if "saque" in f:
            return "K2"
        if team and serving_team:
            return "K2" if team == serving_team else "K1"
        return "K1"
    # Modelo B (K0-K5)
    if "saque" in f:
        return "K0"
    if "cobertura" in f or (had_block and "continuidade" in f):
        return "K4"
    if "bola de graça" in f or "bola de graca" in f:
        return "K5"
    if receiving:
        if n_attacks == 0 and ("recep" in f or "levant" in f or "ataque" in f):
            return "K1"
        if "defesa" in f or "contra" in f or "ataque" in f:
            return "K3"
        return "K3"
    else:  # equipe que sacou / lado do saque
        if "bloqueio" in f or "defesa" in f:
            return "K2"
        if "contra" in f or "ataque" in f:
            return "K3"
        return "K2"


@api_router.post("/suggest-phase")
async def suggest_phase(body: PhaseSuggestIn):
    return {"phase": _suggest_phase(body.model, body.fundamento_name, body.team, body.serving_team, body.prior)}


async def recalc_scores(video_id: str):
    rallies = await db.rallies.find({"video_id": video_id}, {"_id": 0}).sort("number", 1).to_list(3000)
    running: Dict[int, Dict[str, int]] = {}
    for r in rallies:
        if r.get("number") is None:
            continue
        s = r.get("set_number") or 1
        cur = running.setdefault(s, {"nos": 0, "adv": 0})
        before = dict(cur)
        w = r.get("winner")
        if w == "nos":
            cur["nos"] += 1
        elif w == "adv":
            cur["adv"] += 1
        await db.rallies.update_one({"id": r["id"]}, {"$set": {"score_before": before, "score_after": dict(cur)}})


@api_router.post("/rallies/close-point")
async def close_point(payload: Dict[str, Any]):
    video_id = payload.get("video_id")
    winner = payload.get("winner")            # nos | adv
    set_number = payload.get("set_number") or 1
    serving_team = payload.get("serving_team")
    if not video_id or winner not in ("nos", "adv"):
        raise HTTPException(400, "Informe video_id e o vencedor (nos/adv)")
    open_actions = await db.actions.find({"video_id": video_id, "rally_id": None, "detached": {"$ne": True}}, {"_id": 0}).sort("timestamp", 1).to_list(3000)
    last = await db.rallies.find_one({"video_id": video_id, "number": {"$ne": None}}, {"_id": 0}, sort=[("number", -1)])
    number = (last.get("number", 0) if last else 0) + 1
    ts = [a.get("timestamp", 0) for a in open_actions]
    rally = await insert("rallies", {
        "video_id": video_id, "number": number, "set_number": int(set_number), "winner": winner,
        "serving_team": serving_team, "start_ts": min(ts) if ts else None, "end_ts": max(ts) if ts else None,
        "action_ids": [a["id"] for a in open_actions], "situation": None, "label": f"Rally {number}",
    })
    if open_actions:
        await db.actions.update_many({"id": {"$in": [a["id"] for a in open_actions]}}, {"$set": {"rally_id": rally["id"]}})
    await recalc_scores(video_id)
    return await db.rallies.find_one({"id": rally["id"]}, {"_id": 0})


@api_router.put("/rallies/{item_id}/winner")
async def set_rally_winner(item_id: str, payload: Dict[str, Any]):
    r = await db.rallies.find_one({"id": item_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Rally não encontrado")
    await db.rallies.update_one({"id": item_id}, {"$set": {"winner": payload.get("winner")}})
    await recalc_scores(r["video_id"])
    return await db.rallies.find_one({"id": item_id}, {"_id": 0})


@api_router.post("/rallies/{item_id}/remove-point")
async def remove_point(item_id: str, payload: Dict[str, Any]):
    r = await db.rallies.find_one({"id": item_id}, {"_id": 0})
    if not r or r.get("number") is None:
        raise HTTPException(404, "Ponto não encontrado")
    mode = payload.get("actions_mode", "reopen")
    if mode not in ("reopen", "detach", "delete"):
        raise HTTPException(400, "actions_mode inválido")
    q = {"rally_id": item_id}
    n_actions = await db.actions.count_documents(q)
    if mode == "delete" and n_actions and not payload.get("confirm_delete"):
        raise HTTPException(409, "Confirmação necessária para excluir os lances vinculados")
    if mode == "delete":
        await db.actions.delete_many(q)
    else:
        await db.actions.update_many(q, {"$set": {"rally_id": None, "detached": mode == "detach"}})
    await db.rallies.delete_one({"id": item_id})
    remaining = await db.rallies.find({"video_id": r["video_id"], "number": {"$ne": None}}, {"_id": 0}).sort("number", 1).to_list(3000)
    for i, x in enumerate(remaining, start=1):
        upd = {"number": i}
        if (x.get("label") or "").startswith("Rally "):
            upd["label"] = f"Rally {i}"
        await db.rallies.update_one({"id": x["id"]}, {"$set": upd})
    await recalc_scores(r["video_id"])
    return {"ok": True, "removed_number": r["number"], "actions_mode": mode, "n_actions": n_actions}


@api_router.patch("/actions/{item_id}/attach")
async def reattach_action(item_id: str):
    return await update("actions", item_id, {"detached": False})


@api_router.patch("/videos/{item_id}/original")
async def set_video_original(item_id: str, payload: Dict[str, Any]):
    return await update("videos", item_id, {"original_storage_path": payload.get("storage_path")})


@api_router.get("/videos/{video_id}/rallies-full")
async def rallies_full(video_id: str):
    rallies = await db.rallies.find({"video_id": video_id, "number": {"$ne": None}}, {"_id": 0}).sort("number", 1).to_list(3000)
    acts = {a["id"]: a for a in await db.actions.find({"video_id": video_id}, {"_id": 0}).to_list(5000)}
    for r in rallies:
        rl = [acts[i] for i in r.get("action_ids", []) if i in acts]
        rl.sort(key=lambda x: x.get("timestamp", 0))
        r["actions"] = rl
    return rallies


# ----------------- Saved Filters -----------------
@api_router.get("/saved-filters")
async def list_filters():
    return await db.saved_filters.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/saved-filters")
async def create_filter(body: SavedFilterIn):
    return await insert("saved_filters", body.model_dump())


@api_router.delete("/saved-filters/{item_id}")
async def delete_filter(item_id: str):
    await db.saved_filters.delete_one({"id": item_id})
    return {"ok": True}


# ----------------- Settings -----------------
@api_router.get("/settings")
async def get_settings():
    s = await db.settings.find_one({"id": "global"}, {"_id": 0})
    if not s:
        s = {"id": "global", "default_clip_before": 10.0, "default_clip_after": 10.0}
        await db.settings.insert_one(dict(s))
    return s


@api_router.put("/settings")
async def set_settings(body: SettingsIn):
    data = body.model_dump()
    data["id"] = "global"
    await db.settings.update_one({"id": "global"}, {"$set": data}, upsert=True)
    return clean(await db.settings.find_one({"id": "global"}, {"_id": 0}))


# ----------------- Export CSV -----------------
@api_router.get("/export/csv")
async def export_csv(video_id: Optional[str] = None, athlete_id: Optional[str] = None):
    q: Dict[str, Any] = {}
    if video_id:
        q["video_id"] = video_id
    if athlete_id:
        q["athlete_ids"] = athlete_id
    actions = await db.actions.find(q, {"_id": 0}).sort("timestamp", 1).to_list(5000)
    athletes = {a["id"]: a for a in await db.athletes.find({}, {"_id": 0}).to_list(1000)}
    videos = {v["id"]: v for v in await db.videos.find({}, {"_id": 0}).to_list(1000)}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Partida", "Tempo(s)", "Fundamento", "Classificacao", "Atletas", "Posicao", "Fase", "Nota"])
    for a in actions:
        names = ", ".join([athletes.get(i, {}).get("name", "?") for i in a.get("athlete_ids", [])])
        w.writerow([
            videos.get(a.get("video_id"), {}).get("title", ""),
            round(a.get("timestamp", 0), 2),
            a.get("fundamento_name", ""),
            a.get("classificacao_label", ""),
            names,
            a.get("tactical_position", ""),
            a.get("phase", ""),
            a.get("note", ""),
        ])
    return Response(content=out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=ava_relatorio.csv"})


# ----------------- Categorias & Equipes -----------------
class CategoriaIn(BaseModel):
    name: str
    base: Optional[str] = None       # Mirim | Infantil | Juvenil | Adulta
    gender: Optional[str] = None     # Masculina | Feminina
    order: int = 0
    active: bool = True
    archived: bool = False


class EquipeIn(BaseModel):
    name: str
    order: int = 0
    active: bool = True
    archived: bool = False


@api_router.get("/categorias")
async def list_categorias():
    return await db.categorias.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@api_router.post("/categorias")
async def create_categoria(body: CategoriaIn):
    return await insert("categorias", body.model_dump())


@api_router.put("/categorias/{item_id}")
async def update_categoria(item_id: str, body: CategoriaIn):
    return await update("categorias", item_id, body.model_dump())


@api_router.patch("/categorias/{item_id}/archive")
async def archive_categoria(item_id: str, archived: bool = Query(True)):
    return await update("categorias", item_id, {"archived": archived})


@api_router.delete("/categorias/{item_id}")
async def delete_categoria(item_id: str):
    await db.categorias.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


@api_router.get("/equipes")
async def list_equipes():
    return await db.equipes.find({}, {"_id": 0}).sort("order", 1).to_list(500)


@api_router.post("/equipes")
async def create_equipe(body: EquipeIn):
    return await insert("equipes", body.model_dump())


@api_router.put("/equipes/{item_id}")
async def update_equipe(item_id: str, body: EquipeIn):
    return await update("equipes", item_id, body.model_dump())


@api_router.patch("/equipes/{item_id}/archive")
async def archive_equipe(item_id: str, archived: bool = Query(True)):
    return await update("equipes", item_id, {"archived": archived})


@api_router.delete("/equipes/{item_id}")
async def delete_equipe(item_id: str):
    await db.equipes.update_one({"id": item_id}, {"$set": {"active": False}})
    return {"ok": True}


# ----------------- Stats engine (shared by reports, compare, IA) -----------------
POS_WORDS = ("ponto", "ace", "perfeit", "positiv", "boa", "bom", "precis", "mantid")
ERR_WORDS = ("erro", "rede", "fora", "bloquead", "perdid")


def _quality(label: Optional[str]) -> str:
    l = (label or "").strip().lower()
    if not l or l == "—":
        return "neu"
    if l == "a":
        return "pos"
    if l == "c":
        return "neg"
    if "erro" in l:
        return "err"
    if any(w in l for w in POS_WORDS):
        return "pos"
    if any(w in l for w in ERR_WORDS):
        return "err"
    return "neu"


def compute_stats(acts: List[dict], athletes_map: dict, videos_map: dict) -> dict:
    by_fund: Dict[str, Any] = {}
    for a in acts:
        f = a.get("fundamento_name") or "—"
        d = by_fund.setdefault(f, {"total": 0, "classes": {}, "pos": 0, "err": 0})
        d["total"] += 1
        c = a.get("classificacao_label") or "—"
        d["classes"][c] = d["classes"].get(c, 0) + 1
        q = _quality(c)
        if q == "pos":
            d["pos"] += 1
        elif q == "err":
            d["err"] += 1
    for f, d in by_fund.items():
        t = d["total"]
        d["eficiencia"] = round((d["pos"] - d["err"]) / t * 100) if t else 0
        d["pct"] = {k: round(v / t * 100) for k, v in d["classes"].items()} if t else {}

    by_sit: Dict[str, Any] = {}
    for a in acts:
        s = a.get("phase") or "—"
        d = by_sit.setdefault(s, {"total": 0, "pontos": 0, "erros": 0})
        d["total"] += 1
        res = (a.get("result") or "").lower()
        cq = _quality(a.get("classificacao_label"))
        if "ponto nosso" in res or (cq == "pos" and "advers" not in res):
            d["pontos"] += 1
        if "advers" in res or cq == "err":
            d["erros"] += 1
    for s, d in by_sit.items():
        d["eficiencia"] = round((d["pontos"] - d["erros"]) / d["total"] * 100) if d["total"] else 0

    by_form: Dict[str, Any] = {}
    for a in acts:
        fo = a.get("formation") or "sem formação"
        d = by_form.setdefault(fo, {"total": 0, "pos": 0, "err": 0})
        d["total"] += 1
        q = _quality(a.get("classificacao_label"))
        if q == "pos":
            d["pos"] += 1
        elif q == "err":
            d["err"] += 1
    for fo, d in by_form.items():
        d["eficiencia"] = round((d["pos"] - d["err"]) / d["total"] * 100) if d["total"] else 0

    by_ath: Dict[str, int] = {}
    for a in acts:
        for aid in a.get("athlete_ids", []):
            nm = athletes_map.get(aid, {}).get("name", "?")
            by_ath[nm] = by_ath.get(nm, 0) + 1

    by_cat: Dict[str, int] = {}
    for a in acts:
        c = a.get("categoria_name") or "—"
        by_cat[c] = by_cat.get(c, 0) + 1

    zones: Dict[str, int] = {}
    for a in acts:
        z = (a.get("court") or {}).get("zone")
        if z is not None:
            zones[str(z)] = zones.get(str(z), 0) + 1

    partidas = sorted({videos_map.get(v, {}).get("title") for v in {a.get("video_id") for a in acts} if videos_map.get(v)})
    return {
        "total": len(acts),
        "n_partidas": len({a.get("video_id") for a in acts}),
        "partidas": [p for p in partidas if p],
        "por_fundamento": by_fund,
        "por_situacao": by_sit,
        "por_formacao": by_form,
        "por_atleta": by_ath,
        "por_categoria": by_cat,
        "zonas_quadra": zones,
    }


async def _load_actions(f: Dict[str, Any]) -> List[dict]:
    q: Dict[str, Any] = {}
    if f.get("video_ids"):
        q["video_id"] = {"$in": f["video_ids"]}
    elif f.get("video_id"):
        q["video_id"] = f["video_id"]
    if f.get("athlete_id"):
        q["athlete_ids"] = f["athlete_id"]
    for src, dbk in [
        ("fundamento_id", "fundamento_id"), ("classificacao_id", "classificacao_id"),
        ("phase", "phase"), ("formation", "formation"), ("categoria_name", "categoria_name"),
        ("equipe_name", "equipe_name"), ("competition", "competition"), ("season", "season"),
        ("comp_phase", "comp_phase"), ("position", "tactical_position"),
    ]:
        if f.get(src):
            q[dbk] = f[src]
    if f.get("set_number") not in (None, ""):
        try:
            q["set_number"] = int(f["set_number"])
        except (ValueError, TypeError):
            pass
    acts = await db.actions.find(q, {"_id": 0}).sort("timestamp", 1).to_list(10000)
    if f.get("zone") not in (None, ""):
        try:
            zv = int(f["zone"])
            acts = [a for a in acts if (a.get("court") or {}).get("zone") == zv]
        except (ValueError, TypeError):
            pass
    return acts


async def _maps():
    athletes = {a["id"]: a for a in await db.athletes.find({}, {"_id": 0}).to_list(3000)}
    videos = {v["id"]: v for v in await db.videos.find({}, {"_id": 0}).to_list(3000)}
    return athletes, videos


@api_router.get("/stats")
async def stats_endpoint(
    video_id: Optional[str] = None, athlete_id: Optional[str] = None,
    fundamento_id: Optional[str] = None, classificacao_id: Optional[str] = None,
    phase: Optional[str] = None, formation: Optional[str] = None,
    categoria_name: Optional[str] = None, equipe_name: Optional[str] = None,
    competition: Optional[str] = None, season: Optional[str] = None,
    comp_phase: Optional[str] = None, set_number: Optional[str] = None,
):
    f = {k: v for k, v in locals().items() if v not in (None, "")}
    acts = await _load_actions(f)
    athletes, videos = await _maps()
    return compute_stats(acts, athletes, videos)


@api_router.get("/athletes/{item_id}/summary")
async def athlete_summary(item_id: str):
    a = await db.athletes.find_one({"id": item_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Atleta não encontrado")
    acts = await db.actions.find({"athlete_ids": item_id}, {"_id": 0}).sort("timestamp", 1).to_list(10000)
    athletes, videos = await _maps()
    cats = sorted({(x.get("categoria_name") or "—") for x in acts})
    por_categoria = {c: compute_stats([x for x in acts if (x.get("categoria_name") or "—") == c], athletes, videos) for c in cats}
    # evolução cronológica por temporada/competição
    periods: Dict[str, list] = {}
    for x in acts:
        v = videos.get(x.get("video_id"), {})
        key = x.get("season") or v.get("season") or (v.get("match_date") or "")[:4] or "—"
        periods.setdefault(str(key), []).append(x)
    evolucao = [{"period": k, "categorias": sorted({(x.get("categoria_name") or "—") for x in v}), "stats": compute_stats(v, athletes, videos)} for k, v in sorted(periods.items())]
    return {"athlete": a, "categorias": cats, "por_categoria": por_categoria, "evolucao": evolucao, "geral": compute_stats(acts, athletes, videos)}


class CompareGroup(BaseModel):
    label: str
    filters: Dict[str, Any] = {}


class CompareIn(BaseModel):
    groups: List[CompareGroup] = []


@api_router.post("/compare")
async def compare_endpoint(body: CompareIn):
    athletes, videos = await _maps()
    out = []
    for g in body.groups:
        acts = await _load_actions(dict(g.filters or {}))
        out.append({"label": g.label, "filters": g.filters, "stats": compute_stats(acts, athletes, videos)})
    return {"groups": out}


# ----------------- Seed -----------------
DEFAULT_FUNDAMENTOS = [
    {"name": "Saque", "color": "#3B82F6", "shortcut": "S", "classes": [("Ace", "##", "#10B981"), ("Positivo", "+", "#3B82F6"), ("Negativo", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Recepção", "color": "#8B5CF6", "shortcut": "R", "classes": [("A", "##", "#10B981"), ("B", "+", "#3B82F6"), ("C", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Levantamento", "color": "#EC4899", "shortcut": "L", "classes": [("Perfeito", "##", "#10B981"), ("Bom", "+", "#3B82F6"), ("Ruim", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Ataque", "color": "#EF4444", "shortcut": "A", "classes": [("Ponto", "##", "#10B981"), ("Positivo", "+", "#3B82F6"), ("Negativo", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Bloqueio", "color": "#10B981", "shortcut": "B", "classes": [("Ponto", "##", "#10B981"), ("Positivo", "+", "#3B82F6"), ("Negativo", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Defesa", "color": "#F59E0B", "shortcut": "D", "classes": [("Perfeita", "##", "#10B981"), ("Boa", "+", "#3B82F6"), ("Ruim", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
]
DEFAULT_POSITIONS = ["Levantador", "Ponteiro", "Oposto", "Central", "Líbero"]
DEFAULT_FORMATIONS = ["P1", "P2", "P3", "P4", "P5", "P6"]
EXTRA_FUNDAMENTOS = [
    {"name": "Contra-ataque", "color": "#06B6D4", "shortcut": "C", "classes": [("Ponto", "##", "#10B981"), ("Defendido", "+", "#3B82F6"), ("Continuidade", "~", "#8B5CF6"), ("Erro", "=", "#EF4444")]},
    {"name": "Cobertura", "color": "#84CC16", "shortcut": "O", "classes": [("Positiva", "+", "#10B981"), ("Negativa", "-", "#F97316"), ("Erro", "=", "#EF4444")]},
    {"name": "Continuidade", "color": "#A855F7", "shortcut": "T", "classes": [("Mantida", "+", "#10B981"), ("Perdida", "-", "#EF4444")]},
]


STANDARD_CATEGORIAS = [
    ("Mirim Masculina", "Mirim", "Masculina"), ("Mirim Feminina", "Mirim", "Feminina"),
    ("Infantil Masculina", "Infantil", "Masculina"), ("Infantil Feminina", "Infantil", "Feminina"),
    ("Juvenil Masculina", "Juvenil", "Masculina"), ("Juvenil Feminina", "Juvenil", "Feminina"),
    ("Adulta Masculina", "Adulta", "Masculina"), ("Adulta Feminina", "Adulta", "Feminina"),
]


async def seed():
    if await db.categorias.count_documents({}) == 0:
        for i, (name, base, gender) in enumerate(STANDARD_CATEGORIAS):
            await insert("categorias", {"name": name, "base": base, "gender": gender, "order": i, "active": True, "archived": False})
        logger.info("Seeded categorias")
    if await db.equipes.count_documents({}) == 0:
        await insert("equipes", {"name": "AVA", "order": 0, "active": True, "archived": False})
        logger.info("Seeded equipes")
    if await db.kphases.count_documents({}) == 0:
        kA = [("K1", "Side-out", "Recepção do saque adversário e construção ofensiva"),
              ("K2", "Saque e defesa", "Saque, organização do bloqueio e da defesa")]
        kB = [("K0", "Saque", "Execução e eficiência do saque"),
              ("K1", "Side-out", "Recepção do saque adversário e construção ofensiva"),
              ("K2", "Saque e organização defensiva", "Organização defensiva após o saque (bloqueio e defesa)"),
              ("K3", "Transição e contra-ataque", "Recuperação, reorganização ofensiva e ataque após a defesa"),
              ("K4", "Continuidade após bloqueio", "Cobertura e reorganização quando a bola bloqueada segue em jogo"),
              ("K5", "Bola de graça", "Devolução sem ataque forte (fácil ou difícil)")]
        for i, (k, n, d) in enumerate(kA):
            await insert("kphases", {"model": "A", "key": k, "name": n, "description": d, "order": i, "active": True})
        for i, (k, n, d) in enumerate(kB):
            await insert("kphases", {"model": "B", "key": k, "name": n, "description": d, "order": i, "active": True})
        logger.info("Seeded kphases")

    if await db.positions.count_documents({}) == 0:
        for i, name in enumerate(DEFAULT_POSITIONS):
            await insert("positions", {"name": name, "order": i, "active": True})
        logger.info("Seeded positions")

    fundamento_map = {}
    if await db.fundamentos.count_documents({}) == 0:
        for i, f in enumerate(DEFAULT_FUNDAMENTOS):
            fdoc = await insert("fundamentos", {"name": f["name"], "color": f["color"], "shortcut": f["shortcut"], "order": i, "active": True})
            fundamento_map[f["name"]] = fdoc["id"]
            for j, (label, symbol, color) in enumerate(f["classes"]):
                await insert("classificacoes", {"fundamento_id": fdoc["id"], "label": label, "symbol": symbol, "color": color, "order": j, "active": True})
        logger.info("Seeded fundamentos & classificacoes")

    positions = await db.positions.find({}, {"_id": 0}).to_list(50)
    pos_by_name = {p["name"]: p for p in positions}

    if await db.formations.count_documents({}) == 0:
        for i, name in enumerate(DEFAULT_FORMATIONS):
            await insert("formations", {"name": name, "order": i, "active": True})
        logger.info("Seeded formations")

    # idempotent: add extra default fundamentos if missing
    existing_fund_names = {f["name"] for f in await db.fundamentos.find({}, {"_id": 0, "name": 1}).to_list(100)}
    base_order = await db.fundamentos.count_documents({})
    for k, f in enumerate(EXTRA_FUNDAMENTOS):
        if f["name"] in existing_fund_names:
            continue
        fdoc = await insert("fundamentos", {"name": f["name"], "color": f["color"], "shortcut": f["shortcut"], "order": base_order + k, "active": True, "archived": False, "uses_court": True})
        for j, (label, symbol, color) in enumerate(f["classes"]):
            await insert("classificacoes", {"fundamento_id": fdoc["id"], "label": label, "symbol": symbol, "color": color, "order": j, "active": True, "archived": False})
        logger.info(f"Seeded extra fundamento {f['name']}")

    athletes_ids = {}
    if await db.athletes.count_documents({}) == 0:
        sample = [
            ("Lucas Ferreira", "1", "Levantador"),
            ("Rafael Souza", "7", "Ponteiro"),
            ("Bruno Almeida", "10", "Oposto"),
            ("Thiago Costa", "12", "Central"),
            ("Pedro Henrique", "5", "Líbero"),
            ("Gabriel Lima", "9", "Ponteiro"),
        ]
        for name, num, posname in sample:
            pos = pos_by_name.get(posname, {})
            a = await insert("athletes", {
                "name": name, "number": num, "team": "AVA", "category": "Adulto",
                "position_id": pos.get("id"), "position_name": posname,
                "photo_url": None, "notes": "", "active": True,
            })
            athletes_ids[name] = a["id"]
        logger.info("Seeded athletes")

    if await db.videos.count_documents({}) == 0:
        demo_yt = "aqz-KE-bpKQ"
        v = await insert("videos", {
            "title": "AVA x Marília — Final Regional (demo)",
            "opponent": "Marília VC", "team": "AVA", "category": "Adulto",
            "competition": "Campeonato Regional", "match_date": "2026-05-18",
            "source_type": "youtube", "youtube_id": demo_yt,
            "thumbnail_url": f"https://img.youtube.com/vi/{demo_yt}/hqdefault.jpg",
            "duration": 634, "status": "em_analise", "is_deleted": False,
        })
        for yt, title, opp, status in [
            ("l9I8m9OQKWo", "AVA x Bauru — Semifinal", "Bauru VC", "pendente"),
            ("QH2-TGUlwu4", "Treino Coletivo — Sistema de Recepção", "Interno", "concluido"),
        ]:
            await insert("videos", {
                "title": title, "opponent": opp, "team": "AVA", "category": "Adulto",
                "competition": "Amistoso", "match_date": "2026-04-30",
                "source_type": "youtube", "youtube_id": yt,
                "thumbnail_url": f"https://img.youtube.com/vi/{yt}/hqdefault.jpg",
                "duration": 420, "status": status, "is_deleted": False,
            })

        # sample actions on demo video
        funds = {f["name"]: f for f in await db.fundamentos.find({}, {"_id": 0}).to_list(50)}
        classes = await db.classificacoes.find({}, {"_id": 0}).to_list(200)

        def cls(fund_name, label):
            fid = funds[fund_name]["id"]
            for c in classes:
                if c["fundamento_id"] == fid and c["label"] == label:
                    return c
            return None

        ath_list = list(athletes_ids.values())
        if ath_list and funds:
            samples = [
                (12, "Saque", "Ace", [athletes_ids.get("Rafael Souza")], "Ponteiro", "K1"),
                (24, "Recepção", "A", [athletes_ids.get("Pedro Henrique")], "Líbero", "K1"),
                (28, "Levantamento", "Perfeito", [athletes_ids.get("Lucas Ferreira")], "Levantador", "K1"),
                (31, "Ataque", "Ponto", [athletes_ids.get("Bruno Almeida")], "Oposto", "K1"),
                (55, "Recepção", "C", [athletes_ids.get("Gabriel Lima")], "Ponteiro", "K1"),
                (72, "Bloqueio", "Ponto", [athletes_ids.get("Thiago Costa")], "Central", "K2"),
                (88, "Defesa", "Boa", [athletes_ids.get("Pedro Henrique")], "Líbero", "K2"),
                (94, "Ataque", "Erro", [athletes_ids.get("Rafael Souza")], "Ponteiro", "K2"),
                (120, "Ataque", "Positivo", [athletes_ids.get("Bruno Almeida")], "Oposto", "K1"),
                (140, "Saque", "Positivo", [athletes_ids.get("Lucas Ferreira")], "Levantador", "K1"),
            ]
            for ts, fname, clabel, aths, pos, phase in samples:
                c = cls(fname, clabel)
                await insert("actions", {
                    "video_id": v["id"], "timestamp": float(ts),
                    "fundamento_id": funds[fname]["id"], "fundamento_name": fname,
                    "classificacao_id": c["id"] if c else None, "classificacao_label": clabel,
                    "athlete_ids": [a for a in aths if a], "tactical_position": pos,
                    "note": "", "clip_before": 10.0, "clip_after": 10.0,
                    "annotations": [], "rally_id": None, "phase": phase,
                })
        logger.info("Seeded videos & actions")


# ----------------- AI Analysis -----------------
class AIQuery(BaseModel):
    question: str
    video_ids: List[str] = []
    formation: Optional[str] = None
    filters: Dict[str, Any] = {}


AI_SYSTEM = (
    "Você é um analista técnico de voleibol sênior apoiando a comissão técnica da AVA. "
    "Responda SEMPRE em português do Brasil, de forma objetiva e fundamentada APENAS nos dados fornecidos. "
    "Regras obrigatórias: (1) cite os NÚMEROS e PERCENTUAIS reais dos dados (use os campos eficiencia, pct, pos/err); "
    "(2) informe a quantidade de ações consideradas, as partidas, categorias e o período; "
    "(3) nunca misture categorias diferentes numa mesma conclusão a menos que a pergunta peça comparação; "
    "(4) distinga claramente PADRÕES ESTATÍSTICOS de HIPÓTESES sobre causas — nunca afirme causalidade sem evidência; "
    "(5) se houver poucos registros (menos de ~15 ações relevantes) ou dados insuficientes, declare essa limitação e evite conclusões; "
    "(6) ao comparar períodos/categorias/treinos, aponte diferenças sem afirmar que foram causadas por um único fator; "
    "(7) finalize com sugestões de aspectos a investigar nos treinamentos, ligadas aos dados. "
    "Use subtítulos curtos e listas. Não invente dados que não estão no resumo."
)


@api_router.post("/ai/analyze")
async def ai_analyze(body: AIQuery):
    if not EMERGENT_KEY:
        raise HTTPException(500, "Chave de IA não configurada")
    f = dict(body.filters or {})
    if body.video_ids:
        f["video_ids"] = body.video_ids
    if body.formation:
        f["formation"] = body.formation
    acts = await _load_actions(f)
    athletes, videos = await _maps()
    stats = compute_stats(acts, athletes, videos)
    payload = {"filtros_aplicados": f, "resumo": stats}
    if f.get("athlete_id"):
        try:
            payload["evolucao_atleta"] = (await athlete_summary(f["athlete_id"]))["evolucao"]
        except Exception:
            pass
    import json as _json
    context = (
        "RESUMO ESTATÍSTICO (dados reais registrados):\n"
        + _json.dumps(payload, ensure_ascii=False, indent=2)
        + f"\n\nPergunta da comissão técnica: {body.question}"
    )
    try:
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=new_id(), system_message=AI_SYSTEM).with_model("anthropic", "claude-sonnet-5-5")
        answer = await chat.send_message(UserMessage(text=context))
    except Exception as e:
        logger.error(f"AI error: {e}")
        raise HTTPException(502, "Falha ao consultar a IA. Verifique o saldo da chave Emergent.")
    return {"answer": answer, "n_actions": stats["total"], "stats": stats}


@api_router.get("/")
async def root():
    return {"message": "AVA Volleyball Analysis API"}


app.include_router(api_router)

# Camada de integração ISOLADA com o site principal (hoje local/desconectada)
from integration_layer import integration_router  # noqa: E402
app.include_router(integration_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


async def migrate():
    # 1) backfill match context onto videos
    for v in await db.videos.find({}, {"_id": 0}).to_list(5000):
        patch = {}
        if not v.get("equipe_name"):
            patch["equipe_name"] = v.get("team") or "AVA"
        if not v.get("categoria_name") and v.get("category"):
            patch["categoria_name"] = v.get("category")
        if not v.get("season"):
            patch["season"] = (v.get("match_date") or "")[:4] or "2026"
        if not v.get("analysis_model"):
            patch["analysis_model"] = "B"
        if patch:
            await db.videos.update_one({"id": v["id"]}, {"$set": patch})
    # 2) backfill denormalized context onto existing actions
    vids = {v["id"]: v for v in await db.videos.find({}, {"_id": 0}).to_list(5000)}
    for a in await db.actions.find({"categoria_name": {"$exists": False}}, {"_id": 0}).to_list(20000):
        v = vids.get(a.get("video_id"), {})
        await db.actions.update_one({"id": a["id"]}, {"$set": {
            "categoria_name": v.get("categoria_name") or v.get("category"),
            "equipe_name": v.get("equipe_name") or v.get("team"),
            "competition": v.get("competition"), "season": v.get("season"),
            "comp_phase": v.get("comp_phase"), "match_date": v.get("match_date"),
        }})
    # 3) one-time demo in a second category (so evolução/comparação entre categorias têm dados)
    if await db.videos.count_documents({"categoria_name": "Mirim Masculina"}) == 0:
        ath = await db.athletes.find({}, {"_id": 0}).sort("number", 1).to_list(10)
        funds = {f["name"]: f for f in await db.fundamentos.find({}, {"_id": 0}).to_list(50)}
        classes = await db.classificacoes.find({}, {"_id": 0}).to_list(300)
        if ath and funds:
            def cls(fn, lb):
                fid = funds.get(fn, {}).get("id")
                return next((c for c in classes if c["fundamento_id"] == fid and c["label"] == lb), None)
            yt = "l9I8m9OQKWo"
            v = await insert("videos", {
                "title": "AVA Mirim x Ourinhos — Festival (demo)", "opponent": "Ourinhos",
                "team": "AVA", "equipe_name": "AVA", "category": "Mirim Masculina",
                "categoria_name": "Mirim Masculina", "competition": "Festival Regional Mirim",
                "comp_phase": "Fase de grupos", "season": "2025", "match_date": "2025-09-14",
                "source_type": "youtube", "youtube_id": yt,
                "thumbnail_url": f"https://img.youtube.com/vi/{yt}/hqdefault.jpg",
                "duration": 420, "status": "concluido", "is_deleted": False,
            })
            samples = [
                (10, "Saque", "Positivo", 1, "K1"), (22, "Recepção", "B", 0, "K1"),
                (30, "Ataque", "Positivo", 1, "K1"), (44, "Recepção", "C", 0, "K1"),
                (60, "Ataque", "Erro", 1, "K1"), (75, "Defesa", "Boa", 0, "K2"),
            ]
            for ts, fname, clabel, ai, phase in samples:
                c = cls(fname, clabel)
                a = ath[ai % len(ath)]
                await insert("actions", {
                    "video_id": v["id"], "timestamp": float(ts),
                    "fundamento_id": funds[fname]["id"], "fundamento_name": fname,
                    "classificacao_id": c["id"] if c else None, "classificacao_label": clabel,
                    "athlete_ids": [a["id"]], "tactical_position": a.get("position_name"),
                    "note": "", "clip_before": 5.0, "clip_after": 4.0, "annotations": [],
                    "rally_id": None, "phase": phase, "formation": "P1",
                    "categoria_name": "Mirim Masculina", "equipe_name": "AVA",
                    "competition": "Festival Regional Mirim", "comp_phase": "Fase de grupos",
                    "season": "2025", "match_date": "2025-09-14",
                })
            logger.info("Seeded cross-category demo (Mirim)")


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed failed: {e}")
    try:
        await migrate()
    except Exception as e:
        logger.error(f"Migrate failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
