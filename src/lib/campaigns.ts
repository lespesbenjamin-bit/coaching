import { z } from 'zod';

export type Campaign = {
  id: string; name: string; eyebrow: string | null; title: string; highlight: string | null; description: string | null;
  voucher_product: string | null; price_cents: number | null; reference_price_cents: number | null; show_reference: boolean;
  cta_label: string; cta_url: string; reassurance: string | null; media_path: string | null;
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
  const i = hl ? title.toLowerCase().indexOf(hl.toLowerCase()) : -1;
  if (!hl || i < 0) return esc(title);
  return `${esc(title.slice(0, i))}<em>${esc(title.slice(i, i + hl.length))}</em>${esc(title.slice(i + hl.length))}`;
}

function scene() {
  let holes = '';
  for (let r = 0; r < 7; r++) for (let k = 0; k < 6; k++) { const x = 120 + (k - 2.5) * 14 + (r % 2 ? 7 : 0), y = 44 + r * 14; if (((x - 120) / 62) ** 2 + ((y - 100) / 62) ** 2 < 0.78) holes += `<circle cx="${x}" cy="${y}" r="3.2"/>`; }
  return `<svg class="evs-scene" viewBox="0 0 640 520" role="img" aria-label="Coffret cadeau noir, ruban vert citron, raquette de padel, balles et bon cadeau" xmlns="http://www.w3.org/2000/svg">
<defs>
<radialGradient id="evsGlow" cx="50%" cy="58%" r="55%"><stop offset="0" stop-color="#d9ff3f" stop-opacity=".28"/><stop offset="1" stop-color="#d9ff3f" stop-opacity="0"/></radialGradient>
<linearGradient id="evsBox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#262c28"/><stop offset="1" stop-color="#0d0f0e"/></linearGradient>
<linearGradient id="evsLid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30372f"/><stop offset="1" stop-color="#151816"/></linearGradient>
<linearGradient id="evsRib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c4eb26"/><stop offset=".5" stop-color="#ecff86"/><stop offset="1" stop-color="#b8db1f"/></linearGradient>
<radialGradient id="evsBall" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#f4ffa8"/><stop offset=".55" stop-color="#d9ff3f"/><stop offset="1" stop-color="#93b510"/></radialGradient>
<linearGradient id="evsRk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b312d"/><stop offset="1" stop-color="#101311"/></linearGradient>
</defs>
<ellipse cx="320" cy="300" rx="300" ry="230" fill="url(#evsGlow)"/>
<ellipse cx="320" cy="468" rx="250" ry="28" fill="#000" opacity=".55"/>
<g class="evs-racket" transform="translate(96 40) rotate(-18 120 200)"><path d="M120 8c52 0 88 36 88 86 0 44-26 76-56 96l-6 74h-52l-6-74c-30-20-56-52-56-96C32 44 68 8 120 8Z" fill="url(#evsRk)" stroke="#d9ff3f" stroke-opacity=".75" stroke-width="3"/><g fill="#0b0d0c">${holes}</g><rect x="104" y="262" width="32" height="76" rx="9" fill="#0b0d0c" stroke="#d9ff3f" stroke-opacity=".5" stroke-width="2"/></g>
<g class="evs-box"><rect x="196" y="262" width="300" height="190" rx="14" fill="url(#evsBox)" stroke="#fff" stroke-opacity=".08"/><rect x="180" y="226" width="332" height="58" rx="12" fill="url(#evsLid)" stroke="#fff" stroke-opacity=".1"/>
<rect x="326" y="226" width="40" height="226" fill="url(#evsRib)"/><path d="M346 226c-34-74-112-84-122-48-8 30 56 52 122 48Z" fill="#d9ff3f"/><path d="M346 226c34-74 112-84 122-48 8 30-56 52-122 48Z" fill="#c4eb26"/><path d="M346 226c-34-74-112-84-122-48" fill="none" stroke="#f6ffd0" stroke-opacity=".55" stroke-width="2.5"/><rect x="326" y="208" width="40" height="36" rx="11" fill="#d9ff3f" stroke="#a4c817" stroke-width="2"/></g>
<g class="evs-voucher" transform="rotate(-7 430 390)"><rect x="352" y="330" width="214" height="124" rx="14" fill="#0b0d0c" stroke="#d9ff3f" stroke-opacity=".8" stroke-width="2"/><rect x="368" y="346" width="34" height="34" rx="9" fill="#15181a" stroke="#d9ff3f" stroke-opacity=".5"/><text x="385" y="369" text-anchor="middle" font-size="15" font-weight="800" fill="#d9ff3f" font-family="Inter,system-ui,sans-serif">BL</text><text x="412" y="360" font-size="10.5" font-weight="700" fill="#fff" letter-spacing=".5" font-family="Inter,system-ui,sans-serif">BENJAMIN LESPES</text><text x="412" y="374" font-size="8" font-weight="600" fill="#d9ff3f" letter-spacing="1.4" font-family="Inter,system-ui,sans-serif">COACH PADEL TOULOUSE</text><text x="368" y="418" font-size="24" font-weight="700" fill="#fff" font-family="Inter,system-ui,sans-serif">Bon cadeau</text><text x="368" y="438" font-size="12.5" font-weight="500" fill="#d9ff3f" font-family="Inter,system-ui,sans-serif">5 cours individuels</text></g>
<g class="evs-balls"><circle cx="120" cy="420" r="30" fill="url(#evsBall)"/><path d="M92 408c14 4 24 16 26 34M148 432c-14-4-24-16-26-34" fill="none" stroke="#f6ffd0" stroke-opacity=".75" stroke-width="2.6" stroke-linecap="round"/><circle cx="196" cy="452" r="22" fill="url(#evsBall)"/><path d="M176 444c10 3 17 11 19 24" fill="none" stroke="#f6ffd0" stroke-opacity=".7" stroke-width="2.2" stroke-linecap="round"/></g>
</svg>`;
}

export type SpotlightInput = { campaign: Campaign; productPriceCents?: number | null; mediaUrl?: string | null };
/** HTML de la section (échappé). `preview` : liens neutralisés, ni suivi ni animation (aperçu de l'administration). */
export function spotlightHtml({ campaign: c, productPriceCents, mediaUrl }: SpotlightInput, opts: { preview?: boolean } = {}) {
  const p = pricing(c, productPriceCents);
  const href = opts.preview ? '#' : esc(ctaHref(c));
  const price = p.price ? `<div class="evs-price"><span class="evs-now">${esc(eur(p.price))}</span>${p.reference ? `<span class="evs-was"><span class="evs-sr">Prix habituel : </span><s>${esc(eur(p.reference))}</s></span><span class="evs-save">Vous économisez ${esc(eur(p.saving!))}</span>` : ''}</div>` : '';
  const visual = mediaUrl ? `<img class="evs-img" src="${esc(mediaUrl)}" alt="" width="640" height="520" loading="lazy" decoding="async">` : scene();
  const html = `<section class="evs" id="offres" aria-labelledby="evs-title" data-campaign="${esc(c.id)}">
<div class="evs-bg" aria-hidden="true"></div>
<div class="evs-wrap">
<div class="evs-copy">
<p class="evs-kicker">Les offres du moment</p>
${c.eyebrow ? `<p class="evs-edition">${esc(c.eyebrow)}</p>` : ''}
<h2 id="evs-title">${titleHtml(c.title, c.highlight)}</h2>
${c.description ? `<p class="evs-desc">${esc(c.description)}</p>` : ''}
${price}
<a class="evs-btn" href="${href}" data-evs-cta>${esc(c.cta_label)}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
${c.reassurance ? `<p class="evs-note"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/></svg>${esc(c.reassurance)}</p>` : ''}
</div>
<div class="evs-visual">${visual}</div>
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
  reassurance: optText(80), starts_on: day, ends_on: day,
  priority: z.string().trim().regex(/^\d{1,3}$/, 'Priorité : nombre entre 0 et 100').transform(Number).refine(n => n <= 100, 'Priorité : 0 à 100'),
}).refine(d => !d.starts_on || !d.ends_on || d.ends_on >= d.starts_on, { message: 'La date de fin précède la date de début', path: ['ends_on'] })
  .refine(d => !d.show_reference || (d.reference !== null), { message: 'Indiquez le prix de référence pour pouvoir l’afficher', path: ['reference'] });
