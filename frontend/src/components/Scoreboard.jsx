import { Flag } from "lucide-react";

export const Scoreboard = ({ home = "AVA", away = "Adversário", score = { nos: 0, adv: 0 }, set = 1, serving, onServe, compact = false }) => {
  return (
    <div data-testid="scoreboard" className="inline-flex items-stretch overflow-hidden rounded-xl border border-border bg-gradient-to-b from-black/60 to-black/80 shadow-lg select-none">
      <Team name={home} side="nos" value={score.nos} serving={serving === "nos"} onServe={onServe} />
      <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-primary/90 text-primary-foreground">
        <span className="text-[9px] font-bold uppercase tracking-widest leading-none opacity-90">Set</span>
        <span className="font-data text-lg font-extrabold leading-none" data-testid="scoreboard-set">{set}</span>
      </div>
      <Team name={away} side="adv" value={score.adv} serving={serving === "adv"} onServe={onServe} />
    </div>
  );
};

const Team = ({ name, side, value, serving, onServe }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 text-white">
    <button onClick={() => onServe && onServe(side)} title="Quem está sacando" data-testid={`serve-${side}`} className={serving ? "text-amber-400" : "text-white/25 hover:text-white/60"}>
      <Flag size={13} fill={serving ? "currentColor" : "none"} />
    </button>
    <span className="max-w-[120px] truncate text-sm font-semibold">{name}</span>
    <span className="font-data text-2xl font-extrabold tabular-nums" data-testid={`scoreboard-${side}`}>{value}</span>
  </div>
);
