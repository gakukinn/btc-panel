import React from 'react';

const RobustnessBar = ({ score, totalNeighbors, stableNeighbors, passedNeighbors }) => {
  const pct = Math.round((score || 0) * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="flex items-center gap-3">
      {/* Track */}
      <div className="w-24 h-2 rounded bg-slate-700 overflow-hidden">
        <div 
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }} 
        />
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold font-mono-tech" style={{ color }}>
          {pct}%
        </span>
        <span className="text-xs text-slate-400">
          ({stableNeighbors}/{totalNeighbors})
        </span>
      </div>
    </div>
  );
};

export default RobustnessBar;
