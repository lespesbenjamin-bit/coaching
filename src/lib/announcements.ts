import { z } from 'zod';

export const THEMES = { volt: 'Jaune (mise en avant)', dark: 'Noir', paper: 'Clair' } as const;
const opt = (max: number) => z.string().trim().max(max).transform(s => s || null);
const url = z.string().trim().max(300).regex(/^(https:\/\/|\/)[^\s]*$/, 'Lien : https://… ou /page').transform(s => s || null).or(z.literal('').transform(() => null));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).transform(s => s || null);

export const announcementInput = z.object({
  kicker: opt(30), title: z.string().trim().min(1).max(80), body: opt(240), price_label: opt(40),
  cta_label: opt(30), cta_url: url, theme: z.enum(['volt', 'dark', 'paper']), starts_on: day, ends_on: day, sort: z.coerce.number().int().min(0).max(999).default(0),
}).refine(v => (v.cta_label === null) === (v.cta_url === null), { message: 'Renseignez le texte ET le lien du bouton, ou aucun des deux.' })
  .refine(v => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { message: 'La date de fin précède la date de début.' });

export type Announcement = { id: string; kicker: string | null; title: string; body: string | null; price_label: string | null; cta_label: string | null; cta_url: string | null; theme: string; starts_on: string | null; ends_on: string | null; active: boolean; sort: number };

export const parisToday = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(now);
export function announcementState(a: Pick<Announcement, 'active' | 'starts_on' | 'ends_on'>, today = parisToday()): 'live' | 'scheduled' | 'expired' | 'off' {
  if (!a.active) return 'off';
  if (a.starts_on && a.starts_on > today) return 'scheduled';
  if (a.ends_on && a.ends_on < today) return 'expired';
  return 'live';
}
