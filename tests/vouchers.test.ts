import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

vi.mock('server-only', () => ({}));
const { rpc, single, sendVoucherEmail } = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn(), sendVoucherEmail: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ serviceClient: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ single }) }), update: () => ({ eq: () => ({ eq: () => ({}) }) }) }) }) }));
vi.mock('@/lib/vouchers', async (orig) => ({ ...(await orig<typeof import('@/lib/vouchers')>()), sendVoucherEmail }));

import { newCode, normalizeCode, formatCode, buildVoucherPdf } from '@/lib/vouchers';
import { POST } from '@/app/api/stripe/webhook/route';

const SECRET = 'whsec_test_secret';
const voucher = { id: 'v1', code: 'ABCDE23456', label: '3 cours — travail d\'un geste technique', credits: 3, amount_cents: 13500, status: 'paid', buyer_name: 'Marie Dupont', buyer_email: 'm@x.fr', recipient_name: 'Paul', message: 'Joyeux Noël 🎄 avec beaucoup d’amour', expires_at: '2027-11-27T10:00:00Z', email_sent_at: null };

function signed(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret });
  return new Request('https://site.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': header }, body: payload });
}
const completed = (over = {}) => ({ id: 'evt_1', object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 13500, ...over } } });

describe('codes', () => {
  it('10 caractères sans ambiguïté, uniques', () => {
    const s = new Set(Array.from({ length: 500 }, newCode)); expect(s.size).toBe(500);
    for (const c of s) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });
  it('normalise la saisie', () => { expect(normalizeCode(' abcde-23456 ')).toBe('ABCDE23456'); expect(formatCode('ABCDE23456')).toBe('ABCDE-23456'); });
});
describe('PDF', () => {
  it('génère un vrai PDF, même avec emoji et message long', async () => {
    const pdf = await buildVoucherPdf({ ...voucher, message: voucher.message + ' lorem ipsum '.repeat(40) }, 'https://www.coachpadeltoulouse.fr');
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.length).toBeGreaterThan(1500);
  });
  it('fonctionne sans destinataire ni message', async () => {
    expect((await buildVoucherPdf({ ...voucher, recipient_name: null, message: null }, 'https://x.fr')).length).toBeGreaterThan(1500);
  });
});
describe('webhook Stripe', () => {
  beforeEach(() => { rpc.mockReset(); single.mockReset(); sendVoucherEmail.mockReset(); process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = SECRET; });
  it('refuse une signature invalide, sans rien écrire', async () => {
    const res = await POST(signed(completed(), 'whsec_autre')); expect(res.status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it('refuse une requête sans signature', async () => {
    const res = await POST(new Request('https://site.test/x', { method: 'POST', body: '{}' })); expect(res.status).toBe(400);
  });
  it('paiement confirmé : marque payé avec le montant Stripe puis envoie le PDF', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1', newly_paid: true }, error: null }); single.mockResolvedValue({ data: voucher }); sendVoucherEmail.mockResolvedValue('sent');
    const res = await POST(signed(completed())); expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('mark_voucher_paid', { p_session: 'cs_test_1', p_payment_intent: 'pi_1', p_amount: 13500 });
    expect(sendVoucherEmail).toHaveBeenCalledTimes(1);
  });
  it('rejeu : e-mail déjà envoyé, pas de second envoi', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1', newly_paid: false }, error: null }); single.mockResolvedValue({ data: { ...voucher, email_sent_at: '2026-11-27T10:00:00Z' } });
    const res = await POST(signed(completed())); expect(res.status).toBe(200); expect(sendVoucherEmail).not.toHaveBeenCalled();
  });
  it('paiement non encaissé : on n’attribue rien', async () => {
    const res = await POST(signed(completed({ payment_status: 'unpaid' }))); expect(res.status).toBe(200); expect(rpc).not.toHaveBeenCalled();
  });
  it('échec d’envoi : 500 pour que Stripe rejoue (le paiement reste enregistré)', async () => {
    rpc.mockResolvedValue({ data: { id: 'v1', newly_paid: true }, error: null }); single.mockResolvedValue({ data: voucher }); sendVoucherEmail.mockResolvedValue('failed');
    expect((await POST(signed(completed()))).status).toBe(500);
  });
  it('montant incohérent : pas de bon délivré', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0095' } });
    const res = await POST(signed(completed({ amount_total: 100 }))); expect(res.status).toBe(200); expect(sendVoucherEmail).not.toHaveBeenCalled();
  });
});
