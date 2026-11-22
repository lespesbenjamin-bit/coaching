import { redirect, notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { formatDay, formatTime, euros } from '@/lib/dates';
import { ATTENDANCE_LABELS } from '@/lib/backoffice';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { grantPack, adjustCredits, bookMakeup } from '../../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche joueur — administration', robots: { index: false, follow: false } };
const KIND: Record<string, string> = { grant: 'Attribution', hold: 'Réservé', release: 'Rendu', consume: 'Consommé', reverse_consume: 'Consommation annulée', expire: 'Expiré', adjust: 'Correction' };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const svc = serviceClient(); const iso = new Date().toISOString();
  const { data: c } = await svc.from('customers').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [{ data: bal }, { data: allocs }, { data: tx }, { data: bks }, { data: groups }, { data: packs }, { data: mk }, { data: future }] = await Promise.all([
    svc.from('v_credit_balance').select('*').eq('customer_id', id).maybeSingle(),
    svc.from('player_pack_allocations').select('*').eq('customer_id', id).order('granted_at', { ascending: false }),
    svc.from('credit_transactions').select('id,kind,d_available,reason,created_at,player_pack_allocations(name)').eq('customer_id', id).order('created_at', { ascending: false }).limit(40),
    svc.from('bookings').select('id,status,source,sessions(id,starts_at,title,course_types(label)),attendance_records(status)').eq('customer_id', id).order('created_at', { ascending: false }).limit(40),
    svc.from('group_memberships').select('status,joined_at,left_at,groups(id,name)').eq('customer_id', id).order('joined_at', { ascending: false }),
    svc.from('pack_definitions').select('id,name,credits,price_cents').eq('active', true).order('credits'),
    svc.from('makeup_entitlements').select('id,status,created_at,bookings!makeup_entitlements_origin_booking_id_fkey(sessions(starts_at,course_type_id,course_types(label)))').eq('customer_id', id).order('created_at', { ascending: false }),
    svc.from('sessions').select('id,starts_at,course_type_id,course_types(label)').eq('status', 'open').gt('starts_at', iso).order('starts_at').limit(60),
  ]);
  const to = `/admin/joueurs/fiche/${id}`;
  const att = (b: any) => Array.isArray(b.attendance_records) ? b.attendance_records[0] : b.attendance_records;
  const b = (bal ?? { available: 0, reserved: 0, consumed: 0, expired: 0 }) as any;
  const activeAllocs = ((allocs ?? []) as any[]).filter(a => a.status === 'active');
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="joueurs" />
      <p className="muted"><a href="/admin/joueurs">← Joueurs</a></p>
      <h1 style={{ fontSize: 30, margin: '6px 0 4px' }}>{c.first_name} {c.last_name}</h1>
      <p className="muted"><a href={`mailto:${c.email}`}>{c.email}</a> · <a href={`tel:${c.phone}`}>{c.phone}</a> · Niveau {c.level ?? '—'} · {c.user_id ? <><span className="badge confirmed">Compte lié</span> <a href={`/admin/joueurs/${c.user_id}`}>suivi, objectifs, comptes rendus</a></> : 'Sans compte'}</p>
      <Flash ok={sp.ok} err={sp.err} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, margin: '14px 0 22px' }}>
        {[['Disponibles', b.available], ['Réservés', b.reserved], ['Consommés', b.consumed], ['Expirés', b.expired]].map(([l, n]) => <div className="panel" key={l as string} style={{ padding: 14 }}><div style={{ fontSize: 30, fontWeight: 900 }}>{n}</div><div className="muted">{l}</div></div>)}
      </div>
      <div className="grid2">
        <section>
          <h2 style={{ marginBottom: 10 }}>Séances</h2>
          {(bks ?? []).length === 0 ? <div className="panel empty">Aucune séance.</div> : <div className="panel scroll"><table><tbody>
            {((bks ?? []) as any[]).map(k => { const a = att(k); return <tr key={k.id}><td><span className="cap">{formatDay(k.sessions.starts_at)}</span> · {formatTime(k.sessions.starts_at)}<br /><span className="muted">{k.sessions.title ?? k.sessions.course_types?.label}{k.source === 'makeup' ? ' · rattrapage' : ''}</span></td>
              <td>{a ? ATTENDANCE_LABELS[a.status] : k.status === 'cancelled' ? 'Annulée' : k.status === 'pending' ? 'En attente' : 'Prévue'}</td><td><a href={`/admin/seances/${k.sessions.id}`}>Ouvrir</a></td></tr>; })}</tbody></table></div>}
          <h2 style={{ margin: '22px 0 10px' }}>Rattrapages</h2>
          {(mk ?? []).length === 0 ? <div className="panel empty">Aucun rattrapage.</div> : ((mk ?? []) as any[]).map(m => {
            const o = m.bookings?.sessions; const opts = ((future ?? []) as any[]).filter(s => s.course_type_id === o?.course_type_id); return (
            <div className="panel" key={m.id} style={{ padding: 14, marginBottom: 8 }}>
              Séance du <b>{o ? formatDay(o.starts_at) : '—'}</b> — {m.status === 'open' ? 'à rattraper' : m.status === 'booked' ? 'rattrapage réservé' : m.status === 'done' ? 'rattrapé' : 'annulé'}
              {m.status === 'open' && <form action={bookMakeup} className="row-actions" style={{ marginTop: 8 }}><input type="hidden" name="entitlement" value={m.id} /><input type="hidden" name="back" value={to} />
                <select name="session" required defaultValue=""><option value="" disabled>Choisir une séance…</option>{opts.map(s => <option key={s.id} value={s.id}>{formatDay(s.starts_at)} {formatTime(s.starts_at)}</option>)}</select><button className="btn">Réserver</button></form>}
            </div>); })}
          <h2 style={{ margin: '22px 0 10px' }}>Groupes</h2>
          {(groups ?? []).length === 0 ? <div className="panel empty">Aucun groupe.</div> : <div className="panel scroll"><table><tbody>
            {((groups ?? []) as any[]).map((g, i) => <tr key={i}><td><a href={`/admin/groupes/${g.groups?.id}`}>{g.groups?.name}</a></td><td>{g.status === 'active' ? 'Membre actuel' : 'Parti'}</td><td>{new Date(g.joined_at).toLocaleDateString('fr-FR')}{g.left_at && ` → ${new Date(g.left_at).toLocaleDateString('fr-FR')}`}</td></tr>)}</tbody></table></div>}
        </section>
        <aside>
          <h2 style={{ marginBottom: 10 }}>Packs</h2>
          {(allocs ?? []).length === 0 ? <div className="panel empty">Aucun pack.</div> : <div className="panel scroll"><table><tbody>
            {((allocs ?? []) as any[]).map(a => <tr key={a.id}><td><b>{a.name}</b><br /><span className="muted">{a.credits_granted} crédits · {euros(a.price_cents)}{a.expires_at ? ` · expire le ${new Date(a.expires_at).toLocaleDateString('fr-FR')}` : ''}</span></td></tr>)}</tbody></table></div>}
          <form action={grantPack} className="form panel" style={{ padding: 16, marginTop: 12 }}>
            <h3 className="full">Attribuer un pack</h3><input type="hidden" name="customer" value={id} /><input type="hidden" name="back" value={to} />
            <label className="full">Pack<select name="pack" required defaultValue=""><option value="" disabled>Choisir…</option>{(packs ?? []).map(p => <option key={p.id} value={p.id}>{p.name} — {p.credits} crédits ({euros(p.price_cents)})</option>)}</select></label>
            <label className="full">Note (paiement, chèque…)<input name="note" maxLength={200} /></label>
            <button className="btn full">Attribuer</button></form>
          {activeAllocs.length > 0 && <form action={adjustCredits} className="form panel" style={{ padding: 16, marginTop: 12 }}>
            <h3 className="full">Correction manuelle</h3><input type="hidden" name="customer" value={id} /><input type="hidden" name="back" value={to} />
            <label className="full">Pack<select name="alloc" required>{activeAllocs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Quantité (+ ou −)<input name="delta" type="number" required /></label>
            <label className="full">Motif (obligatoire)<input name="reason" required minLength={3} maxLength={200} /></label>
            <button className="btn full">Enregistrer la correction</button></form>}
          <h2 style={{ margin: '22px 0 10px' }}>Journal des crédits</h2>
          {(tx ?? []).length === 0 ? <div className="panel empty">Aucun mouvement.</div> : <div className="panel scroll"><table><tbody>
            {((tx ?? []) as any[]).map(t => <tr key={t.id}><td>{new Date(t.created_at).toLocaleDateString('fr-FR')}</td><td>{KIND[t.kind]}{t.reason ? <><br /><span className="muted">{t.reason}</span></> : null}</td><td>{t.d_available > 0 ? '+' : ''}{t.d_available !== 0 ? t.d_available : ''}</td></tr>)}</tbody></table></div>}
        </aside>
      </div>
    </div></main>
  );
}
