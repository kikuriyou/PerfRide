'use client';

import { useState, useEffect } from 'react';
import { useSettings } from '@/lib/settings';
import { logCoachEvent } from '@/lib/coach-events';

interface InsightItem {
  type: string;
  title: string;
  summary: string;
  why_now: string;
  based_on: string;
  priority: string;
}

const DEDUP_KEY = 'perfride_insight_dedup';
const DEDUP_DAYS = 3;
const MAX_CARDS = 2;

const PRIORITY_ICON: Record<string, string> = {
  high: '⚠️',
  medium: 'ℹ️',
  low: '💡',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: '#e74c3c',
  medium: '#3498db',
  low: '#95a5a6',
};

function loadDedupMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(DEDUP_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveDedupMap(map: Record<string, number>) {
  localStorage.setItem(DEDUP_KEY, JSON.stringify(map));
}

function filterDedup(items: InsightItem[]): InsightItem[] {
  const now = Date.now();
  const map = loadDedupMap();
  const cutoff = now - DEDUP_DAYS * 24 * 60 * 60 * 1000;

  const cleaned: Record<string, number> = {};
  for (const [key, ts] of Object.entries(map)) {
    if (ts > cutoff) cleaned[key] = ts;
  }

  const result: InsightItem[] = [];
  for (const item of items) {
    if (cleaned[item.type] && cleaned[item.type] > cutoff) continue;
    result.push(item);
    cleaned[item.type] = now;
  }

  saveDedupMap(cleaned);
  return result;
}

export default function InsightCards() {
  const { settings } = useSettings();
  const [items, setItems] = useState<InsightItem[]>([]);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (settings.coachAutonomy === 'observe' && !settings.usePersonalData) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchInsights() {
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal: settings.goal,
            ftp: settings.ftp,
            goalCustom: settings.goalCustom,
            usePersonalData: settings.usePersonalData,
            mode: 'insight',
            asOf: settings.asOf ?? null,
          }),
        });

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = await res.json();
        if (cancelled) return;

        const fetched: InsightItem[] = data.items || [];
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        fetched.sort((a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));

        const finalItems = settings.asOf ? fetched : filterDedup(fetched);
        setItems(finalItems.slice(0, MAX_CARDS));
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchInsights();
    return () => { cancelled = true; };
  }, [settings.goal, settings.ftp, settings.goalCustom, settings.usePersonalData, settings.coachAutonomy, settings.asOf]);

  if (loading || items.length === 0) return null;

  const toggleExpand = (type: string) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
        logCoachEvent('insight_expand', type);
      }
      return next;
    });
  };

  return (
    <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
      {items.map((item) => {
        const expanded = expandedTypes.has(item.type);
        const icon = PRIORITY_ICON[item.priority] || 'ℹ️';
        const borderColor = PRIORITY_COLOR[item.priority] || '#95a5a6';

        return (
          <div
            key={item.type}
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: `1px solid ${borderColor}33`,
              borderLeft: `4px solid ${borderColor}`,
              padding: '1rem 1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: expanded ? '0.75rem' : 0,
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{icon}</span>
              <span style={{ fontWeight: 600, flex: 1 }}>{item.title}</span>
              <button
                onClick={() => toggleExpand(item.type)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                {expanded ? '閉じる' : '詳しく見る'}
              </button>
            </div>

            {expanded && (
              <div style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 0.5rem' }}>{item.summary}</p>
                {item.why_now && (
                  <p style={{ margin: '0 0 0.25rem', opacity: 0.7, fontSize: '0.85rem' }}>
                    {item.why_now}
                  </p>
                )}
                {item.based_on && (
                  <p style={{ margin: 0, opacity: 0.5, fontSize: '0.8rem' }}>
                    {item.based_on}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
