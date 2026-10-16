import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "reopen", title: "Manter lances e devolver ao rally em aberto", desc: "Vídeo, marcações e análise ficam intactos; os lances entram no próximo ponto registrado." },
  { id: "detach", title: "Manter lances avulsos (sem ponto)", desc: "Tudo é preservado, mas os lances não serão agrupados em nenhum ponto." },
  { id: "delete", title: "Excluir também os lances vinculados", desc: "Apaga lances, marcações e análise deste ponto. Irreversível." },
];

export const RemovePointDialog = ({ rally, teamName, onClose, onConfirm }) => {
  const [mode, setMode] = useState("reopen");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMode("reopen"); setConfirmDel(false); }, [rally?.id]);
  if (!rally) return null;
  const acts = rally.actions || [];
  const nAnnos = acts.reduce((s, a) => s + (a.annotations || []).length, 0);
  const submit = async () => {
    if (mode === "delete" && acts.length && !confirmDel) return setConfirmDel(true);
    setBusy(true);
    try { await onConfirm(rally, acts.length ? mode : "reopen", mode === "delete"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!rally} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="remove-point-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="ava-heading text-xl">Remover ponto #{rally.number}</DialogTitle>
          <DialogDescription>
            Ponto de <b>{teamName(rally.winner)}</b> · Set {rally.set_number || 1} · placar {rally.score_after?.nos ?? 0}-{rally.score_after?.adv ?? 0}. O placar será recalculado sem refazer a análise.
          </DialogDescription>
        </DialogHeader>
        {acts.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm" data-testid="remove-point-safe">
            <ShieldCheck size={16} className="text-emerald-500 mt-0.5 shrink-0" /> Nenhum lance vinculado a este ponto (provável clique duplicado). Nada além do ponto será removido.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm" data-testid="remove-point-links">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" /> Este ponto tem {acts.length} lance(s) vinculado(s) com {nAnnos} marcação(ões). Escolha o que fazer com eles:
            </div>
            {OPTIONS.map((o) => (
              <button key={o.id} data-testid={`remove-mode-${o.id}`} onClick={() => { setMode(o.id); setConfirmDel(false); }} className={cn("w-full text-left rounded-lg border p-3 transition", mode === o.id ? (o.id === "delete" ? "border-primary bg-primary/10" : "border-primary/60 bg-primary/5") : "border-border hover:border-primary/40")}>
                <div className="text-sm font-semibold">{o.title}</div>
                <div className="text-xs text-muted-foreground">{o.desc}</div>
              </button>
            ))}
          </div>
        )}
        {confirmDel && <div className="rounded-lg bg-primary/10 border border-primary/40 p-3 text-sm text-primary font-semibold" data-testid="remove-point-delete-warning">Confirme: {acts.length} lance(s) e suas marcações serão excluídos definitivamente.</div>}
        <div className="flex gap-2 justify-end pt-1">
          <button data-testid="remove-point-cancel" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
          <button data-testid="remove-point-confirm" disabled={busy} onClick={submit} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            <Trash2 size={14} /> {confirmDel ? "Confirmar exclusão" : "Remover ponto"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
