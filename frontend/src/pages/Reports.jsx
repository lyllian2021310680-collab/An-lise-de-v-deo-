import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getActions, getFundamentos, getClassificacoes, getAthletes, getVideos, getPositions, getFormations, getCategorias, compareGroups, exportCsvUrl } from "@/lib/api";
import { formatTime, pct } from "@/lib/format";
import { CourtMap } from "@/components/CourtMap";
import { Download, Play, Filter, GitCompare, FileStack, Loader2, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfButton } from "@/components/PdfButton";
import { CompilationDialog } from "@/components/CompilationDialog";
import { captureEl, exportPdfSections } from "@/lib/pdf";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const GROUP_COLORS = ["#E50914", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

export default function Reports() {
  const navigate = useNavigate();
  const [actions, setActions] = useState([]);
  const [funds, setFunds] = useState([]);
  const [classes, setClasses] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [videos, setVideos] = useState([]);
  const [positions, setPositions] = useState([]);
  const [formations, setFormations] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [f, setF] = useState({ video: "", athlete: "", fundamento: "", classificacao: "", position: "", phase: "", formation: "", categoria: "", equipe: "", competition: "", season: "", comp_phase: "", set: "" });
  const [heatFund, setHeatFund] = useState("");
  const [heatCat, setHeatCat] = useState("");
  const [recFormation, setRecFormation] = useState("");
  const [selFormation, setSelFormation] = useState("");
  const [tab, setTab] = useState("geral");
  const [fullBusy, setFullBusy] = useState(false);
  const [compOpen, setCompOpen] = useState(false);

  // comparison state
  const [cmpDim, setCmpDim] = useState("categoria_name");
  const [cmpValues, setCmpValues] = useState([]);
  const [cmpBaseCat, setCmpBaseCat] = useState("");
  const [cmpFund, setCmpFund] = useState("");
  const [cmpResult, setCmpResult] = useState(null);
  const [cmpLoading, setCmpLoading] = useState(false);

  useEffect(() => {
    Promise.all([getActions(), getFundamentos(), getClassificacoes(), getAthletes(), getVideos(), getPositions(), getFormations(), getCategorias()])
      .then(([a, fu, c, at, v, p, fo, cat]) => { setActions(a); setFunds(fu.filter((x) => x.active !== false && !x.archived)); setClasses(c); setAthletes(at); setVideos(v); setPositions(p.filter((x) => x.active !== false)); setFormations(fo.filter((x) => x.active !== false)); setCategorias(cat.filter((x) => x.active !== false)); });
  }, []);

  const athleteById = useMemo(() => Object.fromEntries(athletes.map((a) => [a.id, a])), [athletes]);
  const videoById = useMemo(() => Object.fromEntries(videos.map((v) => [v.id, v])), [videos]);
  const recepFund = useMemo(() => funds.find((x) => x.name === "Recepção"), [funds]);
  const ataqueFund = useMemo(() => funds.find((x) => x.name === "Ataque"), [funds]);
  const competitions = useMemo(() => uniq(videos.map((v) => v.competition)), [videos]);
  const seasons = useMemo(() => uniq(videos.map((v) => v.season)), [videos]);
  const compPhases = useMemo(() => uniq(videos.map((v) => v.comp_phase)), [videos]);

  const filtered = useMemo(() => actions.filter((a) => {
    if (f.video && a.video_id !== f.video) return false;
    if (f.athlete && !(a.athlete_ids || []).includes(f.athlete)) return false;
    if (f.fundamento && a.fundamento_id !== f.fundamento) return false;
    if (f.classificacao && a.classificacao_id !== f.classificacao) return false;
    if (f.position && a.tactical_position !== f.position) return false;
    if (f.phase && a.phase !== f.phase) return false;
    if (f.formation && a.formation !== f.formation) return false;
    if (f.categoria && (a.categoria_name || "") !== f.categoria) return false;
    if (f.equipe && (a.equipe_name || "") !== f.equipe) return false;
    if (f.competition && (a.competition || "") !== f.competition) return false;
    if (f.season && String(a.season || "") !== f.season) return false;
    if (f.comp_phase && (a.comp_phase || "") !== f.comp_phase) return false;
    if (f.set && String(a.set_number ?? "") !== f.set) return false;
    return true;
  }), [actions, f]);

  const fundDist = useMemo(() => funds.map((fd) => ({ name: fd.name, value: filtered.filter((a) => a.fundamento_id === fd.id).length, color: fd.color })).filter((x) => x.value > 0), [filtered, funds]);
  const total = filtered.length;

  const Sel = ({ k, placeholder, options, testid }) => (
    <select data-testid={testid} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60">
      <option value="">{placeholder}</option>{options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );

  const recepClasses = useMemo(() => classes.filter((c) => recepFund && c.fundamento_id === recepFund.id), [classes, recepFund]);
  const recepActions = useMemo(() => actions.filter((a) => recepFund && a.fundamento_id === recepFund.id && (!recFormation || a.formation === recFormation) && (!f.video || a.video_id === f.video) && (!f.categoria || a.categoria_name === f.categoria)), [actions, recepFund, recFormation, f.video, f.categoria]);
  const recepByFormation = useMemo(() => formations.map((fo) => {
    const list = recepActions.filter((a) => a.formation === fo.name);
    const row = { name: fo.name, total: list.length };
    recepClasses.forEach((c) => (row[c.label] = list.filter((a) => a.classificacao_id === c.id).length));
    return row;
  }).filter((r) => r.total > 0), [recepActions, formations, recepClasses]);

  const fmActions = useMemo(() => actions.filter((a) => selFormation && a.formation === selFormation && (!f.video || a.video_id === f.video) && (!f.categoria || a.categoria_name === f.categoria)), [actions, selFormation, f.video, f.categoria]);
  const k1Attacks = fmActions.filter((a) => ataqueFund && a.fundamento_id === ataqueFund.id && a.phase === "K1");
  const k1Points = k1Attacks.filter((a) => (a.classificacao_label || "").toLowerCase().includes("ponto") || a.result === "Ponto nosso").length;

  const heatActions = useMemo(() => actions.filter((a) => (!heatFund || a.fundamento_id === heatFund) && a.court && (a.court.zone != null || a.court.point) && (!f.video || a.video_id === f.video) && (!heatCat || a.categoria_name === heatCat)), [actions, heatFund, f.video, heatCat]);
  const heatPoints = heatActions.map((a) => ({ zone: a.court.zone, x: a.court.point?.x, y: a.court.point?.y }));

  // ---- Comparison ----
  const DIMS = [
    { v: "categoria_name", l: "Categorias" }, { v: "competition", l: "Competições" },
    { v: "season", l: "Temporadas" }, { v: "comp_phase", l: "Fases" },
    { v: "formation", l: "Formações/Rotações" }, { v: "video_id", l: "Partidas" },
  ];
  const dimOptions = useMemo(() => {
    if (cmpDim === "categoria_name") return categorias.map((c) => ({ v: c.name, l: c.name }));
    if (cmpDim === "competition") return competitions.map((c) => ({ v: c, l: c }));
    if (cmpDim === "season") return seasons.map((s) => ({ v: s, l: s }));
    if (cmpDim === "comp_phase") return compPhases.map((p) => ({ v: p, l: p }));
    if (cmpDim === "formation") return formations.map((fo) => ({ v: fo.name, l: fo.name }));
    if (cmpDim === "video_id") return videos.map((v) => ({ v: v.id, l: v.title }));
    return [];
  }, [cmpDim, categorias, competitions, seasons, compPhases, formations, videos]);

  const toggleCmp = (v) => setCmpValues((s) => s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);

  const runCompare = async () => {
    if (cmpValues.length < 2) return;
    setCmpLoading(true); setCmpResult(null);
    const groups = cmpValues.map((v) => {
      const base = {};
      if (cmpBaseCat) base.categoria_name = cmpBaseCat;
      if (cmpFund) base.fundamento_id = cmpFund;
      if (cmpDim === "video_id") return { label: videoById[v]?.title || "Partida", filters: { ...base, video_ids: [v] } };
      return { label: v, filters: { ...base, [cmpDim]: v } };
    });
    try { const res = await compareGroups(groups); setCmpResult(res); } finally { setCmpLoading(false); }
  };

  const cmpFunds = useMemo(() => {
    if (!cmpResult) return [];
    const set = new Set();
    cmpResult.groups.forEach((g) => Object.keys(g.stats.por_fundamento || {}).forEach((x) => set.add(x)));
    return [...set];
  }, [cmpResult]);
  const cmpChart = useMemo(() => cmpFunds.map((fd) => { const row = { fundamento: fd }; cmpResult.groups.forEach((g) => (row[g.label] = g.stats.por_fundamento[fd]?.total || 0)); return row; }), [cmpFunds, cmpResult]);

  const shoot = async (key, setup) => {
    setup?.(); setTab(key);
    await new Promise((r) => setTimeout(r, 1700));
    return captureEl(document.querySelector(`[data-pdf-section="${key}"]`));
  };
  const exportFull = async () => {
    const prev = { tab, selFormation };
    const fmList = formations.filter((fo) => actions.some((a) => a.formation === fo.name && (!f.video || a.video_id === f.video) && (!f.categoria || a.categoria_name === f.categoria)));
    const sections = [
      { label: "Geral", capture: () => shoot("geral") },
      { label: "Recepção A/B/C", capture: () => shoot("recepcao") },
      ...fmList.map((fo) => ({ label: `Por Formação - ${fo.name}`, capture: () => shoot("formacao", () => setSelFormation(fo.name)) })),
      { label: "Mapa de Calor", capture: () => shoot("mapa") },
      ...(cmpResult ? [{ label: "Comparação", capture: () => shoot("comparar") }] : []),
    ];
    setFullBusy(true);
    const tid = toast.loading("Gerando relatório completo…");
    try {
      await exportPdfSections(sections, {
        title: "Relatório completo", subtitle: f.video ? videoById[f.video]?.title : "Todas as partidas", filename: "relatorio-completo-ava",
        onProgress: (i, n, label) => toast.loading(`Gerando relatório completo… ${label} (${i + 1}/${n})`, { id: tid }),
      });
      toast.success(`PDF gerado com ${sections.length} seções`, { id: tid });
    } catch { toast.error("Não foi possível gerar o PDF", { id: tid }); }
    finally { setSelFormation(prev.selFormation); setTab(prev.tab); setFullBusy(false); }
  };

  return (
    <Layout title="Análises e Relatórios" subtitle="Estatísticas por categoria, formação, mapas de calor e comparações" back="/"
      actions={<><button data-testid="reports-compilation" onClick={() => setCompOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40"><Film size={16} className="text-primary" /> Compilação em vídeo</button><PdfButton targetId="reports-pdf-root" title="Análises e Relatórios" subtitle={f.video ? videoById[f.video]?.title : "Todas as partidas"} filename="relatorio-ava" testid="reports-export-pdf" label="PDF da aba" /><button data-testid="reports-export-full-pdf" onClick={exportFull} disabled={fullBusy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">{fullBusy ? <Loader2 size={16} className="animate-spin" /> : <FileStack size={16} />} Relatório completo (PDF)</button><a data-testid="reports-export" href={exportCsvUrl(f.video ? { video_id: f.video } : {})} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40"><Download size={16} /> Exportar CSV</a></>}>
      <CompilationDialog open={compOpen} onClose={() => setCompOpen(false)} actions={filtered} videosById={videoById} athletes={athletes} funds={funds} classes={classes} />
      <Tabs value={tab} onValueChange={setTab} id="reports-pdf-root">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="geral" data-testid="rtab-geral">Geral</TabsTrigger>
          <TabsTrigger value="recepcao" data-testid="rtab-recepcao">Recepção A/B/C</TabsTrigger>
          <TabsTrigger value="formacao" data-testid="rtab-formacao">Por Formação</TabsTrigger>
          <TabsTrigger value="mapa" data-testid="rtab-mapa">Mapa de Calor</TabsTrigger>
          <TabsTrigger value="comparar" data-testid="rtab-comparar"><GitCompare size={14} className="mr-1" /> Comparar</TabsTrigger>
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral" data-pdf-section="geral" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-4 mb-5">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground"><Filter size={15} /> Filtros</div>
            <div className="flex flex-wrap gap-2">
              <Sel k="categoria" placeholder="Todas as categorias" testid="filter-categoria" options={categorias.map((c) => ({ v: c.name, l: c.name }))} />
              <Sel k="video" placeholder="Todas as partidas" testid="filter-video" options={videos.map((v) => ({ v: v.id, l: v.title }))} />
              <Sel k="athlete" placeholder="Todos os atletas" testid="filter-athlete" options={athletes.map((a) => ({ v: a.id, l: `${a.number ? a.number + " · " : ""}${a.name}` }))} />
              <Sel k="fundamento" placeholder="Todos os fundamentos" testid="filter-fund" options={funds.map((x) => ({ v: x.id, l: x.name }))} />
              <Sel k="classificacao" placeholder="Toda classificação" testid="filter-class" options={classes.filter((c) => !f.fundamento || c.fundamento_id === f.fundamento).map((c) => ({ v: c.id, l: c.label }))} />
              <Sel k="formation" placeholder="Toda formação" testid="filter-formation" options={formations.map((p) => ({ v: p.name, l: p.name }))} />
              <Sel k="position" placeholder="Toda posição" testid="filter-pos" options={positions.map((p) => ({ v: p.name, l: p.name }))} />
              <Sel k="phase" placeholder="Toda situação" testid="filter-phase" options={["K1", "K2", "K3", "Continuidade", "Contra-ataque"].map((x) => ({ v: x, l: x }))} />
              <Sel k="competition" placeholder="Toda competição" testid="filter-competition" options={competitions.map((c) => ({ v: c, l: c }))} />
              <Sel k="season" placeholder="Toda temporada" testid="filter-season" options={seasons.map((s) => ({ v: s, l: s }))} />
              <Sel k="comp_phase" placeholder="Toda fase" testid="filter-compphase" options={compPhases.map((p) => ({ v: p, l: p }))} />
              <Sel k="set" placeholder="Todo set" testid="filter-set" options={[1, 2, 3, 4, 5].map((n) => ({ v: String(n), l: `Set ${n}` }))} />
              <button data-testid="clear-filters" onClick={() => setF({ video: "", athlete: "", fundamento: "", classificacao: "", position: "", phase: "", formation: "", categoria: "", equipe: "", competition: "", season: "", comp_phase: "", set: "" })} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">Limpar</button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            {[["Ações", total], ["Fundamentos", fundDist.length], ["Atletas", new Set(filtered.flatMap((a) => a.athlete_ids || [])).size], ["Partidas", new Set(filtered.map((a) => a.video_id)).size]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-4"><div className="font-data text-3xl font-bold text-primary">{v}</div><div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div></div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 mb-5">
            <h3 className="ava-heading text-lg font-bold mb-3">Distribuição por fundamento</h3>
            {fundDist.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={fundDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e) => `${e.name} ${e.value}`}>{fundDist.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} /></PieChart></ResponsiveContainer></div> : <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Sem dados.</div>}
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border"><h3 className="ava-heading text-lg font-bold">Ocorrências ({total})</h3></div>
            <div className="divide-y divide-border max-h-[420px] overflow-auto scrollbar-thin">
              {filtered.length === 0 ? <div className="p-6 text-center text-muted-foreground text-sm">Nenhuma ocorrência.</div> : filtered.map((a, i) => {
                const fd = funds.find((x) => x.id === a.fundamento_id);
                return (
                  <button key={a.id} data-testid={`report-row-${a.id}`} onClick={() => navigate(`/analisar/${a.video_id}?t=${a.timestamp}&action=${a.id}`)} className="w-full flex items-center gap-3 p-3 hover:bg-secondary/40 text-left">
                    <span className="font-data text-xs text-muted-foreground w-6">{i + 1}</span>
                    <span className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary"><Play size={14} /></span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{(a.athlete_ids || []).map((id) => athleteById[id]?.name).filter(Boolean).join(", ") || "—"}</div><div className="text-xs text-muted-foreground truncate">{videoById[a.video_id]?.title} · {a.categoria_name || "—"} · {a.formation || "—"} {a.phase ? `· ${a.phase}` : ""}</div></div>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: (fd?.color || "#888") + "22", color: fd?.color }}>{a.fundamento_name}</span>
                    <span className="text-xs hidden sm:block">{a.classificacao_label}</span>
                    <span className="font-data text-xs text-muted-foreground">{formatTime(a.timestamp)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* RECEPÇÃO */}
        <TabsContent value="recepcao" data-pdf-section="recepcao" className="mt-4 space-y-5">
          <div className="flex flex-wrap gap-2 items-center">
            <Sel k="categoria" placeholder="Todas as categorias" testid="rec-categoria" options={categorias.map((c) => ({ v: c.name, l: c.name }))} />
            <select data-testid="rec-formation" value={recFormation} onChange={(e) => setRecFormation(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"><option value="">Todas as formações</option>{formations.map((fo) => <option key={fo.id} value={fo.name}>{fo.name}</option>)}</select>
            <span className="text-sm text-muted-foreground">{recepActions.length} recepções efetivas (base dos percentuais)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recepClasses.map((c) => { const n = recepActions.filter((a) => a.classificacao_id === c.id).length; return (
              <div key={c.id} data-testid={`rec-class-${c.id}`} className="rounded-xl border border-border p-4" style={{ borderColor: c.color + "55" }}>
                <div className="text-xs font-semibold" style={{ color: c.color }}>Recepção {c.label}</div>
                <div className="font-data text-3xl font-bold">{n}</div>
                <div className="text-xs text-muted-foreground">{pct(n, recepActions.length)}% das recepções</div>
              </div>
            ); })}
          </div>
          {recepByFormation.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="ava-heading text-lg font-bold mb-3">Recepção por formação</h3>
              <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={recepByFormation}><XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} cursor={{ fill: "hsl(var(--secondary))" }} />{recepClasses.map((c) => <Bar key={c.id} dataKey={c.label} stackId="a" fill={c.color} radius={[2, 2, 0, 0]} />)}</BarChart></ResponsiveContainer></div>
            </div>
          )}
        </TabsContent>

        {/* FORMAÇÃO */}
        <TabsContent value="formacao" data-pdf-section="formacao" className="mt-4 space-y-5">
          <div className="flex gap-2 flex-wrap items-center">
            <Sel k="categoria" placeholder="Todas as categorias" testid="fm-categoria" options={categorias.map((c) => ({ v: c.name, l: c.name }))} />
            {formations.map((fo) => <button key={fo.id} data-testid={`fm-${fo.name}`} onClick={() => setSelFormation(fo.name)} className={cn("rounded-full px-4 py-2 text-sm font-semibold border", selFormation === fo.name ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{fo.name}</button>)}
          </div>
          {!selFormation ? <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Selecione uma formação para analisar.</div> : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[["Oportunidades", fmActions.length], ["Ataques K1", k1Attacks.length], ["Pontos K1", k1Points], ["Eficiência K1", `${pct(k1Points, k1Attacks.length)}%`]].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-border bg-card p-4"><div className="font-data text-3xl font-bold text-primary">{v}</div><div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div></div>
              ))}
              <div className="col-span-2 sm:col-span-4 rounded-2xl border border-border bg-card p-5">
                <h3 className="ava-heading text-lg font-bold mb-3">Ações na {selFormation} por fundamento</h3>
                <div className="flex flex-wrap gap-2">{funds.map((fd) => { const n = fmActions.filter((a) => a.fundamento_id === fd.id).length; if (!n) return null; return <span key={fd.id} className="rounded-full px-3 py-1.5 text-sm font-semibold" style={{ background: fd.color + "22", color: fd.color }}>{fd.name}: {n}</span>; })}</div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* MAPA DE CALOR */}
        <TabsContent value="mapa" data-pdf-section="mapa" className="mt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <select data-testid="heat-fund" value={heatFund} onChange={(e) => setHeatFund(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"><option value="">Todos os fundamentos</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <select data-testid="heat-cat" value={heatCat} onChange={(e) => setHeatCat(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none"><option value="">Todas as categorias</option>{categorias.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
            <Sel k="video" placeholder="Todas as partidas" testid="heat-video" options={videos.map((v) => ({ v: v.id, l: v.title }))} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="ava-heading text-lg font-bold mb-3">Distribuição na quadra ({heatActions.length} ações localizadas)</h3>
              <div className="max-w-[320px] mx-auto"><CourtMap editable={false} heatPoints={heatPoints} /></div>
              <p className="text-xs text-muted-foreground mt-3 text-center">Intensidade por zona (números = ocorrências). Rede no topo.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="ava-heading text-lg font-bold mb-3">Como ler os mapas</h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
                <li>Todos os fundamentos podem ter a localização marcada — o mapa diferencia <b>ponto de contato</b>, <b>zona</b> e <b>direção da bola</b>.</li>
                <li>Marque a quadra durante a análise (barra ⚡ → mapa) para alimentar estes mapas.</li>
                <li>Filtre por fundamento, categoria e partida para comparar padrões.</li>
              </ul>
              {heatActions.length === 0 && <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Ainda não há lances com local marcado na quadra para os filtros atuais.</div>}
            </div>
          </div>
        </TabsContent>

        {/* COMPARAR */}
        <TabsContent value="comparar" data-pdf-section="comparar" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Comparar por</span>
              <select data-testid="cmp-dim" value={cmpDim} onChange={(e) => { setCmpDim(e.target.value); setCmpValues([]); setCmpResult(null); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none">
                {DIMS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">(filtre todos os grupos por)</span>
              <select data-testid="cmp-base-cat" value={cmpBaseCat} onChange={(e) => setCmpBaseCat(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"><option value="">categoria: todas</option>{categorias.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
              <select data-testid="cmp-fund" value={cmpFund} onChange={(e) => setCmpFund(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"><option value="">fundamento: todos</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            </div>
            <div className="flex flex-wrap gap-2">
              {dimOptions.length === 0 ? <span className="text-sm text-muted-foreground">Sem valores disponíveis para esta dimensão.</span> : dimOptions.map((o) => (
                <button key={o.v} data-testid={`cmp-val-${o.v}`} onClick={() => toggleCmp(o.v)} className={cn("rounded-full px-3 py-1.5 text-sm font-medium border max-w-[220px] truncate", cmpValues.includes(o.v) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40")}>{o.l}</button>
              ))}
            </div>
            <button data-testid="cmp-run" onClick={runCompare} disabled={cmpValues.length < 2 || cmpLoading} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><GitCompare size={15} /> {cmpLoading ? "Comparando…" : `Comparar (${cmpValues.length})`}</button>
            <p className="text-xs text-muted-foreground">Selecione 2 ou mais itens. Para “antes/depois” de um treinamento, compare temporadas, fases ou partidas de períodos diferentes. Contextos distintos podem explicar parte das diferenças.</p>
          </div>

          {cmpResult && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cmpResult.groups.map((g, i) => (
                  <div key={g.label} data-testid={`cmp-card-${i}`} className="rounded-xl border border-border bg-card p-4" style={{ borderTopColor: GROUP_COLORS[i % GROUP_COLORS.length], borderTopWidth: 3 }}>
                    <div className="font-semibold truncate" title={g.label}>{g.label}</div>
                    <div className="font-data text-2xl font-bold text-primary mt-1">{g.stats.total} <span className="text-xs text-muted-foreground font-normal">ações · {g.stats.n_partidas} partida(s)</span></div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(g.stats.por_fundamento).map(([fd, d]) => <span key={fd} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">{fd}: {d.eficiencia}%</span>)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="ava-heading text-lg font-bold mb-3">Volume por fundamento</h3>
                <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={cmpChart}><XAxis dataKey="fundamento" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} /><Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} cursor={{ fill: "hsl(var(--secondary))" }} /><Legend />{cmpResult.groups.map((g, i) => <Bar key={g.label} dataKey={g.label} fill={GROUP_COLORS[i % GROUP_COLORS.length]} radius={[3, 3, 0, 0]} />)}</BarChart></ResponsiveContainer></div>
              </div>

              <div className="overflow-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50"><tr><th className="text-left p-3">Fundamento</th>{cmpResult.groups.map((g) => <th key={g.label} className="p-3 whitespace-nowrap">{g.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-border">
                    {cmpFunds.map((fd) => (
                      <tr key={fd} data-testid={`cmp-table-row-${fd}`}>
                        <td className="p-3 font-medium">{fd}</td>
                        {cmpResult.groups.map((g) => { const d = g.stats.por_fundamento[fd]; return <td key={g.label} className="p-3 text-center font-data">{d ? <>{d.total} <span className="text-xs text-muted-foreground">({d.eficiencia}%)</span></> : "—"}</td>; })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
