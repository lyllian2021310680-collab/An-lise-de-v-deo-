import { useCallback, useEffect, useState } from "react";
import { Sparkles, Play, Check, X, Loader2, AlertTriangle, CheckCheck } from "lucide-react";
import { detectRallies, getRallySuggestions, acceptSuggestion, rejectSuggestion, getJobs } from "@/lib/api";
import { notifyJobs } from "@/lib/highlights";
import { renderSourcePath } from "@/lib/clipRender";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const inp = "w-20 rounded border border-border bg-background px-1.5 py-1 font-data text-[11px]";

const SuggestionRow = ({ s, teamName, time, onPlay, onAccept, onReject }) => {
  const [st, setSt] = useState(s.start_ts);
  const [en, setEn] = useState(s.end_ts);
  const [w, setW] = useState(s.winner_guess !== "incerto" && s.confidence >= 0.6 ? s.winner_guess : "pendente");
  const low = s.confidence < 0.6 || s.winner_guess === "incerto";
  return (
    <div data-testid={`suggestion-${s.id}`} className={cn("p-2.5 text-[11px]", low && "bg-amber-500/5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button data-testid={`suggestion-play-${s.id}`} onClick={() => onPlay(st)} className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center text-primary"><Play size={11} /></button>
        <input type="number" step="0.1" value={st} onChange={(e) => setSt(e.target.value)} className={inp} data-testid={`suggestion-start-${s.id}`} />
        <button onClick={() => setSt(time.toFixed(1))} className="rounded border border-border px-1">agora</button>
        <span>→</span>
        <input type="number" step="0.1" value={en} onChange={(e) => setEn(e.target.value)} className={inp} data-testid={`suggestion-end-${s.id}`} />
        <button onClick={() => setEn(time.toFixed(1))} className="rounded border border-border px-1">agora</button>
        <select data-testid={`suggestion-winner-${s.id}`} value={w} onChange={(e) => setW(e.target.value)} className="h-6 rounded border border-border bg-background px-1">
          <option value="nos">{teamName("nos")}</option><option value="adv">{teamName("adv")}</option><option value="pendente">Pendente</option>
        </select>
        <span className={cn("rounded px-1 font-semibold", low ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500")}>{Math.round(s.confidence * 100)}%</span>
        <div className="ml-auto flex gap-1">
          <button data-testid={`suggestion-accept-${s.id}`} onClick={() => onAccept(s, { start_ts: Number(st), end_ts: Number(en), winner: w })} title="Confirmar rali" className="h-6 w-6 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center"><Check size={12} /></button>
          <button data-testid={`suggestion-reject-${s.id}`} onClick={() => onReject(s)} title="Descartar" className="h-6 w-6 rounded-lg border border-border text-muted-foreground flex items-center justify-center hover:text-primary"><X size={12} /></button>
        </div>
      </div>
      <div className="mt-1 text-muted-foreground">{formatTime(Number(st))}–{formatTime(Number(en))} · IA: {s.winner_guess === "incerto" ? "vencedor incerto" : `ponto ${teamName(s.winner_guess)}`}{s.reason ? ` — ${s.reason}` : ""}</div>
      {s.overlaps_existing && <div className="mt-0.5 flex items-center gap-1 text-amber-500"><AlertTriangle size={10} /> Sobrepõe um rali já registrado — confira antes de confirmar.</div>}
    </div>
  );
};

export const RallySuggestions = ({ video, teamName, time, onPlay, onChanged }) => {
  const [list, setList] = useState([]);
  const [job, setJob] = useState(null);
  const [form, setForm] = useState({ uniform_color: "", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const hasSource = !!renderSourcePath(video);

  const load = useCallback(async () => {
    const [s, jobs] = await Promise.all([getRallySuggestions(video.id), getJobs()]);
    setList(s);
    setJob(jobs.find((j) => j.kind === "detect" && j.meta?.video_id === video.id) || null);
  }, [video.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFin = (e) => { if (e.detail?.meta?.video_id === video.id) load(); };
    window.addEventListener("ava-job-finished", onFin);
    return () => window.removeEventListener("ava-job-finished", onFin);
  }, [video.id, load]);
  const running = job && (job.status === "queued" || job.status === "running");
  useEffect(() => { if (!running) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [running, load]);

  const start = async () => {
    try { setJob(await detectRallies(video.id, form)); setShowForm(false); notifyJobs(); toast.success("IA assistindo o vídeo", { description: "Pode continuar trabalhando ou fechar a página; você será avisado no sininho." }); }
    catch (e) { toast.error(e?.response?.data?.detail || "Falha ao iniciar a detecção"); }
  };
  const accept = async (s, body) => {
    try { await acceptSuggestion(s.id, body); } catch (e) { return toast.error(e?.response?.data?.detail || "Falha ao confirmar"); }
    await load(); await onChanged(); toast.success("Rali confirmado — placar recalculado");
  };
  const reject = async (s) => { await rejectSuggestion(s.id); load(); };
  const acceptConfident = async () => {
    const ok = list.filter((s) => s.confidence >= 0.6 && s.winner_guess !== "incerto" && !s.overlaps_existing);
    for (const s of ok) await acceptSuggestion(s.id, {});
    await load(); await onChanged(); toast.success(`${ok.length} rali(s) confirmado(s); os incertos continuam para revisão`);
  };

  return (
    <div data-testid="rally-suggestions" className="rounded-xl border border-border bg-card">
      <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        <h3 className="ava-heading text-lg font-bold">Ralis automáticos (IA)</h3>
        {list.length > 0 && <span className="text-[11px] text-muted-foreground">{list.length} sugestão(ões) para confirmar</span>}
        <div className="ml-auto flex gap-1.5">
          {list.length > 0 && <button data-testid="suggestions-accept-confident" onClick={acceptConfident} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-emerald-500/50"><CheckCheck size={12} /> Confirmar os confiáveis</button>}
          <button data-testid="detect-rallies-open" disabled={running || !hasSource} onClick={() => setShowForm((x) => !x)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
            {running ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {running ? "Analisando…" : "Detectar ralis"}
          </button>
        </div>
      </div>
      {!hasSource && <div className="p-3 text-[11px] text-muted-foreground">Para a IA assistir a partida, envie o vídeo como arquivo ou anexe o arquivo original (botão “Arquivo p/ exportar”).</div>}
      {running && <div data-testid="detect-progress" className="p-3 text-xs text-muted-foreground">{job.message} <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, (job.progress || 0) * 100)}%` }} /></div></div>}
      {job?.status === "error" && !running && <div className="p-3 text-xs text-amber-500">Última detecção falhou: {job.message}</div>}
      {showForm && (
        <div data-testid="detect-form" className="p-3 space-y-2 border-b border-border text-xs">
          <input data-testid="detect-uniform" value={form.uniform_color} onChange={(e) => setForm({ ...form, uniform_color: e.target.value })} placeholder={`Cor do uniforme de ${teamName("nos")} (ex: vermelho)`} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary/60" />
          <input data-testid="detect-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações (ex: começamos do lado esquerdo da câmera)" className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 outline-none focus:border-primary/60" />
          <p className="text-muted-foreground">A IA sugere início, fim e vencedor de cada rali. Nada entra no placar sem a sua confirmação; ralis já registrados não são alterados.</p>
          <button data-testid="detect-rallies-start" onClick={start} className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground">Iniciar análise da IA</button>
        </div>
      )}
      <div className="divide-y divide-border max-h-[320px] overflow-auto scrollbar-thin">
        {list.map((s) => <SuggestionRow key={s.id} s={s} teamName={teamName} time={time} onPlay={onPlay} onAccept={accept} onReject={reject} />)}
        {!running && list.length === 0 && hasSource && <div className="p-3 text-[11px] text-muted-foreground">Nenhuma sugestão pendente. {job?.status === "done" ? job.message : "Clique em “Detectar ralis” para a IA assistir a partida."}</div>}
      </div>
    </div>
  );
};
