import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { sessionInput } from '@/lib/validation';
import { parisToUtcIso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const parsed = sessionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  const s = parsed.data;
  const supa = serviceClient();
  const { data: type } = await supa.from('course_types').select('id,price_per_person_cents').eq('code', s.courseCode).single();
  if (!type) return NextResponse.json({ error: 'Type de cours inconnu' }, { status: 400 });

  const rows = Array.from({ length: s.weeks }, (_, i) => {
    const d = new Date(`${s.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7 * i);
    const date = d.toISOString().slice(0, 10);
    const starts = parisToUtcIso(date, s.time);
    return {
      course_type_id: type.id, starts_at: starts,
      ends_at: new Date(new Date(starts).getTime() + s.durationMin * 60000).toISOString(),
      booking_mode: s.bookingMode, court_secured: s.courtSecured, capacity: s.capacity,
      price_per_person_cents: s.priceCents ?? type.price_per_person_cents,
    };
  });
  const { error } = await supa.from('sessions').insert(rows);
  if (error) {
    const overlap = error.code === '23P01';
    return NextResponse.json({ error: overlap ? 'Conflit avec un autre créneau ou une indisponibilité.' : 'Erreur serveur' }, { status: overlap ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, created: rows.length });
}

export async function DELETE(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  const supa = serviceClient();
  const { count } = await supa.from('bookings').select('id', { count: 'exact', head: true })
    .eq('session_id', id).in('status', ['pending', 'confirmed']);
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Des réservations actives existent : annulez-les d’abord.' }, { status: 409 });
  const { error } = await supa.from('sessions').update({ status: 'cancelled' }).eq('id', id);
  return error ? NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }) : NextResponse.json({ ok: true });
}
