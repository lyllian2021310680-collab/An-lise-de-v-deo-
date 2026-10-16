import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportPdf } from "@/lib/pdf";

export const PdfButton = ({ targetId, title, subtitle, filename, testid = "export-pdf", label = "Exportar PDF" }) => {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    setBusy(true);
    try { await exportPdf(el, { title, subtitle, filename }); toast.success("PDF gerado"); }
    catch { toast.error("Não foi possível gerar o PDF"); }
    finally { setBusy(false); }
  };
  return (
    <button data-testid={testid} onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40 disabled:opacity-60">
      {busy ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} {label}
    </button>
  );
};
