import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import {
  getFundamentos, createFundamento, updateFundamento, deleteFundamento, archiveFundamento,
  getClassificacoes, createClassificacao, updateClassificacao, deleteClassificacao,
  getPositions, createPosition, updatePosition, deletePosition,
  getFormations, createFormation, updateFormation, deleteFormation,
  getCategorias, createCategoria, updateCategoria, deleteCategoria, archiveCategoria,
  getEquipes, createEquipe, updateEquipe, deleteEquipe, archiveEquipe,
  getSettings, updateSettings,
} from "@/lib/api";
import { Plus, Trash2, Save, GripVertical, Clock, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function SettingsPage() {
  const [funds, setFunds] = useState([]);
  const [classes, setClasses] = useState([]);
  const [positions, setPositions] = useState([]);
  const [formations, setFormations] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [settings, setSettings] = useState({ default_clip_before: 5, default_clip_after: 4 });
  const [newFund, setNewFund] = useState("");
  const [newPos, setNewPos] = useState("");
  const [newForm, setNewForm] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newEquipe, setNewEquipe] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = async () => {
    const [f, c, p, fo, cat, eq, s] = await Promise.all([getFundamentos(), getClassificacoes(), getPositions(), getFormations(), getCategorias(), getEquipes(), getSettings()]);
    setFunds(f.filter((x) => x.active !== false));
    setClasses(c.filter((x) => x.active !== false));
    setPositions(p.filter((x) => x.active !== false));
    setFormations(fo.filter((x) => x.active !== false));
    setCategorias(cat.filter((x) => x.active !== false));
    setEquipes(eq.filter((x) => x.active !== false));
    setSettings(s);
  };
  useEffect(() => { load(); }, []);

  const addFund = async () => { if (!newFund.trim()) return; await createFundamento({ name: newFund, color: "#E50914", order: funds.length }); setNewFund(""); toast.success("Fundamento criado"); load(); };
  const renameFund = async (f, name) => { await updateFundamento(f.id, { ...f, name }); };
  const recolorFund = async (f, color) => { await updateFundamento(f.id, { ...f, color }); load(); };
  const delFund = async (id) => { await deleteFundamento(id); toast.success("Fundamento desativado"); load(); };
  const toggleArchiveFund = async (f) => { await archiveFundamento(f.id, !f.archived); toast.success(f.archived ? "Reativado" : "Arquivado (histórico preservado)"); load(); };

  const addClass = async (fundId) => { await createClassificacao({ fundamento_id: fundId, label: "Nova", color: "#3B82F6", order: classes.filter((c) => c.fundamento_id === fundId).length }); load(); };
  const saveClass = async (c, patch) => { await updateClassificacao(c.id, { ...c, ...patch }); };
  const delClass = async (id) => { await deleteClassificacao(id); load(); };

  const addPos = async () => { if (!newPos.trim()) return; await createPosition({ name: newPos, order: positions.length }); setNewPos(""); toast.success("Posição criada"); load(); };
  const renamePos = async (p, name) => { await updatePosition(p.id, { ...p, name }); };
  const delPos = async (id) => { await deletePosition(id); toast.success("Posição desativada"); load(); };

  const addForm = async () => { if (!newForm.trim()) return; await createFormation({ name: newForm, order: formations.length }); setNewForm(""); toast.success("Formação criada"); load(); };
  const renameForm = async (p, name) => { await updateFormation(p.id, { ...p, name }); };
  const delForm = async (id) => { await deleteFormation(id); toast.success("Formação desativada"); load(); };

  const addCat = async () => { if (!newCat.trim()) return; await createCategoria({ name: newCat, order: categorias.length }); setNewCat(""); toast.success("Categoria criada"); load(); };
  const renameCat = async (c, name) => { await updateCategoria(c.id, { ...c, name }); };
  const delCat = async (id) => { await deleteCategoria(id); toast.success("Categoria desativada"); load(); };
  const toggleArchiveCat = async (c) => { await archiveCategoria(c.id, !c.archived); toast.success(c.archived ? "Reativada" : "Arquivada (histórico preservado)"); load(); };

  const addEquipe = async () => { if (!newEquipe.trim()) return; await createEquipe({ name: newEquipe, order: equipes.length }); setNewEquipe(""); toast.success("Equipe criada"); load(); };
  const renameEquipe = async (e, name) => { await updateEquipe(e.id, { ...e, name }); };
  const delEquipe = async (id) => { await deleteEquipe(id); toast.success("Equipe desativada"); load(); };
  const toggleArchiveEquipe = async (e) => { await archiveEquipe(e.id, !e.archived); toast.success(e.archived ? "Reativada" : "Arquivada"); load(); };

  const saveSettings = async () => { await updateSettings({ default_clip_before: Number(settings.default_clip_before), default_clip_after: Number(settings.default_clip_after) }); toast.success("Padrões salvos"); };

  const visibleFunds = funds.filter((f) => showArchived || !f.archived);
  const visibleCats = categorias.filter((c) => showArchived || !c.archived);
  const visibleEquipes = equipes.filter((e) => showArchived || !e.archived);

  return (
    <Layout title="Configurações" subtitle="Equipes, categorias, fundamentos, classificações, posições, formações e padrões" back="/">
      <Tabs defaultValue="equipes" className="max-w-4xl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="equipes" data-testid="tab-equipes">Equipes</TabsTrigger>
          <TabsTrigger value="categorias" data-testid="tab-categorias">Categorias</TabsTrigger>
          <TabsTrigger value="fund" data-testid="tab-fundamentos">Fundamentos</TabsTrigger>
          <TabsTrigger value="pos" data-testid="tab-positions">Posições</TabsTrigger>
          <TabsTrigger value="form" data-testid="tab-formations">Formações</TabsTrigger>
          <TabsTrigger value="clip" data-testid="tab-clips">Clipes</TabsTrigger>
        </TabsList>

        <TabsContent value="equipes" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <input data-testid="new-equipe-input" value={newEquipe} onChange={(e) => setNewEquipe(e.target.value)} placeholder="Nova equipe (ex: AVA)" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button data-testid="add-equipe-btn" onClick={addEquipe} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Adicionar</button>
            <button data-testid="toggle-archived-eq" onClick={() => setShowArchived((s) => !s)} className={cn("rounded-lg border px-3 text-sm", showArchived ? "border-primary text-primary" : "border-border text-muted-foreground")}>{showArchived ? "Ocultar arquivados" : "Ver arquivados"}</button>
          </div>
          {visibleEquipes.map((e) => (
            <div key={e.id} className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", e.archived ? "border-amber-500/40 opacity-70" : "border-border")}>
              <GripVertical size={16} className="text-muted-foreground" />
              <input defaultValue={e.name} onBlur={(ev) => renameEquipe(e, ev.target.value)} className="flex-1 bg-transparent font-medium outline-none" data-testid={`equipe-name-${e.id}`} />
              {e.archived && <span className="text-[10px] uppercase font-bold text-amber-500">Arquivada</span>}
              <button onClick={() => toggleArchiveEquipe(e)} data-testid={`archive-equipe-${e.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-amber-500">{e.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
              <button onClick={() => delEquipe(e.id)} data-testid={`del-equipe-${e.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="categorias" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <input data-testid="new-cat-input" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nova categoria (ex: Sub-21 Masculina)" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button data-testid="add-cat-btn" onClick={addCat} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Adicionar</button>
            <button data-testid="toggle-archived-cat" onClick={() => setShowArchived((s) => !s)} className={cn("rounded-lg border px-3 text-sm", showArchived ? "border-primary text-primary" : "border-border text-muted-foreground")}>{showArchived ? "Ocultar arquivadas" : "Ver arquivadas"}</button>
          </div>
          <p className="text-xs text-muted-foreground">Os dados ficam separados por categoria. A categoria de cada ação é definida pela partida analisada — o histórico é preservado ao arquivar.</p>
          {visibleCats.map((c) => (
            <div key={c.id} className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", c.archived ? "border-amber-500/40 opacity-70" : "border-border")}>
              <GripVertical size={16} className="text-muted-foreground" />
              <input defaultValue={c.name} onBlur={(ev) => renameCat(c, ev.target.value)} className="flex-1 bg-transparent font-medium outline-none" data-testid={`cat-name-${c.id}`} />
              {c.base && <span className="text-[11px] rounded bg-secondary px-2 py-0.5 text-muted-foreground">{c.base}{c.gender ? ` · ${c.gender}` : ""}</span>}
              {c.archived && <span className="text-[10px] uppercase font-bold text-amber-500">Arquivada</span>}
              <button onClick={() => toggleArchiveCat(c)} data-testid={`archive-cat-${c.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-amber-500">{c.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
              <button onClick={() => delCat(c.id)} data-testid={`del-cat-${c.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="fund" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <input data-testid="new-fund-input" value={newFund} onChange={(e) => setNewFund(e.target.value)} placeholder="Novo fundamento (ex: Cobertura)" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button data-testid="add-fund-btn" onClick={addFund} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Adicionar</button>
            <button data-testid="toggle-archived" onClick={() => setShowArchived((s) => !s)} className={cn("rounded-lg border px-3 text-sm", showArchived ? "border-primary text-primary" : "border-border text-muted-foreground")}>{showArchived ? "Ocultar arquivados" : "Ver arquivados"}</button>
          </div>
          <p className="text-xs text-muted-foreground">Crie, renomeie, recolora, arquive/reative fundamentos e classificações livremente — o histórico de registros é preservado em alterações.</p>
          {visibleFunds.map((f) => (
            <div key={f.id} className={cn("rounded-xl border bg-card p-4", f.archived ? "border-amber-500/40 opacity-70" : "border-border")}>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="color" value={f.color} onChange={(e) => recolorFund(f, e.target.value)} className="h-8 w-8 rounded cursor-pointer bg-transparent border border-border" data-testid={`fund-color-${f.id}`} />
                <input defaultValue={f.name} onBlur={(e) => renameFund(f, e.target.value)} className="flex-1 min-w-[120px] bg-transparent font-semibold outline-none border-b border-transparent focus:border-primary/40" data-testid={`fund-name-${f.id}`} />
                {f.archived && <span className="text-[10px] uppercase font-bold text-amber-500">Arquivado</span>}
                <button onClick={() => addClass(f.id)} data-testid={`add-class-${f.id}`} className="text-xs rounded-lg border border-border px-2.5 py-1.5 hover:border-primary/40 flex items-center gap-1"><Plus size={12} /> Classificação</button>
                <button onClick={() => toggleArchiveFund(f)} data-testid={`archive-fund-${f.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-amber-500" title="Arquivar/Reativar">{f.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                <button onClick={() => delFund(f.id)} data-testid={`del-fund-${f.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {classes.filter((c) => c.fundamento_id === f.id).map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1">
                    <input type="color" defaultValue={c.color} onBlur={(e) => saveClass(c, { color: e.target.value })} className="h-5 w-5 rounded cursor-pointer bg-transparent border-0" />
                    <input defaultValue={c.label} onBlur={(e) => saveClass(c, { label: e.target.value })} className="w-24 bg-transparent text-sm outline-none" data-testid={`class-label-${c.id}`} />
                    <button onClick={() => delClass(c.id)} className="text-muted-foreground hover:text-primary"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="pos" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <input data-testid="new-pos-input" value={newPos} onChange={(e) => setNewPos(e.target.value)} placeholder="Nova posição" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button data-testid="add-pos-btn" onClick={addPos} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Adicionar</button>
          </div>
          {positions.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <GripVertical size={16} className="text-muted-foreground" />
              <input defaultValue={p.name} onBlur={(e) => renamePos(p, e.target.value)} className="flex-1 bg-transparent font-medium outline-none" data-testid={`pos-name-${p.id}`} />
              <button onClick={() => delPos(p.id)} data-testid={`del-pos-${p.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="form" className="space-y-3 mt-4">
          <div className="flex gap-2">
            <input data-testid="new-form-input" value={newForm} onChange={(e) => setNewForm(e.target.value)} placeholder="Nova formação / rotação (ex: P1)" className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/60" />
            <button data-testid="add-form-btn" onClick={addForm} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus size={16} /> Adicionar</button>
          </div>
          {formations.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <GripVertical size={16} className="text-muted-foreground" />
              <input defaultValue={p.name} onBlur={(e) => renameForm(p, e.target.value)} className="flex-1 bg-transparent font-medium outline-none" data-testid={`form-name-${p.id}`} />
              <button onClick={() => delForm(p.id)} data-testid={`del-form-${p.id}`} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-primary"><Trash2 size={14} /></button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="clip" className="mt-4">
          <div className="rounded-xl border border-border bg-card p-6 max-w-md">
            <div className="flex items-center gap-2 mb-4 text-primary"><Clock size={18} /> <span className="font-semibold text-foreground">Duração padrão dos clipes</span></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Segundos antes</label><input type="number" data-testid="clip-before" value={settings.default_clip_before} onChange={(e) => setSettings({ ...settings, default_clip_before: e.target.value })} className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2.5 font-data outline-none focus:border-primary/60" /></div>
              <div><label className="text-xs uppercase tracking-wider text-muted-foreground">Segundos depois</label><input type="number" data-testid="clip-after" value={settings.default_clip_after} onChange={(e) => setSettings({ ...settings, default_clip_after: e.target.value })} className="w-full mt-1 rounded-lg border border-border bg-background px-3 py-2.5 font-data outline-none focus:border-primary/60" /></div>
            </div>
            <button data-testid="save-settings" onClick={saveSettings} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Save size={16} /> Salvar padrões</button>
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
