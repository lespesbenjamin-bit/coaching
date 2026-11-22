import 'server-only';
import { createHash } from 'node:crypto';
import { serviceClient } from './supabase/admin';

/** Limite : 5 tentatives par IP et par 10 minutes. L'IP est hachée (RGPD). */
export async function tooManyAttempts(ip: string) {
  const supa = serviceClient();
  const hash = createHash('sha256').update(ip + (process.env.RATE_LIMIT_SALT ?? 'cpt')).digest('hex');
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await supa.from('booking_attempts').select('id', { count: 'exact', head: true })
    .eq('ip_hash', hash).gte('created_at', since);
  if ((count ?? 0) >= 5) return true;
  await supa.from('booking_attempts').insert({ ip_hash: hash });
  return false;
}
