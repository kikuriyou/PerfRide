'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { ActivityStream } from '@/lib/strava';
import { useSettings } from '@/lib/settings';

interface ActivityChartsProps {
  activityId: number;
  stats?: {
    distance: number; // meters
    elevation: number; // meters
    time: number; // seconds
    avgSpeed: number; // m/s
  };
}

interface ChartDataPoint {
  time: number; // minutes
  speed?: number; // km/h
  altitude?: number; // meters
  heartrate?: number;
  zone?: number;
  power?: number; // watts
}

interface ZoneData {
  name: string;
  percentage: number;
  color: string;
  time: number; // seconds
}

// HR Zone definitions
const HR_ZONES = [
  { name: 'Z1 回復', minPct: 0, maxPct: 60, color: '#9E9E9E' },
  { name: 'Z2 持久力', minPct: 60, maxPct: 70, color: '#2196F3' },
  { name: 'Z3 テンポ', minPct: 70, maxPct: 80, color: '#4CAF50' },
  { name: 'Z4 閾値', minPct: 80, maxPct: 90, color: '#FF9800' },
  { name: 'Z5 VO2Max', minPct: 90, maxPct: 100, color: '#f44336' },
];

function getHRZone(hr: number, maxHR: number): number {
  const pct = (hr / maxHR) * 100;
  if (pct < 60) return 1;
  if (pct < 70) return 2;
  if (pct < 80) return 3;
  if (pct < 90) return 4;
  return 5;
}

// Downsample data for performance (keep every nth point)
function downsampleData<T>(data: T[], maxPoints: number = 200): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  return data.filter((_, i) => i % step === 0);
}

export default function ActivityCharts({ activityId }: ActivityChartsProps) {
  const [streams, setStreams] = useState<ActivityStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/activities/${activityId}/streams`);
        if (!res.ok) throw new Error('Failed to fetch streams');
        const data = await res.json();
        setStreams(data);
      } catch {
        setError('データを読み込めませんでした');
      } finally {
        setLoading(false);
      }
    };
    fetchStreams();
  }, [activityId]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.7 }}>
        📊 チャートを読み込み中...
      </div>
    );
  }

  if (error || !streams || streams.time.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1rem', opacity: 0.5, fontSize: '0.85rem' }}>
        チャートデータがありません
      </div>
    );
  }

  // Calculate minimum altitude for relative display (min = 0)
  const minAltitude =
    streams.altitude && streams.altitude.length > 0 ? Math.min(...streams.altitude) : 0;

  // Prepare chart data
  const rawChartData: ChartDataPoint[] = streams.time.map((t, i) => ({
    time: t / 60, // Convert to minutes
    speed: streams.velocity_smooth?.[i] ? streams.velocity_smooth[i] * 3.6 : undefined,
    altitude: streams.altitude?.[i] != null ? streams.altitude[i] - minAltitude : undefined,
    heartrate: streams.heartrate?.[i],
    zone: streams.heartrate?.[i] ? getHRZone(streams.heartrate[i], settings.maxHR) : undefined,
    power: streams.watts?.[i],
  }));

  const chartData = downsampleData(rawChartData);
  const hasSpeed = streams.velocity_smooth && streams.velocity_smooth.length > 0;
  const hasAltitude = streams.altitude && streams.altitude.length > 0;
  const hasHeartrate = streams.heartrate && streams.heartrate.length > 0;
  const hasPower = streams.watts && streams.watts.length > 0;

  // Calculate zone distribution
  let zoneDistribution: ZoneData[] = [];
  if (hasHeartrate) {
    const zoneCounts = [0, 0, 0, 0, 0];
    const timeStep = streams.time.length > 1 ? streams.time[1] - streams.time[0] : 1;

    streams.heartrate!.forEach((hr) => {
      const zone = getHRZone(hr, settings.maxHR);
      zoneCounts[zone - 1] += timeStep;
    });

    const totalTime = zoneCounts.reduce((a, b) => a + b, 0);
    zoneDistribution = HR_ZONES.map((zone, i) => ({
      name: zone.name,
      percentage: totalTime > 0 ? Math.round((zoneCounts[i] / totalTime) * 100) : 0,
      color: zone.color,
      time: zoneCounts[i],
    }));
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {/* Charts + Zone Distribution - responsive layout */}
      <div
        className="activity-charts-grid"
        style={{
          display: 'grid',
          gap: '1rem',
        }}
      >
        {/* Stacked Charts - Speed and HR with aligned X-axis */}
        <div>
          {/* Speed Chart with Elevation Background */}
          {hasSpeed && (
            <div style={{ marginBottom: hasPower || hasHeartrate ? '0.5rem' : 0 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                  opacity: 0.8,
                }}
              >
                📈 速度 (km/h){' '}
                {hasAltitude && <span style={{ opacity: 0.6, fontWeight: 400 }}>/ 標高</span>}
              </div>
              <div
                style={{
                  height: 100,
                  background: 'var(--background)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem',
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B4513" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#8B4513" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickFormatter={(v) => `${Math.round(v)}m`}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      hide={hasPower || hasHeartrate} // Hide if more charts follow
                    />
                    <YAxis
                      yAxisId="speed"
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickFormatter={(v) => `${v}`}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      width={35}
                    />
                    {hasAltitude && (
                      <YAxis
                        yAxisId="altitude"
                        orientation="right"
                        tick={{ fontSize: 8, fill: '#8B4513' }}
                        tickFormatter={(v) => `${v}m`}
                        tickLine={false}
                        axisLine={false}
                        width={35}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'altitude') return [`${Math.round(value)}m`, '標高'];
                        return [`${value.toFixed(1)} km/h`, '速度'];
                      }}
                      labelFormatter={(v) => `${Math.round(v as number)} 分`}
                    />
                    {/* Elevation area (background) */}
                    {hasAltitude && (
                      <Area
                        yAxisId="altitude"
                        type="linear"
                        dataKey="altitude"
                        stroke="#8B4513"
                        strokeWidth={0}
                        fill="url(#elevationGradient)"
                      />
                    )}
                    {/* Speed line (foreground) */}
                    <Line
                      yAxisId="speed"
                      type="linear"
                      dataKey="speed"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Power Chart */}
          {hasPower && (
            <div style={{ marginBottom: hasHeartrate ? '0.5rem' : 0 }}>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                  opacity: 0.8,
                }}
              >
                ⚡ パワー (W){' '}
                {hasAltitude && <span style={{ opacity: 0.6, fontWeight: 400 }}>/ 標高</span>}
              </div>
              <div
                style={{
                  height: 120,
                  background: 'var(--background)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem',
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="elevationGradientPower" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8B4513" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8B4513" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickFormatter={(v) => `${Math.round(v)}m`}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      hide={hasHeartrate} // Hide if HR chart follows
                    />
                    <YAxis
                      yAxisId="power"
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickFormatter={(v) => `${v}`}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      width={35}
                    />
                    {hasAltitude && (
                      <YAxis
                        yAxisId="altitudePower"
                        orientation="right"
                        tick={{ fontSize: 8, fill: '#8B4513' }}
                        tickFormatter={(v) => `${v}m`}
                        tickLine={false}
                        axisLine={false}
                        width={35}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'altitude') return [`${Math.round(value)}m`, '標高'];
                        return [`${Math.round(value)}W`, 'パワー'];
                      }}
                      labelFormatter={(v) => `${Math.round(v as number)} 分`}
                    />
                    {/* FTP reference line */}
                    {settings.ftp > 0 && (
                      <ReferenceLine
                        yAxisId="power"
                        y={settings.ftp}
                        stroke="#2196F3"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        label={{
                          value: `FTP ${settings.ftp}W`,
                          position: 'right',
                          fontSize: 9,
                          fill: '#2196F3',
                          opacity: 0.8,
                        }}
                      />
                    )}
                    {/* Elevation area (background) */}
                    {hasAltitude && (
                      <Area
                        yAxisId="altitudePower"
                        type="linear"
                        dataKey="altitude"
                        stroke="#8B4513"
                        strokeWidth={0}
                        fill="url(#elevationGradientPower)"
                      />
                    )}
                    {/* Power line (foreground) */}
                    <Line
                      yAxisId="power"
                      type="linear"
                      dataKey="power"
                      stroke="#2196F3"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Heart Rate Chart */}
          {hasHeartrate && (
            <div>
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '0.25rem',
                  opacity: 0.8,
                }}
              >
                ❤️ 心拍数 (bpm)
              </div>
              <div
                style={{
                  height: 130,
                  background: 'var(--background)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.5rem',
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    {/* Zone reference areas */}
                    <ReferenceArea
                      y1={settings.maxHR * 0.9}
                      y2={settings.maxHR}
                      fill="#f44336"
                      fillOpacity={0.2}
                    />
                    <ReferenceArea
                      y1={settings.maxHR * 0.8}
                      y2={settings.maxHR * 0.9}
                      fill="#FF9800"
                      fillOpacity={0.2}
                    />
                    <ReferenceArea
                      y1={settings.maxHR * 0.7}
                      y2={settings.maxHR * 0.8}
                      fill="#4CAF50"
                      fillOpacity={0.2}
                    />
                    <ReferenceArea
                      y1={settings.maxHR * 0.6}
                      y2={settings.maxHR * 0.7}
                      fill="#2196F3"
                      fillOpacity={0.2}
                    />
                    <ReferenceArea
                      y1={0}
                      y2={settings.maxHR * 0.6}
                      fill="#616161"
                      fillOpacity={0.05}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickFormatter={(v) => `${Math.round(v)}m`}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                    />
                    <YAxis
                      domain={[
                        Math.floor(settings.maxHR * 0.5), // Start from 50% of maxHR to show Z1
                        settings.maxHR,
                      ]}
                      tick={{ fontSize: 9, fill: 'var(--foreground)' }}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                      }}
                      formatter={(
                        value: number,
                        name: string,
                        props: { payload?: ChartDataPoint },
                      ) => {
                        const zone = props.payload?.zone ?? 1;
                        const zoneInfo = HR_ZONES[zone - 1];
                        return [
                          <span key="hr" style={{ color: zoneInfo?.color }}>
                            {Math.round(value)} bpm ({zoneInfo?.name || ''})
                          </span>,
                          '心拍',
                        ];
                      }}
                      labelFormatter={(v) => `${Math.round(v as number)} 分`}
                    />
                    <Line
                      type="linear"
                      dataKey="heartrate"
                      stroke="#f44336"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Zone Distribution (right sidebar) */}
        {hasHeartrate && (
          <div>
            <div
              style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem', opacity: 0.8 }}
            >
              ❤️ ゾーン分布
            </div>
            <div
              style={{
                background: 'var(--background)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                height:
                  hasSpeed && hasPower
                    ? 'calc(320px + 1rem)'
                    : hasSpeed || hasPower
                      ? 'calc(200px + 0.5rem)'
                      : '100px',
              }}
            >
              {zoneDistribution.map((zone, i) => (
                <div key={i} style={{ marginBottom: i < 4 ? '0.5rem' : 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.7rem',
                      marginBottom: '0.15rem',
                    }}
                  >
                    <span style={{ color: zone.color, fontWeight: 500 }}>{zone.name}</span>
                    <span style={{ opacity: 0.7 }}>{zone.percentage}%</span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: 'var(--border)',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${zone.percentage}%`,
                        height: '100%',
                        background: zone.color,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!hasSpeed && !hasHeartrate && (
        <div style={{ textAlign: 'center', padding: '1rem', opacity: 0.5, fontSize: '0.85rem' }}>
          詳細データがありません
        </div>
      )}
    </div>
  );
}
