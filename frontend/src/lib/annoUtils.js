export const SPAN = 5;
export const endOf = (el) => (el.endTime != null ? el.endTime : (el.startTime ?? 0) + SPAN);
export const inWindow = (el, t) => el.pinned || el.startTime == null || (t >= el.startTime - 0.04 && t <= endOf(el));

// Deslocamento interpolado entre quadros-chave (modo "acompanhar")
export const offsetAt = (el, t) => {
  const k = el.track === "follow" ? el.keys || [] : [];
  if (!k.length) return { dx: 0, dy: 0 };
  if (t <= k[0].t) return k[0];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i].t) {
      const a = k[i - 1], b = k[i];
      const f = (t - a.t) / (b.t - a.t || 1);
      return { dx: a.dx + (b.dx - a.dx) * f, dy: a.dy + (b.dy - a.dy) * f };
    }
  }
  return k[k.length - 1];
};

export const upsertKey = (keys = [], t, dx, dy) =>
  [...keys.filter((k) => Math.abs(k.t - t) > 0.08), { t, dx, dy }].sort((a, b) => a.t - b.t);

export const shiftEl = (el, t) => {
  const { dx, dy } = offsetAt(el, t);
  if (!dx && !dy) return el;
  return {
    ...el,
    x1: el.x1 + dx, y1: el.y1 + dy,
    x2: el.x2 != null ? el.x2 + dx : el.x2,
    y2: el.y2 != null ? el.y2 + dy : el.y2,
    points: el.points ? el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) : el.points,
  };
};

// Desenho das marcações num canvas (exportação de clipes)
export const drawEl = (ctx, raw, t, W, H) => {
  const el = shiftEl(raw, t);
  const lw = ((el.strokeWidth || 4) / 4) * Math.max(1.5, W / 600);
  ctx.save();
  ctx.strokeStyle = el.color; ctx.fillStyle = el.color; ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const X = (v) => v * W, Y = (v) => v * H;
  if (el.type === "line" || el.type === "arrow") {
    ctx.beginPath(); ctx.moveTo(X(el.x1), Y(el.y1)); ctx.lineTo(X(el.x2), Y(el.y2)); ctx.stroke();
    if (el.type === "arrow") {
      const ang = Math.atan2(Y(el.y2) - Y(el.y1), X(el.x2) - X(el.x1));
      const s = lw * 4 + W * 0.006;
      ctx.beginPath(); ctx.moveTo(X(el.x2), Y(el.y2));
      ctx.lineTo(X(el.x2) - s * Math.cos(ang - 0.45), Y(el.y2) - s * Math.sin(ang - 0.45));
      ctx.lineTo(X(el.x2) - s * Math.cos(ang + 0.45), Y(el.y2) - s * Math.sin(ang + 0.45));
      ctx.closePath(); ctx.fill();
    }
  } else if (el.type === "rect" || el.type === "highlight") {
    const x = X(Math.min(el.x1, el.x2)), y = Y(Math.min(el.y1, el.y2));
    const w = Math.abs(X(el.x2) - X(el.x1)), h = Math.abs(Y(el.y2) - Y(el.y1));
    if (el.type === "highlight") { ctx.globalAlpha = 0.3; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 0.6; }
    ctx.strokeRect(x, y, w, h);
  } else if (el.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(X((el.x1 + el.x2) / 2), Y((el.y1 + el.y2) / 2), Math.abs(X(el.x2) - X(el.x1)) / 2, Math.abs(Y(el.y2) - Y(el.y1)) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === "trajectory") {
    ctx.setLineDash([0.015 * W, 0.01 * W]); ctx.beginPath();
    (el.points || []).forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.stroke();
  } else if (el.type === "text") {
    ctx.font = `700 ${Math.round(0.045 * H)}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = Math.max(2, H * 0.006); ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(el.text, X(el.x1), Y(el.y1)); ctx.fillText(el.text, X(el.x1), Y(el.y1));
  }
  ctx.restore();
};
