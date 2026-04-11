'use client';

import { useState, useEffect } from 'react';
import { calculateClimbingTime, formatTime, TIRE_TYPES, TireType } from '../_lib/physics';
import { useSettings } from '@/lib/settings';

interface SimulatorFormProps {
  segmentName: string;
  distance: number;
  elevationGain: number;
  averageGrade: number;
}

export default function SimulatorForm({
  segmentName,
  distance,
  elevationGain,
  averageGrade,
}: SimulatorFormProps) {
  const { settings } = useSettings();
  const [riderWeight, setRiderWeight] = useState(settings.weight);
  const [bikeWeight, setBikeWeight] = useState(8);
  const [power, setPower] = useState(settings.ftp);
  const [tireType, setTireType] = useState<TireType>('road');
  const [result, setResult] = useState<ReturnType<typeof calculateClimbingTime> | null>(null);

  // Editable segment data for Quick Simulate
  const [editDistance, setEditDistance] = useState(distance);
  const [editElevation, setEditElevation] = useState(elevationGain);
  const [editGrade, setEditGrade] = useState(averageGrade);

  // Sync with settings
  useEffect(() => {
    setRiderWeight(settings.weight);
    setPower(settings.ftp);
  }, [settings]);

  useEffect(() => {
    const res = calculateClimbingTime({
      riderWeight,
      bikeWeight,
      power,
      distance: editDistance,
      elevationGain: editElevation,
      averageGrade: editGrade,
      tireType,
    });
    setResult(res);
  }, [riderWeight, bikeWeight, power, editDistance, editElevation, editGrade, tireType]);

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      {/* Segment Info (editable for Quick Simulate) */}
      {segmentName === 'Custom Segment' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.7,
              }}
            >
              Distance (m)
            </label>
            <input
              type="number"
              value={editDistance}
              onChange={(e) => setEditDistance(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.7,
              }}
            >
              Elevation (m)
            </label>
            <input
              type="number"
              value={editElevation}
              onChange={(e) => setEditElevation(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.7,
              }}
            >
              Grade (%)
            </label>
            <input
              type="number"
              step="0.1"
              value={editGrade}
              onChange={(e) => setEditGrade(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Input Panel */}
        <div>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Parameters</h3>

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.8,
              }}
            >
              Rider Weight: <strong>{riderWeight} kg</strong>
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

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.8,
              }}
            >
              Bike Weight: <strong>{bikeWeight} kg</strong>
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

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.8,
              }}
            >
              Tire Type
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(Object.keys(TIRE_TYPES) as TireType[]).map((type) => {
                const tire = TIRE_TYPES[type];
                const isSelected = tireType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setTireType(type)}
                    style={{
                      flex: 1,
                      padding: '0.75rem 0.5rem',
                      borderRadius: 'var(--radius-md)',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--primary-subtle)' : 'var(--background)',
                      color: 'var(--foreground)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ fontSize: '1rem' }}>{tire.label}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem' }}>
                      {tire.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.8,
              }}
            >
              Average Power: <strong>{power} W</strong>
            </label>
            <input
              type="range"
              min="100"
              max="400"
              step="5"
              value={power}
              onChange={(e) => setPower(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          <div
            style={{
              padding: '0.75rem',
              background: 'var(--background)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.9rem',
            }}
          >
            <strong>W/kg: {result?.wattsPerKg.toFixed(2)}</strong>
          </div>
        </div>

        {/* Result Panel */}
        <div
          style={{
            background: 'var(--surface)',
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>Estimated Time</h3>

          {result && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    background: 'linear-gradient(to right, var(--primary), #ffa07a)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '0.25rem',
                  }}
                >
                  {formatTime(result.estimatedTimeSeconds)}
                </div>
                <div style={{ opacity: 0.7, fontSize: '0.9rem' }}>
                  at {result.averageSpeedKmh} km/h avg
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div
                  style={{
                    background: 'var(--background)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{result.vam}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>VAM (m/h)</div>
                </div>
                <div
                  style={{
                    background: 'var(--background)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{editElevation}m</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Elevation</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
