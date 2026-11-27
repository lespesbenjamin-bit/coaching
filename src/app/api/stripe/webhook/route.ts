import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { serviceClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe';
import { sendVoucherEmail, type Voucher } from '@/lib/vouchers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Webhook Stripe : la SEULE voie par laquelle un bon passe à « payé ». Signature vérifiée, traitement idempotent. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET; const sig = req.headers.get('stripe-signature');
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await req.text(), sig, secret); } catch { return NextResponse.json({ error: 'invalid signature' }, { status: 400 }); }

  const svc = serviceClient(); const origin = new URL(req.url).origin;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== 'paid') return NextResponse.json({ ok: true, waiting: true });
    const pi = typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null;
    const { data, error } = await svc.rpc('mark_voucher_paid', { p_session: s.id, p_payment_intent: pi, p_amount: s.amount_total });
    if (error) { console.error('voucher paid error', error.code); return NextResponse.json({ error: 'cannot mark paid' }, { status: error.code === 'P0050' || error.code === 'P0095' ? 200 : 500 }); }   // erreurs métier : inutile de rejouer
    const { data: v } = await svc.from('gift_vouchers').select('id,code,label,credits,amount_cents,status,buyer_name,buyer_email,recipient_name,message,expires_at,email_sent_at').eq('id', data.id).single();
    if (v && v.status === 'paid' && !v.email_sent_at) {
      const r = await sendVoucherEmail(v as Voucher, origin);
      if (r === 'failed') return NextResponse.json({ error: 'email failed' }, { status: 500 });      // Stripe rejouera ; le paiement est déjà enregistré
    }
  } else if (event.type === 'checkout.session.expired') {
    const s = event.data.object as Stripe.Checkout.Session;
    await svc.from('gift_vouchers').update({ status: 'cancelled', cancel_reason: 'paiement non finalisé' }).eq('stripe_session_id', s.id).eq('status', 'pending');
  } else if (event.type === 'charge.refunded') {
    const c = event.data.object as Stripe.Charge; const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id;
    if (pi) await svc.rpc('mark_voucher_refunded', { p_payment_intent: pi });
  }
  return NextResponse.json({ received: true });
}
