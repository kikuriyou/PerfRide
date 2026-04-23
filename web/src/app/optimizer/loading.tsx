export default function OptimizerLoading() {
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: '200px', height: '2rem' }} />
        <div
          className="skeleton"
          style={{ width: '340px', height: '0.9rem', marginTop: '0.5rem' }}
        />
      </header>

      {/* Optimizer form skeleton */}
      <section>
        <div className="card" style={{ height: '300px' }}>
          <div className="skeleton" style={{ width: '40%', height: '1rem' }} />
          <div
            className="skeleton"
            style={{ width: '100%', height: '2.5rem', marginTop: '1rem' }}
          />
          <div
            className="skeleton"
            style={{ width: '100%', height: '2.5rem', marginTop: '0.75rem' }}
          />
          <div
            className="skeleton"
            style={{ width: '100%', height: '2.5rem', marginTop: '0.75rem' }}
          />
          <div
            className="skeleton"
            style={{ width: '120px', height: '2.5rem', marginTop: '1rem' }}
          />
        </div>
      </section>
    </div>
  );
}
