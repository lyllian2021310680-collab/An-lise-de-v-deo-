import { Clock, Move, Anchor, Eraser } from "lucide-react";
import { endOf, SPAN } from "@/lib/annoUtils";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_LABEL = { arrow: "Flecha", line: "Linha", rect: "Quadrado", ellipse: "Círculo", highlight: "Destaque", trajectory: "Trajetória", text: "Texto" };

export const AnnoTimingPanel = ({ annos, selId, time, onSelect, onPatch, onSeek }) => {
  const el = annos.find((e) => e.id === selId);
  const start = el?.startTime ?? 0;
  const end = el ? endOf(el) : 0;
  const setStart = (t) => onPatch(el.id, { startTime: t, endTime: t >= end ? t + (end - start) : end });
  const setEnd = (t) => onPatch(el.id, { endTime: Math.max(start + 0.1, t) });
  const setTrack = (track) => onPatch(el.id, track === "follow" ? { track, keys: el.keys?.length ? el.keys : [{ t: start, dx: 0, dy: 0 }] } : { track: "fixed" });
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3" data-testid="anno-timing-panel">
      {el ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Clock size={13} className="text-primary" />
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">{TYPE_LABEL[el.type] || "Marcação"} · tempo na tela</span>
            {el.pinned && <span className="text-[10px] rounded bg-primary/15 text-primary px-1">fixada no trecho inteiro</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">Aparece em (s)
              <div className="flex gap-1 mt-0.5">
                <input type="number" step={0.1} data-testid="anno-start-field" value={Number(start).toFixed(1)} onChange={(e) => setStart(Math.max(0, parseFloat(e.target.value) || 0))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-data outline-none focus:border-primary/60" />
                <button data-testid="anno-start-now" onClick={() => setStart(time)} className="shrink-0 rounded-lg border border-border px-2 text-[11px] hover:border-primary/40">agora</button>
              </div>
            </label>
            <label className="text-[11px] text-muted-foreground">Some em (s)
              <div className="flex gap-1 mt-0.5">
                <input type="number" step={0.1} data-testid="anno-end-field" value={Number(end).toFixed(1)} onChange={(e) => setEnd(parseFloat(e.target.value) || 0)} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-data outline-none focus:border-primary/60" />
                <button data-testid="anno-end-now" onClick={() => setEnd(time)} className="shrink-0 rounded-lg border border-border px-2 text-[11px] hover:border-primary/40">agora</button>
              </div>
            </label>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1">Posição:</span>
            <button data-testid="anno-track-fixed" onClick={() => setTrack("fixed")} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold", el.track !== "follow" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}><Anchor size={12} /> Fixa na tela</button>
            <button data-testid="anno-track-follow" onClick={() => setTrack("follow")} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold", el.track === "follow" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}><Move size={12} /> Acompanhar jogador/objeto</button>
            {el.track === "follow" && (
              <>
                <span className="text-[11px] font-data text-primary" data-testid="anno-keys-count">{(el.keys || []).length} ponto(s) de trajeto</span>
                <button data-testid="anno-keys-clear" onClick={() => onPatch(el.id, { keys: [{ t: start, dx: 0, dy: 0 }] })} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"><Eraser size={11} /> limpar</button>
              </>
            )}
          </div>
          {el.track === "follow" && <p className="text-[11px] text-muted-foreground">Avance o vídeo (▷ ou seek) e arraste a marcação até o jogador/objeto. Cada ajuste cria um ponto de trajeto; entre eles o movimento é suave. Também é possível arrastar com o vídeo rodando.</p>}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Pause no instante desejado e desenhe — a marcação aparece a partir desse momento por {SPAN}s. Selecione uma marcação (ferramenta seta) para ajustar o período e o modo de posição.</p>
      )}
      {annos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-2" data-testid="anno-list">
          {annos.map((a, i) => (
            <button key={a.id} data-testid={`anno-item-${i}`} onClick={() => { onSelect(a.id); if (a.startTime != null) onSeek(a.startTime); }} className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-data", a.id === selId ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
              <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />{TYPE_LABEL[a.type] || a.type} {a.startTime != null ? `${formatTime(a.startTime)}–${formatTime(endOf(a))}` : ""}{a.track === "follow" ? " ↝" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
