'use client';
import { useEffect, useRef, useState } from 'react';
import VoucherCard from '@/components/bc/VoucherCard';

export type Product = { code: string; label: string; description: string | null; credits: number; price_cents: number; validity_days: number; promo: string | null };
type Draft = { product: string; recipient: string; message: string; name: string; email: string };
type Errors = Partial<Record<'product' | 'recipient' | 'message' | 'name' | 'email' | 'accept', string>>;

const eur = (c: number) => `${(c / 100).toLocaleString('fr-FR')} €`;
const STEPS = ['Formule', 'Personnalisation', 'Coordonnées', 'Paiement'];
const SUGGESTIONS = ['Joyeux anniversaire !', 'Joyeux Noël !', 'À toi de jouer !', 'Pour de beaux moments sur le terrain.'];
const TIERS: Record<string, { name: string; title: string; text: string; icon: 'one' | 'group' | 'gift' }> = {
  single: { name: 'Découverte', title: '1 cours individuel', text: 'Un cours personnalisé avec Benjamin Lespes.', icon: 'one' },
  technique: { name: 'Perfectionnement', title: '3 cours individuels', text: 'Un accompagnement pour travailler un geste technique précis.', icon: 'group' },
  pack5: { name: 'Progression', title: '5 cours individuels', text: 'Un accompagnement pour progresser sur plusieurs séances.', icon: 'gift' },
};
const tier = (p: Product) => TIERS[p.code] ?? { name: p.label, title: `${p.credits} cours individuel${p.credits > 1 ? 's' : ''}`, text: p.description ?? '', icon: 'one' as const };
const KEY = 'bc-draft-v1';
const ICON: Record<string, string> = { one: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0', group: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 10a2.5 2.5 0 1 0 0-5M3 20a6 6 0 0 1 12 0M16 14a5 5 0 0 1 5 5', gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z' };

export default function Configurator({ products, paymentEnabled, cancelled, initialProduct, campaign }: { products: Product[]; paymentEnabled: boolean; cancelled: boolean; initialProduct?: string; campaign?: string }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ product: initialProduct ?? products[0].code, recipient: '', message: '', name: '', email: '' });
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false); const [apiError, setApiError] = useState('');
  const sending = useRef(false); const heading = useRef<HTMLHeadingElement>(null); const first = useRef(true);

  // Les informations saisies survivent à un retour depuis la page de paiement (stockage de session, jamais de données bancaires)
  useEffect(() => {
    try { const s = sessionStorage.getItem(KEY); if (s) { const v = JSON.parse(s) as Draft; if (products.some(p => p.code === v.product)) { setD(initialProduct && !cancelled ? { ...v, product: initialProduct } : v); if (cancelled) setStep(3); } } } catch { /* ignoré */ }
  }, [products, cancelled]);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignoré */ } }, [d]);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus({ preventScroll: true }); }, [step]);

  const p = products.find(x => x.code === d.product)!; const t = tier(p);
  const months = Math.round(p.validity_days / 30.4);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD(o => ({ ...o, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0 && !products.some(x => x.code === d.product)) e.product = 'Choisissez une formule.';
    if (s === 1) { if (d.recipient.length > 80) e.recipient = '80 caractères maximum.'; if (d.message.length > 400) e.message = '400 caractères maximum.'; }
    if (s === 2) {
      if (d.name.trim().length < 2) e.name = 'Indiquez votre nom (2 caractères minimum).';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim()) || d.email.length > 120) e.email = 'Saisissez une adresse e-mail valide, par exemple prenom@exemple.fr.';
    }
    if (s === 3 && !accept) e.accept = 'Veuillez accepter les conditions pour continuer.';
    return e;
  }
  function go(to: number) { if (to > step) { for (let s = step; s < to; s++) { const e = validate(s); if (Object.keys(e).length) { setErrors(e); setStep(s); return; } } } setErrors({}); setApiError(''); setStep(to); }
  async function pay() {
    if (sending.current) return;                            // empêche la double soumission
    const e = { ...validate(0), ...validate(1), ...validate(2), ...validate(3) }; if (Object.keys(e).length) { setErrors(e); if (e.name || e.email) setStep(2); return; }
    sending.current = true; setBusy(true); setApiError('');
    try {
      const r = await fetch('/api/vouchers/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: d.product, buyer_name: d.name.trim(), buyer_email: d.email.trim(), recipient_name: d.recipient.trim(), message: d.message.trim(), accept: true, website: '', ...(campaign ? { campaign } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) { setApiError(j.error ?? 'Une erreur est survenue. Réessayez.'); sending.current = false; setBusy(false); return; }
      window.location.href = j.url;
    } catch { setApiError('Connexion impossible. Vérifiez votre réseau et réessayez.'); sending.current = false; setBusy(false); }
  }

  const preview = <VoucherCard variant="preview" subtitle={t.title} recipient={d.recipient.trim() || undefined} message={d.message.trim() || undefined} validity={`Valable ${months} mois`} />;
  const summary = (
    <dl className="bc-sum">
      <div><dt>Formule</dt><dd>{t.title}</dd></div>
      {d.recipient.trim() && <div><dt>Pour</dt><dd>{d.recipient.trim()}</dd></div>}
      <div><dt>Validité</dt><dd>{months} mois après l’achat</dd></div>
      <div className="bc-sum-total"><dt>Total</dt><dd>{eur(p.price_cents)}</dd></div>
    </dl>
  );
  const last = step === STEPS.length - 1;
  const next = () => (last ? pay() : go(step + 1));

  return (
    <div className="bc-layout">
      <div className="bc-main">
        <ol className="bc-steps" aria-label="Étapes de l’achat">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <button type="button" disabled={i > step} onClick={() => go(i)} aria-label={`Étape ${i + 1} : ${s}${i < step ? ' (terminée, modifier)' : ''}`}>
                <span className="bc-dot">{i < step ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg> : i + 1}</span><span className="bc-steplabel">{s}</span>
              </button>
            </li>))}
        </ol>
        <p className="bc-stepcount" aria-hidden="true">Étape {step + 1} sur {STEPS.length} · {STEPS[step]}</p>

        <details className="bc-mobile-preview"><summary><span>Aperçu et récapitulatif</span><b>{eur(p.price_cents)}</b></summary>{preview}{summary}</details>

        <div className="bc-panel" key={step}>
          {step === 0 && <>
            <h2 tabIndex={-1} ref={heading}>Choisissez votre formule</h2>
            <div className="bc-offers" role="radiogroup" aria-label="Formule">
              {products.map(x => { const tt = tier(x); const on = x.code === d.product; return (
                <label key={x.code} className={`bc-offer${on ? ' is-on' : ''}`}>
                  <input type="radio" name="product" value={x.code} checked={on} onChange={() => set('product', x.code)} />
                  <span className="bc-radio" aria-hidden="true" />
                  {x.promo && <span className="bc-promo">{x.promo}</span>}
                  <svg className="bc-offer-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={ICON[tt.icon]} /></svg>
                  <span className="bc-offer-name">{tt.name}</span>
                  <b className="bc-offer-title">{tt.title}</b>
                  <span className="bc-offer-text">{tt.text}</span>
                  <span className="bc-price">{eur(x.price_cents)}</span>
                </label>); })}
            </div>
            {errors.product && <p className="bc-err" role="alert">{errors.product}</p>}
          </>}

          {step === 1 && <>
            <h2 tabIndex={-1} ref={heading}>Personnalisez votre bon</h2>
            <div className="bc-field"><label htmlFor="bc-rec">Prénom et nom du bénéficiaire <em>(facultatif)</em></label>
              <input id="bc-rec" value={d.recipient} maxLength={80} autoComplete="off" onChange={e => set('recipient', e.target.value)} aria-invalid={!!errors.recipient} aria-describedby={errors.recipient ? 'bc-rec-e' : undefined} />
              {errors.recipient && <p className="bc-err" id="bc-rec-e" role="alert">{errors.recipient}</p>}</div>
            <div className="bc-field"><label htmlFor="bc-msg">Message personnel <em>(facultatif)</em></label>
              <textarea id="bc-msg" rows={4} value={d.message} maxLength={400} onChange={e => set('message', e.target.value)} aria-describedby="bc-count" />
              <div className="bc-count" id="bc-count" aria-live="polite">{d.message.length} / 400</div>
              <div className="bc-chips" role="group" aria-label="Suggestions de messages">{SUGGESTIONS.map(s => <button type="button" key={s} onClick={() => set('message', s)}>{s}</button>)}</div></div>
          </>}

          {step === 2 && <>
            <h2 tabIndex={-1} ref={heading}>Vos coordonnées</h2>
            <div className="bc-form2">
              <div className="bc-field"><label htmlFor="bc-name">Votre nom</label>
                <input id="bc-name" value={d.name} maxLength={80} autoComplete="name" required onChange={e => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'bc-name-e' : undefined} />
                {errors.name && <p className="bc-err" id="bc-name-e" role="alert">{errors.name}</p>}</div>
              <div className="bc-field"><label htmlFor="bc-mail">Votre adresse e-mail</label>
                <input id="bc-mail" type="email" inputMode="email" value={d.email} maxLength={120} autoComplete="email" required onChange={e => set('email', e.target.value)} aria-invalid={!!errors.email} aria-describedby="bc-mail-h" />
                <p className="bc-hint" id="bc-mail-h">C’est à cette adresse que le bon cadeau PDF vous sera envoyé, une fois le paiement confirmé.</p>
                {errors.email && <p className="bc-err" role="alert">{errors.email}</p>}</div>
            </div>
          </>}

          {step === 3 && <>
            <h2 tabIndex={-1} ref={heading}>Récapitulatif et paiement</h2>
            <dl className="bc-recap">
              <div><dt>Formule</dt><dd>{t.name} — {t.title}</dd></div>
              <div><dt>Nombre de cours</dt><dd>{p.credits}</dd></div>
              {d.recipient.trim() && <div><dt>Bénéficiaire</dt><dd>{d.recipient.trim()}</dd></div>}
              {d.message.trim() && <div><dt>Message</dt><dd>« {d.message.trim()} »</dd></div>}
              <div><dt>Bon envoyé à</dt><dd>{d.email.trim()}</dd></div>
              <div className="bc-sum-total"><dt>Total</dt><dd>{eur(p.price_cents)}</dd></div>
            </dl>
            <ul className="bc-info">
              <li>Bon valable {months} mois à partir de l’achat, pour des cours individuels avec Benjamin Lespes à l’Ace Padel Club de Colomiers.</li>
              <li>Le bon PDF est envoyé par e-mail une fois le paiement confirmé par notre prestataire.</li>
              <li>Le paiement est sécurisé : vos coordonnées bancaires ne transitent jamais par ce site.</li>
            </ul>
            <details className="bc-terms"><summary>Conditions du bon cadeau</summary><ul>
              <li>Les cours se réservent selon les disponibilités, avec le code du bon, depuis l’espace joueur ou directement auprès du coach.</li>
              <li>Le bon n’est ni échangeable contre de l’argent ni prolongeable. Un code ne peut être utilisé qu’une fois.</li>
              <li>Le droit de rétractation s’exerce conformément à la loi ; pour toute demande, écrivez au coach.</li></ul></details>
            <label className="bc-check"><input type="checkbox" checked={accept} onChange={e => { setAccept(e.target.checked); setErrors(o => ({ ...o, accept: undefined })); }} aria-describedby={errors.accept ? 'bc-acc-e' : undefined} /><span>J’ai lu et j’accepte les conditions du bon cadeau.</span></label>
            {errors.accept && <p className="bc-err" id="bc-acc-e" role="alert">{errors.accept}</p>}
            {apiError && <div className="bc-notice bc-notice--bad" role="alert">{apiError}</div>}
            {!paymentEnabled && <div className="bc-notice" role="status">Le paiement en ligne n’est pas encore ouvert.</div>}
          </>}

          <div className="bc-actions">
            {step > 0 ? <button type="button" className="bc-btn bc-btn--ghost" onClick={() => go(step - 1)} disabled={busy}>Retour</button> : <span />}
            <button type="button" className="bc-btn bc-btn--primary bc-btn--lg bc-desktop-only" onClick={next} disabled={busy || (last && !paymentEnabled)}>
              {last ? (busy ? 'Redirection vers le paiement…' : 'Payer et recevoir mon bon cadeau') : 'Continuer'}
            </button>
          </div>
        </div>
      </div>

      <aside className="bc-aside" aria-label="Aperçu de votre bon cadeau">
        <h2 className="bc-aside-title">Aperçu de votre bon cadeau</h2>
        {preview}{summary}
        <p className="bc-fine">Aperçu indicatif : le code personnel figure uniquement sur le bon PDF reçu après paiement.</p>
      </aside>

      <div className="bc-bar" role="region" aria-label="Montant et validation">
        <div><small>Total</small><b>{eur(p.price_cents)}</b></div>
        <button type="button" className="bc-btn bc-btn--primary" onClick={next} disabled={busy || (last && !paymentEnabled)}>{last ? (busy ? 'Redirection…' : 'Payer') : 'Continuer'}</button>
      </div>
    </div>
  );
}
