import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseUrl } from './url';
import type { CookieOptions } from '@supabase/ssr';

/** Client lié à la session de l'utilisateur connecté (cookies). */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Component */ }
        },
      },
    },
  );
}
