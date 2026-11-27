import { serviceClient } from '@/lib/supabase/admin';
import VoucherCard from '@/components/bc/VoucherCard';
import Poll from './Poll';
import '../bc.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Merci — bon cadeau', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { data: v } = s && /^cs_[A-Za-z0-9_]+$/.test(s) ? await serviceClient().from('gift_vouchers').select('status,buyer_email,label,email_sent_at,recipient_name').eq('stripe_session_id', s).maybeSingle() : { data: null };
  const paid = !!v && ['paid', 'redeemed'].includes(v.status);
  return (
    <div className="bc"><section className="bc-sheet" style={{ marginTop: 0, borderRadius: 0, minHeight: '100vh', paddingBottom: 60 }}><div className="bc-wrap"><div className="bc-done">
      {paid ? <>
        <div className="bc-checkmark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg></div>
        <h1>Votre cadeau est prêt !</h1>
        <p>Paiement confirmé. {v!.email_sent_at ? <>Le bon cadeau PDF a été envoyé à <b>{v!.buyer_email}</b>.</> : <>Le bon PDF est en cours d’envoi à <b>{v!.buyer_email}</b>.</>}</p>
        <VoucherCard variant="preview" subtitle={v!.label} recipient={v!.recipient_name || undefined} />
        <div className="bc-done-box"><b>Et maintenant ?</b><br />Ouvrez l’e-mail (pensez aux courriers indésirables), puis imprimez le PDF ou transférez-le à la personne que vous gâtez. Sans nouvelle sous quelques minutes, contactez le coach.</div>
      </>
      : v?.status === 'pending' ? <>
        <Poll />
        <h1><span className="bc-spin" aria-hidden="true" />Confirmation en cours…</h1>
        <div className="bc-done-box" role="status">Nous attendons la confirmation de votre paiement par notre prestataire. Cette page se met à jour automatiquement ; le bon vous est envoyé par e-mail dès que le paiement est confirmé.</div>
      </>
      : <><h1>Bon introuvable</h1><div className="bc-done-box" role="alert">Aucun paiement n’est associé à ce lien.</div></>}
      <div className="bc-done-actions"><a className="bc-btn bc-btn--primary" href="/">Retour au site</a>{!paid && <a className="bc-btn bc-btn--ghost" href="/bon-cadeau">Retour aux bons cadeaux</a>}</div>
    </div></div></section></div>
  );
}
