import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { saveSettings } from '../actions';
import { addRef, toggleRef } from '../tournois/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paramètres — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams;
  const svc = serviceClient(); const { data } = await svc.from('app_settings').select('key,value');
  const [{ data: cats }, { data: fmts }] = await Promise.all([svc.from('tournament_categories').select('*').order('sort_order'), svc.from('tournament_formats').select('*').order('sort_order')]);
  const s = Object.fromEntries(((data ?? []) as any[]).map(r => [r.key, r.value]));
  const on = (k: string, d: boolean) => (s[k] ?? d) === true;
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="parametres" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Paramètres</h1>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={saveSettings} className="form panel" style={{ padding: 20, maxWidth: 640 }}>
        <h3 className="full">Règles des crédits</h3>
        <label className="full">Délai d’annulation gratuite (heures avant la séance)<input name="cancel_deadline_hours" type="number" min={0} max={720} defaultValue={Number(s.cancel_deadline_hours ?? 24)} required /></label>
        <label className="full" style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="late_cancel_consumes_credit" defaultChecked={on('late_cancel_consumes_credit', true)} />Une annulation tardive consomme le crédit</label>
        <label className="full" style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="unjustified_absence_consumes_credit" defaultChecked={on('unjustified_absence_consumes_credit', true)} />Une absence non justifiée consomme le crédit</label>
        <label className="full" style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="hold_credit_on_booking" defaultChecked={on('hold_credit_on_booking', true)} />Réserver un crédit dès que la séance est confirmée (sinon, consommation à la présence)</label>
        <button className="btn full">Enregistrer</button>
        <p className="muted full">Une absence justifiée, une annulation par le coach ou une séance annulée ne consomment jamais de crédit. Les changements s’appliquent aux prochains calculs ; l’historique du journal n’est jamais réécrit.</p>
      </form>
      {[['tournament_categories', 'Catégories de tournois', cats], ['tournament_formats', 'Épreuves (sexe / catégorie d’épreuve)', fmts]].map(([table, title, rows]: any) => (
        <section key={table} className="panel" style={{ padding: 20, maxWidth: 640, marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          <table><tbody>{(rows ?? []).map((r: any) => <tr key={r.code}><td><b>{r.code}</b></td><td>{r.label}</td><td>{r.active ? 'Actif' : 'Inactif'}</td>
            <td><form action={toggleRef}><input type="hidden" name="table" value={table} /><input type="hidden" name="code" value={r.code} /><input type="hidden" name="to" value={r.active ? '0' : '1'} /><button className="btn ghost" style={{ padding: '4px 8px', fontSize: 11 }}>{r.active ? 'Désactiver' : 'Activer'}</button></form></td></tr>)}</tbody></table>
          <form action={addRef} className="row-actions" style={{ marginTop: 10 }}><input type="hidden" name="table" value={table} /><input name="code" placeholder="Code (ex. P3000)" required maxLength={20} /><input name="label" placeholder="Libellé" required maxLength={60} /><button className="btn">Ajouter</button></form>
          <p className="muted">Pour suivre les évolutions fédérales : ajoutez ou désactivez, sans rien supprimer de l’historique.</p>
        </section>))}
    </div></main>
  );
}
