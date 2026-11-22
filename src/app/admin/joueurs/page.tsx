import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { createCustomer } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; niveau?: string; groupe?: string; ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const [{ data: customers }, { data: groups }, { data: mships }, { data: bal }, { data: profiles }, { data: admins }] = await Promise.all([
    svc.from('customers').select('id,first_name,last_name,email,phone,level,user_id').order('last_name').limit(1000),
    svc.from('groups').select('id,name').neq('status', 'archived').order('name'),
    svc.from('group_memberships').select('customer_id,group_id,groups(name)').eq('status', 'active'),
    svc.from('v_credit_balance').select('customer_id,available,reserved'),
    svc.from('profiles').select('user_id,first_name,last_name,level,consent_at,created_at').order('created_at', { ascending: false }),
    svc.from('admin_profiles').select('user_id'),
  ]);
  const q = (sp.q ?? '').trim().toLowerCase();
  const gm = new Map<string, any[]>(); for (const m of (mships ?? []) as any[]) gm.set(m.customer_id, [...(gm.get(m.customer_id) ?? []), m]);
  const balOf = new Map(((bal ?? []) as any[]).map(b => [b.customer_id, b]));
  const list = ((customers ?? []) as any[]).filter(c =>
    (!q || `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q)) &&
    (!sp.niveau || (c.level ?? '').toLowerCase() === sp.niveau.toLowerCase()) &&
    (!sp.groupe || (gm.get(c.id) ?? []).some(m => m.group_id === sp.groupe)));
  const levels = [...new Set(((customers ?? []) as any[]).map(c => c.level).filter(Boolean))].sort();
  const adminIds = new Set((admins ?? []).map(a => a.user_id));
  const linked = new Set(((customers ?? []) as any[]).map(c => c.user_id).filter(Boolean));
  const orphans = ((profiles ?? []) as any[]).filter(p => !adminIds.has(p.user_id) && !linked.has(p.user_id));
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="joueurs" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Joueurs ({list.length})</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <form className="row-actions" style={{ marginBottom: 14 }}>
        <input name="q" placeholder="Rechercher un nom ou un e-mail" defaultValue={sp.q ?? ''} />
        <select name="niveau" defaultValue={sp.niveau ?? ''}><option value="">Tous niveaux</option>{levels.map(l => <option key={l}>{l}</option>)}</select>
        <select name="groupe" defaultValue={sp.groupe ?? ''}><option value="">Tous groupes</option>{(groups ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <button className="btn ghost">Filtrer</button></form>
      <div className="grid2">
        <section>
          {list.length === 0 ? <div className="panel empty">Aucun joueur ne correspond.</div> : <div className="panel scroll"><table><thead><tr><th>Joueur</th><th>Niveau</th><th>Groupes</th><th>Crédits</th><th>Compte</th><th /></tr></thead><tbody>
            {list.map(c => { const b = balOf.get(c.id) as any; return (
              <tr key={c.id}><td><b>{c.last_name} {c.first_name}</b><br /><span className="muted">{c.email}</span></td><td>{c.level ?? '—'}</td>
                <td>{(gm.get(c.id) ?? []).map(m => m.groups?.name).join(', ') || '—'}</td>
                <td>{b ? `${b.available} dispo / ${b.reserved} rés.` : '—'}</td>
                <td>{c.user_id ? <span className="badge confirmed">Oui</span> : <span className="muted">Non</span>}</td>
                <td><a className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }} href={`/admin/joueurs/fiche/${c.id}`}>Fiche</a></td></tr>); })}
          </tbody></table></div>}
          {orphans.length > 0 && <>
            <h2 style={{ margin: '24px 0 10px' }}>Comptes sans fiche joueur ({orphans.length})</h2>
            <p className="muted">Comptes créés sur le site qui n’ont encore jamais réservé. Suivi (comptes rendus, objectifs, tournois) via « Ouvrir ».</p>
            <div className="panel scroll"><table><tbody>
              {orphans.map(p => <tr key={p.user_id}><td><b>{[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom'}</b></td><td>{p.level ?? '—'}</td><td><a href={`/admin/joueurs/${p.user_id}`}>Ouvrir</a></td></tr>)}</tbody></table></div></>}
        </section>
        <aside><form action={createCustomer} className="form panel" style={{ padding: 16 }}>
          <h3 className="full">Nouveau joueur</h3>
          <label>Prénom<input name="first" required /></label><label>Nom<input name="last" required /></label>
          <label className="full">E-mail<input name="email" type="email" required /></label>
          <label>Téléphone<input name="phone" required /></label><label>Niveau<input name="level" placeholder="P100" /></label>
          <button className="btn full">Créer la fiche</button>
          <p className="muted full">Une fiche existante avec le même e-mail est ouverte, jamais fusionnée sur le nom.</p>
        </form></aside>
      </div>
    </div></main>
  );
}
