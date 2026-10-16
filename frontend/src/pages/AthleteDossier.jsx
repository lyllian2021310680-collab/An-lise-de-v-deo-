import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getAthlete, getActions, getFundamentos, getClassificacoes, getVideos, getAthleteSummary, exportCsvUrl } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { User, Play, Download, FolderOpen, TrendingUp, GitCompare, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfButton } from "@/components/PdfButton";
import { CompilationDialog } from "@/components/CompilationDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export default function AthleteDossier() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [athlete, setAthlete] = useState(null);
  const [actions, setActions] = useState([]);
  const [fundamentos, setFundamentos] = useState([]);
  const [classes, setClasses] = useState([]);
  const [videos, setVideos] = useState([]);
  const [summary, setSummary] = useState(null);
  const [openFund, setOpenFund] = useState(null);
  const [cat, setCat] = useState("todas");
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [compOpen, setCompOpen] = useState(false);

  useEffect(() => {
    Promise.all([getAthlete(id), getActions({ athlete_id: id }), getFundamentos(), getClassificacoes(), getVideos(), getAthleteSummary(id)])
      .then(([a, ac, f, c, v, s]) => {
        setAthlete(a); setActions(ac); setFundamentos(f); setClasses(c); setVideos(v); setSummary(s);
        if (s.categorias?.length >= 2) { setCmpA(s.categorias[0]); setCmpB(s.categorias[1]); }
        else if (s.categorias?.length === 1) { setCmpA(s.categorias[0]); }
      })
      .catch(() => {});
  }, [id]);

  const videoById = useMemo(() => Object.fromEntries(videos.map((v) => [v.id, v])), [videos]);
  const activeFund = fundamentos.filter((f) => f.active !== false);
  const cats = summary?.categorias || [];

  const scopedActions = useMemo(() => cat === "todas" ? actions : actions.filter((a) => (a.categoria_name || "—") === cat), [actions, cat]);

  const perFund = useMemo(() => activeFund.map((f) => {
    const list = scopedActions.filter((a) => a.fundamento_id === f.id);
    const byClass = {};
    list.forEach((a) => (byClass[a.classificacao_label || "—"] = (byClass[a.classificacao_label || "—"] || 0) + 1));
    return { fund: f, total: list.length, byClass, list };
  }), [scopedActions, activeFund]);

  const radarData = perFund.map((p) => ({ fund: p.fund.name, total: p.total }));
  const classColor = (label, fundId) => classes.find((c) => c.label === label && c.fundamento_id === fundId)?.color || "#A1A1AA";

  // Evolution: eficiência por fundamento ao longo dos períodos
  const evoFunds = useMemo(() => {
    const set = new Set();
    (summary?.evolucao || []).forEach((p) => Object.keys(p.stats.por_fundamento || {}).forEach((f) => set.add(f)));
    return [...set];
  }, [summary]);
  const evoChart = useMemo(() => (summary?.evolucao || []).map((p) => {
    const row = { period: p.period, total: p.stats.total };
    Object.entries(p.stats.por_fundamento || {}).forEach(([f, d]) => (row[f] = d.eficiencia));
    return row;
  }), [summary]);
  const FUND_COLORS = ["#E50914", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4"];

  if (!athlete) return <Layout back="/atletas"><div className="text-muted-foreground">Carregando...</div></Layout>;

  const StatCards = ({ stats }) => (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[["Ações", stats.total], ["Fundamentos", Object.keys(stats.por_fundamento).length], ["Partidas", stats.n_partidas], ["Categorias", Object.keys(stats.por_categoria).length]].map(([l, v]) => (
        <div key={l} className="rounded-xl border border-border bg-card p-4"><div className="font-data text-3xl font-bold text-primary">{v}</div><div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div></div>
      ))}
    </div>
  );

  const CompareTable = ({ a, b }) => {
    const sa = summary.por_categoria[a]; const sb = summary.por_categoria[b];
    if (!sa || !sb) return <div className="text-sm text-muted-foreground">Selecione duas categorias com dados.</div>;
    const funds = [...new Set([...Object.keys(sa.por_fundamento), ...Object.keys(sb.por_fundamento)])];
    return (
      <div className="overflow-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50"><tr><th className="text-left p-3">Fundamento</th><th className="p-3">{a}</th><th className="p-3">{b}</th><th className="p-3">Δ eficiência</th></tr></thead>
          <tbody className="divide-y divide-border">
            {funds.map((f) => {
              const da = sa.por_fundamento[f] || { total: 0, eficiencia: 0 }; const dbb = sb.por_fundamento[f] || { total: 0, eficiencia: 0 };
              const delta = dbb.eficiencia - da.eficiencia;
              return (
                <tr key={f} data-testid={`cmp-row-${f}`}>
                  <td className="p-3 font-medium">{f}</td>
                  <td className="p-3 text-center font-data">{da.total} <span className="text-xs text-muted-foreground">({da.eficiencia}%)</span></td>
                  <td className="p-3 text-center font-data">{dbb.total} <span className="text-xs text-muted-foreground">({dbb.eficiencia}%)</span></td>
                  <td className={cn("p-3 text-center font-data font-bold", delta > 0 ? "text-emerald-500" : delta < 0 ? "text-primary" : "text-muted-foreground")}>{delta > 0 ? "+" : ""}{delta}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Layout
      title={athlete.name}
      subtitle={`${athlete.position_name || "Sem posição"} · Camisa ${athlete.number || "—"} · ${actions.length} ações · ${cats.length} categoria(s)`}
      back="/atletas"
      actions={<><button data-testid="dossier-compilation" onClick={() => setCompOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40"><Film size={16} className="text-primary" /> Compilação em vídeo</button><PdfButton targetId="dossier-pdf-root" title={`Dossiê — ${athlete.name}`} subtitle={`${athlete.position_name || "Sem posição"} · Camisa ${athlete.number || "—"}`} filename={`dossie-${athlete.name}`} testid="dossier-export-pdf" /><a data-testid="dossier-export" href={exportCsvUrl({ athlete_id: id })} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-semibold hover:border-primary/40"><Download size={16} /> Exportar CSV</a></>}
    >
      <CompilationDialog open={compOpen} onClose={() => setCompOpen(false)} actions={actions} videosById={videoById} athletes={[athlete]} funds={fundamentos} classes={classes} fixedAthleteId={athlete.id} />
      <Tabs defaultValue="pasta" id="dossier-pdf-root">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pasta" data-testid="dtab-pasta"><FolderOpen size={15} className="mr-1.5" /> Pasta</TabsTrigger>
          <TabsTrigger value="evolucao" data-testid="dtab-evolucao"><TrendingUp size={15} className="mr-1.5" /> Evolução</TabsTrigger>
          <TabsTrigger value="comparar" data-testid="dtab-comparar"><GitCompare size={15} className="mr-1.5" /> Comparar categorias</TabsTrigger>
        </TabsList>

        {/* PASTA */}
        <TabsContent value="pasta" className="mt-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
            <button onClick={() => setCat("todas")} data-testid="dcat-todas" className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium border", cat === "todas" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>Todas ({actions.length})</button>
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} data-testid={`dcat-${c}`} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium border", cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{c} ({summary.por_categoria[c]?.total || 0})</button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 rounded-xl bg-secondary flex items-center justify-center">
                  <User className="text-primary" size={28} />
                  {athlete.number && <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground font-data">{athlete.number}</span>}
                </div>
                <div><div className="ava-heading text-xl font-bold">{athlete.name}</div><div className="text-sm text-muted-foreground">{athlete.position_name}</div><div className="text-xs text-muted-foreground mt-0.5">{cat === "todas" ? "Todas as categorias" : cat}</div></div>
              </div>
              {radarData.some((r) => r.total > 0) && (
                <div className="h-56 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="fund" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                      <Radar dataKey="total" stroke="#E50914" fill="#E50914" fillOpacity={0.45} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {athlete.notes && <p className="text-sm text-muted-foreground mt-2 border-t border-border pt-3">{athlete.notes}</p>}
            </div>

            <div className="lg:col-span-2 space-y-3">
              <h3 className="ava-heading text-xl font-bold flex items-center gap-2"><FolderOpen size={20} className="text-primary" /> Fundamentos</h3>
              {perFund.map(({ fund, total, byClass, list }) => (
                <div key={fund.id} data-testid={`dossier-fund-${fund.id}`} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button onClick={() => setOpenFund(openFund === fund.id ? null : fund.id)} className="w-full flex items-center gap-3 p-4 hover:bg-secondary/40 transition">
                    <span className="h-3 w-3 rounded-full" style={{ background: fund.color }} />
                    <span className="font-semibold">{fund.name}</span>
                    <span className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                      {Object.entries(byClass).map(([label, n]) => (
                        <span key={label} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: classColor(label, fund.id) + "22", color: classColor(label, fund.id) }}>{label} {n}</span>
                      ))}
                      <span className="font-data text-sm text-muted-foreground">{total}</span>
                    </span>
                  </button>
                  {openFund === fund.id && (
                    <div className="border-t border-border divide-y divide-border">
                      {list.length === 0 ? <div className="p-4 text-sm text-muted-foreground">Nenhuma ação deste fundamento.</div> : list.map((a) => (
                        <button key={a.id} data-testid={`dossier-clip-${a.id}`} onClick={() => navigate(`/analisar/${a.video_id}?t=${a.timestamp}&action=${a.id}`)} className="w-full flex items-center gap-3 p-3 hover:bg-secondary/40 text-left">
                          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary"><Play size={14} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{videoById[a.video_id]?.title || "Partida"}</div>
                            <div className="text-xs text-muted-foreground">{a.categoria_name || "—"} · {a.tactical_position || "—"} · {a.phase || "—"}</div>
                          </div>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: classColor(a.classificacao_label, fund.id) + "22", color: classColor(a.classificacao_label, fund.id) }}>{a.classificacao_label}</span>
                          <span className="font-data text-xs text-muted-foreground">{formatTime(a.timestamp)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* EVOLUÇÃO */}
        <TabsContent value="evolucao" className="mt-4 space-y-5">
          {summary.geral && <StatCards stats={summary.geral} />}
          {evoChart.length < 2 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              A evolução cronológica aparece quando há registros em períodos (temporadas) diferentes. {evoChart.length === 1 && `Atualmente há dados de ${evoChart[0].period}.`}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="ava-heading text-lg font-bold mb-1">Eficiência por fundamento ao longo das temporadas</h3>
              <p className="text-xs text-muted-foreground mb-3">Eficiência = (ações positivas − erros) ÷ total. Interprete junto à quantidade de ações de cada período.</p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={evoChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} unit="%" />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    {evoFunds.map((f, i) => <Line key={f} type="monotone" dataKey={f} stroke={FUND_COLORS[i % FUND_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(summary.evolucao || []).map((p) => (
              <div key={p.period} data-testid={`evo-period-${p.period}`} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2"><span className="ava-heading text-lg font-bold">{p.period}</span><span className="font-data text-sm text-primary">{p.stats.total} ações</span></div>
                <div className="text-xs text-muted-foreground mb-2">{p.categorias.join(", ")}</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(p.stats.por_fundamento).map(([f, d]) => (
                    <span key={f} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">{f}: {d.eficiencia}%</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* COMPARAR CATEGORIAS */}
        <TabsContent value="comparar" className="mt-4 space-y-4">
          {cats.length < 2 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">A comparação entre categorias aparece quando o atleta tem registros em duas ou mais categorias.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 items-center">
                <select data-testid="cmp-a" value={cmpA} onChange={(e) => setCmpA(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none">{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                <span className="text-muted-foreground text-sm">vs</span>
                <select data-testid="cmp-b" value={cmpB} onChange={(e) => setCmpB(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none">{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              </div>
              <p className="text-xs text-muted-foreground">Contextos diferentes (nível, quantidade de ações) podem explicar parte das diferenças — compare com cautela.</p>
              <CompareTable a={cmpA} b={cmpB} />
            </>
          )}
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
