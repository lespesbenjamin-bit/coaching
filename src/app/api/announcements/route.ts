import { NextResponse } from 'next/server';
import { serviceClient, isSupabaseConfigured } from '@/lib/supabase/admin';
import { announcementState, parisToday, type Announcement } from '@/lib/announcements';

export const dynamic = 'force-dynamic';

/** Actualités visibles aujourd'hui (public). Aucune donnée personnelle ; réponse mise en cache 60 s. */
export async function GET() {
  const empty = NextResponse.json({ items: [] }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  if (!isSupabaseConfigured()) return empty;
  const { data, error } = await serviceClient().from('site_announcements').select('id,kicker,title,body,price_label,cta_label,cta_url,theme,starts_on,ends_on,active,sort').eq('active', true).order('sort').order('created_at', { ascending: false }).limit(12);
  if (error || !data) return empty;
  const today = parisToday();
  const items = (data as Announcement[]).filter(a => announcementState(a, today) === 'live').slice(0, 6).map(({ id, kicker, title, body, price_label, cta_label, cta_url, theme }) => ({ id, kicker, title, body, price_label, cta_label, cta_url, theme }));
  return NextResponse.json({ items }, { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } });
}
