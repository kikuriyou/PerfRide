type CoachEventType =
  | 'recommend_expand'
  | 'recommend_detail'
  | 'chip_click'
  | 'chip_revert'
  | 'insight_expand'
  | 'recommend_refresh';

interface CoachEvent {
  type: CoachEventType;
  label?: string;
  timestamp: string;
}

const STORAGE_KEY = 'perfride_coach_events';
const MAX_EVENTS = 200;

export function logCoachEvent(type: CoachEventType, label?: string) {
  const event: CoachEvent = {
    type,
    label,
    timestamp: new Date().toISOString(),
  };

  console.log('[CoachEvent]', event.type, label ?? '');

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: CoachEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // storage full or unavailable
  }
}
