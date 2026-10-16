import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { VideoPlayer } from "@/components/VideoPlayer";
import { AnnotationLayer } from "@/components/AnnotationLayer";
import { CourtMap } from "@/components/CourtMap";
import {
  getVideo, getFundamentos, getClassificacoes, getAthletes, getPositions, getFormations, getSettings,
  getActions, createAction, updateAction, deleteAction, setVideoStatus, linkRally,
  getKphases, suggestPhase, closePoint, setRallyWinner, getRalliesFull, updateVideo,
  removePoint, reattachAction, setVideoOriginal, uploadFile, getMatch, saveMatchRules, applyProposedSets, editRally,
} from "@/lib/api";
import { MatchSummary } from "@/components/MatchSummary";
import { RallyRow } from "@/components/RallyRow";
import { SetRulesDialog } from "@/components/SetRulesDialog";
import { AnnoTimingPanel } from "@/components/AnnoTimingPanel";
import { RemovePointDialog } from "@/components/RemovePointDialog";
import { renderClip, renderSourcePath } from "@/lib/clipRender";
import { formatTime } from "@/lib/format";
import { Scoreboard } from "@/components/Scoreboard";
import {
  Play, Pause, Rewind, FastForward, Plus, Trash2, Save, MousePointer2, ArrowUpRight,
  Minus, Square, Circle, Type, Spline, Undo2, Eraser, Clock, Check, Users, X, Scissors, Link2, MapPin,
  Trophy, Repeat, ListOrdered, Sparkles, Settings2, Highlighter, Pin, Timer, TimerOff, Film, Upload, Loader2, Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLORS = ["#E50914", "#F59E0B", "#10B981", "#3B82F6", "#FFFFFF"];
const TOOLS = [
  { id: "select", icon: MousePointer2 }, { id: "arrow", icon: ArrowUpRight }, { id: "line", icon: Minus },
  { id: "rect", icon: Square }, { id: "ellipse", icon: Circle }, { id: "highlight", icon: Highlighter },
  { id: "trajectory", icon: Spline }, { id: "text", icon: Type },
];
const TRIM_WIN = 30;
const RESULTS = ["Ponto nosso", "Ponto adversário", "Continuidade"];

const ClipTrimBar = ({ before, after, onBefore, onAfter }) => {
  const ref = useRef(null);
  const drag = useRef(null);
  const posOf = (sec) => (TRIM_WIN + sec) / (2 * TRIM_WIN);
  const onPointerDown = (which) => (e) => { e.preventDefault(); drag.current = which; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (!drag.current || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const sec = frac * 2 * TRIM_WIN - TRIM_WIN;
    if (drag.current === "before") onBefore(Math.max(0, Math.min(TRIM_WIN, -sec)));
    else onAfter(Math.max(0, Math.min(TRIM_WIN, sec)));
  };
  const onPointerUp = () => { drag.current = null; };
  const leftPct = posOf(-before) * 100;
  const rightPct = posOf(after) * 100;
  return (
    <div ref={ref} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative h-8 rounded-lg bg-background border border-border select-none" style={{ touchAction: "none" }} data-testid="clip-trim-bar">
      <div className="absolute top-0 bottom-0 bg-primary/25 rounded" style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
      <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-5 bg-foreground/70" style={{ left: "50%" }} />
      <div onPointerDown={onPointerDown("before")} data-testid="trim-handle-before" className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center z-10" style={{ left: `${leftPct}%` }}><div className="w-1.5 h-6 rounded bg-primary" /></div>
      <div onPointerDown={onPointerDown("after")} data-testid="trim-handle-after" className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center z-10" style={{ left: `${rightPct}%` }}><div className="w-1.5 h-6 rounded bg-primary" /></div>
    </div>
  );
};
const base = { fundamento_id: "", classificacao_id: "", athlete_ids: [], tactical_position: "", phase: "", note: "", clip_before: 5, clip_after: 4, set_number: "", formation: "", result: "", court: null, team: "nos" };

export default function Analyze() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const playerRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [funds, setFunds] = useState([]);
  const [classes, setClasses] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [positions, setPositions] = useState([]);
  const [formations, setFormations] = useState([]);
  const [actions, setActions] = useState([]);

  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const [form, setForm] = useState(base);
  const [markTime, setMarkTime] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [drafting, setDrafting] = useState(false);
  const [annos, setAnnos] = useState([]);
  const [tool, setTool] = useState("select");
  const [color, setColor] = useState("#E50914");
  const [width, setWidth] = useState(4);
  const [selEl, setSelEl] = useState(null);
  const [showCourt, setShowCourt] = useState(true);
  const [rallySel, setRallySel] = useState([]);
  const [rallySit, setRallySit] = useState("K1");
  const [kphases, setKphases] = useState([]);
  const [rallies, setRallies] = useState([]);
  const [servingTeam, setServingTeam] = useState("adv");
  const [setNumber, setSetNumber] = useState(1);
  const [autoPause, setAutoPause] = useState(true);
  const [pointBusy, setPointBusy] = useState(false);
  const [removeRally, setRemoveRally] = useState(null);
  const [exporting, setExporting] = useState(null);
  const [match, setMatch] = useState(null);
  const [setFilter, setSetFilter] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const originalInput = useRef(null);
  const clipStop = useRef(null);
  const lastTimeRef = useRef(0);
  const activeAnnosRef = useRef([]);
  const pausedForRef = useRef(new Set());
  const autoPauseRef = useRef(true);
  useEffect(() => { autoPauseRef.current = autoPause; }, [autoPause]);

  const reloadActions = useCallback(() => getActions({ video_id: videoId }).then(setActions), [videoId]);
  const reloadRallies = useCallback(() => Promise.all([getRalliesFull(videoId).then(setRallies), getMatch(videoId).then(setMatch)]), [videoId]);
  useEffect(() => { if (match?.current_set) setSetNumber(match.current_set); }, [match?.current_set, match?.total_rallies]);

  const phaseKeys = useMemo(() => (kphases.length ? kphases.map((k) => k.key) : ["K1", "K2", "K3"]), [kphases]);
  const phaseName = (key) => kphases.find((k) => k.key === key)?.name || "";

  useEffect(() => {
    Promise.all([getVideo(videoId), getFundamentos(), getClassificacoes(), getAthletes(), getPositions(), getFormations(), getSettings(), getActions({ video_id: videoId })])
      .then(([v, f, c, a, p, fo, s, acts]) => {
        setVideo(v); setFunds(f.filter((x) => x.active !== false && !x.archived)); setClasses(c.filter((x) => x.active !== false && !x.archived));
        setAthletes(a.filter((x) => x.active !== false)); setPositions(p.filter((x) => x.active !== false)); setFormations(fo.filter((x) => x.active !== false));
        setForm((fm) => ({ ...fm, clip_before: s.default_clip_before, clip_after: s.default_clip_after }));
        setActions(acts);
      });
    reloadRallies();
  }, [videoId, reloadRallies]);

  useEffect(() => {
    if (video?.analysis_model) getKphases(video.analysis_model).then((k) => setKphases(k.filter((x) => x.active !== false)));
  }, [video?.analysis_model]);

  const changeModel = async (m) => {
    await updateVideo(videoId, { ...video, analysis_model: m });
    setVideo((v) => ({ ...v, analysis_model: m }));
    toast.success(`Modelo de análise: ${m === "A" ? "K1–K2" : "K0–K5"}`);
  };

  // Placar sincronizado com o vídeo (recomputado no cliente p/ confiabilidade)
  const scoreAt = useCallback((t, set) => {
    const rs = rallies.filter((r) => (r.set_number || 1) === set && r.number != null).sort((a, b) => a.number - b.number);
    let nos = 0, adv = 0, shown = { nos: 0, adv: 0 };
    for (const r of rs) {
      if (r.end_ts == null || r.end_ts <= t) {
        if (r.winner === "nos") nos += 1; else if (r.winner === "adv") adv += 1;
        shown = { nos, adv };
      }
    }
    return shown;
  }, [rallies]);

  const suggestFor = useCallback(async (fundId, teamVal) => {
    const fund = funds.find((x) => x.id === fundId);
    if (!fund) return;
    const prior = actions.filter((x) => !x.rally_id);
    try {
      const { phase } = await suggestPhase({ model: video?.analysis_model || "B", fundamento_name: fund.name, team: teamVal || "nos", serving_team: servingTeam, prior });
      if (phase) setForm((fm) => ({ ...fm, phase }));
    } catch { /* noop */ }
  }, [funds, actions, video, servingTeam]);

  const registerPoint = async (winner) => {
    if (pointBusy) return;
    setPointBusy(true);
    try {
      await closePoint({ video_id: videoId, winner, set_number: setNumber, serving_team: servingTeam });
      await Promise.all([reloadActions(), reloadRallies()]);
    } catch { setPointBusy(false); return toast.error("Falha ao registrar o ponto"); }
    setPointBusy(false);
    if (winner === "pendente") return toast.warning("Rali encerrado com resultado pendente de revisão");
    setServingTeam(winner); // vencedor do rally saca no próximo
    toast.success(`Ponto ${winner === "nos" ? (video.equipe_name || "AVA") : (video.opponent || "Adversário")}! Rally encerrado.`);
  };

  const teamName = (w) => (w === "pendente" ? "Pendente" : w === "nos" ? (video?.equipe_name || "AVA") : (video?.opponent || "Adversário"));
  const saveRules = async (rules) => {
    try { const s = await saveMatchRules(videoId, rules); setVideo((v) => ({ ...v, ...rules })); await reloadRallies(); setRulesOpen(false);
      toast.success(s.review_count ? `Regras salvas — placar recalculado. ${s.review_count} rali(s) para revisão.` : "Regras salvas — placar recalculado");
    } catch (e) { toast.error(e?.response?.data?.detail || "Falha ao salvar as regras"); }
  };
  const applyProposal = async () => { const s = await applyProposedSets(videoId); await Promise.all([reloadRallies(), reloadActions()]); toast.success(`${s.moved} rali(s) reorganizado(s) conforme as regras`); };
  const onEditRally = async (r, body) => {
    try { await editRally(r.id, body); } catch (e) { return toast.error(e?.response?.data?.detail || "Falha ao salvar o rali"); }
    await Promise.all([reloadRallies(), reloadActions()]); toast.success("Rali atualizado — placar recalculado");
  };
  const undoLastPoint = () => {
    const last = [...rallies].sort((a, b) => b.number - a.number)[0];
    if (!last) return toast.error("Nenhum ponto registrado");
    setRemoveRally(last);
  };
  const confirmRemovePoint = async (rally, mode, confirmDelete) => {
    try { await removePoint(rally.id, { actions_mode: mode, confirm_delete: confirmDelete }); }
    catch (e) { return toast.error(e?.response?.data?.detail || "Falha ao remover o ponto"); }
    await Promise.all([reloadActions(), reloadRallies()]);
    setRemoveRally(null);
    if (mode === "delete" && editingId && (rally.action_ids || []).includes(editingId)) cancelDraft();
    toast.success(`Ponto #${rally.number} removido — placar recalculado${mode === "delete" ? "" : "; lances e marcações preservados"}`);
  };
  const reattach = async (a) => { try { await reattachAction(a.id); } catch { return toast.error("Falha ao devolver o lance"); } await reloadActions(); toast.success("Lance devolvido ao rally em aberto"); };

  const exportClip = async ({ start, end, annotations, caption, filename }) => {
    const path = renderSourcePath(video);
    if (!path) return toast.error("Para exportar clipes de vídeos do YouTube, anexe o arquivo original da partida (botão “Arquivo p/ exportar”).");
    const tid = toast.loading("Renderizando clipe… 0%");
    setExporting(filename);
    try {
      await renderClip({ storagePath: path, start, end, annotations, caption, filename, onProgress: (p) => toast.loading(`Renderizando clipe… ${Math.round(p * 100)}%`, { id: tid }) });
      toast.success("Clipe exportado com as marcações", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Falha ao exportar o clipe", { id: tid });
    } finally { setExporting(null); }
  };
  const actionClipRange = (a) => [
    Math.max(0, a.clip_start != null ? a.clip_start : a.timestamp - (a.clip_before ?? 5)),
    Math.min(duration || 1e9, a.clip_end != null ? a.clip_end : a.timestamp + (a.clip_after ?? 4)),
  ];
  const slug = (t) => (t || "clipe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const exportAction = (a) => {
    const [start, end] = actionClipRange(a);
    exportClip({ start, end, annotations: editingId === a.id ? annos : a.annotations || [], caption: `${a.fundamento_name || "Lance"}${a.classificacao_label ? " · " + a.classificacao_label : ""} · ${formatTime(a.timestamp)}`, filename: `${slug(video.title)}-${slug(a.fundamento_name)}-${Math.round(a.timestamp)}s` });
  };
  const exportRally = (r) => {
    const acts = r.actions || [];
    if (!acts.length) return toast.error("Rally sem lances vinculados para exportar");
    const ranges = acts.map(actionClipRange);
    exportClip({ start: Math.min(...ranges.map((x) => x[0])), end: Math.max(...ranges.map((x) => x[1])), annotations: acts.flatMap((a) => a.annotations || []), caption: `Rally #${r.number} · Ponto ${teamName(r.winner)} · ${r.score_after?.nos ?? 0}-${r.score_after?.adv ?? 0}`, filename: `${slug(video.title)}-rally-${r.number}` });
  };
  const exportDraft = () => exportClip({ start: clipStart, end: clipEnd, annotations: annos, caption: `${funds.find((x) => x.id === form.fundamento_id)?.name || "Lance"} · ${formatTime(markTime)}`, filename: `${slug(video.title)}-trecho-${Math.round(markTime)}s` });
  const onOriginalFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    const tid = toast.loading("Enviando arquivo original… 0%");
    try {
      const up = await uploadFile(file, "video", (p) => toast.loading(`Enviando arquivo original… ${p}%`, { id: tid }));
      const v = await setVideoOriginal(videoId, up.storage_path);
      setVideo((old) => ({ ...old, original_storage_path: v.original_storage_path }));
      toast.success("Arquivo original anexado — exportação de clipes liberada", { id: tid });
    } catch { toast.error("Falha no envio do arquivo", { id: tid }); }
  };
  const patchAnno = (id, patch) => setAnnos((a) => a.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const changeWinner = async (rallyId, winner) => {
    await setRallyWinner(rallyId, winner);
    await reloadRallies();
    toast.success("Vencedor atualizado — placar recalculado");
  };

  useEffect(() => {
    const t = sp.get("t"); const aid = sp.get("action");
    if (t) setTimeout(() => playerRef.current?.seekTo(Math.max(0, parseFloat(t))), 1200);
    if (aid && actions.length) { const a = actions.find((x) => x.id === aid); if (a) selectAction(a); }
    // eslint-disable-next-line
  }, [actions.length]);

  const onTime = useCallback((t) => {
    const prev = lastTimeRef.current; lastTimeRef.current = t;
    setTime(t);
    if (clipStop.current != null && t >= clipStop.current) { playerRef.current?.pause(); clipStop.current = null; setPlaying(false); return; }
    if (autoPauseRef.current && activeAnnosRef.current.length) {
      for (const el of activeAnnosRef.current) {
        if (el.startTime == null || el.pinned) continue;
        if (!pausedForRef.current.has(el.id) && el.startTime > prev && el.startTime <= t) {
          playerRef.current?.pause(); setPlaying(false);
          playerRef.current?.seekTo(el.startTime);
          pausedForRef.current.add(el.id);
          break;
        }
      }
    }
  }, []);

  const togglePlay = () => { if (!playerRef.current) return; if (playing) { playerRef.current.pause(); setPlaying(false); } else { clipStop.current = null; activeAnnosRef.current = annos; pausedForRef.current = new Set(); playerRef.current.play(); setPlaying(true); } };
  const seekBy = (d) => playerRef.current?.seekTo(Math.max(0, Math.min(duration || 1e9, time + d)));
  const changeRate = (r) => { setRate(r); playerRef.current?.setRate(r); };
  const fundClasses = useMemo(() => classes.filter((c) => c.fundamento_id === form.fundamento_id), [classes, form.fundamento_id]);
  const activeFund = useMemo(() => funds.find((f) => f.id === form.fundamento_id), [funds, form.fundamento_id]);

  // ---- Click-to-mark during playback ----
  const quickMark = (fundId) => {
    const now = playerRef.current?.getCurrentTime?.() ?? time;
    playerRef.current?.pause(); setPlaying(false); clipStop.current = null;
    setMarkTime(now);
    setEditingId(null); setDrafting(true); setAnnos([]); setSelEl(null);
    const fund = funds.find((f) => f.id === fundId);
    setForm((fm) => ({ ...base, clip_before: fm.clip_before, clip_after: fm.clip_after, formation: fm.formation, set_number: fm.set_number, fundamento_id: fundId, team: "nos" }));
    setShowCourt(fund?.uses_court !== false);
    suggestFor(fundId, "nos");
    playerRef.current?.seekTo(Math.max(0, now - Number(form.clip_before || 0)));
    toast.info(`${fund?.name} marcado em ${formatTime(now)} — fase sugerida, confira e salve`);
  };

  const selectAction = (a) => {
    setEditingId(a.id); setDrafting(true); setMarkTime(a.timestamp);
    setForm({ fundamento_id: a.fundamento_id || "", classificacao_id: a.classificacao_id || "", athlete_ids: a.athlete_ids || [], tactical_position: a.tactical_position || "", phase: a.phase || "", note: a.note || "", clip_before: a.clip_before ?? 5, clip_after: a.clip_after ?? 4, set_number: a.set_number ?? "", formation: a.formation || "", result: a.result || "", court: a.court || null, team: a.team || "nos" });
    setAnnos(a.annotations || []); setSelEl(null);
    playerRef.current?.pause(); setPlaying(false); playerRef.current?.seekTo(a.timestamp);
  };

  const cancelDraft = () => { setDrafting(false); setEditingId(null); setForm(base); setAnnos([]); playerRef.current?.seekTo(markTime); };
  const toggleAthlete = (id) => setForm((f) => ({ ...f, athlete_ids: f.athlete_ids.includes(id) ? f.athlete_ids.filter((x) => x !== id) : [...f.athlete_ids, id] }));

  const clipStart = Math.max(0, markTime - Number(form.clip_before || 0));
  const clipEnd = Math.min(duration || 1e9, markTime + Number(form.clip_after || 0));

  const buildBody = () => {
    const fund = funds.find((x) => x.id === form.fundamento_id);
    const cls = classes.find((x) => x.id === form.classificacao_id);
    return {
      video_id: videoId, timestamp: markTime,
      fundamento_id: form.fundamento_id, fundamento_name: fund?.name,
      classificacao_id: form.classificacao_id || null, classificacao_label: cls?.label || null,
      athlete_ids: form.athlete_ids, tactical_position: form.tactical_position || null, phase: form.phase || null,
      note: form.note, clip_before: Number(form.clip_before), clip_after: Number(form.clip_after),
      clip_start: clipStart, clip_end: clipEnd, annotations: annos,
      set_number: form.set_number === "" ? null : Number(form.set_number), formation: form.formation || null,
      result: form.result || null, court: form.court, team: form.team || "nos",
    };
  };

  const save = async (andContinue = false) => {
    if (!form.fundamento_id) return toast.error("Selecione um fundamento");
    const body = buildBody();
    let savedId = editingId;
    if (editingId) { await updateAction(editingId, body); toast.success("Lance atualizado"); }
    else { const created = await createAction(body); savedId = created.id; setEditingId(created.id); toast.success("Lance registrado!"); }
    await reloadActions();
    if (video?.status === "pendente") { setVideoStatus(videoId, "em_analise"); setVideo((v) => ({ ...v, status: "em_analise" })); }
    if (andContinue) { setDrafting(false); setForm(base); setAnnos([]); playerRef.current?.seekTo(markTime); playerRef.current?.play(); setPlaying(true); }
  };

  const retime = async () => { if (!editingId) return; const newT = playerRef.current?.getCurrentTime?.() ?? time; setMarkTime(newT); await updateAction(editingId, { ...buildBody(), timestamp: newT }); toast.success("Tempo do lance atualizado"); reloadActions(); };
  const removeAction = async (id) => { await deleteAction(id); if (editingId === id) cancelDraft(); toast.success("Lance excluído"); reloadActions(); };

  const playClip = (a) => {
    const start = Math.max(0, (a.clip_start != null ? a.clip_start : a.timestamp - (a.clip_before ?? 5)));
    clipStop.current = Math.min(duration || 1e9, (a.clip_end != null ? a.clip_end : a.timestamp + (a.clip_after ?? 4)));
    if (!drafting) { setAnnos(a.annotations || []); activeAnnosRef.current = a.annotations || []; }
    else { activeAnnosRef.current = annos; }
    pausedForRef.current = new Set();
    playerRef.current?.seekTo(start); playerRef.current?.play(); setPlaying(true);
  };
  const previewDraftClip = () => { activeAnnosRef.current = annos; pausedForRef.current = new Set(); clipStop.current = clipEnd; playerRef.current?.seekTo(clipStart); playerRef.current?.play(); setPlaying(true); };

  const undo = () => setAnnos((a) => a.slice(0, -1));
  const delSelEl = () => { if (selEl) { setAnnos((a) => a.filter((e) => e.id !== selEl)); setSelEl(null); } };
  const togglePin = () => { if (!selEl) return; setAnnos((a) => a.map((e) => (e.id === selEl ? { ...e, pinned: !e.pinned } : e))); };
  const markComplete = async () => { await setVideoStatus(videoId, "concluido"); setVideo((v) => ({ ...v, status: "concluido" })); toast.success("Análise concluída!"); };

  const toggleRally = (id) => setRallySel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const doLinkRally = async () => {
    if (rallySel.length < 2) return toast.error("Selecione ao menos 2 lances");
    await linkRally({ video_id: videoId, action_ids: rallySel, situation: rallySit, label: rallySit });
    toast.success("Jogada relacionada!"); setRallySel([]); reloadActions();
  };

  if (!video) return <Layout back="/galeria"><div className="text-muted-foreground">Carregando análise...</div></Layout>;

  const saqueCount = actions.filter((a) => (a.fundamento_name || "").toLowerCase() === "saque").length;
  const sideOutCount = rallies.filter((r) => r.serving_team && r.winner && r.winner !== r.serving_team).length;
  const pointsNos = rallies.filter((r) => r.winner === "nos").length;
  const pointsAdv = rallies.filter((r) => r.winner === "adv").length;
  const pad3 = (n) => String(n).padStart(3, "0");
  const setCount = Math.max(match?.set_rules?.length || 5, ...rallies.map((r) => r.set_number || 1), setNumber);
  const visibleRallies = setFilter == null ? rallies : rallies.filter((r) => (r.set_number || 1) === setFilter);

  return (
    <Layout back="/galeria">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0"><h1 className="ava-heading text-2xl sm:text-3xl font-extrabold truncate">{video.title}</h1><p className="text-sm text-muted-foreground">{video.categoria_name ? `${video.categoria_name} · ` : ""}{video.competition || ""} {video.opponent ? `· vs ${video.opponent}` : ""}</p></div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" data-testid="model-selector">
            <Settings2 size={14} className="text-muted-foreground ml-1" />
            {[["A", "K1–K2"], ["B", "K0–K5"]].map(([k, lbl]) => (
              <button key={k} data-testid={`model-${k}`} onClick={() => changeModel(k)} className={cn("rounded-md px-2.5 py-1 text-xs font-semibold transition", (video.analysis_model || "B") === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{lbl}</button>
            ))}
          </div>
          {video.source_type === "youtube" && (
            <>
              <input ref={originalInput} type="file" accept="video/*" className="hidden" onChange={onOriginalFile} data-testid="original-file-input" />
              <button data-testid="attach-original" onClick={() => originalInput.current?.click()} title="Anexe o arquivo da partida para renderizar clipes com marcações" className={cn("inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold", video.original_storage_path ? "border-emerald-500/40 text-emerald-500" : "border-border hover:border-primary/40")}><Upload size={15} /> {video.original_storage_path ? "Arquivo anexado" : "Arquivo p/ exportar"}</button>
            </>
          )}
          <button data-testid="mark-complete" onClick={markComplete} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold hover:border-emerald-500/50"><Check size={16} className="text-emerald-500" /> Concluir análise</button>
        </div>
      </div>

      {/* SCOREBOARD + PONTO */}
      <div className="rounded-xl border border-border bg-card p-3 mb-4 flex flex-wrap items-center gap-3">
        <Scoreboard home={video.equipe_name || "AVA"} away={video.opponent || "Adversário"} score={scoreAt(time, setNumber)} set={setNumber} rule={match?.set_rules?.[Math.min(setNumber, match.set_rules.length) - 1]} serving={servingTeam} onServe={setServingTeam} />
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="match-counters">
          <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-data font-semibold">Saque {pad3(saqueCount)}</span>
          <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-data font-semibold">Side-out {pad3(sideOutCount)}</span>
          <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-data font-semibold">Rallies {pad3(rallies.length)}</span>
          <span className="rounded-md bg-primary/15 text-primary px-2 py-1 text-[11px] font-data font-semibold">Pontos {video.equipe_name || "AVA"} {pointsNos} · {video.opponent || "ADV"} {pointsAdv}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Set</span>
          <select data-testid="set-select" value={setNumber} onChange={(e) => setSetNumber(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none">{Array.from({ length: setCount }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Encerrar rally — ponto de:</span>
          <button data-testid="point-nos" disabled={pointBusy} onClick={() => registerPoint("nos")} className="disabled:opacity-50 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110"><Trophy size={13} /> {video.equipe_name || "AVA"}</button>
          <button data-testid="point-adv" disabled={pointBusy} onClick={() => registerPoint("adv")} className="disabled:opacity-50 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90"><Trophy size={13} /> {video.opponent || "Adversário"}</button>
          <button data-testid="point-pending" disabled={pointBusy} onClick={() => registerPoint("pendente")} title="Encerrar rali sem definir o vencedor (fica para revisão)" className="disabled:opacity-50 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/10">Pendente</button>
          <button data-testid="undo-last-point" onClick={undoLastPoint} disabled={!rallies.length || pointBusy} title="Desfazer / remover último ponto" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-40"><Undo2 size={13} /> Desfazer ponto</button>
        </div>
      </div>

      <MatchSummary match={match} home={video.equipe_name || "AVA"} away={video.opponent || "Adversário"} setFilter={setFilter} onFilter={setSetFilter} onOpenRules={() => setRulesOpen(true)} onApplyProposal={applyProposal} />

      {/* QUICK MARK BAR */}
      <div className="rounded-xl border border-primary/30 bg-card p-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary mr-1">⚡ Marcar durante o vídeo</span>
          {funds.map((f) => (
            <button key={f.id} data-testid={`quick-${f.id}`} onClick={() => quickMark(f.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition" style={{ background: f.color }}>{f.name}</button>
          ))}
          <span className="ml-auto font-data text-xs text-muted-foreground">Clique = pausa automática no tempo exato</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-3">
          <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-border bg-black">
            <VideoPlayer ref={playerRef} video={video} onTime={onTime} onDuration={setDuration} />
            <AnnotationLayer elements={annos} onChange={setAnnos} tool={tool} color={color} strokeWidth={width} currentTime={time} editable={drafting} selectedId={selEl} onSelect={setSelEl} onToolDone={() => setTool("select")} />
          </div>

          <div className="rounded-xl border border-border bg-card p-3 space-y-3">
            <input type="range" min={0} max={Number.isFinite(duration) ? duration : 0} step={0.1} value={time} onChange={(e) => playerRef.current?.seekTo(parseFloat(e.target.value))} data-testid="seek-bar" className="w-full accent-[#E50914]" />
            <div className="flex items-center gap-2 flex-wrap">
              <button data-testid="seek-back" onClick={() => seekBy(-5)} className="rounded-lg border border-border p-2 hover:border-primary/40"><Rewind size={16} /></button>
              <button data-testid="play-pause" onClick={togglePlay} className="rounded-lg bg-primary p-2.5 text-primary-foreground hover:brightness-110">{playing ? <Pause size={18} /> : <Play size={18} />}</button>
              <button data-testid="seek-fwd" onClick={() => seekBy(5)} className="rounded-lg border border-border p-2 hover:border-primary/40"><FastForward size={16} /></button>
              <button onClick={() => seekBy(-1 / 15)} className="rounded-lg border border-border px-2 py-2 text-xs font-data hover:border-primary/40" data-testid="frame-back">◁</button>
              <button onClick={() => seekBy(1 / 15)} className="rounded-lg border border-border px-2 py-2 text-xs font-data hover:border-primary/40" data-testid="frame-fwd">▷</button>
              <span className="font-data text-sm text-muted-foreground ml-1">{formatTime(time)} / {formatTime(duration)}</span>
              <div className="ml-auto flex items-center gap-1">{[0.25, 0.5, 1].map((r) => <button key={r} onClick={() => changeRate(r)} data-testid={`rate-${r}`} className={cn("rounded-lg px-2 py-1 text-xs font-data border", rate === r ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>{r}x</button>)}</div>
            </div>
          </div>

          {drafting && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Desenho</span>
                {TOOLS.map((t) => { const Icon = t.icon; return <button key={t.id} data-testid={`tool-${t.id}`} onClick={() => { setTool(t.id); if (t.id === "highlight") setColor("#F59E0B"); }} className={cn("rounded-lg border p-2 transition", tool === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}><Icon size={16} /></button>; })}
                <div className="w-px h-6 bg-border mx-1" />
                {COLORS.map((c) => <button key={c} data-testid={`color-${c.replace("#", "")}`} onClick={() => setColor(c)} className={cn("h-7 w-7 rounded-full border-2", color === c ? "border-foreground scale-110" : "border-transparent")} style={{ background: c }} />)}
                <input type="range" min={2} max={10} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-16 accent-[#E50914]" data-testid="stroke-width" />
                <button onClick={undo} data-testid="undo-anno" className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40"><Undo2 size={16} /></button>
                <button onClick={delSelEl} disabled={!selEl} data-testid="del-element" className="rounded-lg border border-border p-2 text-muted-foreground hover:border-primary/40 disabled:opacity-40"><Trash2 size={16} /></button>
                <button onClick={togglePin} disabled={!selEl} data-testid="toggle-pin" title="Fixar marcação no trecho inteiro" className={cn("rounded-lg border p-2 transition disabled:opacity-40", annos.find((e) => e.id === selEl)?.pinned ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}><Pin size={16} /></button>
                <div className="w-px h-6 bg-border mx-1" />
                <button onClick={() => setAutoPause((a) => !a)} data-testid="toggle-autopause" title="Pausa automática nas marcações" className={cn("rounded-lg border p-2 transition", autoPause ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>{autoPause ? <Timer size={16} /> : <TimerOff size={16} />}</button>
                <span className="text-[11px] text-muted-foreground">pausa {autoPause ? "ligada" : "desligada"}</span>
              </div>
            </div>
          )}
          {drafting && <AnnoTimingPanel annos={annos} selId={selEl} time={time} onSelect={(id) => { setSelEl(id); setTool("select"); }} onPatch={patchAnno} onSeek={(t) => { playerRef.current?.pause(); setPlaying(false); playerRef.current?.seekTo(t); }} />}
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-2 space-y-4">
          {drafting ? (
            <div className="rounded-xl border border-primary/40 bg-card p-4 ava-fade-up">
              <div className="flex items-center justify-between mb-3">
                <h3 className="ava-heading text-lg font-bold flex items-center gap-2"><Scissors size={16} className="text-primary" /> {editingId ? "Editar trecho" : "Novo trecho"}</h3>
                <button data-testid="cancel-draft" onClick={cancelDraft} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><X size={15} /></button>
              </div>

              {/* clip trim */}
              <div className="rounded-lg border border-border bg-background p-3 mb-3">
                <div className="flex items-center justify-between text-xs mb-2"><span className="font-semibold text-muted-foreground">RECORTE</span><span className="font-data text-primary">{formatTime(clipStart)} → {formatTime(clipEnd)} · {formatTime(markTime)}</span></div>
                <ClipTrimBar
                  before={Number(form.clip_before || 0)}
                  after={Number(form.clip_after || 0)}
                  onBefore={(v) => setForm((fm) => ({ ...fm, clip_before: Number(v.toFixed(1)) }))}
                  onAfter={(v) => setForm((fm) => ({ ...fm, clip_after: Number(v.toFixed(1)) }))}
                />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-[11px] text-muted-foreground">Antes (s)</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <button data-testid="clip-before-minus" onClick={() => setForm((fm) => ({ ...fm, clip_before: Math.max(0, Number(fm.clip_before || 0) - 1) }))} className="rounded-lg border border-border px-2 py-1.5 text-sm hover:border-primary/40"><Minus size={13} /></button>
                      <input type="number" data-testid="clip-before-field" value={form.clip_before} onChange={(e) => setForm({ ...form, clip_before: e.target.value })} className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-data outline-none focus:border-primary/60" />
                      <button data-testid="clip-before-plus" onClick={() => setForm((fm) => ({ ...fm, clip_before: Number(fm.clip_before || 0) + 1 }))} className="rounded-lg border border-border px-2 py-1.5 text-sm hover:border-primary/40"><Plus size={13} /></button>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Depois (s)</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <button data-testid="clip-after-minus" onClick={() => setForm((fm) => ({ ...fm, clip_after: Math.max(0, Number(fm.clip_after || 0) - 1) }))} className="rounded-lg border border-border px-2 py-1.5 text-sm hover:border-primary/40"><Minus size={13} /></button>
                      <input type="number" data-testid="clip-after-field" value={form.clip_after} onChange={(e) => setForm({ ...form, clip_after: e.target.value })} className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-data outline-none focus:border-primary/60" />
                      <button data-testid="clip-after-plus" onClick={() => setForm((fm) => ({ ...fm, clip_after: Number(fm.clip_after || 0) + 1 }))} className="rounded-lg border border-border px-2 py-1.5 text-sm hover:border-primary/40"><Plus size={13} /></button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button data-testid="set-start-now" onClick={() => setForm({ ...form, clip_before: Math.max(0, (markTime - time)).toFixed(1) })} className="flex-1 rounded-lg border border-border py-1.5 text-[11px] hover:border-primary/40">Início = tempo atual</button>
                  <button data-testid="set-end-now" onClick={() => setForm({ ...form, clip_after: Math.max(0, (time - markTime)).toFixed(1) })} className="flex-1 rounded-lg border border-border py-1.5 text-[11px] hover:border-primary/40">Fim = tempo atual</button>
                  <button data-testid="preview-clip" onClick={previewDraftClip} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground"><Play size={12} className="inline" /> Prévia</button>
                  <button data-testid="export-draft-clip" onClick={exportDraft} disabled={!!exporting} title="Exportar clipe renderizado com marcações" className="rounded-lg border border-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary disabled:opacity-50">{exporting ? <Loader2 size={12} className="inline animate-spin" /> : <Film size={12} className="inline" />} Exportar</button>
                </div>
              </div>

              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equipe da ação</label>
              <div className="flex gap-1.5 mt-1 mb-3">
                {[["nos", video.equipe_name || "AVA"], ["adv", video.opponent || "Adversário"]].map(([k, lbl]) => (
                  <button key={k} data-testid={`team-${k}`} onClick={() => { setForm((fm) => ({ ...fm, team: k })); if (form.fundamento_id) suggestFor(form.fundamento_id, k); }} className={cn("flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition", form.team === k ? (k === "nos" ? "bg-primary text-primary-foreground border-primary" : "bg-foreground text-background border-foreground") : "border-border text-muted-foreground hover:border-primary/40")}>{lbl}</button>
                ))}
              </div>

              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fundamento</label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-3">
                {funds.map((f) => <button key={f.id} data-testid={`fund-${f.id}`} onClick={() => { setForm((fm) => ({ ...fm, fundamento_id: f.id, classificacao_id: "" })); suggestFor(f.id, form.team); }} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-semibold border transition", form.fundamento_id === f.id ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-primary/40")} style={form.fundamento_id === f.id ? { background: f.color } : {}}>{f.name}</button>)}
              </div>

              {form.fundamento_id && (<><label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classificação</label>
                <div className="flex flex-wrap gap-1.5 mt-1 mb-3">{fundClasses.map((c) => <button key={c.id} data-testid={`class-${c.id}`} onClick={() => setForm((fm) => ({ ...fm, classificacao_id: c.id }))} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-semibold border", form.classificacao_id === c.id ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-primary/40")} style={form.classificacao_id === c.id ? { background: c.color } : {}}>{c.symbol ? `${c.symbol} ` : ""}{c.label}</button>)}</div></>)}

              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Users size={12} /> Atletas</label>
              <div className="flex flex-wrap gap-1.5 mt-1 mb-3 max-h-24 overflow-auto scrollbar-thin">{athletes.map((a) => <button key={a.id} data-testid={`mark-athlete-${a.id}`} onClick={() => toggleAthlete(a.id)} className={cn("rounded-lg px-2 py-1 text-xs font-medium border", form.athlete_ids.includes(a.id) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>{a.number ? `${a.number} ` : ""}{a.name}</button>)}</div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <label className="text-[11px] text-muted-foreground">Set<input type="number" data-testid="mark-set" value={form.set_number} onChange={(e) => setForm({ ...form, set_number: e.target.value })} className="w-full mt-0.5 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/60" /></label>
                <label className="text-[11px] text-muted-foreground">Formação<select data-testid="mark-formation" value={form.formation} onChange={(e) => setForm({ ...form, formation: e.target.value })} className="w-full mt-0.5 rounded-lg border border-border bg-background px-1 py-1.5 text-sm outline-none focus:border-primary/60"><option value="">—</option>{formations.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}</select></label>
                <label className="text-[11px] text-muted-foreground flex items-center gap-1">Fase tática <Sparkles size={10} className="text-primary" /><select data-testid="mark-phase" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} className="w-full mt-0.5 rounded-lg border border-border bg-background px-1 py-1.5 text-sm outline-none focus:border-primary/60"><option value="">—</option>{phaseKeys.map((s) => <option key={s} value={s}>{s}{phaseName(s) ? ` · ${phaseName(s)}` : ""}</option>)}</select></label>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <label className="text-[11px] text-muted-foreground">Posição no lance<select data-testid="mark-position" value={form.tactical_position} onChange={(e) => setForm({ ...form, tactical_position: e.target.value })} className="w-full mt-0.5 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/60"><option value="">—</option>{positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</select></label>
                <label className="text-[11px] text-muted-foreground">Resultado<select data-testid="mark-result" value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="w-full mt-0.5 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary/60"><option value="">—</option>{RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              </div>

              {/* court map */}
              <button onClick={() => setShowCourt((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2"><MapPin size={13} className="text-primary" /> Mapa da quadra {form.court?.zone != null ? `· zona ${form.court.zone}` : ""} {showCourt ? "▲" : "▼"}</button>
              {showCourt && (
                <div className="mb-3">
                  <div className="max-w-[220px] mx-auto"><CourtMap value={form.court} onChange={(court) => setForm((f) => ({ ...f, court }))} editable /></div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">Clique = ponto/zona · arraste = direção da bola</span>
                    {form.court && <button data-testid="clear-court" onClick={() => setForm({ ...form, court: null })} className="text-[11px] text-primary">limpar</button>}
                  </div>
                </div>
              )}

              <textarea data-testid="mark-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Observações" rows={2} className="w-full mb-3 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60" />

              <div className="flex gap-2">
                <button data-testid="save-action" onClick={() => save(false)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-card py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"><Save size={16} /> Salvar</button>
                <button data-testid="save-continue" onClick={() => save(true)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110"><Play size={16} /> Salvar e continuar</button>
                {editingId && <button data-testid="retime-action" onClick={retime} title="Tempo = atual" className="rounded-lg border border-border px-3 hover:border-primary/40"><Clock size={16} /></button>}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-primary/40 bg-card p-6 text-center">
              <Scissors className="mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">Clique num fundamento na barra <span className="text-primary font-semibold">⚡ acima</span> enquanto assiste. O vídeo pausa sozinho e abre a edição do trecho aqui.</p>
            </div>
          )}

          {/* timeline */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="ava-heading text-lg font-bold">Lances ({actions.length})</h3>
              {rallySel.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select value={rallySit} onChange={(e) => setRallySit(e.target.value)} data-testid="rally-situation" className="rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none">{phaseKeys.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  <button data-testid="link-rally" onClick={doLinkRally} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"><Link2 size={12} /> Relacionar ({rallySel.length})</button>
                </div>
              )}
            </div>
            <div className="divide-y divide-border max-h-[420px] overflow-auto scrollbar-thin">
              {actions.length === 0 ? <div className="p-5 text-center text-sm text-muted-foreground">Nenhum lance registrado ainda.</div> : actions.map((a) => {
                const fd = funds.find((x) => x.id === a.fundamento_id);
                return (
                  <div key={a.id} data-testid={`timeline-${a.id}`} className={cn("flex items-center gap-2 p-2.5 hover:bg-secondary/40", editingId === a.id && "bg-primary/5 border-l-2 border-primary")}>
                    <input type="checkbox" data-testid={`rally-check-${a.id}`} checked={rallySel.includes(a.id)} onChange={() => toggleRally(a.id)} className="accent-[#E50914]" />
                    <button onClick={() => playClip(a)} data-testid={`play-clip-${a.id}`} className="h-7 w-7 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center text-primary hover:bg-primary/25"><Play size={13} /></button>
                    <button onClick={() => selectAction(a)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="h-2 w-2 rounded-full" style={{ background: fd?.color }} />
                        <span className="text-sm font-medium truncate">{a.fundamento_name}</span>
                        {a.classificacao_label && <span className="text-xs text-muted-foreground">· {a.classificacao_label}</span>}
                        {a.formation && <span className="text-[10px] rounded bg-secondary px-1">{a.formation}</span>}
                        {a.phase && <span className="text-[10px] rounded bg-primary/15 text-primary px-1">{a.phase}</span>}
                        {a.team === "adv" && <span className="text-[10px] rounded bg-foreground/15 px-1">ADV</span>}
                        {a.court?.zone != null && <span className="text-[10px] rounded bg-secondary px-1">Z{a.court.zone}</span>}
                        {a.detached && !a.rally_id && <span data-testid={`detached-${a.id}`} className="text-[10px] rounded bg-amber-500/15 text-amber-500 px-1">avulso</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{(a.athlete_ids || []).map((id) => athletes.find((x) => x.id === id)?.name).filter(Boolean).join(", ") || "—"}</div>
                    </button>
                    <span className="font-data text-xs text-muted-foreground">{formatTime(a.timestamp)}</span>
                    {a.detached && !a.rally_id && <button onClick={() => reattach(a)} data-testid={`reattach-${a.id}`} title="Devolver ao rally em aberto" className="text-muted-foreground hover:text-primary"><Unlink size={14} /></button>}
                    <button onClick={() => exportAction(a)} disabled={!!exporting} data-testid={`export-clip-${a.id}`} title="Exportar clipe com marcações" className="text-muted-foreground hover:text-primary disabled:opacity-40"><Film size={14} /></button>
                    <button onClick={() => removeAction(a.id)} data-testid={`del-action-${a.id}`} className="text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RALLY HISTORY */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-2">
              <ListOrdered size={16} className="text-primary" />
              <h3 className="ava-heading text-lg font-bold">Rallies ({visibleRallies.length}{setFilter != null ? ` · Set ${setFilter}` : ""})</h3>
              <span className="ml-auto text-[11px] text-muted-foreground">placar sincronizado com o vídeo</span>
            </div>
            <div className="divide-y divide-border max-h-[360px] overflow-auto scrollbar-thin">
              {visibleRallies.length === 0 ? (
                <div className="p-5 text-center text-sm text-muted-foreground">Marque os lances e clique em “ponto de…” para encerrar o rally. As ações do ponto são agrupadas automaticamente.</div>
              ) : visibleRallies.map((r) => (
                <RallyRow key={r.id} r={r} teamName={teamName} time={time} setCount={setCount} exporting={exporting}
                  onPlay={(x) => x.start_ts != null && playerRef.current?.seekTo(Math.max(0, x.start_ts))}
                  onWinner={changeWinner} onExport={exportRally} onRemove={setRemoveRally} onSelectAction={selectAction} onEdit={onEditRally} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <SetRulesDialog open={rulesOpen} rules={match ? { sets_to_win: match.sets_to_win, set_rules: match.set_rules } : null} onClose={() => setRulesOpen(false)} onSave={saveRules} />
      <RemovePointDialog rally={removeRally} teamName={teamName} onClose={() => setRemoveRally(null)} onConfirm={confirmRemovePoint} />
    </Layout>
  );
}
