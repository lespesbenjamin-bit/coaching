import type { Metadata } from 'next';
import ReservationApp from './ReservationApp';

export const metadata: Metadata = {
  title: 'Réserver un cours de padel à Toulouse — Coach Padel Toulouse',
  description: "Cours de padel individuel, duo ou collectif à l'Ace Padel Club de Colomiers : choisissez votre créneau et réservez en ligne.",
  alternates: { canonical: '/reservation' },
};

export default function Page() {
  return (
    <>
      <section className="hero"><div className="wrap">
        <div className="eyebrow">Ace Padel Club · Colomiers</div>
        <h1>Réserver un cours</h1>
        <p>Choisissez votre formule, un créneau, et envoyez votre demande. Un créneau « confirmation immédiate » est validé tout de suite ; les autres sont confirmés après vérification du terrain.</p>
      </div></section>
      <main className="main"><div className="wrap"><ReservationApp /></div></main>
    </>
  );
}
