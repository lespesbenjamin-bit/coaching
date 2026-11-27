import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { campaignState, eur, parisToday, pricing, spotlightHtml, type Campaign, type CampaignState } from '@/lib/campaigns';
import { mediaUrl } from '@/lib/campaigns-server';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import Preview from './Preview';
import { saveCampaign, setCampaignStatus, duplicateCampaign } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Campagnes commerciales — administration', robots: { index: false, follow: false } };
const LABEL: Record<CampaignState, string> = { live: 'En ligne sur l’accueil', scheduled: 'Programmée', expired: 'Terminée', draft: 'Brouillon', archived: 'Archivée' };
type Product = { code: string; label: string; price_cents: number };

function Fields({ c, products }: { c?: Campaign; products: Product[] }) {
  return <>
    {c && <input type="hidden" name="id" value={c.id} />}
    <label>Nom interne de la campagne<input name="name" required maxLength={80} defaultValue={c?.name ?? ''} /></label>
    <label>Édition (ex. « Édition Noël 2026 »)<input name="eyebrow" maxLength={40} defaultValue={c?.eyebrow ?? ''} /></label>
    <label>Titre<input name="title" required maxLength={90} defaultValue={c?.title ?? ''} /></label>
    <label>Mot du titre affiché en vert citron (ex. « padel »)<input name="highlight" maxLength={30} defaultValue={c?.highlight ?? ''} /></label>
    <label>Description (240 caractères max)<textarea name="description" rows={3} maxLength={240} defaultValue={c?.description ?? ''} /></label>
    <label>Formule de bon cadeau présélectionnée (son prix fait foi)
      <select name="voucher_product" defaultValue={c?.voucher_product ?? ''}><option value="">Aucune (prix saisi ci-dessous)</option>{products.map(p => <option key={p.code} value={p.code}>{p.label} — {eur(p.price_cents)}</option>)}</select></label>
    <label>Prix affiché en € (seulement si aucune formule n’est liée)<input name="price" inputMode="decimal" defaultValue={c?.price_cents ? String(c.price_cents / 100) : ''} /></label>
    <label>Prix de référence en € (ex. 225)<input name="reference" inputMode="decimal" defaultValue={c?.reference_price_cents ? String(c.reference_price_cents / 100) : ''} /></label>
    <label className="row-actions" style={{ alignItems: 'flex-start', gap: 8 }}><input type="checkbox" name="show_reference" defaultChecked={c?.show_reference ?? false} style={{ width: 'auto' }} />
      <span>Afficher le prix de référence barré et l’économie. À n’activer que si ce prix est un vrai prix de référence : il doit avoir été réellement pratiqué avant la promotion.</span></label>
    <label>Texte du bouton<input name="cta_label" required maxLength={40} defaultValue={c?.cta_label ?? 'Offrir ce bon cadeau'} /></label>
    <label>Destination du bouton (/bon-cadeau ou https://…)<input name="cta_url" required maxLength={300} defaultValue={c?.cta_url ?? '/bon-cadeau'} /></label>
    <label>Réassurance sous le bouton<input name="reassurance" maxLength={80} defaultValue={c?.reassurance ?? ''} /></label>
    <label>Visuel (JPEG, PNG ou WebP, 2 Mo max, environ 1400×1080, fond clair qui se fond dans le podium). Sans image, le podium s’affiche en pleine largeur, sans visuel.<input type="file" name="image" accept="image/jpeg,image/png,image/webp" /></label>
    {c?.media_path && <label className="row-actions" style={{ gap: 8 }}><input type="checkbox" name="remove_image" style={{ width: 'auto' }} /> Retirer l’image actuelle</label>}
    <label>Couleur de fond du podium (clair uniquement, ex. #F0EDE6 ; vide = beige par défaut)<input name="bg_color" maxLength={7} placeholder="#F0EDE6" defaultValue={c?.bg_color ?? ''} /></label>
    <label>Début (facultatif)<input type="date" name="starts_on" defaultValue={c?.starts_on ?? ''} /></label>
    <label>Fin, jour inclus (facultatif)<input type="date" name="ends_on" defaultValue={c?.ends_on ?? ''} /></label>
    <label>Priorité (0 à 100 ; en cas de chevauchement, la plus haute s’affiche)<input name="priority" inputMode="numeric" required defaultValue={c?.priority ?? 0} /></label>
  </>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient(); const today = parisToday();
  const [{ data: cs, error }, { data: pr }, { data: st }, { data: vs }] = await Promise.all([
    svc.from('campaigns').select('*').order('created_at', { ascending: false }),
    svc.from('voucher_products').select('code,label,price_cents').order('sort'),
    svc.from('campaign_stats').select('campaign_id,impressions,clicks'),
    svc.from('gift_vouchers').select('campaign_id,amount_cents,status').not('campaign_id', 'is', null).in('status', ['paid', 'redeemed']),
  ]);
  const products = (pr ?? []) as Product[]; const priceOf = new Map(products.map(p => [p.code, p.price_cents]));
  const list = (cs ?? []) as Campaign[];
  const stats = (id: string) => {
    const s = (st ?? []).filter(x => x.campaign_id === id), v = (vs ?? []).filter(x => x.campaign_id === id);
    const impressions = s.reduce((a, x) => a + x.impressions, 0), clicks = s.reduce((a, x) => a + x.clicks, 0);
    return { impressions, clicks, ctr: impressions ? (clicks / impressions) * 100 : null, purchases: v.length, revenue: v.reduce((a, x) => a + x.amount_cents, 0) };
  };
  const live = list.filter(c => campaignState(c, today) === 'live').sort((a, b) => b.priority - a.priority)[0];
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="campagnes" />
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Campagnes commerciales</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Le podium « Les offres du moment » s’affiche sous l’en-tête de l’accueil. Une seule campagne est montrée à la fois : la publiée et dans ses dates, de priorité la plus haute. Sans campagne active, la section disparaît. Les changements sont visibles en moins d’une minute.</p>
      <Flash ok={sp.ok} err={sp.err} />
      {error && <div className="notice bad">Les campagnes ne sont pas disponibles : la migration 011 n’est pas encore appliquée dans Supabase.</div>}
      {!error && <div className="notice" role="status">{live ? <>Sur l’accueil en ce moment : <b>{live.name}</b>.</> : 'Aucune campagne active : la section est masquée sur l’accueil.'}</div>}
      <div className="grid2">
        <section>
          {list.length === 0 ? <div className="panel empty">Aucune campagne. Créez la première avec le formulaire.</div> : list.map(c => {
            const state = campaignState(c, today), s = stats(c.id), pz = pricing(c, c.voucher_product ? priceOf.get(c.voucher_product) : null);
            const html = spotlightHtml({ campaign: c, productPriceCents: c.voucher_product ? priceOf.get(c.voucher_product) : null, mediaUrl: mediaUrl(c.media_path) }, { preview: true });
            return (
              <details key={c.id} className="panel" style={{ padding: 14, marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer' }}><b>{c.name}</b> <span className={`badge ${state === 'live' ? 'ok' : ''}`}>{LABEL[state]}</span>
                  <br /><span className="muted">{[pz.price ? eur(pz.price) : null, c.starts_on && `du ${c.starts_on}`, c.ends_on && `au ${c.ends_on}`, `priorité ${c.priority}`].filter(Boolean).join(' · ')}</span></summary>
                <p style={{ margin: '10px 0' }}><b>{s.impressions}</b> affichages · <b>{s.clicks}</b> clics · taux de clic <b>{s.ctr === null ? '—' : `${s.ctr.toFixed(1)} %`}</b> · <b>{s.purchases}</b> achat{s.purchases > 1 ? 's' : ''} attribué{s.purchases > 1 ? 's' : ''} · <b>{eur(s.revenue)}</b></p>
                <p className="muted" style={{ fontSize: 13 }}>Comptage anonyme et agrégé, sans cookie ni identifiant. Un achat est attribué quand l’acheteur arrive depuis le bouton du podium et paie dans la même visite (formules payées uniquement).</p>
                <Preview html={html} />
                <div className="row-actions" style={{ margin: '12px 0' }}>
                  {c.status !== 'published' && c.status !== 'archived' && <form action={setCampaignStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="published" /><button className="btn">Publier</button></form>}
                  {c.status === 'published' && <form action={setCampaignStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="draft" /><button className="btn ghost">Désactiver (brouillon)</button></form>}
                  {c.status === 'archived' && <form action={setCampaignStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="draft" /><button className="btn ghost">Restaurer en brouillon</button></form>}
                  <form action={duplicateCampaign}><input type="hidden" name="id" value={c.id} /><button className="btn ghost">Dupliquer</button></form>
                  {c.status !== 'archived' && <form action={setCampaignStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="to" value="archived" /><ConfirmButton className="btn ghost" message="Archiver cette campagne ? Elle ne sera plus affichée.">Archiver</ConfirmButton></form>}
                </div>
                <form action={saveCampaign} className="form"><Fields c={c} products={products} /><button className="btn">Enregistrer les modifications</button></form>
              </details>);
          })}
        </section>
        <aside><form action={saveCampaign} className="form panel" style={{ padding: 16 }}><h2>Nouvelle campagne</h2><Fields products={products} /><button className="btn">Créer en brouillon</button></form></aside>
      </div>
    </div></main>
  );
}
