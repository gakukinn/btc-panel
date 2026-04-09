import React from 'react';

/* 禅意稳健度条 — 墨绿/金色/朱红三段 */
const RobustnessBar = ({ score, totalNeighbors, stableNeighbors, passedNeighbors }) => {
  const pct = Math.round((score || 0) * 100);

  /* 水墨三色：墨绿（稳）/ 金色（中）/ 朱红（弱） */
  const color = pct >= 70
    ? 'var(--mo-green)'
    : pct >= 40
      ? 'var(--gold-lt)'
      : 'var(--zhu-red)';

  return (
    <div className="flex items-center gap-3">
      {/* 墨迹轨道 */}
      <div
        className="w-24 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--ink-border)' }}
      >
        <div
          className="h-full transition-all duration-500 ease-out rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-bold font-mono-tech" style={{ color }}>
          {pct}%
        </span>
        <span className="text-xs" style={{ color: 'var(--ink-mid)' }}>
          ({stableNeighbors}/{totalNeighbors})
        </span>
      </div>
    </div>
  );
};

export default RobustnessBar;
