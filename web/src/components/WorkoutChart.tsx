'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { useSettings } from '@/lib/settings';

import type { WorkoutInterval } from '@/types/workout';
export type { WorkoutInterval };

interface WorkoutChartProps {
  intervals: WorkoutInterval[];
  totalDurationMin: number;
  title: string;
  showZoneLegend?: boolean;
}

// Approximate HR% from Power% (simplified model)
// Recovery (<55% FTP) ≈ 60-70% HRmax
// Endurance (55-75% FTP) ≈ 70-80% HRmax
// Tempo (75-90% FTP) ≈ 80-88% HRmax
// Threshold (90-105% FTP) ≈ 88-95% HRmax
// VO2max (105-120% FTP) ≈ 95-100% HRmax
function powerPercentToHRPercent(powerPercent: number): number {
  if (powerPercent <= 55) return 65 + (powerPercent / 55) * 5;
  if (powerPercent <= 75) return 70 + ((powerPercent - 55) / 20) * 10;
  if (powerPercent <= 90) return 80 + ((powerPercent - 75) / 15) * 8;
  if (powerPercent <= 105) return 88 + ((powerPercent - 90) / 15) * 7;
  return Math.min(100, 95 + ((powerPercent - 105) / 15) * 5);
}

// Helper to convert intervals to chart data points
function intervalsToChartData(
  intervals: WorkoutInterval[],
  totalDurationMin: number,
  ftp: number,
  maxHR: number,
) {
  const data: { time: number; power: number; hr: number; percent: number; label?: string }[] = [];

  const addPoint = (time: number, powerPercent: number, label?: string) => {
    const powerWatts = Math.round((powerPercent * ftp) / 100);
    const hrPercent = powerPercentToHRPercent(powerPercent);
    const hr = Math.round((hrPercent * maxHR) / 100);
    data.push({ time, power: powerWatts, hr, percent: powerPercent, label });
  };

  // Add warmup if first interval doesn't start at 0
  if (intervals.length > 0 && intervals[0].startMin > 0) {
    addPoint(0, 50);
    addPoint(intervals[0].startMin - 0.1, 50);
  }

  intervals.forEach((interval, idx) => {
    addPoint(interval.startMin, interval.powerPercent, interval.label);
    addPoint(interval.endMin, interval.powerPercent);

    // Recovery between intervals
    if (idx < intervals.length - 1) {
      const next = intervals[idx + 1];
      if (interval.endMin < next.startMin) {
        addPoint(interval.endMin + 0.1, 50);
        addPoint(next.startMin - 0.1, 50);
      }
    }
  });

  // Add cooldown if last interval doesn't end at total
  if (intervals.length > 0) {
    const lastEnd = intervals[intervals.length - 1].endMin;
    if (lastEnd < totalDurationMin) {
      addPoint(lastEnd + 0.1, 50);
      addPoint(totalDurationMin, 50);
    }
  }

  return data.sort((a, b) => a.time - b.time);
}

export default function WorkoutChart({
  intervals,
  totalDurationMin,
  title,
  showZoneLegend = true,
}: WorkoutChartProps) {
  const { settings } = useSettings();
  const { ftp, maxHR } = settings;

  const chartData = intervalsToChartData(intervals, totalDurationMin, ftp, maxHR);

  // Calculate Y-axis domains
  const maxPercent = Math.max(...intervals.map((i) => i.powerPercent), 100);
  const maxPower = Math.round(((maxPercent * ftp) / 100) * 1.1);
  const maxHRValue = Math.round(maxHR * 1.05);

  return (
    <div style={{ width: '100%', marginTop: '1rem' }}>
      <div
        style={{
          marginBottom: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.15rem' }}>
          FTP: <strong>{ftp}W</strong> | Max HR: <strong>{maxHR}bpm</strong>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 10, right: 50, left: 5, bottom: 0 }}>
          <defs>
            <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.8} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E91E63" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#E91E63" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, totalDurationMin]}
            ticks={(() => {
              // Pick a clean step: 5, 10, 15, 20, or 30 min
              const steps = [5, 10, 15, 20, 30, 60];
              const step = steps.find((s) => totalDurationMin / s <= 10) || 60;
              const t: number[] = [];
              for (let i = 0; i <= totalDurationMin; i += step) t.push(i);
              if (t[t.length - 1] !== totalDurationMin) t.push(totalDurationMin);
              return t;
            })()}
            tickFormatter={(v) => `${v}min`}
            tick={{ fontSize: 11, fill: 'var(--foreground)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            yAxisId="power"
            domain={[0, maxPower]}
            tickFormatter={(v) => `${v}W`}
            tick={{ fontSize: 11, fill: 'var(--primary)' }}
            axisLine={{ stroke: 'var(--primary)' }}
            tickLine={{ stroke: 'var(--primary)' }}
            width={50}
          />
          <YAxis
            yAxisId="hr"
            orientation="right"
            domain={[80, maxHRValue]}
            tickFormatter={(v) => `${v}bpm`}
            tick={{ fontSize: 11, fill: '#E91E63' }}
            axisLine={{ stroke: '#E91E63' }}
            tickLine={{ stroke: '#E91E63' }}
            width={55}
          />
          <Tooltip
            formatter={(value: number, name: string) => {
              if (name === 'power') return [`${value}W`, 'Power'];
              if (name === 'hr') return [`${value}bpm`, 'HR (est.)'];
              return [value, name];
            }}
            labelFormatter={(label) => `${label} min`}
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '0.8rem' }}
            formatter={(value) => (value === 'power' ? 'Power (W)' : 'Heart Rate (bpm)')}
          />

          {/* FTP reference line */}
          <ReferenceLine
            yAxisId="power"
            y={ftp}
            stroke="var(--primary)"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
          />

          <Area
            yAxisId="power"
            type="stepAfter"
            dataKey="power"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#powerGradient)"
            name="power"
          />
          <Area
            yAxisId="hr"
            type="stepAfter"
            dataKey="hr"
            stroke="#E91E63"
            strokeWidth={2}
            fill="url(#hrGradient)"
            name="hr"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Zone Legend */}
      {showZoneLegend && (
        <>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              fontSize: '0.65rem',
              marginTop: '0.5rem',
              opacity: 0.7,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Power:</span>
            <span>Recovery &lt;{Math.round(ftp * 0.55)}W</span>
            <span>
              | Endurance {Math.round(ftp * 0.55)}-{Math.round(ftp * 0.75)}W
            </span>
            <span>
              | Tempo {Math.round(ftp * 0.75)}-{Math.round(ftp * 0.9)}W
            </span>
            <span>
              | Threshold {Math.round(ftp * 0.9)}-{Math.round(ftp * 1.05)}W
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              fontSize: '0.65rem',
              marginTop: '0.25rem',
              opacity: 0.7,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#E91E63', fontWeight: 600 }}>HR:</span>
            <span>Z1 &lt;{Math.round(maxHR * 0.7)}bpm</span>
            <span>
              | Z2 {Math.round(maxHR * 0.7)}-{Math.round(maxHR * 0.8)}bpm
            </span>
            <span>
              | Z3 {Math.round(maxHR * 0.8)}-{Math.round(maxHR * 0.88)}bpm
            </span>
            <span>
              | Z4 {Math.round(maxHR * 0.88)}-{Math.round(maxHR * 0.95)}bpm
            </span>
            <span>| Z5 &gt;{Math.round(maxHR * 0.95)}bpm</span>
          </div>
        </>
      )}
    </div>
  );
}
