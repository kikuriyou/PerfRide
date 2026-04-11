'use client';

import { useState } from 'react';

interface HelpTooltipProps {
  children: React.ReactNode;
}

export default function HelpTooltip({ children }: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={() => setIsVisible(!isVisible)}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--foreground)',
          fontSize: '0.75rem',
          fontWeight: 600,
          cursor: 'help',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
          transition: 'all 0.2s',
        }}
        aria-label="Help"
      >
        ?
      </button>

      {isVisible && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: '8px',
            padding: '1rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 100,
            minWidth: '280px',
            maxWidth: '350px',
            fontSize: '0.85rem',
            lineHeight: 1.6,
          }}
        >
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '-6px',
              left: '50%',
              width: '12px',
              height: '12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRight: 'none',
              borderBottom: 'none',
              transform: 'translateX(-50%) rotate(45deg)',
            }}
          />
          {children}
        </div>
      )}
    </div>
  );
}
