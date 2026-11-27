'use client';
import { useState } from 'react';

type Product = { code: string; label: string; description: string | null; credits: number; price_cents: number };
const eur = (c: number) => `${(c / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0 })} €`;

export default function Form({ products, enabled }: { products: Product[]; enabled: boolean }) {
  const [product, setProduct] = useState(products[0]?.code ?? '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(''); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/vouchers/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        product, buyer_name: f.get('buyer_name'), buyer_email: f.get('buyer_email'), recipient_name: f.get('recipient_name'), message: f.get('message'), accept: f.get('accept') === 'on', website: f.get('website') ?? '' }) });
      const j = await r.json();
      if (!r.ok || !j.url) { setErr(j.error ?? 'Une erreur est survenue.'); setBusy(false); return; }
      window.location.href = j.url;
    } catch { setErr('Connexion impossible. Réessayez.'); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="form">
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend style={{ fontWeight: 800, marginBottom: 8 }}>1. Choisissez la formule</legend>
        <div className="cards" role="radiogroup" aria-label="Formule">
          {products.map(p => (
            <label key={p.code} className="card" style={{ cursor: 'pointer', outline: product === p.code ? '3px solid var(--black)' : '1px solid var(--line)', display: 'block' }}>
              <input type="radio" name="product" value={p.code} checked={product === p.code} onChange={() => setProduct(p.code)} style={{ marginRight: 8 }} />
              <b>{p.label}</b><div className="price" style={{ fontSize: 26, fontWeight: 800, margin: '6px 0' }}>{eur(p.price_cents)}</div>
              <div className="muted">{p.description}</div></label>))}
        </div></fieldset>
      <h2 style={{ fontSize: 18, margin: '20px 0 8px' }}>2. Pour qui ?</h2>
      <label>Prénom et nom de la personne qui reçoit le bon (facultatif)<input name="recipient_name" maxLength={80} /></label>
      <label>Message personnel (facultatif, 400 caractères)<textarea name="message" maxLength={400} rows={3} /></label>
      <h2 style={{ fontSize: 18, margin: '20px 0 8px' }}>3. Vos coordonnées</h2>
      <label>Votre nom<input name="buyer_name" required minLength={2} maxLength={80} autoComplete="name" /></label>
      <label>Votre e-mail (le bon PDF vous sera envoyé ici)<input name="buyer_email" type="email" required maxLength={120} autoComplete="email" /></label>
      <input name="website" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <details style={{ margin: '12px 0' }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Conditions du bon cadeau</summary>
        <ul className="muted" style={{ lineHeight: 1.6 }}>
          <li>Le bon est valable 12 mois à partir de la date d’achat, pour des cours individuels avec Benjamin Lespes à l’Ace Padel Club de Colomiers.</li>
          <li>Les cours se réservent selon les disponibilités, avec le code du bon, depuis l’espace joueur ou directement auprès du coach.</li>
          <li>Le bon n’est ni échangeable contre de l’argent ni prolongeable. Un code ne peut être utilisé qu’une fois.</li>
          <li>Le droit de rétractation s’exerce conformément à la loi ; pour toute demande, écrivez au coach.</li></ul></details>
      <label style={{ display: 'flex', gap: 8, alignItems: 'start' }}><input name="accept" type="checkbox" required style={{ marginTop: 4 }} />J’ai lu et j’accepte les conditions du bon cadeau.</label>
      {err && <div className="notice bad" role="alert">{err}</div>}
      <button className="btn" disabled={busy || !enabled}>{busy ? 'Redirection vers le paiement…' : 'Payer en ligne'}</button>
      {!enabled && <div className="notice">Le paiement en ligne n’est pas encore ouvert.</div>}
      <p className="muted">Paiement sécurisé par Stripe : vos coordonnées bancaires ne passent jamais par ce site.</p>
    </form>
  );
}
