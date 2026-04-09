import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { cn } from '@/lib/utils';

/* 禅意色彩映射 — 以水墨五色为基调 */
const colorMap = {
  blue:   'text-profit',   /* 墨绿 盈 */
  cyan:   'text-profit',   /* 墨绿 */
  green:  'text-profit',   /* 墨绿 盈 */
  purple: 'text-gold',     /* 金色 */
  amber:  'text-gold',     /* 金色 */
  rose:   'text-loss',     /* 朱红 亏 */
  teal:   'text-profit',   /* 墨绿 */
};

const StatCard = ({ label, value, color = 'green', className }) => {
  const accentClass = colorMap[color] || 'text-profit';

  return (
    <Card className={cn(
      "zen-card transition-all duration-300",
      className
    )}>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle
          className="text-xs font-sans-cn tracking-widest"
          style={{ color: 'var(--ink-mid)', fontWeight: 400 }}
        >
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={cn(
          "text-2xl font-bold font-mono-tech tracking-tight tabular-nums",
          accentClass
        )}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
};

export default StatCard;
