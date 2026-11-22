import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Première barrière : pas de session => login. La vérification "est admin" est refaite côté serveur dans chaque page et API. */
export async function middleware(req: NextRequest) {
  // Accueil : le site vitrine statique (public/index.html) est servi à la racine, URL inchangée.
  if (req.nextUrl.pathname === '/') return NextResponse.rewrite(new URL('/index.html', req.url));
  if (req.nextUrl.pathname === '/admin/login') return NextResponse.next();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const toLogin = () => NextResponse.redirect(new URL('/admin/login', req.url));
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
export const config = { matcher: ['/', '/admin/:path*'] };
