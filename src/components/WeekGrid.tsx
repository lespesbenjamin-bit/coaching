'use client';
import { dayKey } from '@/lib/dates';

export type CalEvent = { id: string; startsAt: string; endsAt: string; title: string; sub?: string; tone: 'open' | 'pending' | 'full' | 'group' | 'muted' };
const PX = 52; // pixels par heure
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function parisMinutes(iso: string) {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return Number(p.find(x => x.type === 'hour')!.value) * 60 + Number(p.find(x => x.type === 'minute')!.value);
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Grille horaire d'une semaine. onEmpty (facultatif) : clic sur une zone vide -> (date, heure arrondie à 15 min). */
export default function WeekGrid({ weekStart, events, onEvent, onEmpty, startHour = 7, endHour = 22, selectedId }: {
  weekStart: string; events: CalEvent[]; onEvent: (e: CalEvent) => void; onEmpty?: (date: string, time: string) => void; startHour?: number; endHour?: number; selectedId?: string | null;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const withMin = events.map(e => ({ e, s: parisMinutes(e.startsAt), f: parisMinutes(e.endsAt), d: dayKey(e.startsAt) })).filter(x => days.includes(x.d));
  const h0 = Math.min(startHour, ...withMin.map(x => Math.floor(x.s / 60)));
  const h1 = Math.max(endHour, ...withMin.map(x => Math.ceil((x.f <= x.s ? 24 * 60 : x.f) / 60)));
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const today = dayKey(new Date().toISOString());
  function clickCol(ev: React.MouseEvent<HTMLDivElement>, day: string) {
    if (!onEmpty || ev.target !== ev.currentTarget) return;
    const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
    const m = Math.min(h1 * 60 - 15, Math.floor(((y / PX) * 60 + h0 * 60) / 15) * 15);
    onEmpty(day, hhmm(m));
  }
  return (
    <div className="wg" role="grid" aria-label="Calendrier de la semaine">
      <div className="wg-head"><div />{days.map((d, i) => <div key={d} className={d === today ? 'today' : ''}><span>{WD[i]}</span><b>{+d.slice(8)}</b></div>)}</div>
      <div className="wg-body" style={{ height: hours.length * PX }}>
        <div className="wg-axis">{hours.map(h => <div key={h} style={{ height: PX }}>{String(h).padStart(2, '0')}h</div>)}</div>
        {days.map(d => (
          <div key={d} className={`wg-col${d === today ? ' today' : ''}${onEmpty ? ' click' : ''}`} onClick={e => clickCol(e, d)}
            style={{ backgroundSize: `100% ${PX}px` }}>
            {withMin.filter(x => x.d === d).map(({ e, s, f }) => (
              <button key={e.id} type="button" className={`wg-ev ${e.tone}${selectedId === e.id ? ' sel' : ''}`} onClick={() => onEvent(e)}
                style={{ top: ((s - h0 * 60) / 60) * PX, height: Math.max(22, (((f <= s ? s + 60 : f) - s) / 60) * PX - 2) }}
                title={`${hhmm(s)} ${e.title}${e.sub ? ' · ' + e.sub : ''}`}>
                <b>{hhmm(s)}</b> {e.title}{e.sub && <small>{e.sub}</small>}
              </button>))}
          </div>))}
      </div>
    </div>
  );
}
