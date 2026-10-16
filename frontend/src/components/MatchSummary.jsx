import { AlertTriangle, CheckCircle2, Trophy, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const MatchSummary = ({ match, home, away, setFilter, onFilter, onOpenRules, onApplyProposal }) => {
  if (!match) return null;
  const name = (w) => (w === "nos" ? home : away);
  return (
    <div data-testid="match-summary" className="rounded-xl border border-border bg-card p-3 mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">Partida</span>
        <span data-testid="match-sets-won" className="font-data text-sm font-bold">{home} {match.sets_won.nos} × {match.sets_won.adv} {away}</span>
        <span className="text-[11px] text-muted-foreground">(vence quem fizer {match.sets_to_win} set{match.sets_to_win > 1 ? "s" : ""})</span>
        {match.match_winner && <span data-testid="match-winner" className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500"><Trophy size={11} /> Vitória: {name(match.match_winner)}</span>}
        <button data-testid="open-set-rules" onClick={onOpenRules} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary/40"><Settings2 size={13} /> Regras dos sets</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button data-testid="set-filter-all" onClick={() => onFilter(null)} className={cn("rounded-lg border px-2.5 py-1 text-xs", setFilter == null ? "border-primary bg-primary/10 text-primary" : "border-border")}>Todos ({match.total_rallies})</button>
        {match.sets.map((s) => (
          <button key={s.number} data-testid={`set-chip-${s.number}`} onClick={() => onFilter(s.number)} className={cn("rounded-lg border px-2.5 py-1 text-xs text-left", setFilter === s.number ? "border-primary bg-primary/10" : "border-border hover:border-primary/40")}>
            <span className="font-semibold">Set {s.number}</span> <span className="font-data">{s.nos}×{s.adv}</span>
            <span className="ml-1 text-[10px] text-muted-foreground">até {s.target} (+{s.min_diff})</span>
            {s.finished ? <CheckCircle2 size={11} className="inline ml-1 text-emerald-500" /> : <span className="ml-1 text-[10px] text-amber-500">em andamento</span>}
            {s.review > 0 && <AlertTriangle size={11} className="inline ml-1 text-amber-500" />}
          </button>
        ))}
      </div>
      {match.review_count > 0 && (
        <div data-testid="match-review-alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
          <AlertTriangle size={14} className="text-amber-500" /> {match.review_count} rali(s) sinalizado(s) para revisão.
          {match.proposal_count > 0 && <>
            <span className="text-muted-foreground">{match.proposal_count} rali(s) pertencem a outro set pelas regras configuradas — nada foi movido sem sua confirmação.</span>
            <button data-testid="apply-proposed-sets" onClick={onApplyProposal} className="ml-auto rounded-lg bg-amber-500 px-2.5 py-1 font-semibold text-black hover:brightness-110">Aplicar divisão proposta</button>
          </>}
        </div>
      )}
    </div>
  );
};
