'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { guard, go } from '@/lib/backoffice';
import { newCode, sendVoucherEmail, normalizeCode, type Voucher } from '@/lib/vouchers';

const to = '/admin/bons-cadeaux';
const COLS = 'id,code,label,credits,amount_cents,status,buyer_name,buyer_email,recipient_name,message,expires_at,email_sent_at';
const origin = async () => { const h = await headers(); return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`; };

export async function createManualVoucher(fd: FormData) {
  const svc = await guard();
  const p = z.object({ product: z.string().min(1), buyer_name: z.string().trim().min(2).max(80), buyer_email: z.string().trim().toLowerCase().email().max(120), recipient_name: z.string().trim().max(80), message: z.string().trim().max(400) }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return go(to, undefined, 'Champs invalides');
  let id: string | null = null;
  for (let i = 0; i < 3 && !id; i++) { const { data, error } = await svc.rpc('create_voucher', { p_product: p.data.product, p_code: newCode(), p_buyer_name: p.data.buyer_name, p_buyer_email: p.data.buyer_email, p_recipient: p.data.recipient_name, p_message: p.data.message, p_manual: true }); if (!error) id = data; else if (error.code !== '23505') break; }
  if (!id) return go(to, undefined, 'Création impossible');
  let msg = 'Bon créé (payé hors ligne). Téléchargez le PDF ci-dessous.';
  if (fd.get('send') === 'on') { const { data: v } = await svc.from('gift_vouchers').select(COLS).eq('id', id).single(); const r = await sendVoucherEmail(v as Voucher, await origin()); msg = r === 'sent' ? 'Bon créé et envoyé par e-mail.' : 'Bon créé, mais l’e-mail n’est pas parti (non configuré ou erreur) : téléchargez le PDF.'; }
  revalidatePath(to); return go(to, msg);
}
export async function resendVoucher(fd: FormData) {
  const svc = await guard(); const id = z.string().uuid().safeParse(fd.get('id')); if (!id.success) return go(to, undefined, 'Requête invalide');
  const { data: v } = await svc.from('gift_vouchers').select(COLS).eq('id', id.data).single();
  if (!v || v.status !== 'paid') return go(to, undefined, 'Seul un bon payé et non utilisé peut être renvoyé.');
  const r = await sendVoucherEmail(v as Voucher, await origin(), true);
  return go(to, r === 'sent' ? `PDF renvoyé à ${v.buyer_email}` : undefined, r === 'sent' ? undefined : 'Envoi impossible (e-mail non configuré ou erreur).');
}
export async function cancelVoucher(fd: FormData) {
  const svc = await guard(); const p = z.object({ id: z.string().uuid(), reason: z.string().trim().max(200) }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return go(to, undefined, 'Requête invalide');
  const { error } = await svc.rpc('cancel_voucher', { p_id: p.data.id, p_reason: p.data.reason });
  revalidatePath(to); return go(to, error ? undefined : 'Bon annulé', error ? (error.code === 'P0092' ? 'Ce bon a déjà été utilisé.' : 'Annulation impossible') : undefined);
}
export async function redeemForCustomer(fd: FormData) {
  const svc = await guard(); const p = z.object({ code: z.string().min(8).max(20), customer: z.string().uuid() }).safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return go(to, undefined, 'Choisissez un joueur et saisissez un code');
  const { data, error } = await svc.rpc('redeem_voucher', { p_code: normalizeCode(p.data.code), p_customer: p.data.customer, p_by: null });
  const M: Record<string, string> = { P0091: 'Code inconnu', P0092: 'Bon déjà utilisé', P0093: 'Bon non utilisable', P0094: 'Bon expiré' };
  revalidatePath(to); return go(to, error ? undefined : `${data.credits} crédit(s) ajouté(s) au joueur`, error ? (M[error.code ?? ''] ?? 'Impossible') : undefined);
}
