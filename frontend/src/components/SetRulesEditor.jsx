import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";

const PRESETS = [
  { id: "25-15", label: "25 / tie-break 15", target: 25, tb: 15 },
  { id: "21-15", label: "21 / tie-break 15", target: 21, tb: 15 },
  { id: "18-15", label: "18 / tie-break 15", target: 18, tb: 15 },
];
const inputCls = "w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-data text-center outline-none focus:border-primary/60";

export const defaultRules = (stw = 3) => ({
  sets_to_win: stw,
  set_rules: Array.from({ length: 2 * stw - 1 }, (_, i) => ({ target: i === 2 * stw - 2 ? 15 : 25, min_diff: 2 })),
});

export const SetRulesEditor = ({ value, onChange }) => {
  const [all, setAll] = useState({ target: 25, min_diff: 2 });
  const { sets_to_win: stw, set_rules: sets } = value;
  const emit = (patch) => onChange({ ...value, ...patch });
  const setFormat = (n) => {
    const len = Math.max(n, 2 * n - 1);
    const base = sets.find((s) => s.target !== 15) || sets[0];
    const next = Array.from({ length: len }, (_, i) => (i === len - 1 && len > 1 ? { target: 15, min_diff: 2 } : { ...(i < sets.length - 1 ? sets[i] : base) }));
    emit({ sets_to_win: n, set_rules: next });
  };
  const patchSet = (i, k, v) => emit({ set_rules: sets.map((s, j) => (j === i ? { ...s, [k]: v === "" ? "" : Number(v) } : s)) });
  const applyPreset = (p) => emit({ set_rules: sets.map((s, i) => ({ target: i === sets.length - 1 && sets.length > 1 ? p.tb : p.target, min_diff: 2 })) });
  const applyAll = () => emit({ set_rules: sets.map(() => ({ ...all })) });
  const isTb = (i) => sets.length === 2 * stw - 1 && sets.length > 1 && i === sets.length - 1;

  return (
    <div className="space-y-4" data-testid="set-rules-editor">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formato</span>
        {[2, 3].map((n) => (
          <button key={n} type="button" data-testid={`format-best-of-${2 * n - 1}`} onClick={() => setFormat(n)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${stw === n ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}>Melhor de {2 * n - 1}</button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">Sets para vencer
          <input type="number" min={1} data-testid="input-sets-to-win" value={stw} onChange={(e) => e.target.value && setFormat(Math.max(1, Number(e.target.value)))} className={inputCls} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelos</span>
        {PRESETS.map((p) => <button key={p.id} type="button" data-testid={`preset-${p.id}`} onClick={() => applyPreset(p)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:border-primary/40">{p.label}</button>)}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 p-2">
        <span className="text-xs text-muted-foreground">Todos os sets:</span>
        <input type="number" min={1} data-testid="all-target" value={all.target} onChange={(e) => setAll({ ...all, target: Number(e.target.value) })} className={inputCls} /><span className="text-xs text-muted-foreground">pontos · dif.</span>
        <input type="number" min={1} data-testid="all-min-diff" value={all.min_diff} onChange={(e) => setAll({ ...all, min_diff: Number(e.target.value) })} className={inputCls} />
        <button type="button" data-testid="apply-all-sets" onClick={applyAll} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-primary/40"><Wand2 size={12} /> Aplicar a todos</button>
      </div>

      <div className="space-y-1.5">
        {sets.map((s, i) => (
          <div key={i} data-testid={`set-rule-row-${i + 1}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
            <span className="w-24 text-sm font-semibold">Set {i + 1}{isTb(i) && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-500">tie-break</span>}</span>
            <input type="number" min={1} data-testid={`set-target-${i + 1}`} value={s.target} onChange={(e) => patchSet(i, "target", e.target.value)} className={inputCls} />
            <span className="text-xs text-muted-foreground">pontos — diferença mínima</span>
            <input type="number" min={1} data-testid={`set-min-diff-${i + 1}`} value={s.min_diff} onChange={(e) => patchSet(i, "min_diff", e.target.value)} className={inputCls} />
            <button type="button" data-testid={`set-remove-${i + 1}`} disabled={sets.length <= stw} onClick={() => emit({ set_rules: sets.filter((_, j) => j !== i) })} title="Remover set" className="ml-auto text-muted-foreground hover:text-primary disabled:opacity-30"><Trash2 size={14} /></button>
          </div>
        ))}
        <button type="button" data-testid="set-add" onClick={() => emit({ set_rules: [...sets, { ...sets[sets.length - 1] }] })} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs hover:border-primary/40"><Plus size={12} /> Adicionar set</button>
      </div>
      <p className="text-[11px] text-muted-foreground">Um set termina quando uma equipe atinge a pontuação configurada <b>e</b> abre a diferença mínima. Ex.: alvo 18 e diferença 2 → 18×16 encerra, 18×17 continua, 19×17 encerra.</p>
    </div>
  );
};
