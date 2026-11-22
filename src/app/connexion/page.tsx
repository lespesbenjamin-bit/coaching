import type { Metadata } from 'next';
import ConnexionForm from './ConnexionForm';

export const metadata: Metadata = {
  title: 'Espace joueur — Connexion',
  description: 'Connectez-vous à votre espace joueur : séances, comptes rendus, objectifs et tournois.',
  robots: { index: false, follow: false },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string; m?: string }> }) {
  const { e, m } = await searchParams;
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 460 }}>
      <div className="eyebrow" style={{ color: 'var(--black)' }}>Espace joueur</div>
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Connexion</h1>
      {e === 'callback' && <div className="notice bad">La connexion n’a pas abouti. Réessayez.</div>}
      {m === 'verifie' && <div className="notice ok">Compte confirmé. Vous pouvez vous connecter.</div>}
      <ConnexionForm />
      <p className="muted" style={{ marginTop: 18 }}>Vous êtes le coach ? <a href="/admin/login">Accès coach</a></p>
    </div></main>
  );
}
