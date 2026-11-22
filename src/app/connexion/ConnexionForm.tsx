'use client';
import { useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

export default function ConnexionForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  async function google() {
    setBusy(true); setMsg(null);
    const { error } = await browserClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) { setMsg({ ok: false, t: 'Connexion Google indisponible pour le moment.' }); setBusy(false); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email')).trim(), password = String(f.get('password'));
    const supa = browserClient();
    if (mode === 'in') {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) { setMsg({ ok: false, t: error.message.includes('not confirmed') ? 'Confirmez d’abord votre e-mail (lien reçu).' : 'E-mail ou mot de passe incorrect.' }); setBusy(false); return; }
      location.href = '/mon-espace'; return;
    }
    if (password.length < 8) { setMsg({ ok: false, t: 'Mot de passe : 8 caractères minimum.' }); setBusy(false); return; }
    const { error } = await supa.auth.signUp({ email, password, options: {
      emailRedirectTo: `${location.origin}/auth/callback`,
      data: { first_name: String(f.get('first') ?? '').trim(), last_name: String(f.get('last') ?? '').trim() } } });
    setBusy(false);
    if (error) setMsg({ ok: false, t: 'Création impossible : ' + error.message });
    else setMsg({ ok: true, t: 'Compte créé. Un e-mail de confirmation vient de vous être envoyé : cliquez sur le lien pour activer votre compte.' });
  }

  async function reset() {
    const email = prompt('Votre e-mail :'); if (!email) return;
    await browserClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/mon-espace?tab=profil` });
    setMsg({ ok: true, t: 'Si ce compte existe, un e-mail de réinitialisation a été envoyé.' });
  }

  return (
    <div className="panel">
      <button className="btn ghost" style={{ width: '100%' }} onClick={google} disabled={busy}>Continuer avec Google</button>
      <p className="muted" style={{ textAlign: 'center', margin: '14px 0' }}>ou avec votre e-mail</p>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Se connecter</button>
        <button type="button" className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Créer un compte</button>
      </div>
      <form className="form" style={{ gridTemplateColumns: '1fr' }} onSubmit={submit}>
        {mode === 'up' && <><label>Prénom<input name="first" required maxLength={60} autoComplete="given-name" /></label><label>Nom<input name="last" required maxLength={60} autoComplete="family-name" /></label></>}
        <label>E-mail<input name="email" type="email" required autoComplete="email" /></label>
        <label>Mot de passe<input name="password" type="password" required minLength={mode === 'up' ? 8 : 1} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'}`}>{msg.t}</div>}
        <button className="btn" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Se connecter' : 'Créer mon compte'}</button>
        {mode === 'in' && <button type="button" onClick={reset} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', font: 'inherit', color: 'var(--mid)' }}>Mot de passe oublié ?</button>}
      </form>
    </div>
  );
}
