import type { Metadata } from 'next';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import Form from './Form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Offrir un cours de padel — bon cadeau', description: 'Offrez un ou plusieurs cours de padel avec Benjamin Lespes à Colomiers : bon cadeau PDF envoyé par e-mail.', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ annule?: string }> }) {
  const sp = await searchParams;
  const { data } = isSupabaseConfigured() ? await serviceClient().from('voucher_products').select('code,label,description,credits,price_cents').eq('active', true).order('sort') : { data: [] };
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 820 }}>
      <div className="eyebrow" style={{ color: 'var(--black)' }}>Bon cadeau</div>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Offrir un cours de padel</h1>
      <p className="muted" style={{ marginBottom: 18 }}>Choisissez une formule, payez en ligne : vous recevez immédiatement un bon cadeau en PDF à offrir.</p>
      {sp.annule && <div className="notice">Paiement annulé : aucun montant n’a été débité.</div>}
      {data && data.length > 0 ? <Form products={data} enabled={stripeConfigured()} /> : <div className="empty">Les bons cadeaux ne sont pas disponibles pour le moment.</div>}
    </div></main>
  );
}
