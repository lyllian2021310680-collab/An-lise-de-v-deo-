import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Download, Loader2, Trash2, CheckCircle2, AlertTriangle, Sparkles, Film } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getJobs, readAllJobs, deleteJob, fileUrl } from "@/lib/api";
import { toast } from "sonner";

const active = (j) => j.status === "queued" || j.status === "running";

export const JobsBell = () => {
  const [jobs, setJobs] = useState([]);
  const prev = useRef(null);
  const load = useCallback(() => getJobs().then((list) => {
    if (prev.current) {
      list.forEach((j) => {
        const before = prev.current[j.id];
        if (before && active(before) && !active(j)) {
          if (j.status === "done") toast.success(`${j.title} — pronto!`, { description: j.message });
          else toast.error(`${j.title} — falhou`, { description: j.message });
          window.dispatchEvent(new CustomEvent("ava-job-finished", { detail: j }));
        }
      });
    }
    prev.current = Object.fromEntries(list.map((j) => [j.id, j]));
    setJobs(list);
  }).catch(() => {}), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    window.addEventListener("ava-jobs-refresh", load);
    return () => { clearInterval(t); window.removeEventListener("ava-jobs-refresh", load); };
  }, [load]);

  const unread = jobs.filter((j) => !j.read && !active(j)).length;
  const running = jobs.filter(active).length;
  const onOpen = (o) => { if (o && unread) readAllJobs().then(load); };
  const remove = async (id) => { await deleteJob(id); load(); };

  return (
    <Popover onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button data-testid="jobs-bell" className="relative rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="Processos e downloads">
          {running ? <Loader2 size={18} className="animate-spin text-primary" /> : <Bell size={18} />}
          {unread > 0 && <span data-testid="jobs-bell-count" className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground flex items-center justify-center">{unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" data-testid="jobs-panel">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold">Processos em segundo plano</div>
        <div className="max-h-[420px] overflow-auto divide-y divide-border">
          {jobs.length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum processo ainda. Compilações no servidor e ralis automáticos aparecem aqui.</div>}
          {jobs.map((j) => (
            <div key={j.id} data-testid={`job-${j.id}`} className="p-3 text-sm">
              <div className="flex items-start gap-2">
                {j.kind === "detect" ? <Sparkles size={14} className="mt-0.5 text-primary shrink-0" /> : <Film size={14} className="mt-0.5 text-primary shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{j.title}</div>
                  <div className="text-xs text-muted-foreground">{j.message}</div>
                </div>
                {j.status === "done" && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                {j.status === "error" && <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                {!active(j) && <button data-testid={`job-delete-${j.id}`} onClick={() => remove(j.id)} className="text-muted-foreground hover:text-primary"><Trash2 size={13} /></button>}
              </div>
              {active(j) && <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(4, (j.progress || 0) * 100)}%` }} /></div>}
              {(j.results || []).map((r) => (
                <a key={r.storage_path} data-testid="job-download" href={fileUrl(r.storage_path)} download={r.name} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold hover:border-primary/40 mr-1">
                  <Download size={12} /> {r.name}
                </a>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
