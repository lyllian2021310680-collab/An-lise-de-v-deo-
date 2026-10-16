import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getVideos, getAthletes, getActions } from "@/lib/api";
import { Plus, Film, Users, ClipboardList, BarChart3, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CARDS = [
  { id: "add_video", title: "Adicionar Vídeo", desc: "Importe uma partida por link do YouTube ou enviando o arquivo.", icon: Plus, to: "/adicionar", accent: true },
  { id: "gallery", title: "Galeria de Vídeos", desc: "Biblioteca de partidas com status, busca e filtros.", icon: Film, to: "/galeria" },
  { id: "athletes", title: "Pastas dos Atletas", desc: "Dossiê individual por fundamento e classificação.", icon: Users, to: "/atletas" },
  { id: "analyze", title: "Analisar Vídeo", desc: "Marque fundamentos no tempo exato e desenhe sobre o lance.", icon: ClipboardList, to: "/galeria", feature: true },
  { id: "reports", title: "Análises e Relatórios", desc: "Estatísticas coletivas e individuais com percentuais.", icon: BarChart3, to: "/relatorios" },
];

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ videos: 0, athletes: 0, actions: 0 });

  useEffect(() => {
    Promise.all([getVideos(), getAthletes(), getActions()])
      .then(([v, a, ac]) => setStats({ videos: v.length, athletes: a.length, actions: ac.length }))
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <section className="relative overflow-hidden rounded-3xl border border-border ava-grid-bg p-6 sm:p-10 mb-8 ava-fade-up">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Associação Voleibol Assisense
          </span>
          <h1 className="ava-heading text-4xl sm:text-5xl lg:text-6xl font-extrabold mt-4 leading-[0.95]">
            Análise técnica de vôlei,<br /><span className="text-primary">centralizada e inteligente.</span>
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mt-4 max-w-xl">
            Importe partidas, marque fundamentos no tempo exato, desenhe sobre os lances e acompanhe o desempenho de cada atleta.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <button data-testid="hero-add-video" onClick={() => navigate("/adicionar")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110 transition ava-red-glow">
              <Plus size={18} /> Adicionar vídeo
            </button>
            <button data-testid="hero-gallery" onClick={() => navigate("/galeria")} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary/50 transition">
              <Film size={18} /> Ver galeria
            </button>
          </div>
          <div className="flex gap-6 mt-8">
            {[["Partidas", stats.videos], ["Atletas", stats.athletes], ["Marcações", stats.actions]].map(([l, v]) => (
              <div key={l}>
                <div className="font-data text-3xl font-bold text-foreground">{v}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <h2 className="ava-heading text-2xl font-bold mb-4">O que você quer fazer?</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {CARDS.map((c, i) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              data-testid={`home-card-${c.id}`}
              onClick={() => navigate(c.to)}
              style={{ animationDelay: `${i * 60}ms` }}
              className={cn(
                "group text-left rounded-2xl border p-6 transition-all duration-300 ava-fade-up hover:-translate-y-1",
                c.feature ? "lg:col-span-2 border-primary/40 bg-gradient-to-br from-primary/10 to-transparent hover:ava-red-glow" : "border-border bg-card hover:border-primary/40",
                c.accent && "border-primary/40"
              )}
            >
              <div className={cn("inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4", c.feature || c.accent ? "bg-primary text-primary-foreground" : "bg-secondary text-primary")}>
                <Icon size={22} />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="ava-heading text-xl font-bold">{c.title}</h3>
                <ArrowRight size={18} className="opacity-0 -translate-x-2 transition-all group-hover:opacity-100 group-hover:translate-x-0 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">{c.desc}</p>
            </button>
          );
        })}
      </div>
    </Layout>
  );
}
