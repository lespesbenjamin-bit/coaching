import { type EventRow, type Filters, PART_SHORT, SOURCE_LABELS, addDays, mondayOf, monthCells, spans, todayKey, fmtRange, href } from '@/lib/tournois';

type Sp = Record<string, string | string[] | undefined>;
export type Marks = Record<string, { status?: string; fav?: boolean; count?: number }>;
const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export function ViewSwitch({ base, sp, view, views }: { base: string; sp: Sp; view: string; views: [string, string][] }) {
  return <div className="seg" role="tablist" style={{ marginBottom: 12 }}>{views.map(([k, l]) => <a key={k} href={href(base, sp, { vue: k })}><button className={view === k ? 'on' : ''}>{l}</button></a>)}</div>;
}

export function Calendar({ base, sp, view, anchor, events, evHref, marks }: { base: string; sp: Sp; view: 'mois' | 'semaine'; anchor: string; events: EventRow[]; evHref: (e: EventRow) => string; marks: Marks }) {
  const today = todayKey(); const month = anchor.slice(0, 7);
  const days = view === 'mois' ? monthCells(anchor) : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i));
  const prev = view === 'mois' ? addDays(month + '-01', -1).slice(0, 7) + '-01' : addDays(anchor, -7);
  const next = view === 'mois' ? addDays(month + '-01', 32).slice(0, 7) + '-01' : addDays(anchor, 7);
  const title = view === 'mois' ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`)) : `Semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${mondayOf(anchor)}T12:00:00Z`))}`;
  return (
    <div>
      <div className="bar nowrap"><a className="btn ghost" href={href(base, sp, { d: prev })} aria-label="Précédent">←</a><b className="cap">{title}</b><a className="btn ghost" href={href(base, sp, { d: next })} aria-label="Suivant">→</a></div>
      <p style={{ margin: '0 0 8px' }}><a href={href(base, sp, { d: today })}>Aujourd’hui</a></p>
      <div className="tcal" role="grid">
        {WD.map(w => <div key={w} className="h">{w}</div>)}
        {days.map(d => {
          const list = events.filter(e => spans(e, d));
          return <div key={d} className={`d${view === 'mois' && d.slice(0, 7) !== month ? ' out' : ''}${d === today ? ' today' : ''}`} style={view === 'semaine' ? { minHeight: 180 } : undefined}>
            <b>{+d.slice(8)}</b>
            {list.slice(0, view === 'mois' ? 3 : 12).map(e => { const m = marks[e.id]; return (
              <a key={e.id} href={evHref(e)} className={`tev${m?.status && m.status !== 'cancelled' ? ' mine' : ''}${e.status === 'cancelled' ? ' cancelled' : ''}${e.start_date < today && !m ? ' past' : ''}`} title={e.name}>
                {m?.fav ? '★ ' : ''}{e.category_code ? `${e.category_code} · ` : ''}{e.name}</a>); })}
            {list.length > 3 && view === 'mois' && <small className="muted">+{list.length - 3}</small>}
          </div>;
        })}
      </div>
    </div>
  );
}

export function EventList({ events, evHref, marks }: { events: EventRow[]; evHref: (e: EventRow) => string; marks: Marks }) {
  if (!events.length) return <div className="panel empty">Aucun tournoi ne correspond à ces critères.</div>;
  return <div className="days">{events.map(e => { const m = marks[e.id]; return (
    <a key={e.id} href={evHref(e)} className="panel" style={{ display: 'block', textDecoration: 'none', padding: 14 }}>
      <b>{e.name}</b> {e.category_code && <span className="tag">{e.category_code}</span>}{e.status === 'cancelled' && <span className="tag s-cancelled">Annulé</span>}
      <div className="muted">{fmtRange(e)}{e.clubs?.name ? ` · ${e.clubs.name}` : ''}{e.city ? ` · ${e.city}` : ''}</div>
      <div style={{ marginTop: 4 }}><span className={`tag ${e.source}`}>{SOURCE_LABELS[e.source]}</span>{m?.fav && <span className="tag">★ Favori</span>}{m?.status && <span className={`tag s-${m.status}`}>{PART_SHORT[m.status]}</span>}{m?.count ? <span className="tag">{m.count} joueur{m.count > 1 ? 's' : ''}</span> : null}</div>
    </a>); })}</div>;
}

export function EventTable({ events, evHref, marks }: { events: EventRow[]; evHref: (e: EventRow) => string; marks: Marks }) {
  if (!events.length) return <div className="panel empty">Aucun tournoi ne correspond à ces critères.</div>;
  return <div className="panel scroll"><table><thead><tr><th>Date</th><th>Tournoi</th><th>Cat.</th><th>Club / ville</th><th>Clôture</th><th>Source</th><th>Élèves</th></tr></thead><tbody>
    {events.map(e => <tr key={e.id}><td>{fmtRange(e)}</td><td><a href={evHref(e)}><b>{e.name}</b></a>{e.publication === 'proposed' && <> <span className="tag">À valider</span></>}{e.status === 'cancelled' && <> <span className="tag s-cancelled">Annulé</span></>}</td>
      <td>{e.category_code ?? '—'}</td><td>{[e.clubs?.name, e.city].filter(Boolean).join(' · ') || '—'}</td><td>{e.registration_deadline ? fmtRange({ start_date: e.registration_deadline, end_date: null }) : '—'}</td>
      <td><span className={`tag ${e.source}`}>{SOURCE_LABELS[e.source]}</span></td><td>{marks[e.id]?.count ?? 0}</td></tr>)}</tbody></table></div>;
}

export type Opt = { value: string; label: string };
export function FilterForm({ f, sp, cats, fmts, clubs, extra, hidden }: { f: Filters; sp: Sp; cats: Opt[]; fmts: Opt[]; clubs: Opt[]; extra?: { groups?: Opt[]; players?: Opt[]; statuses?: Opt[]; sources?: boolean }; hidden?: Record<string, string> }) {
  const Sel = ({ name, label, opts, value }: { name: string; label: string; opts: Opt[]; value: string }) => <label>{label}<select name={name} defaultValue={value}><option value="">Tous</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  return (
    <form className="filters" method="get">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {['vue', 'd'].map(k => sp[k] ? <input key={k} type="hidden" name={k} value={String(sp[k])} /> : null)}
      <label>Recherche<input name="q" defaultValue={f.q} placeholder="Nom, club, ville" /></label>
      <Sel name="cat" label="Catégorie" opts={cats} value={f.cat} />
      <Sel name="fmt" label="Épreuve" opts={fmts} value={f.fmt} />
      <Sel name="club" label="Club organisateur" opts={clubs} value={f.club} />
      <label>Localisation<input name="ville" defaultValue={f.ville} placeholder="Ville" /></label>
      <label>Du<input name="from" type="date" defaultValue={f.from} /></label>
      <label>Au<input name="to" type="date" defaultValue={f.to} /></label>
      {extra?.statuses && <Sel name="statut" label="Statut d’inscription" opts={extra.statuses} value={f.statut} />}
      {extra?.groups && <Sel name="groupe" label="Groupe" opts={extra.groups} value={f.groupe} />}
      {extra?.players && <Sel name="joueur" label="Joueur participant" opts={extra.players} value={f.joueur} />}
      {extra?.sources && <Sel name="source" label="Origine des données" opts={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))} value={f.source} />}
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" name="passes" value="1" defaultChecked={f.passes} style={{ width: 'auto' }} />Inclure les tournois passés</label>
      <div className="row-actions" style={{ alignItems: 'end' }}><button className="btn">Filtrer</button><a className="btn ghost" href="?">Réinitialiser</a></div>
    </form>
  );
}
