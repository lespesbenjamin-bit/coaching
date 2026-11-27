import type { Metadata } from 'next';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { stripeConfigured } from '@/lib/stripe';
import VoucherCard from '@/components/bc/VoucherCard';
import Configurator, { type Product } from './Configurator';
import './bc.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Offrir du padel — bon cadeau cours de padel à Toulouse',
  description: 'Offrez des cours de padel avec Benjamin Lespes à l’Ace Padel Club de Colomiers : bon cadeau PDF envoyé par e-mail, paiement sécurisé.',
  alternates: { canonical: '/bon-cadeau' },
  openGraph: { title: 'Offrez du padel — bon cadeau', description: 'Un ou plusieurs cours de padel avec Benjamin Lespes, à offrir en PDF.', type: 'website' },
};

const parisToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());

export default async function Page({ searchParams }: { searchParams: Promise<{ annule?: string; offre?: string; c?: string }> }) {
  const sp = await searchParams; const today = parisToday();
  const { data } = isSupabaseConfigured() ? await serviceClient().from('voucher_products').select('*').eq('active', true).order('sort') : { data: [] as any[] };
  const products: Product[] = ((data ?? []) as any[]).map(p => ({
    code: p.code, label: p.label, description: p.description, credits: p.credits, price_cents: p.price_cents, validity_days: p.voucher_validity_days,
    promo: p.promo_label && (!p.promo_until || p.promo_until >= today) ? p.promo_label : null,
  }));
  const months = products.length ? Math.round(Math.min(...products.map(p => p.validity_days)) / 30.4) : 12;
  return (
    <div className="bc">
      <section className="bc-hero">
        <div className="bc-hero-bg" aria-hidden="true" />
        <div className="bc-wrap bc-hero-grid">
          <div className="bc-hero-text">
            <h1>Offrez du <span>padel.</span></h1>
            <p className="bc-lead">Le bon cadeau idéal pour progresser, se perfectionner ou vivre une expérience padel sur mesure avec Benjamin Lespes.</p>
            <a className="bc-btn bc-btn--primary bc-btn--lg" href="#configurateur">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z" /></svg>
              Choisir un bon cadeau
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <ul className="bc-trust">
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM4 7l8 6 8-6" /></svg><span>Bon reçu en PDF<br />par e-mail</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v15H5zM5 10h14M9 3v4M15 3v4" /></svg><span>Valable {months} mois</span></li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4" /></svg><span>Paiement sécurisé<br />par Stripe</span></li>
            </ul>
          </div>
          <div className="bc-hero-visual"><VoucherCard variant="hero" /></div>
        </div>
      </section>
      <section className="bc-sheet" id="configurateur" aria-label="Configurer votre bon cadeau">
        <div className="bc-wrap">
          {sp.annule && <div className="bc-notice" role="status">Paiement annulé : aucun montant n’a été débité. Vos informations sont conservées, vous pouvez reprendre.</div>}
          {products.length > 0
            ? <Configurator products={products} paymentEnabled={stripeConfigured()} cancelled={!!sp.annule} initialProduct={products.find(p => p.code === sp.offre)?.code} campaign={/^[0-9a-f-]{36}$/i.test(sp.c ?? '') ? sp.c : undefined} />
            : <div className="bc-empty">Les bons cadeaux ne sont pas disponibles pour le moment.</div>}
        </div>
      </section>
    </div>
  );
}
