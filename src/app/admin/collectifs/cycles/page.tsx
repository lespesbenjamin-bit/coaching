import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { getAdminUser } from '@/lib/auth';
import { loadOverview, cycleAlert, pct } from '@/lib/collectifs';
import Shell, { Notice } from '@/components/pgm/Shell';
import { AlertBadge, Progress } from '@/components/pgm/ui';
import { renewCycle } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Suivi des cycles — collectifs', robots: { index: false, follow: false } };
const fp = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const { cards } = await loadOverview();
  const rows = cards.filter(c => c.cycle && c.status !== 'archived').map(c => ({ g: c, c: c.cycle! }));
  rows.sort((a, b) => sp.tri === 'fin' ? String(a.c.last_planned ?? '9').localeCompare(String(b.c.last_planned ?? '9')) : a.c.remaining - b.c.remaining);
  return (
    <Shell current="cycles" title="Suivi des cycles">
      <Notice ok={sp.ok} err={sp.err} />
      <p className="pgm-muted">Alertes : 3 séances restantes = à anticiper · 2 = attention · 1 = fin imminente · 0 = terminé. Tri : <a href="?tri=restantes">séances restantes</a> · <a href="?tri=fin">date de fin</a>.</p>
      {rows.length === 0 ? <div className="pgm-empty">Aucun cycle en cours.</div> : <div className="pgm-scroll"><table className="pgm-table"><thead><tr><th>Groupe</th><th>Cycle</th><th style={{ minWidth: 140 }}>Progression</th><th>Restantes</th><th>Fin prévue</th><th>Alerte</th><th /></tr></thead><tbody>
        {rows.map(({ g, c }) => <tr key={c.id}><td><a href={`/admin/collectifs/groupes/${g.id}`}><b>{g.name}</b></a></td><td>{c.label ?? 'Cycle'}</td>
          <td><Progress value={pct(c.validated, c.total)} /><span className="pgm-muted">{c.validated}/{c.total}</span></td><td><b>{c.remaining}</b></td>
          <td>{c.last_planned ? fp(c.last_planned, { day: 'numeric', month: 'short' }) : '—'}</td><td>{c.renewed ? <span className="pgm-muted">Renouvelé</span> : <AlertBadge alert={cycleAlert(c.remaining, c.status)} />}</td>
          <td>{!c.renewed && c.remaining <= 3 && <form action={renewCycle}><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="group" value={g.id} /><input type="hidden" name="key" value={randomUUID()} />
            <input type="hidden" name="count" value={c.total} /><input type="hidden" name="label" value={`Cycle suivant`} />
            <input type="hidden" name="start_date" value={(c.last_planned ? new Date(new Date(c.last_planned).getTime() + 7 * 86400000) : new Date()).toISOString().slice(0, 10)} /><button className="pgm-btn sm">Renouveler</button></form>}</td></tr>)}
      </tbody></table></div>}
    </Shell>
  );
}
