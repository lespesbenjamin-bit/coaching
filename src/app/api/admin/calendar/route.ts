import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const D = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const sp = new URL(req.url).searchParams; const from = sp.get('from'); const to = sp.get('to');
  if (!from || !to || !D.test(from) || !D.test(to)) return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
  const a = new Date(`${from}T00:00:00Z`).getTime() - 86400000; const b = new Date(`${to}T00:00:00Z`).getTime() + 2 * 86400000;
  const { data, error } = await serviceClient().from('sessions')
    .select('id,starts_at,ends_at,status,capacity,booking_mode,court_secured,visibility,title,group_id,price_per_person_cents,course_types(label,code),bookings(status,participants)')
    .gte('starts_at', new Date(a).toISOString()).lte('starts_at', new Date(b).toISOString()).neq('status', 'cancelled').order('starts_at').limit(600);
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  const sessions = (data ?? []).map((s: any) => ({
    id: s.id, startsAt: s.starts_at, endsAt: s.ends_at, status: s.status, capacity: s.capacity, mode: s.booking_mode, secured: s.court_secured,
    visibility: s.visibility, title: s.title ?? s.course_types?.label, course: s.course_types?.code, price: s.price_per_person_cents, groupId: s.group_id,
    taken: (s.bookings ?? []).filter((x: any) => ['pending', 'confirmed'].includes(x.status)).reduce((n: number, x: any) => n + x.participants, 0),
    pending: (s.bookings ?? []).filter((x: any) => x.status === 'pending').length,
  }));
  return NextResponse.json({ sessions });
}
