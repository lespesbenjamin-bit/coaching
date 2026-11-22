import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { bookingAction } from '@/lib/validation';
import { canTransition, type BookingStatus } from '@/lib/booking-rules';
import { sendBookingEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
const TARGET: Record<string, BookingStatus> = { confirm: 'confirmed', refuse: 'refused', cancel: 'cancelled', complete: 'completed' };
const MAIL: Record<string, 'confirmed' | 'refused' | 'cancelled'> = { confirm: 'confirmed', refuse: 'refused', cancel: 'cancelled' };

export async function POST(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const parsed = bookingAction.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  const { id, action, note } = parsed.data;
  const supa = serviceClient();

  const { data: cur } = await supa.from('bookings')
    .select('id,status,participants,price_total_cents,customers(first_name,last_name,email,phone),sessions(starts_at,ends_at,course_types(label))')
    .eq('id', id).single();
  if (!cur) return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });

  if (action === 'note') {
    await supa.from('bookings').update({ admin_note: note ?? null }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  const to = TARGET[action];
  if (!canTransition(cur.status as BookingStatus, to)) return NextResponse.json({ error: 'Changement de statut impossible' }, { status: 409 });

  // mise à jour conditionnelle : évite deux décisions simultanées contradictoires
  const { data: upd } = await supa.from('bookings').update({ status: to }).eq('id', id).eq('status', cur.status).select('id');
  if (!upd?.length) return NextResponse.json({ error: 'La réservation a déjà été modifiée' }, { status: 409 });
  // crédits : recalcul idempotent (sans effet si le joueur n'a aucun pack). Annulation par le coach = jamais de crédit perdu.
  await supa.rpc('sync_booking_credit', { p_booking: id });

  let emails = 'none';
  if (MAIL[action]) {
    const f = cur as any;
    emails = await sendBookingEmail(MAIL[action], {
      booking: { id: f.id, participants: f.participants, price_total_cents: f.price_total_cents },
      session: { starts_at: f.sessions.starts_at, ends_at: f.sessions.ends_at, course_label: f.sessions.course_types.label },
      customer: f.customers,
    });
  }
  return NextResponse.json({ ok: true, status: to, emails });
}
