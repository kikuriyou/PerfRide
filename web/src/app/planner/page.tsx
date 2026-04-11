import PlannerForm from './_components/PlannerForm';

export default function PlannerPage() {
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1>Training Planner</h1>
        <p style={{ opacity: 0.7, marginTop: '0.25rem', fontSize: '0.9rem' }}>
          Set your race date and generate a periodized training plan
        </p>
      </header>

      <PlannerForm />
    </div>
  );
}
