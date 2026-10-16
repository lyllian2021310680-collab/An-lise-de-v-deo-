import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { createVideo, uploadFile, getEquipes, getCategorias } from "@/lib/api";
import { extractYouTubeId } from "@/components/VideoPlayer";
import { Youtube, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function AddVideo() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("youtube");
  const [form, setForm] = useState({ title: "", opponent: "", competition: "", comp_phase: "", season: String(new Date().getFullYear()), match_date: "", equipe_id: "", categoria_id: "" });
  const [ytInput, setYtInput] = useState("");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [equipes, setEquipes] = useState([]);
  const [categorias, setCategorias] = useState([]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    getEquipes().then((e) => { const list = e.filter((x) => x.active !== false && !x.archived); setEquipes(list); if (list[0]) set("equipe_id", list[0].id); });
    getCategorias().then((c) => setCategorias(c.filter((x) => x.active !== false && !x.archived)));
  }, []);

  const onFile = (f) => {
    setFile(f);
    if (!form.title) set("title", f.name.replace(/\.[^.]+$/, ""));
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => setDuration(el.duration);
    el.src = URL.createObjectURL(f);
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Informe o nome da partida");
    if (!form.categoria_id) return toast.error("Selecione a categoria da partida");
    setSaving(true);
    try {
      const equipe = equipes.find((e) => e.id === form.equipe_id);
      const categoria = categorias.find((c) => c.id === form.categoria_id);
      let payload = {
        ...form, team: equipe?.name || "AVA",
        equipe_name: equipe?.name || "AVA", categoria_name: categoria?.name || null,
        category: categoria?.name || null, status: "pendente",
      };
      if (mode === "youtube") {
        const id = extractYouTubeId(ytInput);
        if (!id) { setSaving(false); return toast.error("Link do YouTube inválido"); }
        payload = { ...payload, source_type: "youtube", youtube_id: id };
      } else {
        if (!file) { setSaving(false); return toast.error("Selecione um arquivo de vídeo"); }
        const up = await uploadFile(file, "video", setProgress);
        payload = { ...payload, source_type: "upload", storage_path: up.storage_path, duration };
      }
      const v = await createVideo(payload);
      toast.success("Vídeo adicionado à galeria!");
      navigate(`/analisar/${v.id}`);
    } catch (e) {
      toast.error("Erro ao adicionar vídeo");
      setSaving(false);
    }
  };

  return (
    <Layout title="Adicionar Vídeo" subtitle="Importe uma partida e associe à equipe e categoria" back="/galeria">
      <div className="max-w-2xl">
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button data-testid="mode-youtube" onClick={() => setMode("youtube")} className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition", mode === "youtube" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40")}>
            <Youtube className={mode === "youtube" ? "text-primary" : "text-muted-foreground"} />
            <div><div className="font-semibold">Link do YouTube</div><div className="text-xs text-muted-foreground">Rápido e leve</div></div>
          </button>
          <button data-testid="mode-upload" onClick={() => setMode("upload")} className={cn("flex items-center gap-3 rounded-xl border p-4 text-left transition", mode === "upload" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40")}>
            <Upload className={mode === "upload" ? "text-primary" : "text-muted-foreground"} />
            <div><div className="font-semibold">Enviar arquivo</div><div className="text-xs text-muted-foreground">Vídeo do dispositivo</div></div>
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          {mode === "youtube" ? (
            <Field label="Link ou ID do YouTube *">
              <input data-testid="input-youtube" value={ytInput} onChange={(e) => setYtInput(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            </Field>
          ) : (
            <Field label="Arquivo de vídeo *">
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-8 cursor-pointer hover:border-primary/50">
                <Upload className="text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{file ? file.name : "Clique para selecionar (MP4, WebM...)"}</span>
                <input data-testid="input-file" type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
              </label>
              {progress > 0 && progress < 100 && <div className="h-2 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
            </Field>
          )}

          <Field label="Nome da partida *">
            <input data-testid="input-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex: AVA x Marília — Final" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Equipe *">
              <select data-testid="input-equipe" value={form.equipe_id} onChange={(e) => set("equipe_id", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60">
                {equipes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Categoria *">
              <select data-testid="input-categoria" value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60">
                <option value="">Selecione…</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Adversário"><input data-testid="input-opponent" value={form.opponent} onChange={(e) => set("opponent", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></Field>
            <Field label="Competição"><input data-testid="input-competition" value={form.competition} onChange={(e) => set("competition", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></Field>
            <Field label="Fase da competição"><input data-testid="input-phase" value={form.comp_phase} onChange={(e) => set("comp_phase", e.target.value)} placeholder="Ex: Fase de grupos, Semifinal" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></Field>
            <Field label="Temporada"><input data-testid="input-season" value={form.season} onChange={(e) => set("season", e.target.value)} placeholder="Ex: 2026" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></Field>
            <Field label="Data"><input data-testid="input-date" type="date" value={form.match_date} onChange={(e) => set("match_date", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" /></Field>
          </div>

          <button data-testid="submit-video" disabled={saving} onClick={submit} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60">
            {saving ? <><Loader2 className="animate-spin" size={16} /> Salvando...</> : "Adicionar e abrir análise"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</label>
    {children}
  </div>
);
