'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSettings } from '@/lib/settings';
import {
  optimizePacing,
  getPresetCourses,
  formatTime,
  CourseProfile,
  OptimizationResult,
} from '../_lib/paceOptimizer';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Segment data passed from parent
export interface SegmentOption {
  id: number;
  name: string;
  distance: number;
  elevation_gain: number;
  average_grade: number;
}

interface PaceOptimizerFormProps {
  segments?: SegmentOption[];
}

export default function PaceOptimizerForm({ segments = [] }: PaceOptimizerFormProps) {
  const { settings } = useSettings();
  const presetCourses = useMemo(() => getPresetCourses(), []);

  // Rider parameters
  const [riderWeight, setRiderWeight] = useState(settings.weight);
  const [bikeWeight, setBikeWeight] = useState(8);
  const [targetNP, setTargetNP] = useState(settings.ftp);

  // Course selection mode: 'preset' | 'segment'
  const [courseMode, setCourseMode] = useState<'preset' | 'segment'>('preset');
  const [selectedCourseIndex, setSelectedCourseIndex] = useState(1);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(
    segments[0]?.id ?? null,
  );
  const [course, setCourse] = useState<CourseProfile>(presetCourses[1]);
  const [isLoadingSegment, setIsLoadingSegment] = useState(false);

  // Results
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Sync with settings
  useEffect(() => {
    setRiderWeight(settings.weight);
    setTargetNP(settings.ftp);
  }, [settings]);

  // Update course when preset selection changes
  useEffect(() => {
    if (courseMode === 'preset') {
      setCourse(presetCourses[selectedCourseIndex]);
    }
  }, [selectedCourseIndex, courseMode, presetCourses]);

  // Load segment data when segment is selected
  useEffect(() => {
    if (courseMode === 'segment' && selectedSegmentId) {
      setIsLoadingSegment(true);
      fetch(`/api/segments/streams?id=${selectedSegmentId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.streams && data.streams.distance && data.streams.altitude) {
            const points = data.streams.distance.map((d: number, i: number) => ({
              distance: d,
              elevation: data.streams.altitude[i],
            }));
            setCourse({
              name: data.name,
              totalDistance: data.distance,
              points,
            });
          } else {
            // Fallback to simple linear profile
            const segment = segments.find((s) => s.id === selectedSegmentId);
            if (segment) {
              setCourse({
                name: segment.name,
                totalDistance: segment.distance,
                points: [
                  { distance: 0, elevation: 0 },
                  { distance: segment.distance, elevation: segment.elevation_gain },
                ],
              });
            }
          }
        })
        .catch(() => {
          // Fallback on error
          const segment = segments.find((s) => s.id === selectedSegmentId);
          if (segment) {
            setCourse({
              name: segment.name,
              totalDistance: segment.distance,
              points: [
                { distance: 0, elevation: 0 },
                { distance: segment.distance, elevation: segment.elevation_gain },
              ],
            });
          }
        })
        .finally(() => setIsLoadingSegment(false));
    }
  }, [courseMode, selectedSegmentId, segments]);

  // Run optimization
  const runOptimization = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const optimResult = optimizePacing(
        course,
        {
          riderWeight,
          bikeWeight,
          targetNP,
        },
        {
          numSegments: 100,
          maxIterations: 150,
        },
      );
      setResult(optimResult);
      setIsOptimizing(false);
    }, 50);
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!result) return [];
    return result.distancePoints.map((d, i) => ({
      distance: d / 1000,
      optimalPower: Math.round(result.powerProfile[i]),
      constantPower: targetNP,
      velocity: Math.round(result.velocityProfile[i] * 3.6 * 10) / 10,
    }));
  }, [result, targetNP]);

  // Elevation and gradient profile data - interpolate to smooth curve
  const elevationData = useMemo(() => {
    const numPoints = 100;
    const data: { distance: number; elevation: number; gradient: number }[] = [];

    // Helper function to interpolate elevation at a given distance
    const interpolateElevation = (distance: number): number => {
      const points = course.points;
      if (points.length === 0) return 0;
      if (distance <= points[0].distance) return points[0].elevation;
      if (distance >= points[points.length - 1].distance)
        return points[points.length - 1].elevation;

      for (let i = 0; i < points.length - 1; i++) {
        if (distance >= points[i].distance && distance <= points[i + 1].distance) {
          const t = (distance - points[i].distance) / (points[i + 1].distance - points[i].distance);
          return points[i].elevation + t * (points[i + 1].elevation - points[i].elevation);
        }
      }
      return 0;
    };

    // Generate interpolated points
    for (let i = 0; i <= numPoints; i++) {
      const distance = (i / numPoints) * course.totalDistance;
      const elevation = interpolateElevation(distance);

      let gradient = 0;
      if (i > 0) {
        const prevDist = ((i - 1) / numPoints) * course.totalDistance;
        const prevElev = interpolateElevation(prevDist);
        const distDelta = distance - prevDist;
        if (distDelta > 0) {
          gradient = ((elevation - prevElev) / distDelta) * 100;
        }
      }

      data.push({
        distance: distance / 1000,
        elevation: Math.round(elevation * 10) / 10,
        gradient: Math.round(gradient * 10) / 10,
      });
    }

    return data;
  }, [course]);

  const hasSegments = segments.length > 0;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Course Selection */}
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>🗺️ コース選択</h3>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCourseMode('preset')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: courseMode === 'preset' ? 'var(--primary)' : 'var(--surface)',
              color: courseMode === 'preset' ? 'white' : 'var(--foreground)',
              cursor: 'pointer',
            }}
          >
            プリセット
          </button>
          {hasSegments && (
            <button
              onClick={() => setCourseMode('segment')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: courseMode === 'segment' ? 'var(--primary)' : 'var(--surface)',
                color: courseMode === 'segment' ? 'white' : 'var(--foreground)',
                cursor: 'pointer',
              }}
            >
              ⭐ Stravaセグメント
            </button>
          )}
        </div>

        {courseMode === 'preset' && (
          <select
            value={selectedCourseIndex}
            onChange={(e) => setSelectedCourseIndex(Number(e.target.value))}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--background)',
              color: 'var(--foreground)',
              fontSize: '1rem',
            }}
          >
            {presetCourses.map((c, i) => (
              <option key={i} value={i}>
                {c.name} ({(c.totalDistance / 1000).toFixed(1)}km)
              </option>
            ))}
          </select>
        )}

        {courseMode === 'segment' && (
          <div>
            <select
              value={selectedSegmentId ?? ''}
              onChange={(e) => setSelectedSegmentId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            >
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({(s.distance / 1000).toFixed(1)}km, {s.average_grade.toFixed(1)}%)
                </option>
              ))}
            </select>
            {isLoadingSegment && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', opacity: 0.7 }}>
                ⏳ セグメントデータを読み込み中...
              </div>
            )}
          </div>
        )}

        {/* Current course info */}
        <div
          style={{
            marginTop: '1rem',
            padding: '0.75rem',
            background: 'var(--background)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.9rem',
          }}
        >
          <strong>選択中:</strong> {course.name} ({(course.totalDistance / 1000).toFixed(2)}km)
        </div>
      </div>

      {/* Parameters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        <div>
          <label
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}
          >
            体重: <strong>{riderWeight} kg</strong>
          </label>
          <input
            type="range"
            min="40"
            max="120"
            value={riderWeight}
            onChange={(e) => setRiderWeight(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}
          >
            自転車: <strong>{bikeWeight} kg</strong>
          </label>
          <input
            type="range"
            min="5"
            max="15"
            step="0.5"
            value={bikeWeight}
            onChange={(e) => setBikeWeight(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label
            style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', opacity: 0.8 }}
          >
            目標NP: <strong>{targetNP} W</strong>
          </label>
          <input
            type="range"
            min="100"
            max="400"
            step="5"
            value={targetNP}
            onChange={(e) => setTargetNP(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Optimize Button */}
      <button
        onClick={runOptimization}
        disabled={isOptimizing || isLoadingSegment}
        style={{
          padding: '1rem 2rem',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background:
            isOptimizing || isLoadingSegment
              ? 'var(--surface)'
              : 'linear-gradient(to right, var(--primary), #ffa07a)',
          color: 'white',
          fontSize: '1.1rem',
          fontWeight: 600,
          cursor: isOptimizing || isLoadingSegment ? 'wait' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {isOptimizing ? '⏳ 最適化中...' : '🎯 最適ペースを計算'}
      </button>

      {/* Results */}
      {result && (
        <>
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '1rem',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  background: 'linear-gradient(to right, var(--primary), #ffa07a)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {formatTime(result.estimatedTime)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>最適化タイム</div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700, opacity: 0.6 }}>
                {formatTime(result.constantPowerTime)}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>一定パワー</div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: result.improvement > 0 ? '#22c55e' : 'inherit',
                }}
              >
                −{result.improvement.toFixed(2)}%
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>改善率</div>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {Math.round(result.actualNP)} W
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>実際のNP</div>
            </div>
          </div>

          {/* Power & Velocity Combined Chart */}
          <div
            style={{
              background: 'var(--surface)',
              padding: '1.5rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>
              ⚡ パワー・速度プロファイル
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} syncId="paceOptimizer">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="distance"
                  stroke="var(--foreground)"
                  fontSize={12}
                  tickFormatter={(v) => `${v.toFixed(1)}km`}
                />
                <YAxis
                  yAxisId="power"
                  stroke="var(--primary)"
                  fontSize={12}
                  domain={[0, 'dataMax + 50']}
                  tickFormatter={(v) => `${v}W`}
                />
                <YAxis
                  yAxisId="velocity"
                  orientation="right"
                  stroke="#22c55e"
                  fontSize={12}
                  domain={[0, (dataMax: number) => dataMax * 2]}
                  tickFormatter={(v) => `${v}km/h`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === '速度') return [`${value} km/h`, name];
                    return [`${value}W`, name === '最適化パワー' ? '最適化' : '一定'];
                  }}
                  labelFormatter={(v) => `${v.toFixed(2)} km`}
                />
                <Legend />
                <Line
                  yAxisId="power"
                  type="monotone"
                  dataKey="optimalPower"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  name="最適化パワー"
                />
                <Line
                  yAxisId="power"
                  type="monotone"
                  dataKey="constantPower"
                  stroke="#888"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="一定パワー"
                />
                <Line
                  yAxisId="velocity"
                  type="monotone"
                  dataKey="velocity"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name="速度"
                />
                <ReferenceLine
                  yAxisId="power"
                  y={targetNP}
                  stroke="#ffa07a"
                  strokeDasharray="3 3"
                  label={{ value: 'Target NP', fill: '#ffa07a', fontSize: 10 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Elevation & Gradient Profile Chart */}
          <div
            style={{
              background: 'var(--surface)',
              padding: '1.5rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>
              ⛰️ 標高・勾配プロファイル
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={elevationData} syncId="paceOptimizer">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="distance"
                  stroke="var(--foreground)"
                  fontSize={12}
                  tickFormatter={(v) => `${v.toFixed(1)}km`}
                />
                <YAxis
                  yAxisId="elevation"
                  stroke="#8b5cf6"
                  fontSize={12}
                  tickFormatter={(v) => `${v}m`}
                />
                <YAxis
                  yAxisId="gradient"
                  orientation="right"
                  stroke="#22c55e"
                  fontSize={12}
                  tickFormatter={(v) => `${v}%`}
                  domain={[-15, 15]}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === '標高') return [`${Math.round(value)}m`, name];
                    return [`${value}%`, name];
                  }}
                  labelFormatter={(v) => `${v.toFixed(2)} km`}
                />
                <Legend />
                <Line
                  yAxisId="elevation"
                  type="monotone"
                  dataKey="elevation"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="標高"
                />
                <Line
                  yAxisId="gradient"
                  type="stepAfter"
                  dataKey="gradient"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  dot={false}
                  name="勾配"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Explanation */}
          <div
            style={{
              background: 'var(--background)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem',
              opacity: 0.8,
            }}
          >
            <strong>💡 最適化の解説:</strong> 登りや向かい風区間ではパワーを上げ、
            下りや追い風区間ではパワーを抑えることで、同じNPでもタイムを短縮できます。
            これは一定パワーで走るより効率的なエネルギー配分を実現します。
          </div>
        </>
      )}
    </div>
  );
}
