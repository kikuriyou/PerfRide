'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LoginButton from './LoginButton';
import ThemeToggle from './ThemeToggle';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import ExperimentalBadge from './ExperimentalBadge';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  experimental?: boolean;
};

export default function Header() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Public pages (no auth required)
  const publicNavItems: NavItem[] = [
    { href: '/simulator', label: 'Simulator', icon: '🏔️', experimental: true },
    { href: '/optimizer', label: 'Optimizer', icon: '🎯', experimental: true },
    { href: '/planner', label: 'Planner', icon: '📅', experimental: true },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  // Protected pages (auth required)
  const protectedNavItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/weekly-plan', label: 'Weekly Plan', icon: '📅' },
  ];

  const navItems = session ? [...protectedNavItems, ...publicNavItems] : publicNavItems;

  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link
            href="/"
            style={{
              fontWeight: 800,
              fontSize: '1.1rem',
              background: 'linear-gradient(to right, var(--primary), #ffa07a)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PerfRide
          </Link>

          {/* Desktop Navigation - Always show */}
          <nav className="hide-mobile" style={{ display: 'flex', gap: '0.5rem' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 500,
                    fontSize: '0.9rem',
                    transition: 'background 0.2s',
                    background: isActive ? 'var(--surface-active)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{item.label}</span>
                  {item.experimental && <ExperimentalBadge compact />}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            className="hide-mobile"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <ThemeToggle />
            <LoginButton />
          </div>

          {/* Mobile Menu Button - Always show */}
          <button
            className="show-mobile"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'none', // Will be overridden by show-mobile class
              color: 'var(--foreground)',
            }}
            aria-label="Menu"
          >
            {isMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div
          className="show-mobile"
          style={{
            position: 'fixed',
            top: '60px',
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--background)',
            zIndex: 99,
            display: 'none', // Will be overridden by show-mobile
            flexDirection: 'column',
            padding: '1rem',
          }}
        >
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 500,
                    fontSize: '1.1rem',
                    background: isActive ? 'var(--surface)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.experimental && (
                    <ExperimentalBadge compact className="nav-experimental-badge" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div
            style={{
              marginTop: 'auto',
              padding: '1rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <ThemeToggle />
            <LoginButton />
          </div>
        </div>
      )}
    </header>
  );
}
