import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabaseUrl } from './lib/supabase/url';

/** Première barrière : pas de session => login. La vérification "est admin" est refaite côté serveur dans chaque page et API. */
export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/admin/login') return NextResponse.next();
  const url = supabaseUrl(), anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const toLogin = () => NextResponse.redirect(new URL(req.nextUrl.pathname.startsWith('/admin') ? '/admin/login' : '/connexion', req.url));
  if (!url || !anon) return toLogin();
  let res = NextResponse.next({ request: req });
  const supa = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options?: any }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supa.auth.getUser();
  return data.user ? res : toLogin();
}
export const config = { matcher: ['/admin/:path*', '/mon-espace/:path*'] };
