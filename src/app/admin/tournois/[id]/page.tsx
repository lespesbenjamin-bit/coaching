import { redirect, notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import EventForm from '@/components/tournois/EventForm';
import { PART_STATUS, SOURCE_LABELS, fmtRange, fmtDate, type EventRow } from '@/lib/tournois';
import { updateEvent, setEventState, deleteEvent, coachSetParticipation, coachAddParticipation, removeParticipation } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tournoi — administration', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient();
  const { data: e } = await svc.from('tournament_events').select('*, clubs(name,city)').eq('id', id).maybeSingle();
  if (!e) notFound();
  const ev = e as EventRow & { clubs: any };
  const [{ data: parts }, { data: cats }, { data: fmts }, { data: clubs }, { data: customers }, { data: mships }] = await Promise.all([
    svc.from('tournament_participations').select('*, customers!tournament_participations_customer_id_fkey(id,first_name,last_name,level)').eq('tournament_id', id).order('created_at'),
    svc.from('tournament_categories').select('code,label').order('sort_order'),
    svc.from('tournament_formats').select('code,label').order('sort_order'),
    svc.from('clubs').select('id,name').order('name'),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(1000),
    svc.from('group_memberships').select('customer_id,groups(name)').eq('status', 'active'),
  ]);
  const P = (parts ?? []) as any[]; const taken = new Set(P.map(p => p.customer_id));
  const groupOf = new Map<string, string[]>(); for (const m of (mships ?? []) as any[]) groupOf.set(m.customer_id, [...(groupOf.get(m.customer_id) ?? []), m.groups?.name]);
  const label = (c: any) => `${c.first_name} ${c.last_name}`;
  const catLabel = (cats ?? []).find(c => c.code === ev.category_code)?.label;
  const hist = P.length ? (await svc.from('participation_status_history').select('participation_id,old_status,new_status,changed_at').in('participation_id', P.map(p => p.id)).order('changed_at')).data ?? [] : [];
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="tournois" />
      <p className="muted"><a href="/admin/tournois">← Tournois</a></p>
      <h1 style={{ margin: '6px 0 6px' }}>{ev.name}</h1>
      <p><span className={`tag ${ev.source}`}>{SOURCE_LABELS[ev.source]}</span>{ev.publication === 'proposed' && <span className="tag">Proposé par un joueur — à valider</span>}{ev.status !== 'scheduled' && <span className="tag s-cancelled">{ev.status === 'cancelled' ? 'Annulé' : 'Terminé'}</span>}{catLabel && <span className="tag">{catLabel}</span>}
        <span className="muted"> {fmtRange(ev)}{ev.clubs?.name ? ` · ${ev.clubs.name}` : ''}{ev.city ? ` · ${ev.city}` : ''}</span></p>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="row-actions" style={{ marginBottom: 16 }}>
        {ev.publication === 'proposed' && <form action={setEventState}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="publish" /><button className="btn">Valider et publier</button></form>}
        {ev.source !== 'verified' && <form action={setEventState}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="verify" /><ConfirmButton className="btn ghost" message="Marquer ces informations comme vérifiées auprès d’une source fiable (organisateur, calendrier officiel) ?">Marquer comme vérifié</ConfirmButton></form>}
        {ev.status === 'scheduled' ? <form action={setEventState}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="cancel" /><ConfirmButton message="Marquer ce tournoi comme annulé ?">Annuler le tournoi</ConfirmButton></form>
          : <form action={setEventState}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="restore" /><button className="btn ghost">Rétablir</button></form>}
        {ev.status === 'scheduled' && <form action={setEventState}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="finish" /><button className="btn ghost">Marquer terminé</button></form>}
        {ev.official_url && <a className="btn ghost" href={ev.official_url} target="_blank" rel="noopener noreferrer">Lien officiel ↗</a>}
        <form action={deleteEvent}><input type="hidden" name="id" value={id} /><ConfirmButton message="Supprimer définitivement ce tournoi ?">Supprimer</ConfirmButton></form>
      </div>
      <div className="grid2">
        <section>
          <h2 style={{ marginBottom: 10 }}>Joueurs engagés ({P.filter(p => p.status !== 'cancelled').length})</h2>
          <div className="notice">Les statuts « prévue » et « déclarée » viennent des joueurs et ne valent pas inscription officielle. Seul « confirmée » (avec sa source) correspond à une inscription vérifiée.</div>
          {P.length === 0 ? <div className="panel empty">Aucun joueur rattaché.</div> : P.map(p => (
            <div className="panel" key={p.id} style={{ padding: 14, marginBottom: 10 }}>
              <b><a href={`/admin/joueurs/fiche/${p.customer_id}`}>{label(p.customers)}</a></b> <span className="muted">{p.customers.level ?? ''}{groupOf.get(p.customer_id)?.length ? ` · ${groupOf.get(p.customer_id)!.join(', ')}` : ''} · déclaré par {p.declared_by === 'coach' ? 'le coach' : 'le joueur'}</span>
              <form action={coachSetParticipation} className="form" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="event" value={id} />
                <label>Statut<select name="status" defaultValue={p.status}>{Object.entries(PART_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Source de la confirmation<input name="source" maxLength={200} defaultValue={p.confirmation_source ?? ''} placeholder="Liste officielle, e-mail du club…" /></label>
                <label>Partenaire<input name="partner_name" maxLength={100} defaultValue={p.partner_name ?? ''} /></label>
                <label>Commentaire (visible du joueur)<input name="coach_comment" maxLength={1500} defaultValue={p.coach_comment ?? ''} /></label>
                {(p.player_objective || p.result_text || p.player_feedback) && <p className="full muted" style={{ margin: 0 }}>{p.player_objective && <>Objectif du joueur : {p.player_objective}<br /></>}{p.result_text && <>Résultat déclaré : {p.result_text}<br /></>}{p.player_feedback && <>Ressenti : {p.player_feedback}</>}</p>}
                <div className="full row-actions"><button className="btn ghost">Enregistrer</button></div></form>
              {hist.filter((h: any) => h.participation_id === p.id).length > 1 && <details><summary className="muted">Historique des statuts</summary><ul className="muted">{hist.filter((h: any) => h.participation_id === p.id).map((h: any, i: number) => <li key={i}>{fmtDate(h.changed_at.slice(0, 10))} : {h.old_status ? `${PART_STATUS[h.old_status]} → ` : ''}{PART_STATUS[h.new_status]}</li>)}</ul></details>}
              <form action={removeParticipation} style={{ marginTop: 6 }}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="event" value={id} /><ConfirmButton message="Retirer ce joueur du tournoi ?">Retirer</ConfirmButton></form>
            </div>))}
          <form action={coachAddParticipation} className="row-actions" style={{ marginTop: 10 }}><input type="hidden" name="event" value={id} />
            <select name="customer" required defaultValue=""><option value="" disabled>Ajouter un joueur…</option>{(customers ?? []).filter(c => !taken.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select>
            <select name="status" defaultValue="planned">{['interested', 'planned', 'declared'].map(k => <option key={k} value={k}>{PART_STATUS[k]}</option>)}</select><button className="btn">Ajouter</button></form>
        </section>
        <aside>
          <h2 style={{ marginBottom: 10 }}>Informations</h2>
          {(ev.registration_info || ev.registration_deadline || ev.address) && <div className="panel" style={{ marginBottom: 12 }}>
            {ev.address && <p style={{ margin: '0 0 6px' }}>{ev.address}</p>}{ev.registration_deadline && <p style={{ margin: '0 0 6px' }}><b>Clôture des inscriptions :</b> {fmtDate(ev.registration_deadline)}</p>}{ev.registration_info && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ev.registration_info}</p>}</div>}
          <EventForm action={updateEvent} e={ev} submit="Enregistrer les modifications" cats={(cats ?? []).map(c => ({ value: c.code, label: c.label }))} fmts={(fmts ?? []).map(c => ({ value: c.code, label: c.label }))} clubs={(clubs ?? []).map(c => ({ value: c.id, label: c.name }))} />
        </aside>
      </div>
    </div></main>
  );
}
