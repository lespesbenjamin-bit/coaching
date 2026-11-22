import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/auth';

async function login(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const supa = await sessionClient();
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) redirect('/admin/login?e=1');
  if (!(await getAdminUser())) { await supa.auth.signOut(); redirect('/admin/login?e=2'); }
  redirect('/admin/agenda');
}

export const metadata = { title: 'Connexion administrateur', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 420 }}>
      <h1 style={{ fontSize: 28, marginBottom: 18 }}>Espace coach</h1>
      {e && <div className="notice bad">{e === '2' ? 'Ce compte n’a pas accès à l’administration.' : 'Identifiants incorrects.'}</div>}
      <form action={login} className="panel form" style={{ gridTemplateColumns: '1fr' }}>
        <label>E-mail<input name="email" type="email" required autoComplete="username" /></label>
        <label>Mot de passe<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">Se connecter</button>
      </form>
    </div></main>
  );
}
