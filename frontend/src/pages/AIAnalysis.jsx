import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { aiAnalyze, getVideos, getFormations, getCategorias, getAthletes } from "@/lib/api";
import { Sparkles, Send, Loader2, BarChart3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PdfButton } from "@/components/PdfButton";

const SUGGESTIONS = [
  "Por que o rendimento do K1 está baixo?",
  "Em quais rotações a equipe apresenta mais dificuldades?",
  "Em quais regiões os adversários mais direcionam os saques?",
  "Qual é a relação entre a qualidade da recepção e a eficiência do ataque?",
  "Quais fundamentos concentram mais erros?",
  "Como o atleta evoluiu do Mirim para o Infantil?",
  "Quais dificuldades persistem ao longo das temporadas?",
  "Quais formações e situações táticas apresentaram melhores resultados?",
];

export default function AIAnalysis() {
  const [videos, setVideos] = useState([]);
  const [formations, setFormations] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [athletes, setAthletes] = useState([]);
  const [videoId, setVideoId] = useState("");
  const [formation, setFormation] = useState("");
  const [categoria, setCategoria] = useState("");
  const [athlete, setAthlete] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    getVideos().then(setVideos);
    getFormations().then((f) => setFormations(f.filter((x) => x.active !== false)));
    getCategorias().then((c) => setCategorias(c.filter((x) => x.active !== false)));
    getAthletes().then((a) => setAthletes(a.filter((x) => x.active !== false)));
  }, []);

  const ask = async (q) => {
    const question_ = q || question;
    if (!question_.trim()) return toast.error("Escreva uma pergunta");
    setLoading(true); setResult(null);
    try {
      const filters = {};
      if (categoria) filters.categoria_name = categoria;
      if (athlete) filters.athlete_id = athlete;
      const res = await aiAnalyze({ question: question_, video_ids: videoId ? [videoId] : [], formation: formation || null, filters });
      setResult(res);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Falha na análise inteligente");
    } finally { setLoading(false); }
  };

  return (
    <Layout title="Análise Inteligente" subtitle="Perguntas e respostas fundamentadas nos dados registrados" back="/">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-5">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="text-primary" /> <span className="ava-heading text-lg font-bold">Pergunte à comissão técnica AVA</span></div>
            <div className="flex flex-wrap gap-2 mb-3">
              <select data-testid="ai-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60">
                <option value="">Todas as categorias</option>
                {categorias.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <select data-testid="ai-athlete" value={athlete} onChange={(e) => setAthlete(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60">
                <option value="">Todos os atletas</option>
                {athletes.map((a) => <option key={a.id} value={a.id}>{a.number ? `${a.number} · ` : ""}{a.name}</option>)}
              </select>
              <select data-testid="ai-video" value={videoId} onChange={(e) => setVideoId(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60">
                <option value="">Todas as partidas</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
              <select data-testid="ai-formation" value={formation} onChange={(e) => setFormation(e.target.value)} className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/60">
                <option value="">Todas as formações</option>
                {formations.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </select>
            </div>
            <div className="relative">
              <textarea data-testid="ai-question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="Ex: Qual a relação entre recepção A/B/C e a eficiência do ataque na P1?" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-12 text-sm outline-none focus:border-primary/60" />
              <button data-testid="ai-send" onClick={() => ask()} disabled={loading} className="absolute right-2 bottom-2 rounded-lg bg-primary p-2 text-primary-foreground hover:brightness-110 disabled:opacity-60">{loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}</button>
            </div>
          </div>

          {loading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground"><Loader2 className="animate-spin mx-auto mb-2 text-primary" /> Analisando os dados registrados...</div>}

          {result && (
            <div id="ai-pdf-root" className="rounded-2xl border border-border bg-card p-5 ava-fade-up" data-testid="ai-result">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 border-b border-border pb-3">
                <BarChart3 size={14} className="text-primary" />
                <span className="font-semibold">{result.n_actions} ações analisadas</span>
                {result.n_actions < 15 && <span className="flex items-center gap-1 text-amber-500"><AlertTriangle size={13} /> amostra pequena — interprete com cautela</span>}
                <span className="ml-auto" data-pdf-ignore="true"><PdfButton targetId="ai-pdf-root" title="Análise Inteligente" subtitle={question} filename="analise-ia" testid="ai-export-pdf" /></span>
              </div>
              <div className="prose-ava text-sm leading-relaxed" data-testid="ai-answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown></div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="ava-heading text-lg font-bold">Perguntas sugeridas</h3>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} data-testid={`ai-suggestion-${i}`} onClick={() => { setQuestion(s); ask(s); }} className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary/40 hover:-translate-y-0.5 transition">{s}</button>
          ))}
          <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground mt-3">A IA responde com base apenas nos dados reais registrados (filtrados por categoria/atleta/partida), informa a quantidade de ações e distingue padrões de hipóteses.</div>
        </div>
      </div>
    </Layout>
  );
}
