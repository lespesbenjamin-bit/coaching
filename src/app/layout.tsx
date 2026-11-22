import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.coachpadeltoulouse.fr'),
  title: 'Réserver un cours de padel à Toulouse — Coach Padel Toulouse',
  description: "Réservez un cours de padel individuel, duo ou collectif avec Benjamin Lespes à l'Ace Padel Club de Colomiers, près de Toulouse.",
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b0d0c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="topbar">
          <a href="/" className="brand">Benjamin Lespes<small>COACH PADEL TOULOUSE</small></a>
          <nav><a href="/">Retour au site</a></nav>
        </header>
        {children}
      </body>
    </html>
  );
}
