export const formatTime = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return "00:00";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const STATUS = {
  pendente: { label: "Pendente", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  em_analise: { label: "Em Análise", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  concluido: { label: "Concluído", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
};

export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

export const formatDatePt = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};
