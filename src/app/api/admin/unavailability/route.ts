import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { parisToUtcIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';
const input = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/).default('00:00'),
  allDay: z.boolean().default(false), reason: z.string().trim().max(120).optional(), force: z.boolean().default(false),
});
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

export async function POST(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const p = input.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  const d = p.data;
  const starts = parisToUtcIso(d.startDate, d.allDay ? '00:00' : d.startTime);
  const ends = parisToUtcIso(d.allDay ? nextDay(d.endDate) : d.endDate, d.allDay ? '00:00' : d.endTime);
  if (new Date(ends) <= new Date(starts)) return NextResponse.json({ error: 'La fin doit être après le début.' }, { status: 400 });
  const supa = serviceClient();
  // séances déjà planifiées sur la plage : signalées, jamais annulées automatiquement
  const { data: clash } = await supa.from('sessions').select('id,starts_at,title,course_types(label),bookings(status)')
    .lt('starts_at', ends).gt('ends_at', starts).neq('status', 'cancelled');
  const list = (clash ?? []) as any[];
  if (list.length > 0 && !d.force) {
    const booked = list.filter(s => (s.bookings ?? []).some((b: any) => ['pending', 'confirmed'].includes(b.status))).length;
    return NextResponse.json({ error: 'conflict', count: list.length, booked }, { status: 409 });
  }
  const { error } = await supa.from('calendar_exceptions').insert({ starts_at: starts, ends_at: ends, reason: d.reason || null });
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  return NextResponse.json({ ok: true, conflicts: list.length });
}

export async function DELETE(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  const { error } = await serviceClient().from('calendar_exceptions').delete().eq('id', id);
  return error ? NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) : NextResponse.json({ ok: true });
}
