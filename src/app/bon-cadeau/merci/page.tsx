import { serviceClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Merci — bon cadeau', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const { data: v } = s && /^cs_[A-Za-z0-9_]+$/.test(s) ? await serviceClient().from('gift_vouchers').select('status,buyer_email,label,email_sent_at').eq('stripe_session_id', s).maybeSingle() : { data: null };
  const paid = v && ['paid', 'redeemed'].includes(v.status);
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 560 }}>
      {paid ? <>
        <h1 style={{ fontSize: 30 }}>Merci, paiement confirmé !</h1>
        <div className="notice ok" role="status">{v.email_sent_at ? <>Votre bon « {v.label} » a été envoyé à <b>{v.buyer_email}</b>. Pensez à regarder vos courriers indésirables.</> : <>Votre paiement est confirmé. Le bon PDF vous est envoyé à <b>{v.buyer_email}</b> dans quelques instants ; sans nouvelle, contactez le coach.</>}</div></>
      : v?.status === 'pending' ? <>
        <h1 style={{ fontSize: 30 }}>Confirmation en cours…</h1>
        <div className="notice" role="status">Nous attendons la confirmation de votre paiement. Rechargez cette page dans quelques secondes ; le bon vous sera envoyé par e-mail dès qu’il est confirmé.</div></>
      : <><h1 style={{ fontSize: 30 }}>Bon introuvable</h1><div className="notice bad">Aucun paiement n’est associé à ce lien.</div></>}
      <p><a href="/">Retour au site</a></p>
    </div></main>
  );
}
