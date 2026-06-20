'use client';

import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Bar } from 'recharts';
import { StravaActivity } from '@/lib/strava';
import HelpTooltip from '@/components/HelpTooltip';
import { useSettings } from '@/lib/settings';
import { processActivitiesForChart } from '../_lib/fitness-chart-data';

interface FitnessChartProps {
  activities: StravaActivity[];
}

export default function FitnessChart({ activities }: FitnessChartProps) {
  const { settings } = useSettings();
  const data = processActivitiesForChart(activities, settings.ftp);

  if (data.length < 2) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '2rem',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-md)',
          opacity: 0.7,
        }}
      >
        Not enough data to display fitness chart. Keep riding!
      </div>
    );
  }

  const latestData = data[data.length - 1];

  return (
    <div style={{ width: '100%' }}>
      {/* Fitness/Fatigue/Form Chart */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            TSS / Fitness / Fatigue / Form
          </span>
          <HelpTooltip>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--primary)' }}>
              📊 How to Read This Chart
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ color: '#00ACC1', fontWeight: 600 }}>
                  ▌ TSS (Training Stress Score)
                </span>
              </div>
              <div style={{ paddingLeft: '1rem', opacity: 0.85 }}>
                Weekly training load.
                <br />
                Estimated from power and elevation gain.
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ color: '#2196F3', fontWeight: 600 }}>● Fitness (CTL)</span>
              </div>
              <div style={{ paddingLeft: '1rem', opacity: 0.85 }}>
                Training load accumulated over roughly six weeks.
                <br />
                Higher values indicate more developed fitness.
              </div>
            </div>
            <div style={{ marginBottom: '0.75rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ color: '#f44336', fontWeight: 600 }}>● Fatigue (ATL)</span>
              </div>
              <div style={{ paddingLeft: '1rem', opacity: 0.85 }}>
                Short-term fatigue over roughly one week.
                <br />
                Higher values indicate more accumulated fatigue.
              </div>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ color: '#4CAF50', fontWeight: 600 }}>● Form (TSB)</span>
              </div>
              <div style={{ paddingLeft: '1rem', opacity: 0.85 }}>
                Fitness - Fatigue = readiness.
                <br />
                <strong>+10 to +25</strong> is often race-ready.
              </div>
            </div>
          </HelpTooltip>
        </div>

        {/* Current Status Badges */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div
            style={{
              background: 'rgba(0, 172, 193, 0.1)',
              border: '1px solid rgba(0, 172, 193, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ opacity: 0.7 }}>TSS: </span>
            <span style={{ fontWeight: 700, color: '#00ACC1' }}>{latestData.tss}</span>
          </div>
          <div
            style={{
              background: 'rgba(33, 150, 243, 0.1)',
              border: '1px solid rgba(33, 150, 243, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ opacity: 0.7 }}>Fitness: </span>
            <span style={{ fontWeight: 700, color: '#2196F3' }}>{latestData.ctl}</span>
          </div>
          <div
            style={{
              background: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ opacity: 0.7 }}>Fatigue: </span>
            <span style={{ fontWeight: 700, color: '#f44336' }}>{latestData.atl}</span>
          </div>
          <div
            style={{
              background: latestData.tsb >= 0 ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)',
              border: `1px solid ${latestData.tsb >= 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0.4rem 0.75rem',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ opacity: 0.7 }}>Form: </span>
            <span style={{ fontWeight: 700, color: latestData.tsb >= 0 ? '#4CAF50' : '#FF9800' }}>
              {latestData.tsb > 0 ? '+' : ''}
              {latestData.tsb}
            </span>
            {latestData.tsb >= 10 && latestData.tsb <= 25 && (
              <span style={{ marginLeft: '0.5rem' }}>🎯</span>
            )}
          </div>
        </div>

        {/* Chart with axis labels */}
        <div style={{ display: 'flex', alignItems: 'center', height: 220 }}>
          <div
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: '0.7rem',
              color: '#00ACC1',
              fontWeight: 600,
              marginRight: '0.25rem',
            }}
          >
            TSS
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="tss"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                width={40}
              />
              <YAxis
                yAxisId="fitness"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    ctl: 'Fitness (CTL)',
                    atl: 'Fatigue (ATL)',
                    tsb: 'Form (TSB)',
                    tss: 'Weekly TSS',
                  };
                  return [value, labels[name] || name];
                }}
              />
              {/* TSS bars in background */}
              <Bar
                yAxisId="tss"
                dataKey="tss"
                fill="#00ACC1"
                fillOpacity={0.2}
                name="tss"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="fitness"
                type="linear"
                dataKey="tsb"
                stroke="#4CAF50"
                strokeWidth={2}
                dot={false}
                name="tsb"
              />
              <Line
                yAxisId="fitness"
                type="linear"
                dataKey="ctl"
                stroke="#2196F3"
                strokeWidth={2}
                dot={false}
                name="ctl"
              />
              <Line
                yAxisId="fitness"
                type="linear"
                dataKey="atl"
                stroke="#f44336"
                strokeWidth={2}
                dot={false}
                name="atl"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div
            style={{
              writingMode: 'vertical-rl',
              fontSize: '0.7rem',
              color: 'var(--foreground)',
              marginLeft: '0.25rem',
            }}
          >
            Fitness/Fatigue/Form
          </div>
        </div>

        {/* Manual Legend - below chart */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.5rem',
            marginTop: '0.5rem',
            fontSize: '0.75rem',
          }}
        >
          <span>
            <span style={{ color: '#00ACC1', opacity: 0.5 }}>▌</span> TSS
          </span>
          <span>
            <span style={{ color: '#2196F3' }}>━</span> Fitness
          </span>
          <span>
            <span style={{ color: '#f44336' }}>━</span> Fatigue
          </span>
          <span>
            <span style={{ color: '#4CAF50' }}>━</span> Form
          </span>
        </div>
      </div>

      {/* Weekly Volume Chart */}
      <div style={{ marginTop: '2rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Weekly Volume</span>
          <HelpTooltip>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              📈 Weekly Volume
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: '#8BC34A', fontWeight: 600 }}>Green</span>: elevation gain (m),
              shown as bars.
            </div>
            <div>
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Orange</span>: distance
              (km), shown as a line.
            </div>
            <div style={{ marginTop: '0.75rem', opacity: 0.8, fontSize: '0.8rem' }}>
              Use this to scan how your volume is changing.
              <br />
              Reduce it gradually before a target race.
            </div>
          </HelpTooltip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', height: 180 }}>
          <div
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontSize: '0.7rem',
              color: '#8BC34A',
              fontWeight: 600,
              marginRight: '0.25rem',
            }}
          >
            Elevation (m)
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="elevation"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
                width={35}
              />
              <YAxis
                yAxisId="distance"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
                width={35}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
                formatter={(value: number, name: string) => {
                  if (name === 'distance') return [`${value} km`, 'Distance'];
                  if (name === 'elevation') return [`${value} m`, 'Elevation gain'];
                  return [value, name];
                }}
              />
              <Bar
                yAxisId="elevation"
                dataKey="elevation"
                fill="#8BC34A"
                fillOpacity={0.5}
                name="elevation"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="distance"
                type="linear"
                dataKey="distance"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                name="distance"
              />
            </ComposedChart>
          </ResponsiveContainer>
          <div
            style={{
              writingMode: 'vertical-rl',
              fontSize: '0.7rem',
              color: 'var(--primary)',
              fontWeight: 600,
              marginLeft: '0.25rem',
            }}
          >
            Distance (km)
          </div>
        </div>

        {/* Manual Legend */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.5rem',
            marginTop: '0.5rem',
            fontSize: '0.75rem',
          }}
        >
          <span>
            <span style={{ color: '#8BC34A', opacity: 0.5 }}>▌</span> Elevation gain (m)
          </span>
          <span>
            <span style={{ color: 'var(--primary)' }}>━</span> Distance (km)
          </span>
        </div>
      </div>
    </div>
  );
}
