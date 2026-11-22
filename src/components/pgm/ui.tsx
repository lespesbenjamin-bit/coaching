import type { Alert } from '@/lib/collectifs';

export function Progress({ value, label }: { value: number; label?: string }) {
  return <div className="pgm-prog" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progression'}><span style={{ width: `${value}%` }} /></div>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'primary'; children: React.ReactNode }) {
  return <span className={`pgm-badge ${tone}`}>{children}</span>;
}
export function AlertBadge({ alert }: { alert: Alert }) {
  if (!alert) return null;
  return <Badge tone={alert.level === 'bad' ? 'bad' : alert.level === 'warn' ? 'warn' : alert.level === 'done' ? 'neutral' : 'info'}>{alert.label}</Badge>;
}
export function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'warn' | 'bad' }) {
  return <div className={`pgm-stat${tone ? ' ' + tone : ''}`}><div className="v">{value}</div><div className="l">{label}</div></div>;
}
export function Icon({ name }: { name: 'users' | 'calendar' | 'check' | 'clock' | 'repeat' | 'alert' }) {
  const d: Record<string, string> = {
    users: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0',
    calendar: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
    check: 'M5 12l4 4 10-10',
    clock: 'M12 6v6l4 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
    repeat: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5',
    alert: 'M12 8v5M12 17h.01M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z',
  };
  return <svg className="pgm-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d[name]} /></svg>;
}
