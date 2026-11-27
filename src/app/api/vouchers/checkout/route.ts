import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { tooManyAttempts } from '@/lib/rate-limit';
import { getStripe, stripeConfigured } from '@/lib/stripe';
import { newCode } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';
const input = z.object({
  product: z.string().min(1).max(40), buyer_name: z.string().trim().min(2).max(80), buyer_email: z.string().trim().toLowerCase().email().max(120),
  recipient_name: z.string().trim().max(80).optional().default(''), message: z.string().trim().max(400).optional().default(''),
  accept: z.literal(true), website: z.string().max(0).optional(),
});

export async function POST(req: Request) {
  if (!isSupabaseConfigured() || !stripeConfigured()) return NextResponse.json({ error: 'Le paiement en ligne n’est pas encore disponible.' }, { status: 503 });
  let body: unknown; try { body = await req.json(); } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }); }
  const p = input.safeParse(body);
  if (!p.success) return NextResponse.json({ error: 'Merci de vérifier les champs et d’accepter les conditions.' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (await tooManyAttempts(ip)) return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 });

  const svc = serviceClient(); let id: string | null = null;
  for (let i = 0; i < 3 && !id; i++) {                      // le prix vient de la base, jamais du navigateur
    const { data, error } = await svc.rpc('create_voucher', { p_product: p.data.product, p_code: newCode(), p_buyer_name: p.data.buyer_name, p_buyer_email: p.data.buyer_email, p_recipient: p.data.recipient_name, p_message: p.data.message, p_manual: false });
    if (!error) id = data; else if (error.code === 'P0090') return NextResponse.json({ error: 'Cette formule n’est plus disponible.' }, { status: 400 }); else if (error.code !== '23505') break;
  }
  if (!id) return NextResponse.json({ error: 'Impossible de préparer le bon. Réessayez.' }, { status: 500 });
  const { data: v } = await svc.from('gift_vouchers').select('label,amount_cents').eq('id', id).single();
  const origin = new URL(req.url).origin;
  try {
    const s = await getStripe().checkout.sessions.create({
      mode: 'payment', customer_email: p.data.buyer_email, locale: 'fr', client_reference_id: id, metadata: { voucher_id: id },
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: v!.amount_cents, product_data: { name: `Bon cadeau — ${v!.label}` } } }],
      success_url: `${origin}/bon-cadeau/merci?s={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/bon-cadeau?annule=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    }, { idempotencyKey: `voucher-checkout:${id}` });
    await svc.from('gift_vouchers').update({ stripe_session_id: s.id }).eq('id', id);
    return NextResponse.json({ url: s.url });
  } catch {
    await svc.from('gift_vouchers').update({ status: 'cancelled', cancel_reason: 'échec création session de paiement' }).eq('id', id);
    return NextResponse.json({ error: 'Le service de paiement est indisponible. Réessayez plus tard.' }, { status: 502 });
  }
}
