import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const input = z.object({ id: z.string().uuid(), kind: z.enum(['impression', 'click']) });

/** Mesure d'audience anonyme et agrégée : un compteur par campagne et par jour. Aucun cookie, aucune IP, aucun identifiant n'est lu ni stocké. */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return new NextResponse(null, { status: 204 });
  if (/bot|crawl|spider|preview|headless/i.test(req.headers.get('user-agent') ?? '')) return new NextResponse(null, { status: 204 });
  let body: unknown; try { body = JSON.parse(await req.text()); } catch { return new NextResponse(null, { status: 400 }); }
  const p = input.safeParse(body); if (!p.success) return new NextResponse(null, { status: 400 });
  await serviceClient().rpc('track_campaign', { p_id: p.data.id, p_kind: p.data.kind });
  return new NextResponse(null, { status: 204 });
}
