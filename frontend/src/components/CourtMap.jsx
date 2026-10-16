import { useRef, useState } from "react";

// 9-zone Data Volley layout. Net at top. Rows top->bottom: [4,3,2],[7,8,9],[5,6,1]
const ZONES = [
  { n: 4, r: 0, c: 0 }, { n: 3, r: 0, c: 1 }, { n: 2, r: 0, c: 2 },
  { n: 7, r: 1, c: 0 }, { n: 8, r: 1, c: 1 }, { n: 9, r: 1, c: 2 },
  { n: 5, r: 2, c: 0 }, { n: 6, r: 2, c: 1 }, { n: 1, r: 2, c: 2 },
];

const zoneAt = (x, y) => {
  const c = Math.min(2, Math.floor(x * 3));
  const r = Math.min(2, Math.floor(y * 3));
  return ZONES.find((z) => z.r === r && z.c === c)?.n ?? null;
};

export const CourtMap = ({ value, onChange, editable = true, heatPoints = null, heatZones = null, compact = false }) => {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [previewArrow, setPreviewArrow] = useState(null);

  const pt = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const onDown = (e) => { if (!editable) return; e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = pt(e); setPreviewArrow(null); };
  const onMove = (e) => { if (!editable || !dragRef.current) return; const p = pt(e); const s = dragRef.current; if (Math.hypot(p.x - s.x, p.y - s.y) > 0.04) setPreviewArrow({ x1: s.x, y1: s.y, x2: p.x, y2: p.y }); };
  const onUp = (e) => {
    if (!editable || !dragRef.current) return;
    const p = pt(e); const s = dragRef.current; dragRef.current = null;
    const moved = Math.hypot(p.x - s.x, p.y - s.y) > 0.04;
    const zone = zoneAt(s.x, s.y);
    onChange({ zone, point: { x: s.x, y: s.y }, arrow: moved ? { x1: s.x, y1: s.y, x2: p.x, y2: p.y } : null });
    setPreviewArrow(null);
  };

  // heatmap intensity per zone
  const heat = {};
  if (heatZones) Object.assign(heat, heatZones);
  else if (heatPoints) heatPoints.forEach((pp) => { const z = pp.zone ?? zoneAt(pp.x, pp.y); if (z != null) heat[z] = (heat[z] || 0) + 1; });
  const maxHeat = Math.max(1, ...Object.values(heat));

  const arrow = previewArrow || value?.arrow;

  return (
    <div className="relative w-full" style={{ paddingBottom: "108%" }}>
      <svg
        ref={svgRef} viewBox="0 0 1 1" preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full rounded-lg"
        style={{ background: "linear-gradient(#c2792e,#b86f28)", touchAction: "none", cursor: editable ? "crosshair" : "default" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} data-testid="court-map"
      >
        <defs>
          <marker id="court-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#111" />
          </marker>
        </defs>
        {/* zones */}
        {ZONES.map((z) => {
          const x = z.c / 3, y = z.r / 3;
          const intensity = heat[z.n] ? heat[z.n] / maxHeat : 0;
          const selected = value?.zone === z.n && !heatPoints && !heatZones;
          return (
            <g key={z.n}>
              <rect x={x} y={y} width={1 / 3} height={1 / 3} fill={intensity > 0 ? `rgba(229,9,20,${0.15 + intensity * 0.7})` : selected ? "rgba(255,255,255,0.25)" : "transparent"} stroke="rgba(255,255,255,0.45)" strokeWidth={0.004} />
              {!compact && <text x={x + 0.5 / 3} y={y + 0.5 / 3} fill="rgba(255,255,255,0.75)" fontSize={0.05} fontWeight="700" textAnchor="middle" dominantBaseline="middle" style={{ pointerEvents: "none" }}>{heat[z.n] ? heat[z.n] : z.n}</text>}
            </g>
          );
        })}
        {/* net line (top) + attack line */}
        <rect x={0} y={0} width={1} height={0.02} fill="#fff" />
        <line x1={0} y1={1 / 3} x2={1} y2={1 / 3} stroke="rgba(255,255,255,0.7)" strokeWidth={0.006} strokeDasharray="0.02,0.015" />
        {/* point */}
        {value?.point && !heatPoints && !heatZones && <circle cx={value.point.x} cy={value.point.y} r={0.018} fill="#E50914" stroke="#fff" strokeWidth={0.006} />}
        {/* arrow */}
        {arrow && <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="#111" strokeWidth={0.012} markerEnd="url(#court-arrow)" />}
      </svg>
      {editable && <span className="absolute top-1 left-2 text-[10px] font-semibold text-white/80 bg-black/30 px-1.5 rounded">NET</span>}
    </div>
  );
};
