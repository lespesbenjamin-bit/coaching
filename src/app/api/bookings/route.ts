import { NextResponse } from 'next/server';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { bookingInput } from '@/lib/validation';
import { tooManyAttempts } from '@/lib/rate-limit';
import { sendBookingEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, [number, string]> = {
  P0001: [409, "Ce créneau n'est plus disponible."],
  P0002: [400, 'Nombre de participants invalide.'],
  P0003: [409, "Il n'y a plus assez de places sur ce créneau."],
};

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Réservation momentanément indisponible.' }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 }); }
  const parsed = bookingInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Merci de vérifier les champs du formulaire.' }, { status: 400 });
  const b = parsed.data;
  if (b.website) return NextResponse.json({ ok: true }, { status: 200 });   // robot : réponse neutre

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (await tooManyAttempts(ip)) return NextResponse.json({ error: 'Trop de tentatives, réessayez dans quelques minutes.' }, { status: 429 });

  const supa = serviceClient();
  const { data, error } = await supa.rpc('create_booking', {
    p_session_id: b.sessionId, p_first: b.firstName, p_last: b.lastName, p_email: b.email, p_phone: b.phone,
    p_level: b.level ?? null, p_comment: b.comment ?? null, p_participants: b.participants, p_idempotency_key: b.idempotencyKey,
  });
  if (error) {
    const known = ERRORS[error.code ?? ''];
    if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
    return NextResponse.json({ error: 'Une erreur est survenue, réessayez.' }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  const bookingId: string = row.booking_id;
  const status: string = row.booking_status;

  // E-mails (n'empêchent jamais la réservation d'aboutir)
  const { data: full } = await supa.from('bookings')
    .select('id,participants,price_total_cents,customers(first_name,last_name,email,phone),sessions(starts_at,ends_at,course_types(label))')
    .eq('id', bookingId).single();
  let emails: string = 'not_attempted';
  if (full) {
    const f = full as any;
    const ctx = {
      booking: { id: f.id, participants: f.participants, price_total_cents: f.price_total_cents },
      session: { starts_at: f.sessions.starts_at, ends_at: f.sessions.ends_at, course_label: f.sessions.course_types.label },
      customer: f.customers,
    };
    emails = await sendBookingEmail(status === 'confirmed' ? 'confirmed' : 'received', ctx);
    await sendBookingEmail('admin_new', ctx);
  }
  return NextResponse.json({ ok: true, bookingId, status, emails });
}
