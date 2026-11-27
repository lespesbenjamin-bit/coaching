import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { redeemMyVoucher } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utiliser mon bon cadeau', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { data } = await (await sessionClient()).auth.getUser(); if (!data.user) redirect('/connexion');
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 520 }}>
      <div className="eyebrow" style={{ color: 'var(--black)' }}>Bon cadeau</div>
      <h1 style={{ fontSize: 30, marginBottom: 12 }}>Utiliser mon bon</h1>
      {sp.ok && <div className="notice ok" role="status">{sp.ok} <a href="/reservation">Réserver un cours</a></div>}
      {sp.err && <div className="notice bad" role="alert">{sp.err}</div>}
      <form action={redeemMyVoucher} className="form">
        <label>Code du bon (indiqué sur le PDF)<input name="code" required minLength={10} maxLength={14} autoCapitalize="characters" autoComplete="off" placeholder="XXXXX-XXXXX" /></label>
        <button className="btn">Ajouter les cours à mon compte</button>
      </form>
      <p className="muted" style={{ marginTop: 14 }}>Les cours du bon sont ajoutés à vos crédits, visibles dans <a href="/mon-espace">votre espace</a>. Un bon ne peut être utilisé qu’une seule fois.</p>
    </div></main>
  );
}
