import React from 'react';

const colorMap = {
  blue:   '#3b82f6',
  cyan:   '#0ea5e9',
  green:  '#10b981',
  purple: '#8b5cf6',
  amber:  '#f59e0b',
  rose:   '#ef4444',
  teal:   '#14b8a6',
};

const StatCard = ({ label, value, color = 'blue' }) => {
  const accentColor = colorMap[color] || colorMap.blue;
  
  return (
    <div
      className="relative rounded bg-slate-800 p-4 transition-all duration-200 hover:bg-slate-700/80 cursor-default flex flex-col justify-center border border-slate-700"
      style={{ borderLeftWidth: '4px', borderLeftColor: accentColor }}
    >
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight text-slate-50 font-mono-tech">
        {value}
      </div>
    </div>
  );
};

export default StatCard;
