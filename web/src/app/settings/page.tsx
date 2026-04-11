import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SettingsForm from './_components/SettingsForm';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/');
  }

  return (
    <div
      className="container"
      style={{ paddingTop: '2rem', paddingBottom: '2rem', maxWidth: '600px' }}
    >
      <header
        style={{
          marginBottom: '2rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '1rem',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Settings</h1>
        <p style={{ opacity: 0.7 }}>Configure your rider profile for accurate calculations.</p>
      </header>

      <SettingsForm />
    </div>
  );
}
