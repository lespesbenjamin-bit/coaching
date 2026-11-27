import 'server-only';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseUrl } from '@/lib/supabase/url';
import { pickActive, spotlightHtml, type Campaign } from '@/lib/campaigns';

export const mediaUrl = (path: string | null) => (path ? `${supabaseUrl()}/storage/v1/object/public/campaign-media/${path}` : null);

/** Prix (en centimes) de la formule liée : la même valeur que celle facturée à l'achat. */
export async function productPrice(code: string | null) {
  if (!code) return null;
  const { data } = await serviceClient().from('voucher_products').select('price_cents').eq('code', code).eq('active', true).maybeSingle();
  return data?.price_cents ?? null;
}

/** HTML du podium de l'accueil, ou null s'il n'y a aucune campagne active (ou si la base est indisponible). */
export async function activeSpotlightHtml(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await serviceClient().from('campaigns').select('*').eq('status', 'published');
  if (error || !data?.length) return null;
  const c = pickActive(data as Campaign[]); if (!c) return null;
  return spotlightHtml({ campaign: c, productPriceCents: await productPrice(c.voucher_product), mediaUrl: mediaUrl(c.media_path) });
}
