export default function DashboardLoading() {
  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <div className="skeleton" style={{ width: '180px', height: '2rem' }} />
        <div
          className="skeleton"
          style={{ width: '280px', height: '0.9rem', marginTop: '0.5rem' }}
        />
      </header>

      {/* Recommendation skeleton */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ height: '80px' }}>
          <div className="skeleton" style={{ width: '60%', height: '1rem' }} />
          <div
            className="skeleton"
            style={{ width: '40%', height: '0.85rem', marginTop: '0.5rem' }}
          />
        </div>
      </section>

      {/* Weekly Summary skeleton */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div
          className="skeleton"
          style={{ width: '140px', height: '1.25rem', marginBottom: '0.75rem' }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '1rem' }}>
              <div
                className="skeleton"
                style={{ width: '60px', height: '1.75rem', margin: '0 auto' }}
              />
              <div
                className="skeleton"
                style={{ width: '50px', height: '0.8rem', margin: '0.5rem auto 0' }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Fitness chart skeleton */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div
          className="skeleton"
          style={{ width: '180px', height: '1.25rem', marginBottom: '0.75rem' }}
        />
        <div className="card" style={{ height: '200px' }} />
      </section>

      {/* Recent rides skeleton */}
      <section>
        <div
          className="skeleton"
          style={{ width: '160px', height: '1.25rem', marginBottom: '0.75rem' }}
        />
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ height: '80px' }}>
              <div className="skeleton" style={{ width: '70%', height: '1rem' }} />
              <div
                className="skeleton"
                style={{ width: '50%', height: '0.85rem', marginTop: '0.5rem' }}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
