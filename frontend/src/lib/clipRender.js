import { inWindow, drawEl } from "./annoUtils";
import { fileUrl } from "./api";

let busy = false;
const blobCache = {};
const once = (el, ev) => new Promise((res, rej) => { el.addEventListener(ev, res, { once: true }); el.addEventListener("error", rej, { once: true }); });

export const renderSourcePath = (video) => (video?.source_type !== "youtube" && video?.storage_path) || video?.original_storage_path || null;

export const actionRange = (a, duration) => [
  Math.max(0, a.clip_start != null ? a.clip_start : a.timestamp - (a.clip_before ?? 5)),
  Math.min(duration || 1e9, a.clip_end != null ? a.clip_end : a.timestamp + (a.clip_after ?? 4)),
];

const loadBlobUrl = async (path) => {
  if (!blobCache[path]) {
    const r = await fetch(fileUrl(path));
    if (!r.ok) throw new Error("Falha ao baixar o arquivo do vídeo");
    blobCache[path] = URL.createObjectURL(await r.blob());
  }
  return blobCache[path];
};

const drawCaption = (ctx, text, W, H) => {
  const fs = Math.round(H * 0.035);
  ctx.save();
  ctx.font = `700 ${fs}px "Barlow Condensed", sans-serif`;
  const w = ctx.measureText(text).width + fs * 1.6;
  ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(fs * 0.6, H - fs * 2.2, w, fs * 1.6);
  ctx.fillStyle = "#E50914"; ctx.fillRect(fs * 0.6, H - fs * 2.2, fs * 0.3, fs * 1.6);
  ctx.fillStyle = "#fff"; ctx.fillText(text, fs * 1.3, H - fs * 1.0);
  ctx.restore();
};

const drawTitle = (ctx, title, sub, W, H) => {
  ctx.fillStyle = "#0A0A0B"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#E50914"; ctx.fillRect(W * 0.08, H * 0.42, W * 0.012, H * 0.18);
  ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(H * 0.08)}px "Barlow Condensed", sans-serif`;
  ctx.fillText(title, W * 0.11, H * 0.51);
  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `500 ${Math.round(H * 0.035)}px "Inter", sans-serif`;
  ctx.fillText(sub || "", W * 0.11, H * 0.58);
};

const download = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

// segments: [{ storagePath, start, end, annotations, caption, title? }] gravados em sequência num único arquivo
export async function renderCompilation({ segments, filename, onProgress }) {
  if (busy) throw new Error("Já existe uma exportação em andamento");
  if (!segments.length) throw new Error("Nenhum trecho para exportar");
  busy = true;
  const v = document.createElement("video");
  let actx;
  try {
    v.playsInline = true; v.preload = "auto";
    v.src = await loadBlobUrl(segments[0].storagePath);
    await once(v, "loadedmetadata");
    const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
    const W = Math.round((v.videoWidth || 1280) * scale / 2) * 2, H = Math.round((v.videoHeight || 720) * scale / 2) * 2;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(30);
    try {
      actx = new AudioContext();
      const dest = actx.createMediaStreamDestination();
      actx.createMediaElementSource(v).connect(dest);
      dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    } catch { /* sem áudio */ }
    const mime = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported(m));
    if (!mime) throw new Error("Este navegador não suporta gravação de vídeo");
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise((r) => (rec.onstop = r));
    const total = segments.reduce((s, x) => s + Math.max(0.1, x.end - x.start), 0);
    let doneDur = 0;
    let curSrc = segments[0].storagePath;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (rec.state === "recording") rec.pause();
      if (seg.storagePath !== curSrc) {
        v.src = await loadBlobUrl(seg.storagePath); curSrc = seg.storagePath;
        await once(v, "loadedmetadata");
      }
      const stop = Math.min(seg.end, v.duration || seg.end);
      v.currentTime = Math.max(0, seg.start); await once(v, "seeked");
      const draw = () => {
        const t = v.currentTime;
        ctx.drawImage(v, 0, 0, W, H);
        (seg.annotations || []).filter((el) => inWindow(el, t)).forEach((el) => drawEl(ctx, el, t, W, H));
        if (seg.caption) drawCaption(ctx, seg.caption, W, H);
      };
      if (seg.title) {
        drawTitle(ctx, seg.title, seg.subtitle, W, H);
        if (rec.state === "inactive") rec.start(250); else rec.resume();
        await new Promise((r) => { const end = performance.now() + 1800; const loop = () => { drawTitle(ctx, seg.title, seg.subtitle, W, H); performance.now() < end ? requestAnimationFrame(loop) : r(); }; loop(); });
        rec.pause();
      }
      draw();
      if (rec.state === "inactive") rec.start(250); else rec.resume();
      await v.play();
      await new Promise((resolve) => {
        const tick = () => {
          draw();
          onProgress?.(Math.min(1, (doneDur + Math.max(0, v.currentTime - seg.start)) / total), i + 1, segments.length);
          if (v.currentTime >= stop || v.ended) return resolve();
          if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
        };
        tick();
        v.addEventListener("ended", resolve, { once: true });
      });
      v.pause();
      doneDur += Math.max(0.1, seg.end - seg.start);
    }
    rec.stop(); await stopped;
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    download(blob, `${filename}.${ext}`);
    return { ext, size: blob.size };
  } finally {
    busy = false;
    v.pause(); v.removeAttribute("src");
    actx?.close().catch(() => {});
  }
}

export const renderClip = ({ storagePath, start, end, annotations = [], caption, filename, onProgress }) =>
  renderCompilation({ segments: [{ storagePath, start, end, annotations, caption }], filename, onProgress });
