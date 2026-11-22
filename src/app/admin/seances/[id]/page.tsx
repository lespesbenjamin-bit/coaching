import { redirect, notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { formatDay, formatTime, dayKey, durationMin } from '@/lib/dates';
import { ATTENDANCE_LABELS, CREDIT_LABELS } from '@/lib/backoffice';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { setAttendance, markAllPresent, cancelSession, rescheduleSession, cancelBookingCredit, addToSession } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Séance — administration', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient();
  const { data: s } = await svc.from('sessions').select('*, course_types(label,code), groups(id,name)').eq('id', id).maybeSingle();
  if (!s) notFound();
  const { data: bks } = await svc.from('bookings').select('id,status,source,participants,cancelled_late,customer_id,customers(first_name,last_name,phone),attendance_records(status,note)').eq('session_id', id).order('created_at');
  const rows = (bks ?? []) as any[];
  const credit = new Map<string, string>();
  for (const b of rows) { const { data } = await svc.rpc('booking_credit_state', { p_booking: b.id }); credit.set(b.id, data ?? 'none'); }
  const active = rows.filter(b => ['pending', 'confirmed', 'completed'].includes(b.status));
  const { data: customers } = await svc.from('customers').select('id,first_name,last_name').order('last_name').limit(500);
  const taken = new Set(active.map(b => b.customer_id));
  const to = `/admin/seances/${id}`; const cancelled = s.status === 'cancelled';
  const att = (b: any) => Array.isArray(b.attendance_records) ? b.attendance_records[0] : b.attendance_records;
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="agenda" />
      <p className="muted">{s.groups ? <a href={`/admin/groupes/${s.groups.id}`}>← {s.groups.name}</a> : <a href="/admin/agenda">← Agenda</a>}</p>
      <h1 style={{ fontSize: 28, margin: '6px 0 4px' }}>{s.title ?? s.course_types?.label}</h1>
      <p className="muted"><span className="cap">{formatDay(s.starts_at)}</span> · {formatTime(s.starts_at)}–{formatTime(s.ends_at)} · {s.capacity} place(s) · {s.visibility === 'group_only' ? 'Réservée au groupe' : 'Publique'}{cancelled && <> · <b>Annulée</b></>}{s.status === 'suspended' && <> · <b>Suspendue</b></>}</p>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid2">
        <section>
          <div className="bar"><h2>Participants ({active.length}/{s.capacity})</h2>
            {!cancelled && <form action={markAllPresent}><input type="hidden" name="session" value={id} /><input type="hidden" name="back" value={to} /><button className="btn">Tous présents</button></form>}</div>
          {active.length === 0 ? <div className="panel empty">Aucun participant.</div> : <div className="panel scroll"><table><thead><tr><th>Joueur</th><th>Présence</th><th>Crédit</th><th /></tr></thead><tbody>
            {active.map(b => { const a = att(b); return (
              <tr key={b.id}><td><a href={`/admin/joueurs/fiche/${b.customer_id}`}><b>{b.customers.first_name} {b.customers.last_name}</b></a><br /><span className="muted">{b.source === 'makeup' ? 'Rattrapage' : b.source === 'group' ? 'Groupe' : b.status === 'pending' ? 'En attente' : 'Réservation'}</span></td>
                <td>{a ? ATTENDANCE_LABELS[a.status] : <span className="muted">À saisir</span>}</td>
                <td>{CREDIT_LABELS[credit.get(b.id) ?? 'none']}</td>
                <td>{b.status !== 'pending' && <form action={setAttendance} className="row-actions">
                  <input type="hidden" name="booking" value={b.id} /><input type="hidden" name="back" value={to} />
                  <select name="status" defaultValue={a?.status ?? 'present'} aria-label="Présence">{Object.entries(ATTENDANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <button className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }}>OK</button></form>}
                  {['pending', 'confirmed'].includes(b.status) && <form action={cancelBookingCredit} style={{ marginTop: 4 }}><input type="hidden" name="booking" value={b.id} /><input type="hidden" name="back" value={to} /><ConfirmButton message="Annuler cette inscription ? Le crédit est rendu ou consommé selon le délai d’annulation.">Annuler</ConfirmButton></form>}</td></tr>); })}
          </tbody></table></div>}
          {!cancelled && active.length < s.capacity && (
            <form action={addToSession} className="row-actions" style={{ marginTop: 10 }}><input type="hidden" name="session" value={id} /><input type="hidden" name="back" value={to} />
              <select name="customer" required defaultValue=""><option value="" disabled>Inscrire un joueur…</option>{((customers ?? []) as any[]).filter(c => !taken.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name}</option>)}</select><button className="btn">Inscrire</button></form>)}
        </section>
        <aside>
          {!cancelled && <>
            <form action={rescheduleSession} className="form panel" style={{ padding: 16 }}>
              <h3 className="full">Modifier l’horaire</h3><input type="hidden" name="session" value={id} /><input type="hidden" name="back" value={to} />
              <label>Date<input name="date" type="date" defaultValue={dayKey(s.starts_at)} required /></label>
              <label>Heure<input name="time" type="time" defaultValue={formatTime(s.starts_at).replace('h', ':')} required /></label>
              <label>Durée (min)<input name="duration" type="number" min={15} max={360} defaultValue={durationMin(s.starts_at, s.ends_at)} required /></label>
              <button className="btn full">Enregistrer</button>
              <p className="muted full">Les inscriptions sont conservées. Les joueurs ne sont pas prévenus automatiquement.</p>
            </form>
            <form action={cancelSession} style={{ marginTop: 14 }}><input type="hidden" name="session" value={id} /><input type="hidden" name="back" value={to} />
              <ConfirmButton message="Annuler cette séance ? Toutes les inscriptions sont annulées et les crédits rendus.">Annuler la séance</ConfirmButton></form></>}
        </aside>
      </div>
    </div></main>
  );
}
