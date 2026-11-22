import 'server-only';
import { Resend } from 'resend';
import { serviceClient } from '../supabase/admin';
import { formatDay, formatTime, euros } from '../dates';

export type EmailKind = 'received' | 'confirmed' | 'refused' | 'cancelled' | 'admin_new';

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

type Ctx = {
  booking: { id: string; participants: number; price_total_cents: number };
  session: { starts_at: string; ends_at: string; course_label: string };
  customer: { first_name: string; last_name: string; email: string; phone: string };
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function content(kind: EmailKind, c: Ctx) {
  const when = `${formatDay(c.session.starts_at)} à ${formatTime(c.session.starts_at)}`;
  const recap = `<p><b>${esc(c.session.course_label)}</b><br>${when}<br>${euros(c.booking.price_total_cents)}</p>`;
  const name = esc(c.customer.first_name);
  switch (kind) {
    case 'received': return { to: c.customer.email, subject: 'Demande de cours reçue — en attente de validation',
      html: `<p>Bonjour ${name},</p><p>J'ai bien reçu votre demande. <b>Elle n'est pas encore confirmée</b> : je vérifie la disponibilité du terrain et je reviens vers vous rapidement.</p>${recap}<p>Benjamin — Coach Padel Toulouse</p>` };
    case 'confirmed': return { to: c.customer.email, subject: 'Votre cours est confirmé',
      html: `<p>Bonjour ${name},</p><p>Votre cours est <b>confirmé</b>.</p>${recap}<p>À bientôt sur le court !<br>Benjamin — Coach Padel Toulouse</p>` };
    case 'refused': return { to: c.customer.email, subject: 'Votre demande de cours',
      html: `<p>Bonjour ${name},</p><p>Je ne peux malheureusement pas confirmer ce créneau.</p>${recap}<p>N'hésitez pas à en choisir un autre sur le site.<br>Benjamin</p>` };
    case 'cancelled': return { to: c.customer.email, subject: 'Votre cours est annulé',
      html: `<p>Bonjour ${name},</p><p>Votre réservation est <b>annulée</b>.</p>${recap}<p>Benjamin — Coach Padel Toulouse</p>` };
    case 'admin_new': return { to: process.env.ADMIN_NOTIFY_EMAIL!, subject: `Nouvelle demande : ${c.session.course_label}`,
      html: `<p>Nouvelle réservation de ${esc(c.customer.first_name)} ${esc(c.customer.last_name)} (${esc(c.customer.email)}, ${esc(c.customer.phone)}).</p>${recap}<p>À traiter dans /admin/agenda</p>` };
  }
}

/** Envoie un e-mail une seule fois par (réservation, type) : le journal empêche les doublons. */
export async function sendBookingEmail(kind: EmailKind, c: Ctx): Promise<'sent' | 'skipped' | 'not_configured' | 'failed'> {
  if (!emailConfigured()) return 'not_configured';
  if (kind === 'admin_new' && !process.env.ADMIN_NOTIFY_EMAIL) return 'not_configured';
  const supa = serviceClient();
  const key = `${c.booking.id}:${kind}`;
  const { error: dup } = await supa.from('email_log').insert({ booking_id: c.booking.id, kind, idempotency_key: key, status: 'pending' });
  if (dup) return 'skipped';                           // clé déjà présente : déjà envoyé ou en cours
  try {
    const m = content(kind, c);
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send(
      { from: process.env.EMAIL_FROM!, to: m.to, subject: m.subject, html: m.html }, { idempotencyKey: key });
    if (error) throw new Error(error.message);
    await supa.from('email_log').update({ status: 'sent' }).eq('idempotency_key', key);
    return 'sent';
  } catch {
    await supa.from('email_log').delete().eq('idempotency_key', key);   // permet une nouvelle tentative
    return 'failed';
  }
}
