import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getSegmentDetails } from '@/lib/strava';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SimulatorForm from '../_components/SimulatorForm';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SegmentSimulatorPage({ params }: Props) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    redirect('/simulator');
  }

  let segment: any = null;
  try {
    segment = await getSegmentDetails(session.accessToken, parseInt(id, 10));
  } catch (e) {
    console.error(e);
  }

  if (!segment) {
    return (
      <div className="container" style={{ paddingTop: '2rem' }}>
        <p>Segment not found or failed to load.</p>
        <Link href="/simulator">← Back to simulator</Link>
      </div>
    );
  }

  const elevationGain = segment.elevation_high - segment.elevation_low;

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <Link
        href="/simulator"
        style={{ opacity: 0.7, fontSize: '0.9rem', display: 'inline-block', marginBottom: '1rem' }}
      >
        ← Back to simulator
      </Link>

      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {segment.name}
        </h1>
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            opacity: 0.8,
            fontSize: '0.9rem',
            flexWrap: 'wrap',
          }}
        >
          <span>{(segment.distance / 1000).toFixed(2)} km</span>
          <span>{segment.average_grade}% avg</span>
          <span>{elevationGain}m elev</span>
          <span>
            {segment.city}, {segment.country}
          </span>
        </div>
      </header>

      <div className="card">
        <SimulatorForm
          segmentName={segment.name}
          distance={segment.distance}
          elevationGain={elevationGain}
          averageGrade={segment.average_grade}
        />
      </div>
    </div>
  );
}
