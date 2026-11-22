import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { saveSettings } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paramètres — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams;
  const { data } = await serviceClient().from('app_settings').select('key,value');
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
    </div></main>
  );
}
