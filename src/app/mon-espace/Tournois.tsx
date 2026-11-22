import { sessionClient } from '@/lib/supabase/server';
import ConfirmButton from '@/components/ConfirmButton';
import { Calendar, EventList, FilterForm, ViewSwitch, type Marks } from '@/components/tournois/Views';
import { PART_STATUS, SOURCE_LABELS, DECLARATION_NOTICE, parseFilters, matchEvent, validDay, mondayOf, todayKey, fmtRange, href, type EventRow } from '@/lib/tournois';
import { toggleFavorite, setMyParticipation, setMyResult, proposeEvent } from './tournois-actions';

type Supa = Awaited<ReturnType<typeof sessionClient>>;
const BASE = '/mon-espace';
const PLAYER_STATUS = ['interested', 'planned', 'declared', 'finished', 'cancelled'] as const;

export default async function Tournois({ supa, userId, sp }: { supa: Supa; userId: string; sp: Record<string, string | undefined> }) {
  const f = parseFilters(sp); const today = todayKey(); const anchor = validDay(sp.d);
  const view = (['mois', 'semaine', 'liste', 'mes', 'favoris'].includes(sp.vue ?? '') ? sp.vue : 'mois') as 'mois' | 'semaine' | 'liste' | 'mes' | 'favoris';
  const evId = sp.t;
  const [{ data: evs }, { data: favs }, { data: cats }, { data: fmts }, { data: clubs }, { data: cust }] = await Promise.all([
    supa.from('tournament_events').select('*, clubs(name,city)').order('start_date').limit(2000),
    supa.from('tournament_favorites').select('tournament_id').eq('user_id', userId),
    supa.from('tournament_categories').select('code,label').eq('active', true).order('sort_order'),
    supa.from('tournament_formats').select('code,label').eq('active', true).order('sort_order'),
    supa.from('clubs').select('id,name').order('name'),
    supa.from('customers').select('id').eq('user_id', userId).maybeSingle(),
  ]);
  const { data: parts } = cust ? await supa.from('tournament_participations').select('*').eq('customer_id', cust.id) : { data: [] as any[] };
  const P = new Map(((parts ?? []) as any[]).map(p => [p.tournament_id, p])); const fav = new Set((favs ?? []).map(x => x.tournament_id));
  const marks: Marks = {}; for (const e of (evs ?? []) as EventRow[]) marks[e.id] = { fav: fav.has(e.id), status: P.get(e.id)?.status };
  const all = (evs ?? []) as EventRow[];
  const evHref = (e: EventRow) => href(BASE, { tab: 'tournois', ...sp }, { t: e.id });
  const current = `${BASE}?tab=tournois${sp.vue ? `&vue=${sp.vue}` : ''}`;

  // ----- fiche détaillée -----
  if (evId) {
    const e = all.find(x => x.id === evId);
    if (!e) return <div className="notice warn">Tournoi introuvable. <a href={`${BASE}?tab=tournois`}>Retour au calendrier</a></div>;
    const p = P.get(e.id); const back = `${BASE}?tab=tournois&t=${e.id}`;
    return (
      <div>
        <p className="muted"><a href={href(BASE, { tab: 'tournois', ...sp }, { t: null })}>← Calendrier des tournois</a></p>
        <h2 style={{ margin: '6px 0' }}>{e.name}</h2>
        <p><span className={`tag ${e.source}`}>{SOURCE_LABELS[e.source]}</span>{e.category_code && <span className="tag">{e.category_code}</span>}{e.publication === 'proposed' && <span className="tag">En attente de validation</span>}{e.status === 'cancelled' && <span className="tag s-cancelled">Annulé</span>}</p>
        <div className="grid2">
          <section className="panel">
            <p style={{ marginTop: 0 }}><b>{fmtRange(e)}</b>{e.clubs?.name ? ` · ${e.clubs.name}` : ''}{e.city ? ` · ${e.city}` : ''}</p>
            {e.address && <p>{e.address}</p>}
            {e.registration_deadline && <p><b>Clôture des inscriptions :</b> {new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${e.registration_deadline}T12:00:00Z`))}</p>}
            {e.registration_info && <p style={{ whiteSpace: 'pre-wrap' }}>{e.registration_info}</p>}
            {e.coach_comment && <div className="notice ok"><b>Note du coach</b><br />{e.coach_comment}</div>}
            {e.official_url && <p><a className="btn ghost" href={e.official_url} target="_blank" rel="noopener noreferrer">Page officielle ↗</a></p>}
            <form action={toggleFavorite}><input type="hidden" name="event" value={e.id} /><input type="hidden" name="back" value={back} /><button className="btn ghost">{fav.has(e.id) ? '★ Retirer des favoris' : '☆ Ajouter aux favoris'}</button></form>
          </section>
          <aside className="panel">
            <h3 style={{ marginTop: 0 }}>Ma participation</h3>
            <div className="notice warn">{DECLARATION_NOTICE}</div>
            {p?.status === 'confirmed' && <div className="notice ok">Inscription confirmée par une source fiable{p.confirmation_source ? ` : ${p.confirmation_source}` : ''}.</div>}
            <form action={setMyParticipation} className="form" style={{ gridTemplateColumns: '1fr' }}>
              <input type="hidden" name="event" value={e.id} /><input type="hidden" name="back" value={back} />
              <label>Mon statut<select name="status" defaultValue={p && p.status !== 'confirmed' ? p.status : p ? 'declared' : 'interested'}>{PLAYER_STATUS.map(k => <option key={k} value={k}>{PART_STATUS[k]}</option>)}</select></label>
              <label>Mon partenaire<input name="partner" maxLength={100} defaultValue={p?.partner_name ?? ''} /></label>
              <label>Mon objectif<textarea name="objective" rows={2} maxLength={500} defaultValue={p?.player_objective ?? ''} /></label>
              <button className="btn">{p ? 'Mettre à jour' : 'Enregistrer'}</button></form>
            {p?.coach_comment && <div className="notice ok" style={{ marginTop: 12 }}><b>Commentaire du coach</b><br />{p.coach_comment}</div>}
            {p && <form action={setMyResult} className="form" style={{ gridTemplateColumns: '1fr', marginTop: 12 }}>
              <h3 style={{ margin: 0 }}>Mon résultat (déclaratif)</h3><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value={back} />
              <label>Résultat<input name="result" maxLength={120} defaultValue={p.result_text ?? ''} placeholder="ex. Demi-finale" /></label>
              <label>Mon ressenti<textarea name="feedback" rows={3} maxLength={1500} defaultValue={p.player_feedback ?? ''} /></label>
              <button className="btn ghost">Enregistrer</button></form>}
          </aside>
        </div>
      </div>
    );
  }

  // ----- calendrier, liste, mes tournois, favoris -----
  let events = all.filter(e => matchEvent(e, f));
  if (view === 'mes') events = events.filter(e => P.has(e.id));
  if (view === 'favoris') events = events.filter(e => fav.has(e.id));
  if (f.statut) events = events.filter(e => P.get(e.id)?.status === f.statut);
  const calendar = view === 'mois' || view === 'semaine';
  if (!calendar && !f.passes && !f.from) events = events.filter(e => (e.end_date ?? e.start_date) >= today);
  const upcoming = all.filter(e => P.has(e.id) && P.get(e.id).status !== 'cancelled' && (e.end_date ?? e.start_date) >= today).slice(0, 3);
  const spx = { tab: 'tournois', ...sp };
  return (
    <div>
      {sp.ok && <div className="notice ok">{sp.ok}</div>}{sp.err && <div className="notice bad">{sp.err}</div>}
      {upcoming.length > 0 && <div className="panel" style={{ marginBottom: 14 }}><b>Mes prochains tournois</b>{upcoming.map(e => <div key={e.id}><a href={evHref(e)}>{e.name}</a> <span className="muted">· {fmtRange(e)} · {PART_STATUS[P.get(e.id).status]}</span></div>)}</div>}
      <ViewSwitch base={BASE} sp={spx} view={view} views={[['mois', 'Calendrier'], ['semaine', 'Semaine'], ['liste', 'Liste'], ['mes', 'Mes participations'], ['favoris', 'Favoris']]} />
      <FilterForm f={f} sp={spx} hidden={{ tab: 'tournois' }} cats={(cats ?? []).map(c => ({ value: c.code, label: c.label }))} fmts={(fmts ?? []).map(c => ({ value: c.code, label: c.label }))} clubs={(clubs ?? []).map(c => ({ value: c.id, label: c.name }))}
        extra={{ statuses: Object.entries(PART_STATUS).map(([value, label]) => ({ value, label })) }} />
      {calendar ? <Calendar base={BASE} sp={spx} view={view as 'mois' | 'semaine'} anchor={view === 'semaine' ? mondayOf(anchor) : anchor} events={events} evHref={evHref} marks={marks} /> : <EventList events={events} evHref={evHref} marks={marks} />}
      <details className="panel" style={{ marginTop: 16 }}><summary><b>Un tournoi manque ? Le proposer à mon coach</b></summary>
        <form action={proposeEvent} className="form" style={{ marginTop: 12 }}><input type="hidden" name="back" value={current} />
          <label className="full">Nom<input name="name" required minLength={2} maxLength={140} /></label>
          <label>Date<input name="start_date" type="date" required /></label>
          <label>Catégorie<select name="category_code" defaultValue=""><option value="">—</option>{(cats ?? []).map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
          <label>Ville<input name="city" maxLength={80} /></label>
          <label>Lien officiel (https://…)<input name="official_url" type="url" maxLength={300} /></label>
          <div className="full"><button className="btn ghost">Proposer</button></div></form></details>
      <p className="muted" style={{ marginTop: 10 }}>{DECLARATION_NOTICE}</p>
    </div>
  );
}
