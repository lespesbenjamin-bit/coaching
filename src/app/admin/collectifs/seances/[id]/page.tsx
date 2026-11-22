import { redirect, notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import Shell, { Notice } from '@/components/pgm/Shell';
import { Badge } from '@/components/pgm/ui';
import { saveSheet, allPresent, postponeSession, cancelOccurrence } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Séance — collectifs', robots: { index: false, follow: false } };
const fp = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));
const parisParts = (iso: string) => { const d = new Date(iso); const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', ...o }).format(d); return { date: f({ year: 'numeric', month: '2-digit', day: '2-digit' }), time: f({ hour: '2-digit', minute: '2-digit' }) }; };
const UI: Record<string, string> = { present: 'present', absent_unjustified: 'absent', absent_justified: 'excused', to_makeup: 'makeup' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams; if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient();
  const { data: s } = await svc.from('sessions').select('*, groups(name,level)').eq('id', id).maybeSingle(); if (!s || !s.group_id) notFound();
  const [{ data: bks }, { data: revs }, { data: cyc }] = await Promise.all([
    svc.from('bookings').select('id,status,customer_id,customers(first_name,last_name),attendance_records(status,credit_decision)').eq('session_id', id).in('status', ['confirmed', 'completed']),
    svc.from('session_revisions').select('*').eq('session_id', id).order('changed_at', { ascending: false }),
    s.cycle_id ? svc.from('v_cycle_progress').select('total,label').eq('cycle_id', s.cycle_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = ((bks ?? []) as any[]).map(b => ({ ...b, a: Array.isArray(b.attendance_records) ? b.attendance_records[0] : b.attendance_records })).sort((x, y) => x.customers.last_name.localeCompare(y.customers.last_name));
  const done = s.status === 'done'; const cancelled = s.status === 'cancelled'; const missing = rows.filter(r => !r.a).length; const pp = parisParts(s.starts_at);
  const dur = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000);
  const names = new Map(rows.map(r => [r.id, `${r.customers.first_name} ${r.customers.last_name}`]));
  return (
    <Shell current="groupes" title={`${s.groups.name} · ${fp(s.starts_at, { weekday: 'long', day: 'numeric', month: 'long' })}`} action={<a className="pgm-btn ghost" href={`/admin/collectifs/groupes/${s.group_id}`}>← Retour au groupe</a>}>
      <Notice ok={sp.ok} err={sp.err} />
      <div className="pgm-row" style={{ marginBottom: 14 }}>
        <span className="pgm-muted">{fp(s.starts_at, { hour: '2-digit', minute: '2-digit' })}–{fp(s.ends_at, { hour: '2-digit', minute: '2-digit' })}{s.cycle_index && cyc ? ` · séance ${s.cycle_index}/${cyc.total}` : ''}{s.is_exceptional ? ' · exceptionnelle' : ''}</span>
        <Badge tone={done ? 'ok' : cancelled ? 'bad' : s.status === 'suspended' ? 'warn' : 'info'}>{done ? 'Validée' : cancelled ? 'Annulée' : s.status === 'suspended' ? 'Suspendue' : 'À valider'}</Badge>
      </div>

      {cancelled ? <div className="pgm-empty">Séance annulée : non comptée comme réalisée, crédits rendus.</div> : (
        <form action={saveSheet}>
          <input type="hidden" name="session" value={id} />
          <section className="pgm-section"><h2>Feuille de présence</h2>
            {rows.length === 0 ? <div className="pgm-empty">Aucun joueur inscrit à cette séance.</div> : rows.map(r => (
              <div className="pgm-sheet-row" key={r.id}>
                <b>{r.customers.last_name} {r.customers.first_name}</b>
                <label>Présence<select name={`st_${r.id}`} defaultValue={r.a ? UI[r.a.status] ?? '' : ''}><option value="">Non renseigné</option><option value="present">Présent</option><option value="absent">Absent</option><option value="excused">Excusé</option><option value="makeup">À rattraper</option></select></label>
                <label>Crédit<select name={`cr_${r.id}`} defaultValue={r.a?.credit_decision ?? ''}><option value="">Automatique (présent = consommé)</option><option value="consume">Consommer 1 crédit</option><option value="free">Ne pas consommer</option></select></label>
                <span>{!r.a ? <Badge tone="warn">À saisir</Badge> : <Badge tone="ok">Saisi</Badge>}</span>
              </div>))}
            {done && <label className="pgm-form" style={{ marginTop: 10 }}>Motif de la correction (obligatoire, tracé)<input name="reason" required minLength={3} maxLength={300} placeholder="Ex. erreur de saisie" /></label>}
            {!done && missing > 0 && rows.length > 0 && <div className="pgm-note warn" style={{ marginTop: 10 }}>{missing} joueur(s) non renseigné(s) : la validation est bloquée tant que tout n’est pas saisi.</div>}
            <div className="pgm-actions" style={{ marginTop: 10 }}>
              <button className="pgm-btn dark" name="intent" value="save">{done ? 'Enregistrer la correction' : 'Enregistrer'}</button>
              {!done && <button className="pgm-btn" name="intent" value="validate" disabled={rows.length === 0}>Valider la séance</button>}
            </div>
          </section>
        </form>)}
      {!done && !cancelled && rows.length > 0 && <form action={allPresent}><input type="hidden" name="session" value={id} /><button className="pgm-btn ghost">Tous présents</button></form>}

      {!cancelled && !done && <section className="pgm-section" style={{ marginTop: 20 }}><h2>Reporter ou annuler</h2><div className="pgm-grid c2">
        <form action={postponeSession} className="pgm-card pgm-form c2"><input type="hidden" name="session" value={id} />
          <label>Nouvelle date<input name="date" type="date" defaultValue={pp.date} required /></label><label>Heure<input name="time" type="time" defaultValue={pp.time} required /></label>
          <label>Durée (min)<input name="duration" type="number" min={15} max={360} defaultValue={dur} required /></label><button className="pgm-btn full">Reporter la séance</button></form>
        <form action={cancelOccurrence} className="pgm-card"><input type="hidden" name="session" value={id} /><p className="pgm-muted">Annuler cette occurrence : elle n’est pas comptée comme réalisée et les crédits réservés sont rendus.</p><button className="pgm-btn danger">Annuler la séance</button></form></div></section>}

      <section className="pgm-section"><h2>Historique des corrections</h2>
        {(revs ?? []).length === 0 ? <div className="pgm-empty">Aucune correction.</div> : <div className="pgm-scroll"><table className="pgm-table"><thead><tr><th>Date</th><th>Joueur</th><th>Avant → après</th><th>Motif</th></tr></thead><tbody>
          {(revs as any[]).map(r => <tr key={r.id}><td>{fp(r.changed_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>{names.get(r.booking_id) ?? '—'}</td>
            <td className="pgm-muted">{r.old_values?.status ?? '—'}/{r.old_values?.decision ?? '—'} → {r.new_values?.status ?? '—'}/{r.new_values?.decision ?? '—'}</td><td>{r.reason}</td></tr>)}
        </tbody></table></div>}</section>
    </Shell>
  );
}
