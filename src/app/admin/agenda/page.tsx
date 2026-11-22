import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { formatDay, formatTime, dayKey, euros } from '@/lib/dates';
import { STATUS_LABELS, type BookingStatus } from '@/lib/booking-rules';
import { BookingButtons, NoteField, SessionForm, DeleteSession } from './Actions';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Agenda — administration', robots: { index: false, follow: false } };

async function logout() { 'use server'; const { sessionClient } = await import('@/lib/supabase/server'); await (await sessionClient()).auth.signOut(); redirect('/admin/login'); }

export default async function Page({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { vue } = await searchParams;
  const horizon = vue === 'mois' ? 31 : 7;
  const supa = serviceClient();
  const now = new Date(); const until = new Date(now.getTime() + horizon * 86400000).toISOString();

  const [{ data: sessions }, { data: bookings }] = await Promise.all([
    supa.from('sessions').select('id,starts_at,ends_at,booking_mode,court_secured,capacity,status,price_per_person_cents,course_types(label,code)')
      .gte('ends_at', now.toISOString()).lte('starts_at', until).neq('status', 'cancelled').order('starts_at'),
    supa.from('bookings').select('id,status,participants,price_total_cents,comment,admin_note,created_at,session_id,customers(first_name,last_name,email,phone,level),sessions(starts_at,ends_at,course_types(label))')
      .in('status', ['pending', 'confirmed']).order('created_at', { ascending: false }).limit(200),
  ]);
  const bks = (bookings ?? []) as any[];
  const seats = (id: string) => bks.filter(b => b.session_id === id).reduce((n, b) => n + b.participants, 0);
  const pending = bks.filter(b => b.status === 'pending');
  const upcomingConfirmed = bks.filter(b => b.status === 'confirmed' && new Date(b.sessions.ends_at) > now).sort((a, b) => a.sessions.starts_at.localeCompare(b.sessions.starts_at));
  const days = ((sessions ?? []) as any[]).reduce<Record<string, any[]>>((a, s) => { (a[dayKey(s.starts_at)] ??= []).push(s); return a; }, {});

  return (
    <main className="main"><div className="wrap">
      <AdminNav current="agenda" />
      <div className="bar"><h1 style={{ fontSize: 30 }}>Agenda</h1>
        <form action={logout}><button className="btn ghost" style={{ padding: '8px 14px' }}>Déconnexion</button></form></div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ marginBottom: 10 }}>Demandes en attente ({pending.length})</h2>
        {pending.length === 0 ? <div className="panel empty">Aucune demande en attente.</div> : (
          <div className="panel scroll"><table><thead><tr><th>Cours</th><th>Client</th><th>Note</th><th>Actions</th></tr></thead><tbody>
            {pending.map(b => (
              <tr key={b.id}>
                <td><b>{b.sessions.course_types.label}</b><br /><span className="cap">{formatDay(b.sessions.starts_at)}</span> · {formatTime(b.sessions.starts_at)}<br />{b.participants} pers. · {euros(b.price_total_cents)}</td>
                <td>{b.customers.first_name} {b.customers.last_name}<br /><a href={`mailto:${b.customers.email}`}>{b.customers.email}</a><br /><a href={`tel:${b.customers.phone}`}>{b.customers.phone}</a>{b.customers.level && <><br />Niveau : {b.customers.level}</>}{b.comment && <><br /><i>« {b.comment} »</i></>}</td>
                <td><NoteField id={b.id} initial={b.admin_note ?? ''} /></td>
                <td><BookingButtons id={b.id} status={b.status} /></td>
              </tr>))}
          </tbody></table></div>)}
      </section>

      <div className="grid2">
        <section>
          <div className="bar"><h2>Planning</h2>
            <div className="seg"><a href="?vue=semaine"><button className={horizon === 7 ? 'on' : ''}>7 jours</button></a><a href="?vue=mois"><button className={horizon === 31 ? 'on' : ''}>Mois</button></a></div></div>
          {Object.keys(days).length === 0 ? <div className="panel empty">Aucun créneau sur la période. Ajoutez-en avec le formulaire.</div> : (
            <div className="days">{Object.entries(days).map(([d, list]) => (
              <div className="day" key={d}><h3>{formatDay(`${d}T12:00:00Z`)}</h3>
                <div style={{ padding: 12, display: 'grid', gap: 8 }}>
                  {list.map((s: any) => { const taken = seats(s.id); return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span><b>{formatTime(s.starts_at)}–{formatTime(s.ends_at)}</b> · {s.course_types.label} · {taken}/{s.capacity} {s.capacity > 1 ? 'inscrits' : taken ? 'réservé' : 'libre'}
                        <br /><span className="muted">{s.booking_mode === 'auto' && s.court_secured ? 'Confirmation auto' : s.booking_mode === 'auto' ? 'Auto (terrain non sécurisé → validation)' : 'Sur validation'} · {euros(s.price_per_person_cents)}/pers.</span></span>
                      <DeleteSession id={s.id} /></div>); })}
                </div></div>))}</div>)}

          <h2 style={{ margin: '24px 0 10px' }}>Réservations confirmées à venir ({upcomingConfirmed.length})</h2>
          {upcomingConfirmed.length === 0 ? <div className="panel empty">Aucune réservation confirmée.</div> : (
            <div className="panel scroll"><table><thead><tr><th>Cours</th><th>Client</th><th>Statut</th><th /></tr></thead><tbody>
              {upcomingConfirmed.map(b => (
                <tr key={b.id}><td><b>{b.sessions.course_types.label}</b><br /><span className="cap">{formatDay(b.sessions.starts_at)}</span> · {formatTime(b.sessions.starts_at)}</td>
                  <td>{b.customers.first_name} {b.customers.last_name}<br /><a href={`tel:${b.customers.phone}`}>{b.customers.phone}</a></td>
                  <td><span className={`badge ${b.status}`}>{STATUS_LABELS[b.status as BookingStatus]}</span></td>
                  <td><BookingButtons id={b.id} status={b.status} /></td></tr>))}
            </tbody></table></div>)}
        </section>
        <aside><SessionForm /></aside>
      </div>
    </div></main>
  );
}
