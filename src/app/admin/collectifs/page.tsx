import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { loadOverview, WEEKDAYS, LEVELS } from '@/lib/collectifs';
import Shell, { Notice } from '@/components/pgm/Shell';
import { Stat, Icon } from '@/components/pgm/ui';
import GroupCardView from '@/components/pgm/GroupCardView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gestion des collectifs', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const { cards, uniquePlayers, progress } = await loadOverview(); const svc = serviceClient();
  const now = new Date(); const wd = (now.getUTCDay() + 6) % 7; const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - wd)); const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [week, month, pending] = await Promise.all([
    svc.from('sessions').select('id', { count: 'exact', head: true }).not('group_id', 'is', null).in('status', ['open', 'suspended']).gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString()),
    svc.from('sessions').select('id', { count: 'exact', head: true }).not('group_id', 'is', null).eq('status', 'done').gte('starts_at', monthStart.toISOString()).lt('starts_at', monthEnd.toISOString()),
    svc.from('sessions').select('id', { count: 'exact', head: true }).not('group_id', 'is', null).eq('status', 'open').lte('ends_at', now.toISOString()),
  ]);
  const active = cards.filter(c => c.status === 'active');
  const remaining = progress.filter(p => p.status === 'active').reduce((n, p) => n + p.remaining, 0);
  const near = cards.filter(c => c.alert && c.alert.level !== 'done');
  const list = cards.filter(c => c.status !== 'archived' || sp.statut === 'archived').filter(c =>
    (!sp.jour || String(c.weekday) === sp.jour) && (!sp.niveau || c.level === sp.niveau) && (!sp.statut || c.status === sp.statut) && (!sp.renouv || (c.alert && c.alert.level !== 'done')));
  return (
    <Shell current="dashboard" title="Tableau de bord" action={<a className="pgm-btn" href="/admin/collectifs/groupes">Nouveau groupe</a>}>
      <Notice ok={sp.ok} err={sp.err} />
      <div className="pgm-stats">
        <Stat value={active.length} label="Groupes actifs" /><Stat value={uniquePlayers} label="Joueurs uniques" /><Stat value={week.count ?? 0} label="Séances cette semaine" />
        <Stat value={month.count ?? 0} label="Réalisées ce mois" /><Stat value={remaining} label="Séances restantes (cycles actifs)" />
        <Stat value={near.length} label="Groupes proches de la fin" tone={near.length ? 'warn' : undefined} /><Stat value={pending.count ?? 0} label="En attente de validation" tone={(pending.count ?? 0) ? 'bad' : undefined} />
      </div>
      <form className="pgm-filters" method="get">
        <label>Jour<select name="jour" defaultValue={sp.jour ?? ''}><option value="">Tous</option>{WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label>Niveau<select name="niveau" defaultValue={sp.niveau ?? ''}><option value="">Tous</option>{[...new Set([...LEVELS, ...cards.map(c => c.level).filter(Boolean) as string[]])].map(l => <option key={l}>{l}</option>)}</select></label>
        <label>Statut<select name="statut" defaultValue={sp.statut ?? ''}><option value="">Actifs et suspendus</option><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="archived">Archivé</option></select></label>
        <label style={{ flex: '0 0 auto', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" name="renouv" value="1" defaultChecked={!!sp.renouv} />Proches du renouvellement</label>
        <button className="pgm-btn dark">Filtrer</button><a className="pgm-btn ghost" href="/admin/collectifs">Réinitialiser</a>
      </form>
      {list.length === 0 ? <div className="pgm-empty"><Icon name="users" />Aucun groupe. Créez votre premier collectif dans « Mes groupes ».</div> : <div className="pgm-grid c3">{list.map(g => <GroupCardView key={g.id} g={g} />)}</div>}
    </Shell>
  );
}
