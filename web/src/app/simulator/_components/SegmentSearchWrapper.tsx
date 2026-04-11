'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ExploreSegment } from '@/lib/strava';
import { useState } from 'react';

// Dynamically import SegmentMap to avoid SSR issues with Leaflet
const SegmentMap = dynamic(() => import('./SegmentMap'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <p>地図を読み込み中...</p>
    </div>
  ),
});

export default function SegmentSearchWrapper() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleSegmentSelect = (segment: ExploreSegment) => {
    setIsNavigating(true);
    router.push(`/simulator/${segment.id}`);
  };

  if (isNavigating) {
    return (
      <div
        style={{
          height: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: '2rem' }}>🏔️</div>
        <p>シミュレーターを準備中...</p>
      </div>
    );
  }

  return <SegmentMap onSegmentSelect={handleSegmentSelect} />;
}
