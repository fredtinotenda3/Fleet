// frontend/modules/ai/components/DriverRiskGauge.tsx
//
// Radial gauge for DriverRiskScore.overallScore. 0-100, HIGHER = RISKIER
// (opposite polarity from metrics.safetyScore -- see the doc comment
// on DriverRiskScore.overallScore in ../types/driver-risk.types.ts).
// The gauge fill color follows riskLevel (already computed
// server-side by determineRiskLevel(), not re-derived from the score
// here) so the gauge's color and the risk-level badge next to it can
// never disagree.

'use client';

import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import type { DriverRiskLevel } from '../types/driver-risk.types';
import { formatRiskScore, riskLevelLabel } from '../utils/driver-risk.utils';

const RISK_LEVEL_COLOR: Record<DriverRiskLevel, string> = {
  low: 'var(--success)',
  medium: 'var(--warning)',
  high: 'var(--destructive)',
  critical: 'var(--destructive)',
};

interface DriverRiskGaugeProps {
  score: number;
  riskLevel: DriverRiskLevel;
  className?: string;
}

export function DriverRiskGauge({ score, riskLevel, className }: DriverRiskGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const color = RISK_LEVEL_COLOR[riskLevel] ?? 'var(--muted-foreground)';
  const data = [{ name: 'overallScore', value: clamped, fill: color }];

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={data}
            startAngle={90}
            endAngle={-270}
            innerRadius="70%"
            outerRadius="100%"
            barSize={16}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: 'var(--muted)' }}
              dataKey="value"
              cornerRadius={8}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold leading-none text-foreground">
            {formatRiskScore(score)}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">out of 100</span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium" style={{ color }}>
        {riskLevelLabel(riskLevel)} risk
      </p>
    </div>
  );
}
