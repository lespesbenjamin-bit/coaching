'use client';
import { useEffect, useMemo, useState } from 'react';
import { dayKey, formatDay, formatTime, euros, durationMin } from '@/lib/dates';

type CType = { code: string; label: string; min_participants: number; max_participants: number; default_duration_min: number; price_per_person_cents: number };
type Slot = { id: string; course_code: string; course_label: string; starts_at: string; ends_at: string; booking_mode: 'auto' | 'manual'; court_secured: boolean; capacity: number; seats_left: number; price_per_person_cents: number };
type Result = { status: 'confirmed' | 'pending'; emails: string };

const DESC: Record<string, string> = { individuel: '1 joueur', duo: '2 joueurs', collectif: 'Petit groupe' };
const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (key: string) => { const d = new Date(`${key}T12:00:00Z`); return addDays(key, -((d.getUTCDay() + 6) % 7)); };
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function ReservationApp() {
  const [step, setStep] = useState(1);
  const [types, setTypes] = useState<CType[]>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [type, setType] = useState<CType | null>(null);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => dayKey(new Date().toISOString()));
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [participants, setParticipants] = useState(1);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', level: '', comment: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    fetch('/api/slots', { cache: 'no-store' }).then(async r => {
      if (!r.ok) throw new Error(r.status === 503 ? 'La réservation en ligne n’est pas encore activée.' : 'Impossible de charger les disponibilités.');
      const j = await r.json(); setTypes(j.types); setSlots(j.slots);
    }).catch(e => setLoadErr(e.message));
  }, []);

  const typeSlots = useMemo(() => (slots ?? []).filter(s => type && s.course_code === type.code && s.seats_left > 0), [slots, type]);
  const byDay = useMemo(() => typeSlots.reduce<Record<string, Slot[]>>((a, s) => { (a[dayKey(s.starts_at)] ??= []).push(s); return a; }, {}), [typeSlots]);

  function chooseType(t: CType) {
    setType(t); setSlot(null); setPickedDay(null); setParticipants(t.code === 'duo' ? 2 : 1); setStep(2);
    // le calendrier s'ouvre sur le premier créneau disponible (jamais sur une semaine vide)
    const first = (slots ?? []).filter(s => s.course_code === t.code && s.seats_left > 0).map(s => dayKey(s.starts_at)).sort()[0];
    setAnchor(first ?? dayKey(new Date().toISOString()));
  }
  function chooseSlot(s: Slot) { setSlot(s); setStep(3); }

  const weekStart = mondayOf(anchor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthFirst = anchor.slice(0, 7) + '-01';
  const monthCells = (() => {
    const lead = (new Date(`${monthFirst}T12:00:00Z`).getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(+monthFirst.slice(0, 4), +monthFirst.slice(5, 7), 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${anchor.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`)];
  })();
  const shift = (n: number) => view === 'week' ? setAnchor(addDays(anchor, 7 * n)) : setAnchor(addDays(monthFirst, n > 0 ? 32 : -1).slice(0, 8) + '01');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!slot || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: slot.id, ...form, participants, idempotencyKey: idemKey }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Une erreur est survenue.'); if (r.status === 409) { setStep(2); setSlot(null); } return; }
      setResult({ status: j.status, emails: j.emails }); setStep(4);
    } catch { setError('Connexion impossible, réessayez.'); } finally { setBusy(false); }
  }

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.value });
  const total = slot ? slot.price_per_person_cents * participants : 0;
  const stepCls = (n: number) => (step === n ? 'on' : step > n ? 'done' : '');

  if (loadErr) return <div className="notice bad">{loadErr}</div>;

  return (
    <>
      <ol className="steps" aria-label="Étapes">
        {['Cours', 'Créneau', 'Infos', 'Confirmation'].map((l, i) => <li key={l} className={stepCls(i + 1)}>{i + 1}. {l}</li>)}
      </ol>

      {step === 1 && (
        <section>
          <h2 style={{ marginBottom: 16 }}>Choisissez votre cours</h2>
          {!slots ? <p className="empty"><span className="spin" /> Chargement…</p> : (
            <div className="cards">
              {types.sort((a, b) => a.max_participants - b.max_participants).map(t => {
                const n = slots.filter(s => s.course_code === t.code && s.seats_left > 0).length;
                return (
                  <button key={t.code} className="card" onClick={() => chooseType(t)}>
                    <h3>{t.label}</h3>
                    <div className="price">{euros(t.price_per_person_cents)}<span className="muted" style={{ fontFamily: 'var(--body)', fontStyle: 'normal', fontSize: 13 }}>{t.code === 'individuel' ? ' / heure' : ' / pers.'}</span></div>
                    <div className="muted">{DESC[t.code]} · {t.default_duration_min} min</div>
                    <div className="muted">{n ? `${n} créneau${n > 1 ? 'x' : ''} disponible${n > 1 ? 's' : ''}` : 'Aucun créneau pour le moment'}</div>
                  </button>);
              })}
            </div>)}
        </section>)}

      {step === 2 && type && (
        <section>
          <div className="bar">
            <h2>{type.label}</h2>
            <div className="seg" role="tablist"><button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Semaine</button><button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Mois</button></div>
          </div>
          <div className="legend"><span><i style={{ background: 'var(--yellow)' }} />Confirmation immédiate</span><span><i style={{ borderStyle: 'dashed' }} />Sur validation du coach</span></div>
          <div className="bar nowrap">
            <button className="btn ghost" onClick={() => shift(-1)} aria-label="Précédent">←</button>
            <b>{view === 'week' ? `Semaine du ${formatDay(`${weekStart}T12:00:00Z`)}` : new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${monthFirst}T12:00:00Z`))}</b>
            <button className="btn ghost" onClick={() => shift(1)} aria-label="Suivant">→</button>
          </div>

          {typeSlots.length === 0 && <div className="empty panel">Aucun créneau n’est disponible pour ce cours pour le moment. Contactez-moi par WhatsApp au 06 79 09 65 74.</div>}

          {typeSlots.length > 0 && view === 'week' && (
            <div className="days">
              {weekDays.filter(d => byDay[d]).length === 0 && <div className="empty panel">Aucun créneau cette semaine — essayez la semaine suivante.</div>}
              {weekDays.filter(d => byDay[d]).map(d => <DayBlock key={d} day={d} slots={byDay[d]} type={type} onPick={chooseSlot} />)}
            </div>)}

          {typeSlots.length > 0 && view === 'month' && (
            <>
              <div className="month">
                {WD.map(w => <div key={w} className="h">{w}</div>)}
                {monthCells.map((d, i) => d ? (
                  <button key={d} className={`cell ${pickedDay === d ? 'sel' : ''}`} disabled={!byDay[d]} onClick={() => setPickedDay(d)}>
                    <b>{+d.slice(8)}</b>{byDay[d] && <em>{byDay[d].length} créneau{byDay[d].length > 1 ? 'x' : ''}</em>}
                  </button>) : <div key={`x${i}`} />)}
              </div>
              {pickedDay && byDay[pickedDay] && <div style={{ marginTop: 14 }}><DayBlock day={pickedDay} slots={byDay[pickedDay]} type={type} onPick={chooseSlot} /></div>}
            </>)}
          <p><button className="btn ghost" onClick={() => setStep(1)}>← Changer de cours</button></p>
        </section>)}

      {step === 3 && slot && type && (
        <section className="panel">
          <h2 style={{ marginBottom: 14 }}>Vos informations</h2>
          <dl className="recap">
            <dt>Cours</dt><dd>{slot.course_label}</dd><dt>Date</dt><dd className="cap">{formatDay(slot.starts_at)}</dd>
            <dt>Horaire</dt><dd>{formatTime(slot.starts_at)} – {formatTime(slot.ends_at)} ({durationMin(slot.starts_at, slot.ends_at)} min)</dd>
            <dt>Tarif</dt><dd>{euros(total)}</dd>
          </dl>
          <div className={`notice ${slot.booking_mode === 'auto' && slot.court_secured ? 'ok' : 'warn'}`}>
            {slot.booking_mode === 'auto' && slot.court_secured
              ? 'Ce créneau est confirmé immédiatement à l’envoi du formulaire.'
              : 'Ce créneau est sur validation : votre demande ne sera confirmée qu’après vérification de la disponibilité du terrain. Vous recevrez un e-mail de décision.'}
          </div>
          <form className="form" onSubmit={submit}>
            <label>Prénom<input required maxLength={60} value={form.firstName} onChange={upd('firstName')} autoComplete="given-name" /></label>
            <label>Nom<input required maxLength={60} value={form.lastName} onChange={upd('lastName')} autoComplete="family-name" /></label>
            <label>E-mail<input required type="email" maxLength={120} value={form.email} onChange={upd('email')} autoComplete="email" /></label>
            <label>Téléphone<input required type="tel" maxLength={25} value={form.phone} onChange={upd('phone')} autoComplete="tel" /></label>
            <label>Niveau de padel (facultatif)<input maxLength={40} value={form.level} onChange={upd('level')} placeholder="ex. P100" /></label>
            {type.code === 'collectif' && slot.seats_left > 1 ? (
              <label>Nombre de places<select value={participants} onChange={e => setParticipants(+e.target.value)}>{Array.from({ length: slot.seats_left }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
            ) : <div />}
            <label className="full">Commentaire (facultatif)<textarea rows={3} maxLength={500} value={form.comment} onChange={upd('comment')} /></label>
            <div className="hp" aria-hidden="true"><label>Site<input tabIndex={-1} autoComplete="off" value={form.website} onChange={upd('website')} /></label></div>
            {error && <div className="notice bad full">{error}</div>}
            <div className="full" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" onClick={() => setStep(2)}>← Retour</button>
              <button className="btn" disabled={busy}>{busy ? 'Envoi…' : slot.booking_mode === 'auto' && slot.court_secured ? 'Réserver' : 'Envoyer ma demande'}</button>
            </div>
            <p className="muted full" style={{ margin: 0 }}>Vos données servent uniquement à traiter cette réservation et à vous contacter. Aucun paiement en ligne.</p>
          </form>
        </section>)}

      {step === 4 && result && slot && (
        <section className="panel">
          <div className={`notice ${result.status === 'confirmed' ? 'ok' : 'warn'}`}>
            {result.status === 'confirmed'
              ? <><b>Réservation confirmée.</b> Votre cours est réservé.</>
              : <><b>Demande reçue — pas encore confirmée.</b> Je vérifie la disponibilité du terrain et je reviens vers vous.</>}
          </div>
          <dl className="recap">
            <dt>Statut</dt><dd><span className={`badge ${result.status}`}>{result.status === 'confirmed' ? 'Confirmée' : 'En attente de validation'}</span></dd>
            <dt>Cours</dt><dd>{slot.course_label}</dd><dt>Date</dt><dd className="cap">{formatDay(slot.starts_at)}</dd>
            <dt>Horaire</dt><dd>{formatTime(slot.starts_at)} – {formatTime(slot.ends_at)}</dd><dt>Tarif</dt><dd>{euros(total)}</dd>
          </dl>
          {result.emails === 'sent' && <p className="muted">Un e-mail récapitulatif vous a été envoyé.</p>}
          {result.emails !== 'sent' && <p className="muted">L’e-mail de récapitulatif n’a pas pu être envoyé : conservez cette page. En cas de doute, contactez-moi au 06 79 09 65 74.</p>}
          <a className="btn" href="/">Retour au site</a>
        </section>)}
    </>
  );
}

function DayBlock({ day, slots, type, onPick }: { day: string; slots: Slot[]; type: CType; onPick: (s: Slot) => void }) {
  return (
    <div className="day">
      <h3>{formatDay(`${day}T12:00:00Z`)}</h3>
      <div className="slots">
        {slots.map(s => (
          <button key={s.id} className={`slot ${s.booking_mode === 'auto' && s.court_secured ? 'auto' : 'manual'}`} onClick={() => onPick(s)}>
            <b>{formatTime(s.starts_at)}</b>
            <small>{durationMin(s.starts_at, s.ends_at)} min{type.code === 'collectif' ? ` · ${s.seats_left} place${s.seats_left > 1 ? 's' : ''}` : ''}</small>
            <small>{s.booking_mode === 'auto' && s.court_secured ? 'Immédiat' : 'Sur validation'}</small>
          </button>))}
      </div>
    </div>
  );
}
