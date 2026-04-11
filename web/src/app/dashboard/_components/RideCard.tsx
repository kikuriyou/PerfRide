'use client';

import { useState } from 'react';
import { StravaActivity, formatDistance, formatDuration, formatElevation } from '@/lib/strava';
import ActivityCharts from './ActivityCharts';

interface RideCardProps {
  activity: StravaActivity;
}

export default function RideCard({ activity }: RideCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="card"
      style={{
        padding: '0.75rem 1rem',
        cursor: 'pointer',
        transition: 'background 0.2s',
      }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Collapsed View - Always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: '0.95rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activity.name}
            </span>
            {activity.type === 'VirtualRide' && (
              <span style={{ fontSize: '0.7rem', opacity: 0.6, flexShrink: 0 }}>🏠</span>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.4rem 0.6rem',
              fontSize: '0.8rem',
              opacity: 0.8,
              marginTop: '0.25rem',
            }}
          >
            <span>
              {(() => {
                // Parse start_date_local without timezone conversion to avoid hydration mismatch
                const d = activity.start_date_local;
                const month = parseInt(d.slice(5, 7), 10);
                const day = parseInt(d.slice(8, 10), 10);
                const dow = new Date(d.slice(0, 10) + 'T00:00:00').getDay();
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                return `${month}月${day}日(${days[dow]})`;
              })()}
            </span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>{formatDistance(activity.distance)}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span>{formatElevation(activity.total_elevation_gain)}</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span>{formatDuration(activity.moving_time)}</span>
            {activity.average_watts && (
              <>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ color: '#2196F3', fontWeight: 600 }}>
                  {Math.round(activity.average_watts)}W
                </span>
              </>
            )}
          </div>
        </div>
        <div
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            opacity: 0.5,
            fontSize: '0.8rem',
          }}
        >
          ▼
        </div>
      </div>

      {/* Expanded View */}
      {isExpanded && (
        <div
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          {/* Main Stats Grid */}
          <div
            className="ride-stats-grid"
            style={{
              padding: '0.75rem',
              background: 'var(--background)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {formatDistance(activity.distance)}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>距離</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {formatElevation(activity.total_elevation_gain)}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>獲得標高</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {formatDuration(activity.moving_time)}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>時間</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                {(activity.average_speed * 3.6).toFixed(1)} km/h
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>平均速度</div>
            </div>
          </div>

          {/* Power & HR Stats */}
          {(activity.average_watts || activity.average_heartrate) && (
            <div className="power-hr-badges" style={{ marginBottom: '0.75rem' }}>
              {activity.average_watts && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(33, 150, 243, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ opacity: 0.7 }}>⚡</span>
                  <span style={{ fontWeight: 600, color: '#2196F3' }}>
                    {Math.round(activity.average_watts)}W
                  </span>
                  {activity.weighted_average_watts && (
                    <>
                      <span style={{ opacity: 0.5 }}>|</span>
                      <span style={{ opacity: 0.7 }}>NP:</span>
                      <span style={{ fontWeight: 600, color: '#2196F3' }}>
                        {Math.round(activity.weighted_average_watts)}W
                      </span>
                    </>
                  )}
                  {activity.max_watts && (
                    <>
                      <span style={{ opacity: 0.5 }}>|</span>
                      <span style={{ opacity: 0.7 }}>Max:</span>
                      <span style={{ fontWeight: 600, color: '#2196F3' }}>
                        {Math.round(activity.max_watts)}W
                      </span>
                    </>
                  )}
                </div>
              )}
              {activity.average_heartrate && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(244, 67, 54, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ opacity: 0.7 }}>❤️</span>
                  <span style={{ fontWeight: 600, color: '#f44336' }}>
                    {Math.round(activity.average_heartrate)} bpm
                  </span>
                  {activity.max_heartrate && (
                    <>
                      <span style={{ opacity: 0.5 }}>|</span>
                      <span style={{ opacity: 0.7 }}>Max:</span>
                      <span style={{ fontWeight: 600, color: '#f44336' }}>
                        {Math.round(activity.max_heartrate)} bpm
                      </span>
                    </>
                  )}
                </div>
              )}
              {activity.kilojoules && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(255, 152, 0, 0.1)',
                    padding: '0.4rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ opacity: 0.7 }}>🔥</span>
                  <span style={{ fontWeight: 600, color: '#FF9800' }}>
                    {Math.round(activity.kilojoules)} kJ
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Activity Charts */}
          <ActivityCharts activityId={activity.id} />

          {/* Strava Link */}
          <a
            href={`https://www.strava.com/activities/${activity.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-block',
              fontSize: '0.8rem',
              color: 'var(--primary)',
              textDecoration: 'none',
              marginTop: '0.75rem',
            }}
          >
            Stravaで見る →
          </a>
        </div>
      )}
    </div>
  );
}
