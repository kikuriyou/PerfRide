import PlannerForm from './_components/PlannerForm';
import ExperimentalBadge, { ExperimentalNotice } from '@/components/ExperimentalBadge';

export default function PlannerPage() {
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span>Training Planner</span>
          <ExperimentalBadge />
        </h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Set your race date and generate a periodized training plan. The coach-mode weekly plan
          lives at <a href="/weekly-plan">/weekly-plan</a>.
        </p>
        <ExperimentalNotice>
          This tool is experimental. Generated plans are drafts and should be reviewed before using
          them for training decisions.
        </ExperimentalNotice>
      </header>

      <PlannerForm />
    </div>
  );
}
