import React from 'react';

/* 颜色映射 — 霓虹科技风格 */
const colorMap = {
  blue:   { borderColor: 'rgba(0,212,255,0.35)',   glowColor: 'rgba(0,212,255,0.18)',   valueColor: '#00d4ff' },
  cyan:   { borderColor: 'rgba(0,212,255,0.45)',   glowColor: 'rgba(0,212,255,0.22)',   valueColor: '#00d4ff' },
  green:  { borderColor: 'rgba(0,255,136,0.35)',   glowColor: 'rgba(0,255,136,0.18)',   valueColor: '#00ff88' },
  purple: { borderColor: 'rgba(168,85,247,0.4)',   glowColor: 'rgba(168,85,247,0.18)',  valueColor: '#c084fc' },
  amber:  { borderColor: 'rgba(255,215,0,0.4)',    glowColor: 'rgba(255,215,0,0.18)',   valueColor: '#ffd700' },
  rose:   { borderColor: 'rgba(255,51,102,0.35)',  glowColor: 'rgba(255,51,102,0.18)',  valueColor: '#ff3366' },
  teal:   { borderColor: 'rgba(45,212,191,0.35)',  glowColor: 'rgba(45,212,191,0.18)',  valueColor: '#2dd4bf' },
};

const StatCard = ({ label, value, color = 'blue' }) => {
  const c = colorMap[color] || colorMap.blue;
  return (
    <div
      className="relative rounded-xl p-4 backdrop-blur-xl transition-all duration-300 hover:scale-[1.04] cursor-default overflow-hidden"
      style={{
        background: 'rgba(10,22,40,0.88)',
        border: `1px solid ${c.borderColor}`,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 25px ${c.glowColor}`; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      {/* Top neon line */}
      <div className="absolute top-0 left-3 right-3 h-[1px]"
        style={{ background: `linear-gradient(90deg, transparent, ${c.valueColor}88, transparent)` }} />

      {/* Corner brackets */}
      <div className="absolute top-[-1px] left-[-1px] w-3 h-3"
        style={{ borderTop: `2px solid ${c.valueColor}`, borderLeft: `2px solid ${c.valueColor}`, borderRadius: '2px 0 0 0', opacity: 0.8 }} />
      <div className="absolute bottom-[-1px] right-[-1px] w-3 h-3"
        style={{ borderBottom: `2px solid ${c.valueColor}`, borderRight: `2px solid ${c.valueColor}`, borderRadius: '0 0 2px 0', opacity: 0.8 }} />

      {/* Label */}
      <div className="text-[9px] font-semibold tracking-[0.18em] uppercase mb-1.5"
        style={{ fontFamily: "'Share Tech Mono', monospace", color: '#7eb3d4' }}>
        {label}
      </div>

      {/* Value */}
      <div className="text-2xl font-black tracking-tight leading-none"
        style={{ fontFamily: "'Orbitron', monospace", color: c.valueColor,
          textShadow: `0 0 10px ${c.valueColor}88` }}>
        {value}
      </div>

      {/* Bottom neon line */}
      <div className="absolute bottom-0 right-3 left-3 h-[1px]"
        style={{ background: `linear-gradient(90deg, transparent, ${c.valueColor}44, transparent)` }} />
    </div>
  );
};

export default StatCard;
