import { z } from 'zod';

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').trim();
const text = (min: number, max: number) => z.string().transform(clean).pipe(z.string().min(min).max(max));

export const bookingInput = z.object({
  sessionId: z.string().uuid(),
  firstName: text(1, 60),
  lastName: text(1, 60),
  email: z.string().transform(clean).pipe(z.string().email().max(120)),
  phone: text(6, 25).pipe(z.string().regex(/^[0-9 +().-]+$/, 'Téléphone invalide')),
  level: text(0, 40).optional(),
  comment: text(0, 500).optional(),
  participants: z.number().int().min(1).max(8).default(1),
  idempotencyKey: z.string().min(16).max(80),
  website: z.string().max(0).optional(),   // champ piège anti-robots (doit rester vide)
});
export type BookingInput = z.infer<typeof bookingInput>;

export const sessionInput = z.object({
  courseCode: z.enum(['individuel', 'duo', 'collectif']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(15).max(240),
  bookingMode: z.enum(['auto', 'manual']),
  courtSecured: z.boolean(),
  capacity: z.number().int().min(1).max(12),
  priceCents: z.number().int().min(0).max(100000).optional(),
  weeks: z.number().int().min(1).max(26).default(1),   // récurrence hebdomadaire
});

export const bookingAction = z.object({
  id: z.string().uuid(),
  action: z.enum(['confirm', 'refuse', 'cancel', 'complete', 'note']),
  note: z.string().max(1000).optional(),
});
