'use client';
import { useCallback, useEffect, useState } from 'react';
import WeekGrid, { type CalEvent } from '@/components/WeekGrid';
import { dayKey, formatDay, formatTime, euros } from '@/lib/dates';

type S = { id: string; startsAt: string; endsAt: string; status: string; capacity: number; mode: string; secured: boolean; visibility: string; title: string; course: string; price: number; groupId: string | null; taken: number; pending: number };
const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (key: string) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));
const DEFAULT_CAP: Record<string, number> = { individuel: 1, duo: 2, collectif: 4 };
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function tone(s: S): CalEvent['tone'] {
  if (s.status === 'suspended' || s.status === 'blocked') return 'muted';
  if (s.groupId) return 'group';
  if (s.taken >= s.capacity) return 'full';
  if (s.pending > 0) return 'pending';
  return 'open';
}

export default function AdminCalendar() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => dayKey(new Date().toISOString()));
  const [sessions, setSessions] = useState<S[]>([]);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<S | null>(null);
  const [create, setCreate] = useState<{ date: string; time: string } | null>(null);
  const [course, setCourse] = useState('individuel');
  const [busy, setBusy] = useState(false); const [formErr, setFormErr] = useState('');

  const weekStart = mondayOf(anchor); const monthFirst = anchor.slice(0, 7) + '-01';
  const range = view === 'week' ? [weekStart, addDays(weekStart, 6)] : [addDays(mondayOf(monthFirst), 0), addDays(mondayOf(monthFirst), 41)];
  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/calendar?from=${range[0]}&to=${range[1]}`, { cache: 'no-store' });
    if (!r.ok) { setErr('Impossible de charger le calendrier.'); return; }
    setErr(''); setSessions((await r.json()).sessions);
  }, [range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const shift = (n: number) => view === 'week' ? setAnchor(addDays(anchor, 7 * n)) : setAnchor(addDays(monthFirst, n > 0 ? 32 : -1).slice(0, 8) + '01');
  const events: CalEvent[] = sessions.map(s => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, title: s.title, sub: `${s.taken}/${s.capacity}${s.pending ? ` · ${s.pending} à valider` : ''}`, tone: tone(s) }));
  const byDay = sessions.reduce<Record<string, S[]>>((a, s) => { (a[dayKey(s.startsAt)] ??= []).push(s); return a; }, {});
  const cells = Array.from({ length: 42 }, (_, i) => addDays(mondayOf(monthFirst), i));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setFormErr('');
    const price = String(f.get('price') ?? '').trim();
    const r = await fetch('/api/admin/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      courseCode: f.get('course'), date: f.get('date'), time: f.get('time'), durationMin: Number(f.get('duration')), bookingMode: f.get('mode'),
      courtSecured: f.get('secured') === 'on', capacity: Number(f.get('capacity')), priceCents: price ? Math.round(Number(price.replace(',', '.')) * 100) : undefined, weeks: Number(f.get('weeks')) }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setFormErr(j.error ?? 'Erreur'); return; }
    setCreate(null); load();
  }

  return (
    <div>
      <div className="bar nowrap">
        <div className="row-actions"><button className="btn ghost" onClick={() => shift(-1)} aria-label="Précédent">←</button>
          <button className="btn ghost" onClick={() => setAnchor(dayKey(new Date().toISOString()))}>Aujourd’hui</button>
          <button className="btn ghost" onClick={() => shift(1)} aria-label="Suivant">→</button></div>
        <b className="cap">{view === 'week' ? `Semaine du ${formatDay(`${weekStart}T12:00:00Z`)}` : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthFirst}T12:00:00Z`))}</b>
        <div className="seg"><button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Semaine</button><button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Mois</button></div>
      </div>
      <div className="legend" style={{ marginBottom: 8 }}><span><i style={{ background: 'var(--yellow)' }} />Libre</span><span><i style={{ borderStyle: 'dashed' }} />Demande à valider</span><span><i style={{ background: '#ddd' }} />Complet</span><span><i style={{ background: 'var(--black)' }} />Groupe</span></div>
      <p className="muted" style={{ margin: '0 0 8px' }}>{view === 'week' ? 'Cliquez sur une zone vide pour créer un créneau, ou sur un créneau pour le gérer.' : 'Cliquez sur un jour pour l’ouvrir en vue semaine.'}</p>
      {err && <div className="notice bad">{err}</div>}

      {view === 'week' ? <WeekGrid weekStart={weekStart} events={events} selectedId={sel?.id} onEvent={e => setSel(sessions.find(s => s.id === e.id) ?? null)} onEmpty={(date, time) => { setCourse('individuel'); setFormErr(''); setCreate({ date, time }); }} /> : (
        <div className="month">
          {WD.map(w => <div key={w} className="h">{w}</div>)}
          {cells.map(d => { const l = byDay[d] ?? []; const other = d.slice(0, 7) !== monthFirst.slice(0, 7); return (
            <button key={d} className="cell" style={other ? { opacity: .45 } : undefined} onClick={() => { setAnchor(d); setView('week'); }}>
              <b>{+d.slice(8)}</b>{l.length > 0 && <em>{l.length} créneau{l.length > 1 ? 'x' : ''}{l.some(s => s.pending) ? ' • à valider' : ''}</em>}
            </button>); })}
        </div>)}

      {sel && (
        <div className="modal-bg" onClick={() => setSel(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: 6 }}>{sel.title}</h2>
          <p className="muted"><span className="cap">{formatDay(sel.startsAt)}</span> · {formatTime(sel.startsAt)}–{formatTime(sel.endsAt)}</p>
          <p>{sel.taken}/{sel.capacity} inscrit(s){sel.pending > 0 && <> · <b>{sel.pending} demande(s) à valider</b></>}<br />
            {euros(sel.price)}/pers. · {sel.mode === 'auto' && sel.secured ? 'Confirmation automatique' : 'Sur validation'}{sel.groupId ? ' · Séance de groupe' : ''}{sel.visibility === 'group_only' ? ' (privée)' : ''}</p>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <a className="btn" href={`/admin/seances/${sel.id}`}>Participants et présences</a>
            <button className="btn ghost" onClick={() => setSel(null)}>Fermer</button></div>
        </div></div>)}

      {create && (
        <div className="modal-bg" onClick={() => setCreate(null)}><div className="modal" onClick={e => e.stopPropagation()}>
          <form className="form" onSubmit={submit}>
            <h2 className="full">Nouveau créneau</h2>
            <label>Cours<select name="course" value={course} onChange={e => setCourse(e.target.value)}><option value="individuel">Individuel</option><option value="duo">Duo</option><option value="collectif">Collectif</option></select></label>
            <label>Date<input name="date" type="date" defaultValue={create.date} required /></label>
            <label>Heure (Paris)<input name="time" type="time" step={900} defaultValue={create.time} required /></label>
            <label>Durée (min)<input name="duration" type="number" min={15} max={240} step={5} defaultValue={course === 'collectif' ? 90 : 60} key={`d${course}`} required /></label>
            <label>Places max<input name="capacity" type="number" min={1} max={12} defaultValue={DEFAULT_CAP[course]} key={`c${course}`} required /></label>
            <label>Tarif/pers. € (vide = tarif du cours)<input name="price" inputMode="decimal" /></label>
            <label>Mode<select name="mode"><option value="manual">Sur validation</option><option value="auto">Confirmation automatique</option></select></label>
            <label>Répéter chaque semaine pendant<select name="weeks" defaultValue={1}>{[1, 2, 4, 8, 12, 26].map(n => <option key={n} value={n}>{n} semaine{n > 1 ? 's' : ''}</option>)}</select></label>
            <label className="full" style={{ display: 'flex', gap: 8 }}><input type="checkbox" name="secured" style={{ width: 'auto' }} />Terrain déjà réservé et sécurisé (requis pour la confirmation automatique)</label>
            {formErr && <div className="notice bad full">{formErr}</div>}
            <div className="full row-actions"><button className="btn" disabled={busy}>{busy ? '…' : 'Créer'}</button><button type="button" className="btn ghost" onClick={() => setCreate(null)}>Annuler</button></div>
          </form>
        </div></div>)}
    </div>
  );
}
