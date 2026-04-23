export default function SimulatorLoading() {
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: '200px', height: '2rem' }} />
        <div
          className="skeleton"
          style={{ width: '320px', height: '0.9rem', marginTop: '0.5rem' }}
        />
      </header>

      {/* Quick Simulate skeleton */}
      <section style={{ marginBottom: '2rem' }}>
        <div
          className="skeleton"
          style={{ width: '160px', height: '1.25rem', marginBottom: '1rem' }}
        />
        <div className="card" style={{ height: '200px' }} />
      </section>

      {/* Starred Segments skeleton */}
      <section>
        <div
          className="skeleton"
          style={{ width: '200px', height: '1.25rem', marginBottom: '1rem' }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ height: '120px' }}>
              <div className="skeleton" style={{ width: '80%', height: '1rem' }} />
              <div
                className="skeleton"
                style={{ width: '50%', height: '0.85rem', marginTop: '0.5rem' }}
              />
              <div
                className="skeleton"
                style={{ width: '60%', height: '0.85rem', marginTop: '0.5rem' }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
