'use client';
import { useEffect, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';

export default function MotDePasseForm() {
  const [ready, setReady] = useState<'wait' | 'ok' | 'none'>('wait');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supa = browserClient();
    let alive = true;
    // le client lit automatiquement le lien de réinitialisation (jeton dans l'adresse) et ouvre une session
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => { if (alive && s) setReady('ok'); });
    const t = setTimeout(async () => {
      const { data } = await supa.auth.getSession();
      if (alive) setReady(data.session ? 'ok' : 'none');
    }, 1200);
    return () => { alive = false; clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErr(null);
    const f = new FormData(e.currentTarget);
    const p1 = String(f.get('p1')), p2 = String(f.get('p2'));
    if (p1.length < 8) return setErr('8 caractères minimum.');
    if (p1 !== p2) return setErr('Les deux mots de passe ne correspondent pas.');
    setBusy(true);
    const supa = browserClient();
    const { error } = await supa.auth.updateUser({ password: p1 });
    if (error) { setBusy(false); return setErr('Impossible de changer le mot de passe : ' + error.message); }
    await supa.auth.signOut({ scope: 'others' });   // révoque toutes les autres sessions (sécurité)
    location.href = '/mon-espace';
  }

  if (ready === 'wait') return <p className="empty"><span className="spin" /> Vérification du lien…</p>;
  if (ready === 'none') return <div className="notice bad">Ce lien est expiré ou invalide. <a href="/connexion">Refaire une demande</a> depuis « Mot de passe oublié ».</div>;
  return (
    <form className="panel form" style={{ gridTemplateColumns: '1fr' }} onSubmit={submit}>
      <label>Nouveau mot de passe<input name="p1" type="password" required minLength={8} autoComplete="new-password" /></label>
      <label>Confirmer<input name="p2" type="password" required minLength={8} autoComplete="new-password" /></label>
      {err && <div className="notice bad">{err}</div>}
      <button className="btn" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
    </form>
  );
}
