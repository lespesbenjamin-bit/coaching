import { WEEKDAYS, hhmm, endTime, pct, type GroupCard } from '@/lib/collectifs';
import { AlertBadge, Badge, Progress } from './ui';

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));
export default function GroupCardView({ g }: { g: GroupCard }) {
  const c = g.cycle; const p = c ? pct(c.validated, c.total) : 0;
  return (
    <a className="pgm-card" href={`/admin/collectifs/groupes/${g.id}`}>
      <div className="pgm-row"><h3>{g.name}</h3>{g.status === 'active' ? (g.level ? <Badge tone="primary">{g.level}</Badge> : null) : <Badge>{g.status === 'suspended' ? 'Suspendu' : 'Archivé'}</Badge>}</div>
      <div className="pgm-muted">{g.weekday ? `${WEEKDAYS[g.weekday]} · ${hhmm(g.start_time)}–${endTime(g.start_time, g.duration_min)}` : 'Horaire à définir'}</div>
      <dl className="pgm-kv">
        <dt>Joueurs</dt><dd>{g.members} / {g.capacity}</dd>
        <dt>Séances effectuées</dt><dd>{c ? c.validated : '—'}</dd>
        <dt>Séances restantes</dt><dd>{c ? c.remaining : '—'}</dd>
      </dl>
      {c ? <><Progress value={p} label={`${g.name} : ${p}%`} /><div className="pgm-row pgm-muted"><span>{c.label ?? 'Cycle'} · {p}%</span><AlertBadge alert={g.alert} /></div></> : <div className="pgm-muted">Aucun cycle en cours</div>}
      <dl className="pgm-kv">
        <dt>Prochaine séance</dt><dd>{g.next_session ? fmt(g.next_session, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
        <dt>Fin prévisionnelle</dt><dd>{c?.last_planned ? fmt(c.last_planned, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</dd>
      </dl>
    </a>
  );
}
