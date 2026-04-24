'use client';

import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
} from 'recharts';
import { StravaActivity } from '@/lib/strava';
import HelpTooltip from '@/components/HelpTooltip';
import { useSettings } from '@/lib/settings';

interface FitnessChartProps {
  activities: StravaActivity[];
}

interface WeeklyData {
  week: string;
  weekStart: Date;
  distance: number;
  elevation: number;
  time: number;
  rides: number;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

function calculateSimplifiedTSS(activity: StravaActivity, userFTP: number): number {
  const hours = activity.moving_time / 3600;
  const ftp = userFTP || 200; // Fallback to 200 if not set

  if (activity.average_watts) {
    // Standard TSS formula: (duration_in_seconds × NP × IF) / (FTP × 3600) × 100
    // Simplified: hours × (average_watts / FTP)² × 100
    const intensityFactor = activity.average_watts / ftp;
    return hours * intensityFactor * intensityFactor * 100;
  }

  // Estimate TSS from elevation and duration when no power data
  const elevationFactor = 1 + activity.total_elevation_gain / (activity.distance / 1000) / 50;
  const baseTSS = hours * 50 * elevationFactor;
  return Math.min(baseTSS, 300);
}

// YYYY-MM-DD形式をローカルタイムゾーンでパース
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayOfWeek = d.getDay();
  // 月曜始まりに変更: 日曜(0)は6日前、それ以外は(dayOfWeek - 1)日前
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysToMonday);
  // ローカルタイムゾーンでYYYY-MM-DD形式を返す
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function processActivitiesForChart(activities: StravaActivity[], ftp: number): WeeklyData[] {
  const rides = activities
    .filter((a) => a.type === 'Ride' || a.type === 'VirtualRide')
    .sort(
      (a, b) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime(),
    );

  if (rides.length === 0) return [];

  const weeklyMap = new Map<
    string,
    {
      distance: number;
      elevation: number;
      time: number;
      rides: number;
      tss: number;
      weekStart: Date;
    }
  >();

  rides.forEach((activity) => {
    const date = new Date(activity.start_date_local);
    const weekKey = getWeekKey(date);

    const existing = weeklyMap.get(weekKey) || {
      distance: 0,
      elevation: 0,
      time: 0,
      rides: 0,
      tss: 0,
      weekStart: parseLocalDate(weekKey),
    };

    existing.distance += activity.distance / 1000;
    existing.elevation += activity.total_elevation_gain;
    existing.time += activity.moving_time / 3600;
    existing.rides += 1;
    existing.tss += calculateSimplifiedTSS(activity, ftp);

    weeklyMap.set(weekKey, existing);
  });

  // Generate all weeks for the last 12 weeks (3 months)
  const allWeeks: string[] = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    allWeeks.push(getWeekKey(d));
  }

  // Merge with actual data, filling missing weeks with zeros
  const weeks = allWeeks.map((weekKey) => {
    const data = weeklyMap.get(weekKey);
    if (data) {
      return [weekKey, data] as [string, typeof data];
    }
    return [
      weekKey,
      {
        distance: 0,
        elevation: 0,
        time: 0,
        rides: 0,
        tss: 0,
        weekStart: parseLocalDate(weekKey),
      },
    ] as [
      string,
      {
        distance: number;
        elevation: number;
        time: number;
        rides: number;
        tss: number;
        weekStart: Date;
      },
    ];
  });

  let ctl = 0;
  let atl = 0;
  const CTL_DECAY = 42;
  const ATL_DECAY = 7;

  const result: WeeklyData[] = weeks.map(([, data]) => {
    const dailyTSS = data.tss / 7;

    for (let i = 0; i < 7; i++) {
      ctl = ctl + (dailyTSS - ctl) / CTL_DECAY;
      atl = atl + (dailyTSS - atl) / ATL_DECAY;
    }

    const tsb = ctl - atl;

    return {
      week: new Date(data.weekStart).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
      }),
      weekStart: data.weekStart,
      distance: Math.round(data.distance),
      elevation: Math.round(data.elevation),
      time: Math.round(data.time * 10) / 10,
      rides: data.rides,
      tss: Math.round(data.tss),
      ctl: Math.round(ctl),
      atl: Math.round(atl),
      tsb: Math.round(tsb),
    };
  });

  return result;
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
              📊 このグラフの見方
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
                週間トレーニング負荷。
                <br />
                パワーや獲得標高から算出。
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
                過去6週間のトレーニング蓄積。
                <br />
                高いほど体力がついている状態。
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
                直近1週間の疲労度。
                <br />
                高いほど疲れが溜まっている。
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
                Fitness - Fatigue = コンディション。
                <br />
                <strong>+10〜+25</strong>がレースに最適な状態！
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
              📈 週間ボリューム
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <span style={{ color: '#8BC34A', fontWeight: 600 }}>グリーン</span>: 獲得標高（m）-
              棒グラフ
            </div>
            <div>
              <span style={{ color: 'var(--primary)', fontWeight: 600 }}>オレンジ</span>:
              走行距離（km）- 線グラフ
            </div>
            <div style={{ marginTop: '0.75rem', opacity: 0.8, fontSize: '0.8rem' }}>
              トレーニング量の推移を確認できます。
              <br />
              レース前は徐々に減らしていきましょう。
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
                  if (name === 'distance') return [`${value} km`, '距離'];
                  if (name === 'elevation') return [`${value} m`, '獲得標高'];
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
            <span style={{ color: '#8BC34A', opacity: 0.5 }}>▌</span> 獲得標高 (m)
          </span>
          <span>
            <span style={{ color: 'var(--primary)' }}>━</span> 距離 (km)
          </span>
        </div>
      </div>
    </div>
  );
}
