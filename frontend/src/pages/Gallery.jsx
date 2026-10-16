import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getVideos, deleteVideo, getCategorias } from "@/lib/api";
import { formatTime, STATUS, formatDatePt } from "@/lib/format";
import { Search, Plus, Play, Trash2, Clock, Tag, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "pendente", label: "Pendente" },
  { id: "em_analise", label: "Em Análise" },
  { id: "concluido", label: "Concluído" },
];

export default function Gallery() {
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("todos");
  const [catFilter, setCatFilter] = useState("todas");
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => getVideos().then((v) => { setVideos(v); setLoading(false); });
  useEffect(() => { load(); getCategorias().then((c) => setCategorias(c.filter((x) => x.active !== false))); }, []);

  const remove = async (id) => {
    await deleteVideo(id);
    toast.success("Vídeo removido da galeria");
    load();
  };

  const filtered = videos.filter((v) => {
    const matchQ = `${v.title} ${v.opponent || ""} ${v.competition || ""} ${v.categoria_name || ""}`.toLowerCase().includes(q.toLowerCase());
    const matchF = filter === "todos" || v.status === filter;
    const matchC = catFilter === "todas" || (v.categoria_name || v.category) === catFilter;
    return matchQ && matchF && matchC;
  });

  return (
    <Layout
      title="Galeria de Vídeos"
      subtitle="Biblioteca central de partidas e treinos da AVA"
      back="/"
      actions={
        <button data-testid="gallery-add-btn" onClick={() => navigate("/adicionar")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110 transition">
          <Plus size={16} /> Adicionar
        </button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            data-testid="gallery-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por partida, adversário ou competição..."
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              data-testid={`gallery-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                filter === f.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select data-testid="gallery-cat-filter" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="shrink-0 rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary/60">
          <option value="todas">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Film className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum vídeo encontrado.</p>
          <button data-testid="gallery-empty-add" onClick={() => navigate("/adicionar")} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Plus size={16} /> Adicionar primeiro vídeo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((v) => {
            const st = STATUS[v.status] || STATUS.pendente;
            return (
              <div key={v.id} data-testid={`video-card-${v.id}`} className="group rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-all hover:-translate-y-1">
                <div className="relative aspect-video bg-secondary overflow-hidden cursor-pointer" onClick={() => navigate(`/analisar/${v.id}`)}>
                  {v.thumbnail_url ? (
                    <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center"><Film className="text-muted-foreground" size={32} /></div>
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center"><Play className="text-primary-foreground ml-0.5" /></div>
                  </div>
                  {v.duration ? (
                    <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-data text-white flex items-center gap-1">
                      <Clock size={11} /> {formatTime(v.duration)}
                    </span>
                  ) : null}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight line-clamp-2">{v.title}</h3>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
                  </div>
                  {(v.categoria_name || v.category) && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span data-testid={`video-cat-${v.id}`} className="rounded-full bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-semibold">{v.categoria_name || v.category}</span>
                      {v.season && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{v.season}</span>}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{v.competition || "—"}{v.comp_phase ? ` · ${v.comp_phase}` : ""} · {formatDatePt(v.match_date)}</p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Tag size={12} /> {v.tag_count || 0} marcações</span>
                    <div className="flex items-center gap-1">
                      <button data-testid={`video-analyze-${v.id}`} onClick={() => navigate(`/analisar/${v.id}`)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:brightness-110">
                        {v.status === "pendente" ? "Analisar" : "Continuar"}
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button data-testid={`video-delete-${v.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary hover:border-primary/40"><Trash2 size={14} /></button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover vídeo?</AlertDialogTitle>
                            <AlertDialogDescription>As marcações já registradas serão preservadas no banco, mas o vídeo sairá da galeria.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(v.id)} className="bg-primary">Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
