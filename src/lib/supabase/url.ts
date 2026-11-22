/** Ne garde que l'origine (https://xxxx.supabase.co) : tolère "/" final, "/rest/v1", espaces. */
export function supabaseUrl(raw = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  const v = (raw ?? '').trim();
  if (!v) return '';
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin; } catch { return v; }
}
