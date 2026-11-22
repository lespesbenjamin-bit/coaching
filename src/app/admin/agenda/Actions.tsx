'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BookingButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  async function act(action: string) {
    if (action === 'cancel' && !confirm('Annuler cette réservation ? Le client sera prévenu par e-mail.')) return;
    if (action === 'refuse' && !confirm('Refuser cette demande ? Le client sera prévenu par e-mail.')) return;
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg(j.error ?? 'Erreur'); return; }
    if (j.emails === 'not_configured' || j.emails === 'failed') setMsg('Statut mis à jour, mais l’e-mail client n’a pas été envoyé.');
    router.refresh();
  }
  return (
    <div>
      <div className="row-actions">
        {status === 'pending' && <><button className="btn" disabled={busy} onClick={() => act('confirm')}>Accepter</button><button className="btn danger" disabled={busy} onClick={() => act('refuse')}>Refuser</button></>}
        {(status === 'pending' || status === 'confirmed') && <button className="btn ghost" disabled={busy} onClick={() => act('cancel')}>Annuler</button>}
        {status === 'confirmed' && <button className="btn ghost" disabled={busy} onClick={() => act('complete')}>Terminée</button>}
      </div>
      {msg && <div className="muted" style={{ color: 'var(--warn)', marginTop: 4 }}>{msg}</div>}
    </div>
  );
}

export function NoteField({ id, initial }: { id: string; initial: string }) {
  const [v, setV] = useState(initial); const [saved, setSaved] = useState(false);
  async function save() {
    if (v === initial) return;
    const r = await fetch('/api/admin/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'note', note: v }) });
    setSaved(r.ok);
  }
  return <input value={v} onChange={e => { setV(e.target.value); setSaved(false); }} onBlur={save} placeholder="Note interne" maxLength={1000} style={{ padding: 6, fontSize: 13 }} aria-label="Note interne" />;
}

export function DeleteSession({ id }: { id: string }) {
  const router = useRouter();
  async function del() {
    if (!confirm('Supprimer ce créneau ?')) return;
    const r = await fetch(`/api/admin/sessions?id=${id}`, { method: 'DELETE' });
    if (!r.ok) alert((await r.json()).error ?? 'Erreur'); else router.refresh();
  }
  return <button className="btn danger" style={{ padding: '5px 9px', fontSize: 11 }} onClick={del}>Supprimer</button>;
}

export function SessionForm() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setMsg(null);
    const price = String(f.get('price') ?? '').trim();
    const r = await fetch('/api/admin/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      courseCode: f.get('course'), date: f.get('date'), time: f.get('time'), durationMin: Number(f.get('duration')),
      bookingMode: f.get('mode'), courtSecured: f.get('secured') === 'on', capacity: Number(f.get('capacity')),
      priceCents: price ? Math.round(Number(price.replace(',', '.')) * 100) : undefined, weeks: Number(f.get('weeks')) }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) setMsg({ ok: false, t: j.error ?? 'Erreur' }); else { setMsg({ ok: true, t: `${j.created} créneau(x) créé(s)` }); router.refresh(); }
  }
  return (
    <form className="panel form" onSubmit={submit}>
      <h2 className="full" style={{ fontSize: 18 }}>Ajouter un créneau</h2>
      <label>Cours<select name="course"><option value="individuel">Individuel</option><option value="duo">Duo</option><option value="collectif">Collectif</option></select></label>
      <label>Date<input name="date" type="date" required /></label>
      <label>Heure (Paris)<input name="time" type="time" required /></label>
      <label>Durée (min)<input name="duration" type="number" min={15} max={240} step={5} defaultValue={60} required /></label>
      <label>Places max<input name="capacity" type="number" min={1} max={12} defaultValue={1} required /></label>
      <label>Tarif/pers. € (vide = tarif du cours)<input name="price" inputMode="decimal" /></label>
      <label>Mode<select name="mode"><option value="manual">Sur validation</option><option value="auto">Confirmation automatique</option></select></label>
      <label>Répéter chaque semaine pendant<select name="weeks" defaultValue={1}>{[1, 2, 4, 8, 12, 26].map(n => <option key={n} value={n}>{n} semaine{n > 1 ? 's' : ''}</option>)}</select></label>
      <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="secured" style={{ width: 'auto' }} />Le terrain est déjà réservé et sécurisé (requis pour la confirmation automatique)</label>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'bad'} full`}>{msg.t}</div>}
      <div className="full"><button className="btn" disabled={busy}>{busy ? '…' : 'Créer'}</button></div>
    </form>
  );
}
