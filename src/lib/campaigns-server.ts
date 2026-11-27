import 'server-only';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseUrl } from '@/lib/supabase/url';
import { pickActive, parisToday, spotlightHtml, type Campaign, type Formula } from '@/lib/campaigns';

/** Image du site (chemin « /img/… ») ou fichier importé dans l'administration (stockage Supabase). */
export const mediaUrl = (path: string | null) => (path ? (path.startsWith('/') && !path.startsWith('//') ? path : `${supabaseUrl()}/storage/v1/object/public/campaign-media/${path}`) : null);

/** Prix (en centimes) de la formule liée : la même valeur que celle facturée à l'achat. */
export async function productPrice(code: string | null) {
  if (!code) return null;
  const { data } = await serviceClient().from('voucher_products').select('price_cents').eq('code', code).eq('active', true).maybeSingle();
  return data?.price_cents ?? null;
}

/** Formules de bons cadeaux actives (prix = ceux facturés à l'achat) ; le badge promo n'apparaît que pendant sa période. */
export async function activeFormulas(): Promise<Formula[]> {
  const { data } = await serviceClient().from('voucher_products').select('*').eq('active', true).order('sort');
  const today = parisToday();
  return ((data ?? []) as any[]).map(p => ({ code: p.code, credits: p.credits, price_cents: p.price_cents, promo: p.promo_label && (!p.promo_until || p.promo_until >= today) ? p.promo_label : null }));
}

/** HTML du podium de l'accueil, ou null s'il n'y a aucune campagne active (ou si la base est indisponible). */
export async function activeSpotlightHtml(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await serviceClient().from('campaigns').select('*').eq('status', 'published');
  if (error || !data?.length) return null;
  const c = pickActive(data as Campaign[]); if (!c) return null;
  return spotlightHtml({ campaign: c, productPriceCents: await productPrice(c.voucher_product), mediaUrl: mediaUrl(c.media_path), formulas: c.show_formulas ? await activeFormulas() : [] });
}
