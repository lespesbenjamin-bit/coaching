import { NextResponse } from 'next/server';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    // diagnostic : noms (jamais les valeurs) des variables absentes de cet environnement
    const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k]);
    return NextResponse.json({ error: 'not_configured', missing, vercelEnv: process.env.VERCEL_ENV ?? 'local' }, { status: 503 });
  }
  const { searchParams } = new URL(req.url);
  const course = searchParams.get('course');
  let q = serviceClient().from('public_slots')
    .select('id,course_code,course_label,starts_at,ends_at,booking_mode,court_secured,capacity,seats_left,price_per_person_cents')
    .order('starts_at').limit(500);
  if (course && ['individuel', 'duo', 'collectif'].includes(course)) q = q.eq('course_code', course);
  const [{ data, error }, { data: types }] = await Promise.all([
    q,
    serviceClient().from('course_types').select('code,label,min_participants,max_participants,default_duration_min,price_per_person_cents').eq('active', true),
  ]);
  if (error) return NextResponse.json({ error: 'server_error' }, { status: 500 });
  return NextResponse.json({ slots: data, types: types ?? [] });
}
