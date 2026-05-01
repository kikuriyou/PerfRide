'use client';

import { useState, useEffect } from 'react';
import {
  generateTrainingPlan,
  formatDate,
  getIntensityColor,
  type TrainingPlan,
  type WeekSchedule,
  type Workout,
} from '../_lib/planner';
import WorkoutChart from '@/components/WorkoutChart';

const STORAGE_KEY = 'plannerState';

interface SavedPlannerState {
  targetDate: string;
  selectedWeekNumber: number | null;
  selectedWorkoutName: string | null;
}

function loadPlannerState(): {
  targetDate: string;
  plan: TrainingPlan | null;
  selectedWeek: WeekSchedule | null;
  selectedWorkout: Workout | null;
} {
  if (typeof window === 'undefined')
    return { targetDate: '', plan: null, selectedWeek: null, selectedWorkout: null };
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { targetDate: '', plan: null, selectedWeek: null, selectedWorkout: null };
  try {
    const state: SavedPlannerState = JSON.parse(saved);
    if (!state.targetDate)
      return { targetDate: '', plan: null, selectedWeek: null, selectedWorkout: null };
    const date = new Date(state.targetDate);
    if (date <= new Date())
      return {
        targetDate: state.targetDate,
        plan: null,
        selectedWeek: null,
        selectedWorkout: null,
      };
    const generated = generateTrainingPlan(date);
    let week: WeekSchedule | null = null;
    let workout: Workout | null = null;
    if (state.selectedWeekNumber) {
      week =
        generated.weeklySchedule.find((w) => w.weekNumber === state.selectedWeekNumber) ?? null;
      if (week && state.selectedWorkoutName) {
        workout =
          week.phase.weeklyWorkouts.find((w) => w.name === state.selectedWorkoutName) ?? null;
      }
    }
    return {
      targetDate: state.targetDate,
      plan: generated,
      selectedWeek: week,
      selectedWorkout: workout,
    };
  } catch {
    return { targetDate: '', plan: null, selectedWeek: null, selectedWorkout: null };
  }
}

export default function PlannerForm() {
  const [initial] = useState(loadPlannerState);
  const [targetDate, setTargetDate] = useState(initial.targetDate);
  const [plan, setPlan] = useState<TrainingPlan | null>(initial.plan);
  const [selectedWeek, setSelectedWeek] = useState<WeekSchedule | null>(initial.selectedWeek);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(initial.selectedWorkout);

  useEffect(() => {
    if (!targetDate) return;
    const state: SavedPlannerState = {
      targetDate,
      selectedWeekNumber: selectedWeek?.weekNumber ?? null,
      selectedWorkoutName: selectedWorkout?.name ?? null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [targetDate, selectedWeek, selectedWorkout]);

  const handleGenerate = () => {
    if (!targetDate) return;
    const date = new Date(targetDate);
    const generated = generateTrainingPlan(date);
    setPlan(generated);
    setSelectedWeek(null);
    setSelectedWorkout(null);
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setTargetDate('');
    setPlan(null);
    setSelectedWeek(null);
    setSelectedWorkout(null);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem' }}>
          Set Your Target Race
        </h3>
        <div
          style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.85rem',
                opacity: 0.8,
              }}
            >
              Race Date (X-Day)
            </label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--foreground)',
                fontSize: '1rem',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleGenerate} className="btn btn-primary" disabled={!targetDate}>
              Generate
            </button>
            {plan && (
              <button
                onClick={handleReset}
                className="btn"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {plan && plan.weeklySchedule.length > 0 && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{plan.totalWeeks}-Week Plan</h3>
            <div style={{ opacity: 0.7, fontSize: '0.85rem' }}>
              Target: {formatDate(plan.targetDate)}
            </div>
          </div>

          {/* Phase Overview */}
          <div
            style={{
              display: 'flex',
              gap: '3px',
              marginBottom: '1.5rem',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            {plan.phases.map((phase, idx) => (
              <div
                key={idx}
                style={{
                  flex: phase.weekCount,
                  background: phase.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
                title={`${phase.name}: ${phase.weekCount} weeks`}
              >
                {phase.weekCount >= 2 && phase.name.substring(0, 4)}
              </div>
            ))}
          </div>

          {/* Weekly Calendar */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>📅 Tap a week</h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                gap: '0.4rem',
              }}
            >
              {plan.weeklySchedule.map((week) => (
                <div
                  key={week.weekNumber}
                  onClick={() => {
                    setSelectedWeek(week);
                    setSelectedWorkout(null);
                  }}
                  style={{
                    background:
                      selectedWeek?.weekNumber === week.weekNumber
                        ? week.phase.color
                        : 'var(--surface)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem',
                    borderLeft: `3px solid ${week.phase.color}`,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    color: selectedWeek?.weekNumber === week.weekNumber ? 'white' : 'inherit',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>W{week.weekNumber}</div>
                  <div style={{ opacity: 0.7, fontSize: '0.7rem' }}>
                    {formatDate(week.startDate)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Week */}
          {selectedWeek && (
            <div
              className="card"
              style={{
                borderColor: selectedWeek.phase.color,
                borderWidth: '2px',
                marginBottom: '1.5rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '1rem' }}>
                  Week {selectedWeek.weekNumber}: {selectedWeek.phase.name}
                </h4>
                <span
                  style={{
                    background: selectedWeek.phase.color,
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                  }}
                >
                  {formatDate(selectedWeek.startDate)} - {formatDate(selectedWeek.endDate)}
                </span>
              </div>

              <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.75rem' }}>
                👆 Tap workout for chart
              </p>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {selectedWeek.phase.weeklyWorkouts.map((workout, idx) => (
                  <WorkoutRow
                    key={idx}
                    workout={workout}
                    selected={selectedWorkout?.name === workout.name}
                    onClick={() => {
                      if (workout.durationMin > 0) setSelectedWorkout(workout);
                    }}
                  />
                ))}
              </div>

              {selectedWorkout && selectedWorkout.intervals.length > 0 && (
                <div className="chart-container" style={{ marginTop: '1rem' }}>
                  <WorkoutChart
                    intervals={selectedWorkout.intervals}
                    totalDurationMin={selectedWorkout.durationMin}
                    title={`${selectedWorkout.day}: ${selectedWorkout.name}`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Phase Details */}
          <details style={{ marginTop: '1rem' }}>
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 600,
                marginBottom: '0.75rem',
                fontSize: '0.9rem',
              }}
            >
              Phase Details
            </summary>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {plan.phases.map((phase, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: '0.75rem 1rem',
                    borderLeftWidth: '4px',
                    borderLeftColor: phase.color,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: phase.color }}>{phase.name}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{phase.weekCount} weeks</div>
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {phase.description}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

interface WorkoutRowProps {
  workout: Workout;
  selected: boolean;
  onClick: () => void;
}

function WorkoutRow({ workout, selected, onClick }: WorkoutRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem',
        background: selected ? 'var(--primary)' : 'var(--background)',
        color: selected ? 'white' : 'inherit',
        borderRadius: 'var(--radius-md)',
        cursor: workout.durationMin > 0 ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
    >
      <span style={{ fontSize: '1.25rem' }}>{workout.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
          <span style={{ opacity: 0.6, marginRight: '0.5rem' }}>{workout.day}</span>
          {workout.name}
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            opacity: 0.7,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {workout.description}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            color: selected ? 'white' : getIntensityColor(workout.intensity),
          }}
        >
          {workout.duration}
        </div>
      </div>
    </div>
  );
}
