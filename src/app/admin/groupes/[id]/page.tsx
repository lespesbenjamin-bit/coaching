import { redirect, notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { formatDay, formatTime } from '@/lib/dates';
import { DAYS } from '@/lib/backoffice';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { updateGroup, addMember, removeMember, createCycle, cycleAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Groupe — administration', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient();
  const { data: g } = await svc.from('groups').select('*').eq('id', id).maybeSingle();
  if (!g) notFound();
  const [{ data: members }, { data: events }, { data: cycles }, { data: sessions }, { data: customers }, { data: bal }] = await Promise.all([
    svc.from('group_memberships').select('id,customer_id,joined_at,customers(first_name,last_name,level)').eq('group_id', id).eq('status', 'active').order('joined_at'),
    svc.from('group_membership_events').select('id,event,at,customers(first_name,last_name)').eq('group_id', id).order('at', { ascending: false }).limit(30),
    svc.from('training_cycles').select('*').eq('group_id', id).order('created_at', { ascending: false }),
    svc.from('sessions').select('id,starts_at,status,cycle_id,cycle_index,capacity').eq('group_id', id).order('starts_at'),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(500),
    svc.from('v_credit_balance').select('customer_id,available,reserved'),
  ]);
  const ms = (members ?? []) as any[]; const memberIds = new Set(ms.map(m => m.customer_id));
  const balOf = new Map(((bal ?? []) as any[]).map(b => [b.customer_id, b]));
  const now = Date.now(); const ss = (sessions ?? []) as any[];
  const upcoming = ss.filter(s => new Date(s.starts_at).getTime() > now && s.status !== 'cancelled');
  const past = ss.filter(s => new Date(s.starts_at).getTime() <= now);
  const price = (g.price_per_person_cents / 100).toString();
  const to = `/admin/groupes/${id}`;
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="groupes" />
      <p className="muted"><a href="/admin/groupes">← Groupes</a></p>
      <h1 style={{ fontSize: 30, margin: '6px 0 16px' }}>{g.name}</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid2">
        <section>
          <h2 style={{ marginBottom: 10 }}>Membres ({ms.length}/{g.capacity})</h2>
          {ms.length === 0 ? <div className="panel empty">Aucun membre.</div> : <div className="panel scroll"><table><tbody>
            {ms.map(m => { const b = balOf.get(m.customer_id) as any; return (
              <tr key={m.id}><td><a href={`/admin/joueurs/fiche/${m.customer_id}`}><b>{m.customers.first_name} {m.customers.last_name}</b></a><br /><span className="muted">{m.customers.level ?? 'Niveau —'} · depuis le {new Date(m.joined_at).toLocaleDateString('fr-FR')}</span></td>
                <td>{b ? `${b.available} crédit(s) dispo` : 'Sans pack'}</td>
                <td><form action={removeMember}><input type="hidden" name="group" value={id} /><input type="hidden" name="customer" value={m.customer_id} /><ConfirmButton message="Retirer ce joueur ? Ses séances à venir dans ce groupe seront annulées (crédits rendus).">Retirer</ConfirmButton></form></td></tr>); })}
          </tbody></table></div>}
          {ms.length < g.capacity && g.status === 'active' && (
            <form action={addMember} className="row-actions" style={{ marginTop: 10 }}>
              <input type="hidden" name="group" value={id} />
              <select name="customer" required defaultValue=""><option value="" disabled>Ajouter un joueur…</option>
                {((customers ?? []) as any[]).filter(c => !memberIds.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select>
              <button className="btn">Ajouter</button></form>)}
          <p className="muted" style={{ marginTop: 6 }}>Un joueur ajouté est inscrit aux séances à venir du groupe. Un joueur absent de la liste ? <a href="/admin/joueurs">Créez sa fiche</a>.</p>

          <h2 style={{ margin: '24px 0 10px' }}>Cycles</h2>
          {(cycles ?? []).length === 0 ? <div className="panel empty">Aucun cycle. Créez-en un pour générer les séances.</div> : ((cycles ?? []) as any[]).map(c => (
            <div className="panel" key={c.id} style={{ padding: 14, marginBottom: 10 }}>
              <b>{c.label ?? 'Cycle'}</b> — {c.sessions_count} séances · {DAYS[c.weekday]} {String(c.start_time).slice(0, 5)} · dès le {new Date(c.start_date).toLocaleDateString('fr-FR')} · <i>{c.status === 'active' ? 'actif' : c.status === 'suspended' ? 'suspendu' : c.status === 'cancelled' ? 'annulé' : 'terminé'}</i>
              {c.excluded_dates?.length > 0 && <div className="muted">Dates exclues : {c.excluded_dates.join(', ')}</div>}
              {['active', 'suspended'].includes(c.status) && (
                <div className="row-actions" style={{ marginTop: 8 }}>
                  <form action={cycleAction}><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="group" value={id} /><input type="hidden" name="op" value={c.status === 'active' ? 'suspend' : 'resume'} /><button className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }}>{c.status === 'active' ? 'Suspendre' : 'Reprendre'}</button></form>
                  <form action={cycleAction}><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="group" value={id} /><input type="hidden" name="op" value="extend" /><input name="extra" type="number" min={1} max={30} defaultValue={1} style={{ width: 60 }} /><button className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }}>Prolonger</button></form>
                  <form action={cycleAction}><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="group" value={id} /><input type="hidden" name="op" value="regenerate" /><button className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }}>Régénérer</button></form>
                  <form action={cycleAction}><input type="hidden" name="cycle" value={c.id} /><input type="hidden" name="group" value={id} /><input type="hidden" name="op" value="cancel" /><ConfirmButton message="Annuler toutes les séances à venir de ce cycle ? Les crédits seront rendus.">Annuler le cycle</ConfirmButton></form>
                </div>)}
            </div>))}
          <form action={createCycle} className="form panel" style={{ padding: 16 }}>
            <h3 className="full">Nouveau cycle</h3><input type="hidden" name="group" value={id} />
            <label>Libellé<input name="label" placeholder="Cycle hiver" /></label>
            <label>Nombre de séances<input name="count" type="number" min={1} max={60} defaultValue={10} required /></label>
            <label>Première date<input name="start" type="date" required /></label>
            <label>Jour<select name="weekday" defaultValue={g.weekday ?? 1}>{DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
            <label>Heure<input name="time" type="time" defaultValue={String(g.start_time ?? '18:00').slice(0, 5)} required /></label>
            <label>Durée (min)<input name="duration" type="number" min={15} max={360} defaultValue={g.duration_min} required /></label>
            <label className="full">Dates exclues (vacances, jours fériés) — AAAA-MM-JJ séparées par des virgules<input name="excluded" placeholder="2027-02-15, 2027-04-05" /></label>
            <button className="btn full">Créer le cycle et générer les séances</button>
          </form>
        </section>
        <aside>
          <form action={updateGroup} className="form panel" style={{ padding: 16 }}>
            <h3 className="full">Réglages</h3><input type="hidden" name="id" value={id} />
            <label className="full">Nom<input name="name" defaultValue={g.name} required /></label>
            <label>Niveau<input name="level" defaultValue={g.level ?? ''} /></label>
            <label>Capacité<input name="capacity" type="number" min={1} max={12} defaultValue={g.capacity} required /></label>
            <label>Prix / pers. (€)<input name="price" type="number" min={0} step="0.5" defaultValue={price} required /></label>
            <label>Visibilité<select name="visibility" defaultValue={g.visibility}><option value="private">Privé</option><option value="public">Public</option></select></label>
            <label>Statut<select name="status" defaultValue={g.status}><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="archived">Archivé</option></select></label>
            <label className="full">Description<input name="description" defaultValue={g.description ?? ''} /></label>
            <button className="btn full">Enregistrer</button>
            <p className="muted full">Le prix et la visibilité s’appliquent aux séances créées ensuite, pas à celles déjà générées.</p>
          </form>
          <h2 style={{ margin: '22px 0 10px' }}>Séances à venir ({upcoming.length})</h2>
          {upcoming.length === 0 ? <div className="panel empty">Aucune.</div> : <div className="panel scroll"><table><tbody>
            {upcoming.slice(0, 40).map(s => <tr key={s.id}><td><span className="cap">{formatDay(s.starts_at)}</span> · {formatTime(s.starts_at)}{s.status === 'suspended' && <> <span className="badge pending">Suspendue</span></>}</td><td><a href={`/admin/seances/${s.id}`}>Ouvrir</a></td></tr>)}</tbody></table></div>}
          <h2 style={{ margin: '22px 0 10px' }}>Séances passées ({past.length})</h2>
          {past.length === 0 ? <div className="panel empty">Aucune.</div> : <div className="panel scroll"><table><tbody>
            {past.slice(-20).reverse().map(s => <tr key={s.id}><td><span className="cap">{formatDay(s.starts_at)}</span> · {formatTime(s.starts_at)}{s.status === 'cancelled' && <> <i>annulée</i></>}</td><td><a href={`/admin/seances/${s.id}`}>Présences</a></td></tr>)}</tbody></table></div>}
          <h2 style={{ margin: '22px 0 10px' }}>Historique des membres</h2>
          {(events ?? []).length === 0 ? <div className="panel empty">Aucun mouvement.</div> : <div className="panel scroll"><table><tbody>
            {((events ?? []) as any[]).map(e => <tr key={e.id}><td>{new Date(e.at).toLocaleDateString('fr-FR')}</td><td>{e.customers?.first_name} {e.customers?.last_name}</td><td>{e.event === 'joined' ? 'Arrivée' : 'Départ'}</td></tr>)}</tbody></table></div>}
        </aside>
      </div>
    </div></main>
  );
}
