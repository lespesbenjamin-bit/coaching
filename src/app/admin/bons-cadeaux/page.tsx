import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { euros } from '@/lib/dates';
import { formatCode } from '@/lib/vouchers';
import { stripeConfigured } from '@/lib/stripe';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { createManualVoucher, resendVoucher, cancelVoucher, redeemForCustomer } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bons cadeaux — administration', robots: { index: false, follow: false } };
const ST: Record<string, string> = { pending: 'Paiement en attente', paid: 'Payé — à utiliser', redeemed: 'Utilisé', cancelled: 'Annulé', refunded: 'Remboursé' };
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—');

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const [{ data: vs }, { data: products }, { data: customers }] = await Promise.all([
    svc.from('gift_vouchers').select('*').order('created_at', { ascending: false }).limit(200),
    svc.from('voucher_products').select('code,label,price_cents').eq('active', true).order('sort'),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(1000),
  ]);
  const list = (vs ?? []) as any[]; const stale = list.filter(v => v.status === 'pending' && Date.now() - new Date(v.created_at).getTime() > 3600_000 && v.stripe_session_id);
  const sold = list.filter(v => ['paid', 'redeemed'].includes(v.status));
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="bons" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Bons cadeaux</h1>
      <Flash ok={sp.ok} err={sp.err} />
      {!stripeConfigured() && <div className="notice">Paiement en ligne non configuré : ajoutez STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET dans Vercel. Vous pouvez déjà créer des bons payés hors ligne.</div>}
      {list.some(v => v.refunded_at && v.status === 'redeemed') && <div className="notice bad">Un bon déjà utilisé a été remboursé dans Stripe : vérifiez les crédits du joueur concerné.</div>}
      {stale.length > 0 && <div className="notice bad">{stale.length} bon(s) en attente de paiement depuis plus d’une heure : si le client a bien payé, vérifiez le webhook dans Stripe.</div>}
      <p className="muted">{sold.length} bon(s) vendu(s) · {euros(sold.reduce((n, v) => n + v.amount_cents, 0))} · {list.filter(v => v.status === 'paid').length} à utiliser</p>
      <div className="grid2">
        <section>
          {list.length === 0 ? <div className="panel empty">Aucun bon pour l’instant.</div> : <div className="panel scroll"><table><thead><tr><th>Bon</th><th>Acheteur</th><th>Statut</th><th /></tr></thead><tbody>
            {list.map(v => <tr key={v.id}><td><b>{v.label}</b><br /><span className="muted">{['paid', 'redeemed'].includes(v.status) ? formatCode(v.code) : '—'} · {euros(v.amount_cents)}{v.source === 'manual' ? ' · hors ligne' : ''}</span></td>
              <td>{v.buyer_name}<br /><span className="muted">{v.buyer_email}{v.recipient_name ? ` → ${v.recipient_name}` : ''}</span></td>
              <td>{ST[v.status]}<br /><span className="muted">{v.status === 'paid' ? `jusqu’au ${day(v.expires_at)}${v.email_sent_at ? ' · e-mail envoyé' : ' · e-mail non envoyé'}` : v.status === 'redeemed' ? day(v.redeemed_at) : day(v.created_at)}</span></td>
              <td><div className="row-actions">
                {['paid', 'redeemed'].includes(v.status) && <a className="btn ghost" href={`/api/admin/vouchers/${v.id}/pdf`}>PDF</a>}
                {v.status === 'paid' && <form action={resendVoucher}><input type="hidden" name="id" value={v.id} /><button className="btn ghost">Renvoyer</button></form>}
                {['paid', 'pending'].includes(v.status) && <form action={cancelVoucher}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="reason" value="annulé par le coach" /><ConfirmButton className="btn ghost" message="Annuler ce bon ? Il ne pourra plus être utilisé. (Le remboursement éventuel se fait dans Stripe.)">Annuler</ConfirmButton></form>}
              </div></td></tr>)}
          </tbody></table></div>}
        </section>
        <aside style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <form action={createManualVoucher} className="form panel" style={{ padding: 16 }}><h2>Créer un bon (payé hors ligne)</h2>
            <label>Formule<select name="product">{(products ?? []).map(p => <option key={p.code} value={p.code}>{p.label} — {euros(p.price_cents)}</option>)}</select></label>
            <label>Acheteur<input name="buyer_name" required /></label><label>E-mail de l’acheteur<input name="buyer_email" type="email" required /></label>
            <label>Pour (facultatif)<input name="recipient_name" /></label><label>Message (facultatif)<textarea name="message" rows={2} maxLength={400} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="send" />Envoyer le PDF par e-mail</label>
            <button className="btn">Créer le bon</button></form>
          <form action={redeemForCustomer} className="form panel" style={{ padding: 16 }}><h2>Utiliser un bon pour un joueur</h2>
            <label>Code<input name="code" required placeholder="XXXXX-XXXXX" /></label>
            <label>Joueur<select name="customer" required defaultValue=""><option value="" disabled>Choisir…</option>{((customers ?? []) as any[]).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select></label>
            <button className="btn">Ajouter les crédits</button></form>
        </aside>
      </div>
    </div></main>
  );
}
