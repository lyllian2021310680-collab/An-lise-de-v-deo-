import { useRef, useState, useCallback } from "react";
import { inWindow, shiftEl, offsetAt, upsertKey } from "@/lib/annoUtils";

const uid = () => Math.random().toString(36).slice(2, 10);

// Elements store normalized coords (0..1). type: arrow|line|rect|ellipse|text|trajectory
export const AnnotationLayer = ({
  elements = [],
  onChange,
  tool = "select",
  color = "#E50914",
  strokeWidth = 4,
  currentTime = 0,
  editable = true,
  selectedId,
  onSelect,
  onToolDone,
}) => {
  const svgRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const dragRef = useRef(null);

  const pt = useCallback((e) => {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const visible = (el) => (editable && el.id === selectedId) || inWindow(el, currentTime);

  const onDown = (e) => {
    if (!editable) return;
    const p = pt(e);
    if (tool === "select") { onSelect && onSelect(null); return; }
    if (tool === "text") {
      const text = window.prompt("Texto da marcação:");
      if (text) onChange([...elements, { id: uid(), type: "text", x1: p.x, y1: p.y, text, color, strokeWidth, startTime: currentTime }]);
      onToolDone && onToolDone();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft({ id: uid(), type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, points: [p], color, strokeWidth, startTime: currentTime });
  };

  const onMove = (e) => {
    const p = pt(e);
    if (draft) {
      setDraft((d) => ({ ...d, x2: p.x, y2: p.y, points: [...d.points, p] }));
      return;
    }
    if (dragRef.current) {
      const { id, start, orig, off0 } = dragRef.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      onChange(
        elements.map((el) => {
          if (el.id !== id) return el;
          if (el.track === "follow") return { ...el, keys: upsertKey(el.keys, currentTime, off0.dx + dx, off0.dy + dy) };
          const o = orig;
          return {
            ...el,
            x1: o.x1 != null ? o.x1 + dx : el.x1,
            y1: o.y1 != null ? o.y1 + dy : el.y1,
            x2: o.x2 != null ? o.x2 + dx : el.x2,
            y2: o.y2 != null ? o.y2 + dy : el.y2,
            points: o.points ? o.points.map((pp) => ({ x: pp.x + dx, y: pp.y + dy })) : el.points,
          };
        })
      );
    }
  };

  const onUp = () => {
    if (draft) {
      const big = Math.abs(draft.x2 - draft.x1) > 0.01 || Math.abs(draft.y2 - draft.y1) > 0.01 || draft.type === "trajectory";
      if (big) onChange([...elements, draft]);
      setDraft(null);
    }
    dragRef.current = null;
  };

  const startDrag = (e, shown) => {
    if (!editable || tool !== "select") return;
    e.stopPropagation();
    const el = elements.find((x) => x.id === shown.id) || shown;
    onSelect && onSelect(el.id);
    dragRef.current = { id: el.id, start: pt(e), off0: offsetAt(el, currentTime), orig: { ...el, points: el.points ? el.points.map((p) => ({ ...p })) : null } };
  };

  const renderEl = (el, isDraft) => {
    const sel = selectedId === el.id;
    const common = {
      stroke: el.color,
      strokeWidth: (el.strokeWidth || 4) / 4,
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      style: { cursor: editable && tool === "select" ? "move" : "crosshair" },
      onPointerDown: (e) => startDrag(e, el),
    };
    const key = el.id + (isDraft ? "-d" : "");
    const extra = sel ? { filter: "drop-shadow(0 0 3px rgba(255,255,255,0.9))" } : {};
    if (el.type === "line")
      return <line key={key} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...common} {...extra} />;
    if (el.type === "arrow")
      return (
        <line key={key} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} markerEnd={`url(#arrow-${el.color.replace("#", "")})`} {...common} {...extra} />
      );
    if (el.type === "rect") {
      const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
      return <rect key={key} x={x} y={y} width={Math.abs(el.x2 - el.x1)} height={Math.abs(el.y2 - el.y1)} rx={0.01} {...common} {...extra} />;
    }
    if (el.type === "highlight") {
      const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
      return (
        <rect
          key={key}
          x={x}
          y={y}
          width={Math.abs(el.x2 - el.x1)}
          height={Math.abs(el.y2 - el.y1)}
          rx={0.008}
          fill={el.color}
          fillOpacity={0.3}
          stroke={el.color}
          strokeOpacity={0.6}
          strokeWidth={(el.strokeWidth || 4) / 4}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: editable && tool === "select" ? "move" : "crosshair" }}
          onPointerDown={(e) => startDrag(e, el)}
          {...extra}
        />
      );
    }
    if (el.type === "ellipse") {
      const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2;
      return <ellipse key={key} cx={cx} cy={cy} rx={Math.abs(el.x2 - el.x1) / 2} ry={Math.abs(el.y2 - el.y1) / 2} {...common} {...extra} />;
    }
    if (el.type === "trajectory") {
      const d = (el.points || []).map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
      return <path key={key} d={d} strokeDasharray="0.015,0.01" {...common} {...extra} />;
    }
    if (el.type === "text")
      return (
        <text
          key={key}
          x={el.x1}
          y={el.y1}
          fill={el.color}
          fontSize={0.045}
          fontWeight="700"
          fontFamily="Barlow Condensed, sans-serif"
          style={{ cursor: editable && tool === "select" ? "move" : "default", paintOrder: "stroke" }}
          stroke="rgba(0,0,0,0.6)"
          strokeWidth={0.004}
          onPointerDown={(e) => startDrag(e, el)}
          {...extra}
        >
          {el.text}
        </text>
      );
    return null;
  };

  const colors = [...new Set(elements.concat(draft ? [draft] : []).map((e) => e.color))];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: editable ? "auto" : "none", touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      data-testid="annotation-svg"
    >
      <defs>
        {colors.map((c) => (
          <marker key={c} id={`arrow-${c.replace("#", "")}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {elements.filter(visible).map((el) => renderEl(shiftEl(el, currentTime), false))}
      {draft && renderEl(draft, true)}
    </svg>
  );
};
