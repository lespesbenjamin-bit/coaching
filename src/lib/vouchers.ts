import 'server-only';
import { randomInt } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { Resend } from 'resend';
import { serviceClient } from './supabase/admin';
import { euros } from './dates';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';        // sans 0/O/1/I : pas d'ambiguïté à la lecture
export const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const formatCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type Voucher = {
  id: string; code: string; label: string; credits: number; amount_cents: number; status: string; buyer_name: string; buyer_email: string;
  recipient_name: string | null; message: string | null; expires_at: string | null; email_sent_at: string | null;
};

/** pdf-lib n'encode que le jeu WinAnsi : on retire ce qu'il ne sait pas écrire (emoji…) plutôt que d'échouer. */
function safe(s: string, font: PDFFont) {
  let out = '';
  for (const ch of s.replace(/\s+/g, ' ')) { try { font.encodeText(ch); out += ch; } catch { /* caractère ignoré */ } }
  return out;
}
function wrap(text: string, font: PDFFont, size: number, max: number) {
  const lines: string[] = []; let cur = '';
  for (const w of text.split(' ')) { const t = cur ? `${cur} ${w}` : w; if (font.widthOfTextAtSize(t, size) > max && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}

export async function buildVoucherPdf(v: Voucher, origin: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]);               // A4 portrait
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold); const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.043, 0.051, 0.047), volt = rgb(0.851, 1, 0.247), grey = rgb(0.43, 0.44, 0.41), W = 595;
  const center = (t: string, y: number, size: number, f: PDFFont, color = ink) => { const s = safe(t, f); page.drawText(s, { x: (W - f.widthOfTextAtSize(s, size)) / 2, y, size, font: f, color }); };

  page.drawRectangle({ x: 0, y: 612, width: W, height: 230, color: ink });
  center('COACH PADEL TOULOUSE', 790, 11, bold, volt);
  center('BON CADEAU', 725, 54, bold, rgb(1, 1, 1));
  center('Benjamin Lespes - Ace Padel Club, Colomiers', 650, 12, reg, rgb(0.8, 0.8, 0.78));
  page.drawRectangle({ x: 0, y: 604, width: W, height: 8, color: volt });

  center(v.label, 540, 22, bold);
  center(`${v.credits} cours individuel${v.credits > 1 ? 's' : ''} de padel`, 512, 13, reg, grey);
  let y = 460;
  if (v.recipient_name) { center('Offert à', y, 11, reg, grey); center(v.recipient_name, y - 24, 22, bold); y -= 62; }
  center(`De la part de ${v.buyer_name}`, y, 13, reg); y -= 30;
  if (v.message) { for (const l of wrap(safe(v.message, reg), reg, 12, 400).slice(0, 6)) { center(l, y, 12, reg, grey); y -= 18; } y -= 10; }

  const boxY = Math.min(y - 90, 250);
  page.drawRectangle({ x: 110, y: boxY, width: 375, height: 80, color: rgb(0.957, 0.957, 0.945), borderColor: ink, borderWidth: 1.5 });
  center('VOTRE CODE', boxY + 58, 10, bold, grey);
  center(formatCode(v.code), boxY + 22, 30, bold);
  center(v.expires_at ? `Valable jusqu'au ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(v.expires_at))}` : 'Valable 12 mois', boxY - 28, 12, bold);
  center('Pour utiliser ce bon : connectez-vous sur', boxY - 60, 11, reg, grey);
  center(`${origin.replace(/^https?:\/\//, '')}/bon-cadeau/utiliser`, boxY - 76, 12, bold);
  center('ou donnez simplement ce code a Benjamin avant votre premier cours.', boxY - 94, 11, reg, grey);
  center(`Valeur : ${euros(v.amount_cents)} - non remboursable, non echangeable contre de l'argent.`, 40, 9, reg, grey);
  return pdf.save();
}

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Envoie le bon (PDF) à l'acheteur. Marque email_sent_at ; sans effet si déjà envoyé. */
export async function sendVoucherEmail(v: Voucher, origin: string, force = false): Promise<'sent' | 'already' | 'not_configured' | 'failed'> {
  if (!emailConfigured()) return 'not_configured';
  if (v.email_sent_at && !force) return 'already';
  try {
    const pdf = await buildVoucherPdf(v, origin); const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM!, to: v.buyer_email, subject: 'Votre bon cadeau Coach Padel Toulouse',
      html: `<p>Bonjour ${esc(v.buyer_name)},</p><p>Merci pour votre achat ! Vous trouverez en pièce jointe votre bon cadeau : <b>${esc(v.label)}</b>.</p><p>Il suffit de l'imprimer ou de le transférer à la personne que vous souhaitez gâter. Le code est valable jusqu'à la date indiquée sur le bon.</p><p>Benjamin — Coach Padel Toulouse</p>`,
      attachments: [{ filename: `bon-cadeau-${v.code}.pdf`, content: Buffer.from(pdf) }],
    }, { idempotencyKey: `voucher:${v.id}${force ? ':' + Date.now() : ''}` });
    if (error) throw new Error(error.message);
    await serviceClient().from('gift_vouchers').update({ email_sent_at: new Date().toISOString() }).eq('id', v.id);
    if (process.env.ADMIN_NOTIFY_EMAIL && !force) await resend.emails.send({ from: process.env.EMAIL_FROM!, to: process.env.ADMIN_NOTIFY_EMAIL, subject: `Bon cadeau vendu : ${v.label}`,
      html: `<p>${esc(v.buyer_name)} (${esc(v.buyer_email)}) vient d'acheter <b>${esc(v.label)}</b> (${euros(v.amount_cents)}).</p><p>Suivi : /admin/bons-cadeaux</p>` }).catch(() => undefined);
    return 'sent';
  } catch { return 'failed'; }
}
