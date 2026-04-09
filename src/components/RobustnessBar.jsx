import React from 'react';

const RobustnessBar = ({ score, totalNeighbors, stableNeighbors, passedNeighbors }) => {
  const pct = Math.round((score || 0) * 100);
  const c = pct >= 70
    ? { bar: '#00ff88', glow: 'rgba(0,255,136,0.6)', txt: '#00ff88' }
    : pct >= 40
      ? { bar: '#ffd700', glow: 'rgba(255,215,0,0.6)',  txt: '#ffd700' }
      : { bar: '#ff3366', glow: 'rgba(255,51,102,0.6)', txt: '#ff3366' };

  return (
    <div className="flex items-center gap-2 group relative">
      {/* Track */}
      <div className="w-20 h-[6px] rounded-full overflow-hidden"
        style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.18)' }}>
        <div className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${pct}%`, background: c.bar, boxShadow: `0 0 8px ${c.glow}` }} />
      </div>

      <span className="text-[11px] font-black tabular-nums"
        style={{ fontFamily: "'Share Tech Mono', monospace", color: c.txt, textShadow: `0 0 6px ${c.glow}` }}>
        {pct}%
      </span>

      <span className="text-[10px] opacity-0 group-hover:opacity-60 transition-opacity"
        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
        {stableNeighbors}/{totalNeighbors}
      </span>

      {/* Tooltip */}
      <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 rounded pointer-events-none
        opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-50"
        style={{
          background: 'rgba(5,10,20,0.96)',
          border: '1px solid rgba(0,212,255,0.3)',
          boxShadow: '0 0 20px rgba(0,212,255,0.12)',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: '10px',
          color: '#7eb3d4',
        }}>
        <span style={{ color: '#00d4ff' }}>TOTAL</span>&nbsp;{totalNeighbors}
        &nbsp;&nbsp;<span style={{ color: '#00ff88' }}>STABLE</span>&nbsp;{stableNeighbors}
        &nbsp;&nbsp;<span style={{ color: '#ffd700' }}>PASSED</span>&nbsp;{passedNeighbors}
      </div>
    </div>
  );
};

export default RobustnessBar;
