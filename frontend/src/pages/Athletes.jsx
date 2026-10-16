import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { getAthletes, getPositions, createAthlete, updateAthlete, deleteAthlete, getActions } from "@/lib/api";
import { Plus, User, Pencil, Trash2, Shirt, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const empty = { name: "", number: "", position_id: "", category: "Adulto", notes: "", external_id: "" };

export default function Athletes() {
  const navigate = useNavigate();
  const [athletes, setAthletes] = useState([]);
  const [positions, setPositions] = useState([]);
  const [counts, setCounts] = useState({});
  const [posFilter, setPosFilter] = useState("todos");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [a, p, acts] = await Promise.all([getAthletes(), getPositions(), getActions()]);
    setAthletes(a.filter((x) => x.active !== false));
    setPositions(p.filter((x) => x.active !== false));
    const c = {};
    acts.forEach((ac) => (ac.athlete_ids || []).forEach((id) => (c[id] = (c[id] || 0) + 1)));
    setCounts(c);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ name: a.name, number: a.number || "", position_id: a.position_id || "", category: a.category || "", notes: a.notes || "", external_id: a.external_id || "" }); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome");
    const pos = positions.find((p) => p.id === form.position_id);
    const body = { ...form, team: "AVA", position_name: pos?.name || null, active: true };
    if (editing) { await updateAthlete(editing.id, body); toast.success("Atleta atualizado"); }
    else { await createAthlete(body); toast.success("Atleta cadastrado"); }
    setOpen(false); load();
  };

  const remove = async (id) => { await deleteAthlete(id); toast.success("Atleta desativado"); load(); };

  const filtered = athletes.filter((a) => posFilter === "todos" || a.position_id === posFilter);

  return (
    <Layout
      title="Pastas dos Atletas"
      subtitle="Cadastro e dossiê individual de cada atleta"
      back="/"
      actions={<button data-testid="athlete-add-btn" onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110"><Plus size={16} /> Novo atleta</button>}
    >
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
        <button onClick={() => setPosFilter("todos")} data-testid="pos-filter-todos" className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium border", posFilter === "todos" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>Todos</button>
        {positions.map((p) => (
          <button key={p.id} data-testid={`pos-filter-${p.id}`} onClick={() => setPosFilter(p.id)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium border", posFilter === p.id ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground")}>{p.name}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">Nenhum atleta cadastrado nesta posição.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((a) => (
            <div key={a.id} data-testid={`athlete-card-${a.id}`} className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-all hover:-translate-y-1">
              <div className="flex items-start gap-3">
                <div className="relative h-14 w-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  <User className="text-primary" />
                  {a.number && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground font-data">{a.number}</span>}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight truncate">{a.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.position_name || "Sem posição"}</p>
                  <p className="text-xs text-muted-foreground">{counts[a.id] || 0} ações registradas</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button data-testid={`athlete-open-${a.id}`} onClick={() => navigate(`/atletas/${a.id}`)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"><FolderOpen size={14} /> Abrir pasta</button>
                <button data-testid={`athlete-edit-${a.id}`} onClick={() => openEdit(a)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground hover:border-primary/40"><Pencil size={14} /></button>
                <AlertDialog>
                  <AlertDialogTrigger asChild><button data-testid={`athlete-del-${a.id}`} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-primary hover:border-primary/40"><Trash2 size={14} /></button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>Desativar atleta?</AlertDialogTitle><AlertDialogDescription>O histórico de ações é preservado. O atleta deixa de aparecer na lista.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => remove(a.id)} className="bg-primary">Desativar</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="ava-heading text-2xl">{editing ? "Editar atleta" : "Novo atleta"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <input data-testid="athlete-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo *" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <div className="grid grid-cols-2 gap-3">
              <input data-testid="athlete-number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="Nº camisa" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
              <input data-testid="athlete-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Categoria" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            </div>
            <select data-testid="athlete-position" value={form.position_id} onChange={(e) => setForm({ ...form, position_id: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60">
              <option value="">Posição principal</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <textarea data-testid="athlete-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anotações" rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <input data-testid="athlete-external-id" value={form.external_id} onChange={(e) => setForm({ ...form, external_id: e.target.value })} placeholder="ID externo (site principal) — opcional" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <p className="text-[11px] text-muted-foreground -mt-1">Reservado para casar este atleta com o do seu site principal no futuro. Pode deixar em branco.</p>
          </div>
          <DialogFooter>
            <button data-testid="athlete-save" onClick={save} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-110">Salvar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
