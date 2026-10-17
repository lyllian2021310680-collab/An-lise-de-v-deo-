import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Film, Loader2, AlertTriangle, Server, Star } from "lucide-react";
import { createCompilation } from "@/lib/api";
import { isHighlight, notifyJobs } from "@/lib/highlights";
import { renderCompilation, renderSourcePath, actionRange } from "@/lib/clipRender";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const slug = (t) => (t || "video").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const chip = (on) => cn("rounded-lg border px-2.5 py-1 text-xs font-semibold transition", on ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40");

// actions: lances candidatos; videosById: id -> vídeo; fixedAthleteId trava o modo individual
export const CompilationDialog = ({ open, onClose, actions, videosById, athletes, funds, classes = [], fixedAthleteId, teamLabel = "AVA" }) => {
  const [scope, setScope] = useState(fixedAthleteId ? "athlete" : "team");
  const [athleteId, setAthleteId] = useState(fixedAthleteId || "");
  const [selFunds, setSelFunds] = useState([]);
  const [classId, setClassId] = useState("");
  const [split, setSplit] = useState("one");
  const [busy, setBusy] = useState(false);
  const [hl, setHl] = useState(false);

  const athleteName = (id) => athletes.find((a) => a.id === id)?.name || "";
  const usedFunds = useMemo(() => funds.filter((f) => actions.some((a) => a.fundamento_id === f.id)), [funds, actions]);
  const picked = useMemo(() => actions.filter((a) =>
    (selFunds.length === 0 || selFunds.includes(a.fundamento_id)) &&
    (!hl || isHighlight(a)) &&
    (!classId || a.classificacao_id === classId) &&
    (scope === "team" ? a.team !== "adv" : athleteId && (a.athlete_ids || []).includes(athleteId))
  ).sort((x, y) => (x.video_id === y.video_id ? x.timestamp - y.timestamp : (videosById[x.video_id]?.match_date || "").localeCompare(videosById[y.video_id]?.match_date || ""))), [actions, selFunds, classId, scope, athleteId, videosById, hl]);
  const playable = picked.filter((a) => renderSourcePath(videosById[a.video_id]));
  const skipped = picked.length - playable.length;
  const totalDur = playable.reduce((s, a) => { const [st, en] = actionRange(a); return s + Math.max(0, en - st); }, 0);
  const who = scope === "team" ? teamLabel : athleteName(athleteId);

  const segOf = (a) => {
    const vid = videosById[a.video_id];
    const [start, end] = actionRange(a, vid?.duration);
    const names = (a.athlete_ids || []).map(athleteName).filter(Boolean).join(", ");
    return { storagePath: renderSourcePath(vid), start, end, annotations: a.annotations || [], caption: [a.fundamento_name, a.classificacao_label, names, vid?.opponent ? `x ${vid.opponent}` : null, formatTime(a.timestamp)].filter(Boolean).join(" · ") };
  };
  const groups = () => {
    const byFund = {};
    playable.forEach((a) => { (byFund[a.fundamento_name || "Lance"] ||= []).push(a); });
    return byFund;
  };

  const generate = async () => {
    if (!playable.length) return toast.error("Nenhum lance com vídeo disponível para exportar");
    setBusy(true);
    const tid = toast.loading("Gerando compilação… 0%");
    const prog = (label) => (p, i, n) => toast.loading(`${label} — trecho ${i}/${n} · ${Math.round(p * 100)}%`, { id: tid });
    try {
      const g = groups();
      if (split === "one") {
        const segments = Object.entries(g).flatMap(([name, list]) => list.map((a, i) => ({ ...segOf(a), ...(i === 0 ? { title: name, subtitle: `${who} · ${list.length} lance(s)` } : {}) })));
        await renderCompilation({ segments, filename: `compilacao-${slug(who)}-${slug(Object.keys(g).join("-"))}`, onProgress: prog("Compilação") });
      } else {
        for (const [name, list] of Object.entries(g)) {
          await renderCompilation({ segments: list.map((a, i) => ({ ...segOf(a), ...(i === 0 ? { title: name, subtitle: `${who} · ${list.length} lance(s)` } : {}) })), filename: `compilacao-${slug(who)}-${slug(name)}`, onProgress: prog(name) });
        }
      }
      toast.success("Compilação salva no seu dispositivo", { id: tid });
    } catch (e) { toast.error(e?.message || "Não foi possível ler um dos vídeos (formato não suportado por este navegador). Tente pelo Chrome ou Edge atualizado.", { id: tid }); }
    finally { setBusy(false); }
  };

  const generateServer = async () => {
    if (!playable.length) return toast.error("Nenhum lance com vídeo disponível para exportar");
    setBusy(true);
    try {
      await createCompilation({ action_ids: playable.map((a) => a.id), who, split, title: `${hl ? "Melhores momentos" : "Compilação"} — ${who}` });
      notifyJobs();
      toast.success("Compilação iniciada no servidor", { description: "Pode fechar a página. Você será avisado no sininho quando terminar." });
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Falha ao iniciar a compilação"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent data-testid="compilation-dialog" className="max-w-xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="ava-heading text-xl">Salvar compilação em vídeo</DialogTitle>
          <DialogDescription>Junta todos os lances escolhidos (ex.: passes, bloqueios, ataques) num vídeo, com as marcações desenhadas e legenda de cada lance.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!fixedAthleteId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Para</span>
              <button data-testid="comp-scope-team" onClick={() => setScope("team")} className={chip(scope === "team")}>Equipe</button>
              <button data-testid="comp-scope-athlete" onClick={() => setScope("athlete")} className={chip(scope === "athlete")}>Individual</button>
              {scope === "athlete" && (
                <select data-testid="comp-athlete" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none">
                  <option value="">Selecione o atleta…</option>
                  {athletes.map((a) => <option key={a.id} value={a.id}>{a.number ? `#${a.number} ` : ""}{a.name}</option>)}
                </select>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Fundamentos</span>
            <button data-testid="comp-highlights" onClick={() => { setHl((x) => !x); setSelFunds([]); setClassId(""); }} className={chip(hl)}><Star size={11} className="inline mr-1" />Melhores momentos</button>
            <button data-testid="comp-fund-all" onClick={() => { setSelFunds([]); setHl(false); }} className={chip(selFunds.length === 0 && !hl)}>Todos</button>
            {usedFunds.map((f) => (
              <button key={f.id} data-testid={`comp-fund-${f.id}`} onClick={() => { setClassId(""); setSelFunds((s) => (s.includes(f.id) ? s.filter((x) => x !== f.id) : [...s, f.id])); }} className={chip(selFunds.includes(f.id))}>
                <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: f.color }} />{f.name}
              </button>
            ))}
          </div>
          {selFunds.length === 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Classificação</span>
              <select data-testid="comp-class" value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none">
                <option value="">Todas</option>
                {classes.filter((c) => c.fundamento_id === selFunds[0]).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Arquivos</span>
            <button data-testid="comp-split-one" onClick={() => setSplit("one")} className={chip(split === "one")}>Tudo em um vídeo</button>
            <button data-testid="comp-split-fund" onClick={() => setSplit("fund")} className={chip(split === "fund")}>Um vídeo por fundamento</button>
          </div>
          <div data-testid="comp-summary" className="rounded-lg bg-secondary/40 p-3 text-sm">
            <b className="font-data">{playable.length}</b> lance(s) · duração aprox. <b className="font-data">{formatTime(totalDur)}</b>
            {Object.entries(groups()).map(([n, l]) => <span key={n} className="ml-2 text-xs text-muted-foreground">{n}: {l.length}</span>)}
            {skipped > 0 && <div data-testid="comp-skipped" className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-500"><AlertTriangle size={12} /> {skipped} lance(s) de vídeos do YouTube sem arquivo original anexado ficarão de fora.</div>}
          </div>
          <p className="text-[11px] text-muted-foreground"><b>No servidor:</b> continua mesmo com a página fechada e avisa no sininho (título e legendas; sem os desenhos). <b>No navegador:</b> inclui as setas e desenhos, mas grava em tempo real com a aba aberta.</p>
          <div className="flex justify-end gap-2">
            <button data-testid="comp-cancel" disabled={busy} onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">Fechar</button>
            <button data-testid="comp-generate" disabled={busy || !playable.length} onClick={generate} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:border-primary/40 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Film size={14} />} No navegador (com desenhos)
            </button>
            <button data-testid="comp-generate-server" disabled={busy || !playable.length} onClick={generateServer} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Server size={14} /> Gerar no servidor
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
