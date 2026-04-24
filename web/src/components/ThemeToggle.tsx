'use client';

import { useState, useEffect } from 'react';

type Theme = 'system' | 'light' | 'dark';

function applyTheme(t: Theme) {
  if (t === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
}

function loadTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('perfride-theme') as Theme | null) ?? 'system';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const cycleTheme = () => {
    const order: Theme[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    applyTheme(next);
    localStorage.setItem('perfride-theme', next);
  };

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🖥️';

  return (
    <button
      onClick={cycleTheme}
      title={`Theme: ${theme}`}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontSize: '1.1rem',
        padding: '0.4rem',
        borderRadius: 'var(--radius-md)',
        transition: 'background 0.2s',
        lineHeight: 1,
      }}
      aria-label={`Theme: ${theme}`}
    >
      {icon}
    </button>
  );
}
