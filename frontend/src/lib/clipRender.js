import { inWindow, drawEl } from "./annoUtils";
import { fileUrl } from "./api";

let busy = false;
const blobCache = {};
const once = (el, ev) => new Promise((res, rej) => { el.addEventListener(ev, res, { once: true }); el.addEventListener("error", rej, { once: true }); });

export const renderSourcePath = (video) => (video?.source_type !== "youtube" && video?.storage_path) || video?.original_storage_path || null;

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

export async function renderClip({ storagePath, start, end, annotations = [], caption, filename, onProgress }) {
  if (busy) throw new Error("Já existe uma exportação em andamento");
  busy = true;
  const v = document.createElement("video");
  let actx;
  try {
    v.src = await loadBlobUrl(storagePath);
    v.playsInline = true; v.preload = "auto";
    await once(v, "loadedmetadata");
    const scale = Math.min(1, 1280 / (v.videoWidth || 1280));
    const W = Math.round((v.videoWidth || 1280) * scale / 2) * 2, H = Math.round((v.videoHeight || 720) * scale / 2) * 2;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const stop = Math.min(end, v.duration || end);
    v.currentTime = Math.max(0, start); await once(v, "seeked");

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

    const draw = () => {
      const t = v.currentTime;
      ctx.drawImage(v, 0, 0, W, H);
      annotations.filter((el) => inWindow(el, t)).forEach((el) => drawEl(ctx, el, t, W, H));
      if (caption) drawCaption(ctx, caption, W, H);
    };
    draw();
    rec.start(250);
    await v.play();
    await new Promise((resolve) => {
      const tick = () => {
        draw();
        onProgress?.(Math.min(1, (v.currentTime - start) / Math.max(0.1, stop - start)));
        if (v.currentTime >= stop || v.ended) return resolve();
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(tick);
      };
      tick();
      v.addEventListener("ended", resolve, { once: true });
    });
    v.pause(); rec.stop(); await stopped;
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${filename}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { ext, size: blob.size };
  } finally {
    busy = false;
    v.pause(); v.removeAttribute("src");
    actx?.close().catch(() => {});
  }
}
