export const isHighlight = (a) => {
  if (a.team === "adv") return false;
  const f = (a.fundamento_name || "").toLowerCase();
  const c = (a.classificacao_label || "").toLowerCase();
  const point = c.includes("ponto") || (a.result || "").toLowerCase() === "ponto nosso";
  if (f.includes("ataque") || f.includes("bloqueio")) return point;
  if (f.includes("saque")) return point || c.includes("ace");
  return false;
};

export const notifyJobs = () => window.dispatchEvent(new Event("ava-jobs-refresh"));
