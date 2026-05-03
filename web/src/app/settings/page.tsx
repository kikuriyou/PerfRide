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
    <div className="container settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Configure your rider profile for accurate calculations.</p>
      </header>

      <SettingsForm />
    </div>
  );
}
