import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { loadOverview, WEEKDAYS, LEVELS } from '@/lib/collectifs';
import Shell, { Notice } from '@/components/pgm/Shell';
import GroupCardView from '@/components/pgm/GroupCardView';
import { createCollectif } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mes groupes — collectifs', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const { cards } = await loadOverview();
  const list = cards.filter(c => sp.archives || c.status !== 'archived');
  return (
    <Shell current="groupes" title="Mes groupes">
      <Notice ok={sp.ok} err={sp.err} />
      <div className="pgm-grid side">
        <section>
          {list.length === 0 ? <div className="pgm-empty">Aucun groupe pour l’instant.</div> : <div className="pgm-grid c2">{list.map(g => <GroupCardView key={g.id} g={g} />)}</div>}
          <p className="pgm-muted" style={{ marginTop: 10 }}>{sp.archives ? <a href="/admin/collectifs/groupes">Masquer les archivés</a> : <a href="?archives=1">Afficher les groupes archivés</a>}</p>
        </section>
        <aside><form action={createCollectif} className="pgm-card pgm-form c2">
          <h2 className="full">Nouveau groupe</h2>
          <label className="full">Nom du groupe<input name="name" required maxLength={80} placeholder="Objectif P100" /></label>
          <label>Niveau<input name="level" list="lv" placeholder="P100 ou personnalisé" /><datalist id="lv">{LEVELS.map(l => <option key={l} value={l} />)}</datalist></label>
          <label>Jour<select name="weekday" defaultValue="3">{WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          <label>Heure de début<input name="start" type="time" defaultValue="19:00" required /></label>
          <label>Heure de fin<input name="end" type="time" defaultValue="20:30" required /></label>
          <label>Capacité maximale<input name="capacity" type="number" min={1} max={12} defaultValue={4} required /></label>
          <label>Date de début<input name="start_date" type="date" required /></label>
          <label>Séances du 1er cycle (0 = aucun)<input name="sessions" type="number" min={0} max={60} defaultValue={10} required /></label>
          <label>Statut<select name="status" defaultValue="active"><option value="active">Actif</option><option value="suspended">Suspendu</option></select></label>
          <button className="pgm-btn full">Créer le groupe</button>
          <p className="pgm-muted full" style={{ margin: 0 }}>Durée = fin − début (1 h 30 par défaut). Les séances du cycle sont créées dans l’agenda.</p>
        </form></aside>
      </div>
    </Shell>
  );
}
