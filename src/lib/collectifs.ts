import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';

export const LEVELS = ['P25', 'P50', 'P100', 'P250', 'P500'];
export const WEEKDAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export type Alert = { level: 'info' | 'warn' | 'bad' | 'done'; label: string } | null;

/** 3 restantes : anticiper · 2 : attention · 1 : fin imminente · 0 : terminé. */
export function cycleAlert(remaining: number, status?: string): Alert {
  if (status && !['active', 'suspended'].includes(status)) return null;
  if (remaining === 0) return { level: 'done', label: 'Cycle terminé' };
  if (remaining === 1) return { level: 'bad', label: 'Fin imminente' };
  if (remaining === 2) return { level: 'warn', label: 'Attention' };
  if (remaining === 3) return { level: 'info', label: 'Renouvellement à anticiper' };
  return null;
}
export const hhmm = (t: string | null | undefined) => (t ? String(t).slice(0, 5) : '');
export const endTime = (start: string | null, mins: number) => { if (!start) return ''; const [h, m] = start.split(':').map(Number); const t = h * 60 + m + mins; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
export const pct = (done: number, total: number) => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

export type GroupCard = {
  id: string; name: string; level: string | null; weekday: number | null; start_time: string | null; duration_min: number; capacity: number; status: string; visibility: string;
  members: number; cycle: null | { id: string; label: string | null; status: string; total: number; validated: number; remaining: number; upcoming: number; last_planned: string | null; renewed: boolean; pending_validation: number };
  next_session: string | null; alert: Alert;
};

export async function loadOverview() {
  const svc = serviceClient(); const iso = new Date().toISOString();
  const [{ data: groups }, { data: mem }, { data: prog }, { data: nextS }] = await Promise.all([
    svc.from('groups').select('*').order('name'),
    svc.from('group_memberships').select('group_id,customer_id').eq('status', 'active'),
    svc.from('v_cycle_progress').select('*'),
    svc.from('sessions').select('group_id,starts_at').not('group_id', 'is', null).in('status', ['open', 'suspended']).gt('starts_at', iso).order('starts_at').limit(2000),
  ]);
  const members = new Map<string, number>(); for (const m of (mem ?? []) as any[]) members.set(m.group_id, (members.get(m.group_id) ?? 0) + 1);
  const cycles = new Map<string, any>();
  for (const c of (prog ?? []) as any[]) { if (!['active', 'suspended'].includes(c.status)) continue; const cur = cycles.get(c.group_id); if (!cur || c.start_date > cur.start_date) cycles.set(c.group_id, c); }
  const next = new Map<string, string>(); for (const s of (nextS ?? []) as any[]) if (!next.has(s.group_id)) next.set(s.group_id, s.starts_at);
  const cards: GroupCard[] = ((groups ?? []) as any[]).map(g => { const c = cycles.get(g.id) ?? null; return {
    id: g.id, name: g.name, level: g.level, weekday: g.weekday, start_time: g.start_time, duration_min: g.duration_min, capacity: g.capacity, status: g.status, visibility: g.visibility,
    members: members.get(g.id) ?? 0, next_session: next.get(g.id) ?? null,
    cycle: c ? { id: c.cycle_id, label: c.label, status: c.status, total: c.total, validated: c.validated, remaining: c.remaining, upcoming: c.upcoming, last_planned: c.last_planned, renewed: c.renewed, pending_validation: c.pending_validation } : null,
    alert: c && !c.renewed ? cycleAlert(c.remaining, c.status) : null,
  }; });
  const uniquePlayers = new Set(((mem ?? []) as any[]).map(m => m.customer_id)).size;
  return { cards, uniquePlayers, progress: (prog ?? []) as any[] };
}
