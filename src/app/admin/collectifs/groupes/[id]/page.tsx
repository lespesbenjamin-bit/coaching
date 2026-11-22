import { redirect, notFound } from 'next/navigation';
import { randomUUID } from 'crypto';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { WEEKDAYS, LEVELS, hhmm, endTime, pct, cycleAlert } from '@/lib/collectifs';
import Shell, { Notice } from '@/components/pgm/Shell';
import { AlertBadge, Badge, Progress } from '@/components/pgm/ui';
import ConfirmButton from '@/components/ConfirmButton';
import { updateCollectif, memberOp, renewCycle, addExceptional, cycleState } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Groupe — collectifs', robots: { index: false, follow: false } };
const fp = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));
const SESSION_STATUS: Record<string, [string, 'ok' | 'neutral' | 'bad' | 'warn' | 'info']> = { open: ['Programmée', 'info'], done: ['Réalisée', 'ok'], cancelled: ['Annulée', 'bad'], suspended: ['Suspendue', 'warn'] };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient();
  const { data: g } = await svc.from('groups').select('*').eq('id', id).maybeSingle(); if (!g) notFound();
  const at = sp.au && /^\d{4}-\d{2}-\d{2}$/.test(sp.au) ? sp.au : null;
  const [{ data: members }, { data: cycles }, { data: sessions }, { data: customers }, { data: bal }, { data: groups }, { data: events }, past] = await Promise.all([
    svc.from('group_memberships').select('customer_id,joined_at,customers(first_name,last_name,level)').eq('group_id', id).eq('status', 'active').order('joined_at'),
    svc.from('v_cycle_progress').select('*').eq('group_id', id).order('start_date', { ascending: false }),
    svc.from('sessions').select('id,starts_at,ends_at,status,cycle_id,cycle_index,is_exceptional,counts_in_cycle,bookings(status,attendance_records(status))').eq('group_id', id).order('starts_at', { ascending: false }).limit(300),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(1000),
    svc.from('v_credit_balance').select('customer_id,available'),
    svc.from('groups').select('id,name,capacity,status').neq('status', 'archived').neq('id', id).order('name'),
    svc.from('group_membership_events').select('id,event,at,customers(first_name,last_name)').eq('group_id', id).order('at', { ascending: false }).limit(40),
    at ? svc.rpc('group_members_at', { p_group: id, p_at: new Date(`${at}T23:59:59Z`).toISOString() }) : Promise.resolve({ data: null }),
  ]);
  const ms = (members ?? []) as any[]; const memberIds = new Set(ms.map(m => m.customer_id));
  const balOf = new Map(((bal ?? []) as any[]).map(b => [b.customer_id, b.available]));
  const cy = ((cycles ?? []) as any[]); const cur = cy.find(c => ['active', 'suspended'].includes(c.status)) ?? null;
  const ss = (sessions ?? []) as any[]; const nameOf = new Map(((customers ?? []) as any[]).map(c => [c.id, `${c.last_name} ${c.first_name}`]));
  const cycleName = new Map(cy.map(c => [c.cycle_id, c.label ?? 'Cycle']));
  const back = `/admin/collectifs/groupes/${id}`;
  const nextStart = cur?.last_planned ? new Date(new Date(cur.last_planned).getTime() + 7 * 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const presence = (s: any) => { const r = { p: 0, a: 0, e: 0, n: 0 }; for (const b of s.bookings ?? []) { if (!['confirmed', 'completed'].includes(b.status)) continue; const a = Array.isArray(b.attendance_records) ? b.attendance_records[0] : b.attendance_records; if (!a) r.n++; else if (a.status === 'present') r.p++; else if (a.status === 'absent_unjustified') r.a++; else r.e++; } return r; };
  const key = randomUUID();
  return (
    <Shell current="groupes" title={g.name} action={<div className="pgm-actions"><a className="pgm-btn ghost" href={`/admin/collectifs/planning?groupe=${id}`}>Voir le planning</a></div>}>
      <Notice ok={sp.ok} err={sp.err} />
      <div className="pgm-grid side">
        <div>
          <section className="pgm-section"><h2>A · Informations générales</h2>
            <form action={updateCollectif} className="pgm-card pgm-form c2"><input type="hidden" name="id" value={id} />
              <label>Nom<input name="name" defaultValue={g.name} required /></label>
              <label>Niveau<input name="level" list="lv2" defaultValue={g.level ?? ''} /><datalist id="lv2">{LEVELS.map(l => <option key={l} value={l} />)}</datalist></label>
              <label>Capacité<input name="capacity" type="number" min={1} max={12} defaultValue={g.capacity} /></label>
              <label>Statut<select name="status" defaultValue={g.status}><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="archived">Archivé</option></select></label>
              <p className="pgm-muted full" style={{ margin: 0 }}>{g.weekday ? `${WEEKDAYS[g.weekday]} ${hhmm(g.start_time)}–${endTime(g.start_time, g.duration_min)} (${g.duration_min} min)` : 'Horaire à définir'}. L’horaire se modifie par cycle ou par séance (ci-dessous).</p>
              <div className="pgm-actions full"><button className="pgm-btn">Enregistrer</button>{g.status !== 'archived' && <button className="pgm-btn ghost" name="status" value="archived" formNoValidate>Archiver</button>}</div></form>
          </section>

          <section className="pgm-section"><h2>B · Composition ({ms.length}/{g.capacity})</h2>
            {ms.length === 0 ? <div className="pgm-empty">Aucun joueur dans ce groupe.</div> : <div className="pgm-scroll"><table className="pgm-table"><thead><tr><th>Joueur</th><th>Niveau</th><th>Crédits</th><th /></tr></thead><tbody>
              {ms.map(m => <tr key={m.customer_id}><td><a href={`/admin/joueurs/fiche/${m.customer_id}`}><b>{m.customers.last_name} {m.customers.first_name}</b></a></td><td>{m.customers.level ?? '—'}</td>
                <td>{balOf.has(m.customer_id) ? <Badge tone={(balOf.get(m.customer_id) as number) <= 2 ? 'warn' : 'ok'}>{balOf.get(m.customer_id)} dispo</Badge> : <Badge>Sans forfait</Badge>}</td>
                <td><form action={memberOp} className="pgm-actions"><input type="hidden" name="group" value={id} /><input type="hidden" name="customer" value={m.customer_id} />
                  <select name="to_group" defaultValue="" aria-label="Groupe d’arrivée" style={{ width: 150 }}><option value="">Déplacer vers…</option>{(groups ?? []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                  <button className="pgm-btn ghost sm" name="op" value="move">Déplacer</button><button className="pgm-btn danger sm" name="op" value="remove">Retirer</button></form></td></tr>)}
            </tbody></table></div>}
            {g.status === 'active' && <form action={memberOp} className="pgm-actions" style={{ marginTop: 10 }}><input type="hidden" name="group" value={id} />
              <select name="customer" required defaultValue="" style={{ flex: 1, minWidth: 180 }}><option value="" disabled>Choisir un joueur…</option>{((customers ?? []) as any[]).filter(c => !memberIds.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select>
              <input name="n" type="number" min={1} max={30} defaultValue={1} style={{ width: 80 }} aria-label="Nombre de séances (joueur temporaire)" />
              <button className="pgm-btn" name="op" value="add" disabled={ms.length >= g.capacity}>Ajouter un joueur</button><button className="pgm-btn ghost" name="op" value="temp">Joueur temporaire (n séances)</button></form>}
            <p className="pgm-muted">Un joueur peut être dans plusieurs groupes. Retirer ou déplacer un joueur ne touche jamais aux séances passées. Le joueur temporaire est inscrit aux n prochaines séances sans devenir membre.</p>
            <details><summary>Anciennes compositions</summary>
              <form method="get" className="pgm-actions" style={{ marginBottom: 8 }}><input type="date" name="au" defaultValue={at ?? ''} style={{ width: 170 }} /><button className="pgm-btn ghost sm">Voir la composition à cette date</button></form>
              {at && <div className="pgm-note">Composition au {fp(`${at}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric' })} : {((past.data ?? []) as string[]).map(c => nameOf.get(c)).filter(Boolean).join(', ') || 'aucun joueur'}</div>}
              <ul className="pgm-muted" style={{ margin: 0, paddingLeft: 18 }}>{((events ?? []) as any[]).map(e => <li key={e.id}>{fp(e.at, { day: 'numeric', month: 'short', year: 'numeric' })} · {e.customers?.first_name} {e.customers?.last_name} : {e.event === 'joined' ? 'arrivée' : 'départ'}</li>)}</ul></details>
          </section>

          <section className="pgm-section"><h2>C · Cycle en cours</h2>
            {!cur ? <div className="pgm-empty">Aucun cycle en cours.{cy[0] && !cy[0].renewed ? ' Renouvelez le dernier cycle ci-dessous.' : ''}</div> : (
              <div className="pgm-card">
                <div className="pgm-row"><h3>{cur.label ?? 'Cycle'}</h3><AlertBadge alert={cur.renewed ? null : cycleAlert(cur.remaining, cur.status)} />{cur.status === 'suspended' && <Badge tone="warn">Suspendu</Badge>}{cur.renewed && <Badge tone="ok">Renouvelé</Badge>}</div>
                <Progress value={pct(cur.validated, cur.total)} label="Progression du cycle" />
                <dl className="pgm-kv"><dt>Début</dt><dd>{fp(`${cur.start_date}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric' })}</dd><dt>Séances prévues</dt><dd>{cur.total}</dd><dt>Réalisées (validées)</dt><dd>{cur.validated}</dd>
                  <dt>Restantes</dt><dd>{cur.remaining}</dd><dt>Progression</dt><dd>{pct(cur.validated, cur.total)} %</dd><dt>Fin prévisionnelle</dt><dd>{cur.last_planned ? fp(cur.last_planned, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</dd></dl>
                {cur.remaining > cur.upcoming && <div className="pgm-note warn">{cur.remaining - cur.upcoming} séance(s) restante(s) non planifiée(s) : ajoutez-les (séance exceptionnelle incluse au cycle) ou prolongez le cycle.</div>}
                <div className="pgm-actions"><form action={cycleState}><input type="hidden" name="cycle" value={cur.cycle_id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="suspend" value={cur.status === 'active' ? '1' : '0'} /><button className="pgm-btn ghost sm">{cur.status === 'active' ? 'Suspendre le cycle' : 'Reprendre le cycle'}</button></form></div>
              </div>)}
            {cy[0] && !cy[0].renewed && cy[0].status !== 'cancelled' && (
              <details className="pgm-card" style={{ marginTop: 10 }} open={!cur || cur.remaining <= 3}><summary>Renouveler le cycle « {cy[0].label ?? 'Cycle'} »</summary>
                <form action={renewCycle} className="pgm-form c2"><input type="hidden" name="cycle" value={cy[0].cycle_id} /><input type="hidden" name="group" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="key" value={key} />
                  <label>Nom du nouveau cycle<input name="label" defaultValue={`Cycle ${cy.length + 1}`} /></label>
                  <label>Date de début<input name="start_date" type="date" defaultValue={nextStart} required /></label>
                  <label>Nombre de séances<input name="count" type="number" min={1} max={60} defaultValue={cy[0].total} required /></label>
                  <label>Heure (vide = conserver le créneau)<input name="time" type="time" /></label>
                  <p className="pgm-muted full" style={{ margin: 0 }}>La composition du groupe est conservée (modifiez-la au-dessus avant de renouveler si besoin). L’historique du cycle précédent n’est jamais modifié. Un cycle ne peut être renouvelé qu’une fois.</p>
                  <button className="pgm-btn full">Renouveler le cycle</button></form></details>)}
            <details className="pgm-card" style={{ marginTop: 10 }}><summary>Ajouter une séance exceptionnelle</summary>
              <form action={addExceptional} className="pgm-form c2"><input type="hidden" name="group" value={id} /><input type="hidden" name="cycle" value={cur?.cycle_id ?? ''} /><input type="hidden" name="back" value={back} />
                <label>Date<input name="date" type="date" required /></label><label>Heure<input name="time" type="time" defaultValue={hhmm(g.start_time) || '19:00'} required /></label>
                <label>Durée (min)<input name="duration" type="number" min={15} max={360} defaultValue={g.duration_min} required /></label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="counts" defaultChecked />Compter dans le cycle en cours</label>
                <button className="pgm-btn full">Ajouter la séance</button></form></details>
          </section>
        </div>

        <aside><section className="pgm-section"><h2>D · Historique des séances</h2>
          {ss.length === 0 ? <div className="pgm-empty">Aucune séance.</div> : <div className="pgm-scroll"><table className="pgm-table"><thead><tr><th>Date</th><th>N°</th><th>Statut</th><th>Présences</th></tr></thead><tbody>
            {ss.map(s => { const st = SESSION_STATUS[s.status] ?? [s.status, 'neutral']; const pr = presence(s); const total = cy.find(c => c.cycle_id === s.cycle_id)?.total;
              return <tr key={s.id}><td><a href={`/admin/collectifs/seances/${s.id}`}><b>{fp(s.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })}</b></a><br /><span className="pgm-muted">{fp(s.starts_at, { hour: '2-digit', minute: '2-digit' })}</span></td>
                <td>{s.is_exceptional ? 'Exc.' : s.cycle_index ? `${s.cycle_index}/${total ?? '?'}` : '—'}{s.cycle_id && cy.length > 1 ? <><br /><span className="pgm-muted">{cycleName.get(s.cycle_id)}</span></> : null}</td>
                <td><Badge tone={st[1]}>{st[0]}</Badge>{s.is_exceptional && !s.counts_in_cycle && <><br /><span className="pgm-muted">hors cycle</span></>}</td>
                <td>{s.status === 'cancelled' ? '—' : <span className="pgm-muted">✓{pr.p} ✗{pr.a} exc.{pr.e}{pr.n ? ` · ${pr.n} à saisir` : ''}</span>}</td></tr>; })}
          </tbody></table></div>}</section></aside>
      </div>
    </Shell>
  );
}
