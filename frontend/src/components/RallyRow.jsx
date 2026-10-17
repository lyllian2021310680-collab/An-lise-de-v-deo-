import { useEffect, useState } from "react";
import { Play, Trophy, Film, Trash2, Pencil, AlertTriangle, Lock, Scissors, Merge, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

const btn = "h-6 w-6 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-primary disabled:opacity-40";

export const RallyRow = ({ r, teamName, time, setCount, exporting, hasNext, onPlay, onWinner, onExport, onRemove, onSelectAction, onEdit, onSplit, onMergeNext }) => {
  const [edit, setEdit] = useState(false);
  const [st, setSt] = useState(r.start_ts ?? "");
  const [en, setEn] = useState(r.end_ts ?? "");
  const [splitW, setSplitW] = useState("pendente");
  useEffect(() => { setSt(r.start_ts ?? ""); setEn(r.end_ts ?? ""); }, [r.start_ts, r.end_ts]);
  const winCls = r.winner === "nos" ? "bg-primary/15 text-primary" : r.winner === "adv" ? "bg-foreground/15" : "bg-amber-500/15 text-amber-500";
  const save = () => { onEdit(r, { start_ts: st === "" ? null : Number(st), end_ts: en === "" ? null : Number(en) }); setEdit(false); };
  return (
    <div data-testid={`rally-${r.number}`} className={cn("p-3", r.needs_review && "bg-amber-500/5")}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-data text-xs text-muted-foreground w-10">#{r.number}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", winCls)}>
          <Trophy size={10} className="inline mr-0.5" />{r.winner === "pendente" ? "Pendente" : teamName(r.winner)}
        </span>
        <span className="font-data text-xs text-muted-foreground">{r.score_before?.nos ?? 0}-{r.score_before?.adv ?? 0} → <b className="text-foreground">{r.score_after?.nos ?? 0}-{r.score_after?.adv ?? 0}</b></span>
        <span className="text-[10px] rounded bg-secondary px-1">Set {r.set_number || 1}{r.set_manual && <Lock size={8} className="inline ml-0.5" />}</span>
        {r.source === "ia" && <span title={r.ai_reason || "Sugerido pela IA e confirmado"} className="text-[10px] rounded bg-primary/10 text-primary px-1"><Sparkles size={8} className="inline" /> IA {Math.round((r.ai_confidence || 0) * 100)}%</span>}
        {r.closes_set && <span data-testid={`rally-closes-set-${r.number}`} className="text-[10px] rounded bg-emerald-500/15 text-emerald-500 px-1 font-semibold">fim do set</span>}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button data-testid={`rally-play-${r.number}`} onClick={() => onPlay(r)} className="h-6 w-6 rounded-lg bg-primary/15 flex items-center justify-center text-primary hover:bg-primary/25"><Play size={12} /></button>
          <select data-testid={`rally-winner-${r.number}`} value={r.winner || "pendente"} onChange={(e) => onWinner(r.id, e.target.value)} title="Vencedor do rali (recalcula placar)" className="h-6 rounded-lg border border-border bg-background px-1 text-[11px] outline-none">
            <option value="nos">{teamName("nos")}</option><option value="adv">{teamName("adv")}</option><option value="pendente">Pendente</option>
          </select>
          <button data-testid={`rally-edit-${r.number}`} onClick={() => setEdit((x) => !x)} title="Editar tempos e set" className={btn}><Pencil size={12} /></button>
          <button data-testid={`rally-export-${r.number}`} onClick={() => onExport(r)} disabled={!!exporting} title="Exportar clipe do rally com marcações" className={btn}><Film size={12} /></button>
          <button data-testid={`rally-remove-${r.number}`} onClick={() => onRemove(r)} title="Remover ponto (preserva vídeo e análise)" className={btn}><Trash2 size={12} /></button>
        </div>
      </div>
      {r.needs_review && (
        <div data-testid={`rally-review-${r.number}`} className="mt-1.5 pl-10 flex flex-wrap items-center gap-2 text-[11px] text-amber-500">
          <AlertTriangle size={11} /> {(r.review_reasons || []).join(" · ")}
          {r.proposed_set != null && r.proposed_set !== (r.set_number || 1) && !r.set_manual && (
            <>
              <button data-testid={`rally-move-set-${r.number}`} onClick={() => onEdit(r, { set_number: r.proposed_set })} className="rounded border border-amber-500/40 px-1.5 py-0.5 hover:bg-amber-500/10">Mover p/ set {r.proposed_set}</button>
              <button data-testid={`rally-keep-set-${r.number}`} onClick={() => onEdit(r, { set_manual: true })} className="rounded border border-border px-1.5 py-0.5 text-muted-foreground hover:text-foreground">Manter no set {r.set_number || 1}</button>
            </>
          )}
        </div>
      )}
      {edit && (
        <div data-testid={`rally-editor-${r.number}`} className="mt-2 pl-10 flex flex-wrap items-center gap-2 text-[11px]">
          <label className="flex items-center gap-1">Início <input type="number" step="0.1" data-testid={`rally-start-${r.number}`} value={st} onChange={(e) => setSt(e.target.value)} className="w-20 rounded border border-border bg-background px-1.5 py-1 font-data" /></label>
          <button onClick={() => setSt(time.toFixed(1))} className="rounded border border-border px-1.5 py-1">agora</button>
          <label className="flex items-center gap-1">Fim <input type="number" step="0.1" data-testid={`rally-end-${r.number}`} value={en} onChange={(e) => setEn(e.target.value)} className="w-20 rounded border border-border bg-background px-1.5 py-1 font-data" /></label>
          <button onClick={() => setEn(time.toFixed(1))} className="rounded border border-border px-1.5 py-1">agora</button>
          <span className="text-muted-foreground">({st !== "" ? formatTime(Number(st)) : "–"} → {en !== "" ? formatTime(Number(en)) : "–"})</span>
          <label className="flex items-center gap-1">Set
            <select data-testid={`rally-set-${r.number}`} value={r.set_number || 1} onChange={(e) => onEdit(r, { set_number: Number(e.target.value) })} className="rounded border border-border bg-background px-1 py-1">
              {Array.from({ length: setCount }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button data-testid={`rally-save-${r.number}`} onClick={save} className="rounded bg-primary px-2 py-1 font-semibold text-primary-foreground">Salvar tempos</button>
          <div className="w-full flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
            <span className="text-muted-foreground">Dividir em <b className="font-data text-foreground">{formatTime(time)}</b> (tempo atual) · 1ª parte foi ponto de</span>
            <select data-testid={`rally-split-winner-${r.number}`} value={splitW} onChange={(e) => setSplitW(e.target.value)} className="rounded border border-border bg-background px-1 py-1">
              <option value="nos">{teamName("nos")}</option><option value="adv">{teamName("adv")}</option><option value="pendente">Pendente</option>
            </select>
            <button data-testid={`rally-split-${r.number}`} onClick={() => onSplit(r, time, splitW)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:border-primary/40"><Scissors size={11} /> Dividir</button>
            {hasNext && <button data-testid={`rally-merge-next-${r.number}`} onClick={() => onMergeNext(r)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:border-primary/40"><Merge size={11} /> Unir com o rali #{r.number + 1}</button>}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1 mt-1.5 pl-10">
        {(r.actions || []).map((a) => (
          <button key={a.id} onClick={() => onSelectAction(a)} className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] hover:bg-secondary">
            {a.fundamento_name}{a.phase ? ` · ${a.phase}` : ""}{a.team === "adv" ? " (adv)" : ""}
          </button>
        ))}
        {(r.actions || []).length === 0 && <span className="text-[11px] text-muted-foreground">sem ações vinculadas</span>}
      </div>
    </div>
  );
};
