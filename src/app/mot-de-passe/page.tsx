import type { Metadata } from 'next';
import MotDePasseForm from './MotDePasseForm';

export const metadata: Metadata = { title: 'Nouveau mot de passe', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 460 }}>
      <div className="eyebrow" style={{ color: 'var(--black)' }}>Espace joueur</div>
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Nouveau mot de passe</h1>
      <MotDePasseForm />
    </div></main>
  );
}
