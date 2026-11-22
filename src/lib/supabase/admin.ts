import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './url';

/** Client à privilèges complets : UNIQUEMENT côté serveur, jamais exposé au navigateur. */
export function serviceClient() {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
