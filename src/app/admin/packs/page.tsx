import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { euros } from '@/lib/dates';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { createPack, togglePack, grantPack, expireCredits } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Packs et crédits — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const [{ data: packs }, { data: bal }, { data: customers }] = await Promise.all([
    svc.from('pack_definitions').select('*').order('credits'),
    svc.from('v_credit_balance').select('customer_id,available,reserved,consumed,expired').order('available'),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(500),
  ]);
  const nameOf = new Map(((customers ?? []) as any[]).map(c => [c.id, `${c.last_name} ${c.first_name}`]));
  const TYPES: [string, string][] = [['individuel', 'Individuel'], ['duo', 'Duo'], ['collectif', 'Collectif']];
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="packs" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Packs et crédits</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid2">
        <section>
          <h2 style={{ marginBottom: 10 }}>Soldes des joueurs</h2>
          {(bal ?? []).length === 0 ? <div className="panel empty">Aucun crédit attribué pour l’instant.</div> : <div className="panel scroll"><table><thead><tr><th>Joueur</th><th>Dispo</th><th>Réservés</th><th>Consommés</th><th>Expirés</th></tr></thead><tbody>
            {((bal ?? []) as any[]).map(r => <tr key={r.customer_id}><td><a href={`/admin/joueurs/fiche/${r.customer_id}`}>{nameOf.get(r.customer_id) ?? 'Joueur'}</a></td><td><b>{r.available}</b></td><td>{r.reserved}</td><td>{r.consumed}</td><td>{r.expired}</td></tr>)}</tbody></table></div>}
          <form action={expireCredits} style={{ marginTop: 10 }}><ConfirmButton className="btn ghost" message="Expirer les crédits des packs dont la date de validité est dépassée ?">Expirer les packs périmés</ConfirmButton></form>
          <h2 style={{ margin: '24px 0 10px' }}>Catalogue</h2>
          {(packs ?? []).length === 0 ? <div className="panel empty">Aucun pack. Créez-en un avec le formulaire.</div> : <div className="panel scroll"><table><tbody>
            {((packs ?? []) as any[]).map(p => <tr key={p.id}><td><b>{p.name}</b><br /><span className="muted">{p.credits} crédits · {euros(p.price_cents)} · {p.eligible_course_codes.join(', ')}{p.validity_days ? ` · ${p.validity_days} j` : ' · sans expiration'}</span></td>
              <td>{p.active ? 'Actif' : 'Inactif'}</td><td><form action={togglePack}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="to" value={p.active ? '0' : '1'} /><button className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }}>{p.active ? 'Désactiver' : 'Activer'}</button></form></td></tr>)}</tbody></table></div>}
        </section>
        <aside>
          <form action={createPack} className="form panel" style={{ padding: 16 }}>
            <h3 className="full">Nouveau pack</h3>
            <label className="full">Nom<input name="name" required placeholder="Pack 10 cours individuels" /></label>
            <label>Crédits<input name="credits" type="number" min={1} max={200} defaultValue={10} required /></label>
            <label>Prix (€)<input name="price" type="number" min={0} step="0.5" defaultValue={0} required /></label>
            <label>Validité (jours, vide = illimitée)<input name="validity" type="number" min={1} /></label>
            <fieldset className="full" style={{ border: 0, padding: 0 }}><legend className="muted">Types de cours éligibles</legend>{TYPES.map(([k, l]) => <label key={k} style={{ display: 'inline-flex', gap: 6, marginRight: 14 }}><input type="checkbox" name="codes" value={k} defaultChecked />{l}</label>)}</fieldset>
            <button className="btn full">Créer le pack</button></form>
          <form action={grantPack} className="form panel" style={{ padding: 16, marginTop: 12 }}>
            <h3 className="full">Attribuer un pack</h3>
            <label className="full">Joueur<select name="customer" required defaultValue=""><option value="" disabled>Choisir…</option>{((customers ?? []) as any[]).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select></label>
            <label className="full">Pack<select name="pack" required defaultValue=""><option value="" disabled>Choisir…</option>{((packs ?? []) as any[]).filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name} — {p.credits} crédits</option>)}</select></label>
            <label className="full">Note<input name="note" maxLength={200} /></label>
            <button className="btn full">Attribuer</button></form>
        </aside>
      </div>
    </div></main>
  );
}
