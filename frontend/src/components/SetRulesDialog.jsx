import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SetRulesEditor } from "@/components/SetRulesEditor";

export const SetRulesDialog = ({ open, rules, onClose, onSave }) => {
  const [value, setValue] = useState(rules);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && rules) setValue(rules); }, [open, rules]);
  if (!value) return null;
  const save = async () => { setBusy(true); try { await onSave(value); } finally { setBusy(false); } };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="set-rules-dialog" className="max-w-xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="ava-heading text-xl">Configuração dos sets</DialogTitle>
          <DialogDescription>Ao salvar, o placar, os encerramentos dos sets e o resultado são recalculados. Ralis que mudariam de set são apenas sinalizados para revisão.</DialogDescription>
        </DialogHeader>
        <SetRulesEditor value={value} onChange={setValue} />
        <div className="flex justify-end gap-2 pt-2">
          <button data-testid="set-rules-cancel" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancelar</button>
          <button data-testid="set-rules-save" disabled={busy} onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">Salvar e recalcular</button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
