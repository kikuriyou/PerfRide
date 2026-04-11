'use client';

import dynamic from 'next/dynamic';
import { StravaActivity } from '@/lib/strava';

// Dynamic import to avoid SSR issues with Recharts
const FitnessChart = dynamic(() => import('./FitnessChart'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.5,
      }}
    >
      Loading chart...
    </div>
  ),
});

interface FitnessChartWrapperProps {
  activities: StravaActivity[];
}

export default function FitnessChartWrapper({ activities }: FitnessChartWrapperProps) {
  return <FitnessChart activities={activities} />;
}
