import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { euros } from '@/lib/dates';
import { DAYS } from '@/lib/backoffice';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { createGroup } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Groupes — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; archives?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const { data: groups } = await svc.from('groups').select('*, group_memberships(status)').order('name');
  const list = ((groups ?? []) as any[]).filter(g => sp.archives || g.status !== 'archived');
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="groupes" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Groupes</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid2">
        <section>
          {list.length === 0 ? <div className="panel empty">Aucun groupe. Créez le premier avec le formulaire.</div> : (
            <div className="panel scroll"><table><thead><tr><th>Groupe</th><th>Créneau</th><th>Membres</th><th>Statut</th><th /></tr></thead><tbody>
              {list.map(g => { const n = g.group_memberships.filter((m: any) => m.status === 'active').length; return (
                <tr key={g.id}><td><b>{g.name}</b><br /><span className="muted">{g.level ?? 'Niveau libre'} · {euros(g.price_per_person_cents)}/pers. · {g.visibility === 'public' ? 'Public' : 'Privé'}</span></td>
                  <td>{g.weekday ? `${DAYS[g.weekday]} ${String(g.start_time ?? '').slice(0, 5)}` : '—'}</td>
                  <td>{n}/{g.capacity}{n >= g.capacity && <> <span className="badge pending">Complet</span></>}</td>
                  <td>{g.status === 'active' ? 'Actif' : g.status === 'suspended' ? 'Suspendu' : 'Archivé'}</td>
                  <td><a className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }} href={`/admin/groupes/${g.id}`}>Ouvrir</a></td></tr>); })}
            </tbody></table></div>)}
          <p className="muted" style={{ marginTop: 10 }}>{sp.archives ? <a href="/admin/groupes">Masquer les archivés</a> : <a href="?archives=1">Afficher les archivés</a>}</p>
        </section>
        <aside><form action={createGroup} className="form panel" style={{ padding: 16 }}>
          <h3 className="full">Nouveau groupe</h3>
          <label className="full">Nom<input name="name" required maxLength={80} placeholder="Collectif lundi 18h" /></label>
          <label>Niveau<input name="level" placeholder="P100" /></label>
          <label>Capacité<input name="capacity" type="number" min={1} max={12} defaultValue={4} required /></label>
          <label>Jour<select name="weekday" defaultValue="1">{DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          <label>Heure<input name="start_time" type="time" defaultValue="18:00" required /></label>
          <label>Durée (min)<input name="duration_min" type="number" min={15} max={360} defaultValue={90} required /></label>
          <label>Prix / pers. (€)<input name="price" type="number" min={0} step="0.5" defaultValue={25} required /></label>
          <label className="full">Visibilité<select name="visibility" defaultValue="private"><option value="private">Privé — séances visibles seulement par le groupe</option><option value="public">Public — séances ouvertes à la réservation</option></select></label>
          <label className="full">Description<input name="description" maxLength={500} /></label>
          <button className="btn full">Créer le groupe</button>
        </form></aside>
      </div>
    </div></main>
  );
}
