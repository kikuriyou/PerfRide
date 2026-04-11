'use client';

import Link from 'next/link';

interface SegmentCardProps {
  id: number;
  name: string;
  distance: number;
  averageGrade: number;
  elevationGain: number;
}

export default function SegmentCard({
  id,
  name,
  distance,
  averageGrade,
  elevationGain,
}: SegmentCardProps) {
  return (
    <Link href={`/simulator/${id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'var(--surface)',
          padding: '1.5rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>{name}</h3>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem', opacity: 0.8 }}>
          <span>{(distance / 1000).toFixed(1)} km</span>
          <span>{averageGrade}% avg</span>
          <span>{elevationGain}m up</span>
        </div>
      </div>
    </Link>
  );
}
