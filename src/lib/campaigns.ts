import { z } from 'zod';

export type Campaign = {
  id: string; name: string; eyebrow: string | null; title: string; highlight: string | null; description: string | null;
  voucher_product: string | null; price_cents: number | null; reference_price_cents: number | null; show_reference: boolean;
  cta_label: string; cta_url: string; reassurance: string | null; media_path: string | null; bg_color?: string | null;
  status: 'draft' | 'published' | 'archived'; starts_on: string | null; ends_on: string | null; priority: number; created_at: string;
};
export type Stats = { impressions: number; clicks: number; purchases: number; revenue_cents: number };

export const parisToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
export const eur = (cents: number) => `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;

export type CampaignState = 'draft' | 'archived' | 'live' | 'scheduled' | 'expired';
export function campaignState(c: Pick<Campaign, 'status' | 'starts_on' | 'ends_on'>, today = parisToday()): CampaignState {
  if (c.status !== 'published') return c.status;
  if (c.starts_on && c.starts_on > today) return 'scheduled';
  if (c.ends_on && c.ends_on < today) return 'expired';
  return 'live';
}
/** Une seule campagne à la fois : la plus prioritaire, puis la plus récemment commencée, puis la plus récemment créée. */
export function pickActive<T extends Campaign>(list: T[], today = parisToday()): T | null {
  const live = list.filter(c => campaignState(c, today) === 'live');
  live.sort((a, b) => b.priority - a.priority || (b.starts_on ?? '').localeCompare(a.starts_on ?? '') || b.created_at.localeCompare(a.created_at));
  return live[0] ?? null;
}
/** Prix affiché : celui de la formule liée (source de vérité de l'achat), sinon le prix saisi. Le prix barré n'apparaît que s'il est activé ET supérieur. */
export function pricing(c: Campaign, productPriceCents?: number | null) {
  const price = c.voucher_product && productPriceCents ? productPriceCents : c.price_cents;
  const ref = c.show_reference && price && c.reference_price_cents && c.reference_price_cents > price ? c.reference_price_cents : null;
  return { price: price ?? null, reference: ref, saving: ref && price ? ref - price : null };
}
/** Lien du bouton : pour une page du site, on ajoute la formule à présélectionner et l'identifiant de campagne (attribution). Le prix, lui, reste décidé par le serveur. */
export function ctaHref(c: Pick<Campaign, 'id' | 'cta_url' | 'voucher_product'>) {
  if (!c.cta_url.startsWith('/')) return c.cta_url;
  const u = new URL(c.cta_url, 'https://x.invalid');
  if (c.voucher_product) u.searchParams.set('offre', c.voucher_product);
  u.searchParams.set('c', c.id);
  if (u.pathname === '/bon-cadeau' && !u.hash) u.hash = '#configurateur';
  return `${u.pathname}${u.search}${u.hash}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
function titleHtml(title: string, hl: string | null) {
  const nl = (t: string) => t.replace(/,\s/, ',<br>');   // « Cette année, / offrez du padel. » : retour à la ligne après la première virgule
  const i = hl ? title.toLowerCase().indexOf(hl.toLowerCase()) : -1;
  if (!hl || i < 0) return nl(esc(title));
  return `${nl(esc(title.slice(0, i)))}<em>${esc(title.slice(i, i + hl.length))}</em>${esc(title.slice(i + hl.length))}`;
}

export type SpotlightInput = { campaign: Campaign; productPriceCents?: number | null; mediaUrl?: string | null };
/** HTML de la section (échappé). `preview` : liens neutralisés, ni suivi ni animation (aperçu de l'administration). */
export function spotlightHtml({ campaign: c, productPriceCents, mediaUrl }: SpotlightInput, opts: { preview?: boolean } = {}) {
  const p = pricing(c, productPriceCents);
  const href = opts.preview ? '#' : esc(ctaHref(c));
  const bg = c.bg_color && /^#[0-9a-fA-F]{6}$/.test(c.bg_color) ? ` style="--evs-pod:${c.bg_color}"` : '';
  const price = p.price ? `<div class="evs-price"><span class="evs-now">${esc(eur(p.price))}</span>${p.reference ? `<span class="evs-was"><span class="evs-sr">Prix habituel : </span><s>${esc(eur(p.reference))}</s></span><span class="evs-save">Vous économisez ${esc(eur(p.saving!))}</span>` : ''}</div>` : '';
  const alt = mediaUrl && mediaUrl.startsWith('/img/podium-noel') ? 'Coffret cadeau noir avec ruban vert citron, raquette de padel, balles et bon cadeau Coach Padel Toulouse' : '';
  const visual = mediaUrl ? `<div class="evs-visual"><img class="evs-img" src="${esc(mediaUrl)}" alt="${esc(alt)}" width="770" height="595" loading="lazy" decoding="async"></div>` : '';
  const gift = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z"/></svg>';
  const html = `<section class="evs" id="offres" aria-labelledby="evs-title" data-campaign="${esc(c.id)}"${bg}>
<div class="evs-podium${mediaUrl ? '' : ' evs-podium--text'}">
<div class="evs-copy">
<p class="evs-kicker">Les offres du moment</p>
${c.eyebrow ? `<p class="evs-edition">${gift}${esc(c.eyebrow)}</p>` : ''}
<h2 id="evs-title">${titleHtml(c.title, c.highlight)}</h2>
${c.description ? `<p class="evs-desc">${esc(c.description)}</p>` : ''}
${price}
<a class="evs-btn" href="${href}" data-evs-cta>${esc(c.cta_label)}<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
${c.reassurance ? `<p class="evs-note"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/></svg>${esc(c.reassurance)}</p>` : ''}
</div>
${visual}
</div>
</section>`;
  if (opts.preview) return html;
  // Suivi anonyme et agrégé (aucun cookie, aucun identifiant) + apparition progressive si le visiteur n'a pas demandé moins d'animations
  return html + `<script>(function(){var el=document.getElementById('offres');if(!el)return;var id=el.getAttribute('data-campaign');var done=false;
function send(k){try{navigator.sendBeacon('/api/campaigns/track',new Blob([JSON.stringify({id:id,kind:k})],{type:'application/json'}))}catch(e){}}
var calm=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;if(!calm&&'IntersectionObserver' in window)el.setAttribute('data-anim','');
function seen(){if(done)return;done=true;el.classList.add('is-in');send('impression')}
if('IntersectionObserver' in window){new IntersectionObserver(function(e,o){if(e[0].isIntersecting){seen();o.disconnect()}},{threshold:.35}).observe(el)}else{seen()}
var a=el.querySelector('[data-evs-cta]');if(a)a.addEventListener('click',function(){send('click')})})();</script>`;
}

const optText = (max: number) => z.string().trim().max(max).transform(v => v || null);
const cents = z.string().trim().transform(v => v.replace(',', '.')).refine(v => v === '' || /^\d{1,5}(\.\d{1,2})?$/.test(v), 'Montant invalide (ex. 200 ou 22,50)').transform(v => (v === '' ? null : Math.round(parseFloat(v) * 100)));
const day = z.string().trim().refine(v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date invalide').transform(v => v || null);
export const campaignInput = z.object({
  name: z.string().trim().min(1, 'Donnez un nom interne à la campagne').max(80),
  eyebrow: optText(40), title: z.string().trim().min(1, 'Le titre est obligatoire').max(90), highlight: optText(30), description: optText(240),
  voucher_product: z.string().trim().max(40).transform(v => v || null),
  price: cents, reference: cents,
  show_reference: z.string().optional().transform(v => v === 'on'),
  cta_label: z.string().trim().min(1, 'Le texte du bouton est obligatoire').max(40),
  cta_url: z.string().trim().max(300).regex(/^(https:\/\/[^ ]+|\/([^/ ][^ ]*)?)$/, 'Lien du bouton : adresse https://… ou page du site (/bon-cadeau)'),
  reassurance: optText(80), bg_color: z.string().trim().regex(/^(#[0-9a-fA-F]{6})?$/, 'Couleur de fond : format #F0EDE6').transform(v => v || null), starts_on: day, ends_on: day,
  priority: z.string().trim().regex(/^\d{1,3}$/, 'Priorité : nombre entre 0 et 100').transform(Number).refine(n => n <= 100, 'Priorité : 0 à 100'),
}).refine(d => !d.starts_on || !d.ends_on || d.ends_on >= d.starts_on, { message: 'La date de fin précède la date de début', path: ['ends_on'] })
  .refine(d => !d.show_reference || (d.reference !== null), { message: 'Indiquez le prix de référence pour pouvoir l’afficher', path: ['reference'] });
