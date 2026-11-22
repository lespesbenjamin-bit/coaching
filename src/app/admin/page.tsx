import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { formatDay, formatTime } from '@/lib/dates';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord — administration', robots: { index: false, follow: false } };

export default async function Page() {
  if (!(await getAdminUser())) redirect('/admin/login');
  const svc = serviceClient(); const now = new Date(); const in7 = new Date(now.getTime() + 7 * 86400000).toISOString(); const iso = now.toISOString();
  const [pend, week, groups, lowRows, noAtt, makeups, exp] = await Promise.all([
    svc.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    svc.from('sessions').select('id,starts_at,title,capacity,course_types(label),group_id', { count: 'exact' }).gte('starts_at', iso).lte('starts_at', in7).in('status', ['open']).order('starts_at').limit(12),
    svc.from('groups').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    svc.from('v_credit_balance').select('customer_id,available,reserved').lte('available', 1).gt('granted', 0),
    svc.from('sessions').select('id,starts_at,title,course_types(label)').lt('ends_at', iso).eq('status', 'open').order('starts_at', { ascending: false }).limit(40),
    svc.from('makeup_entitlements').select('id,customers(first_name,last_name)').eq('status', 'open'),
    svc.from('player_pack_allocations').select('id,name,expires_at,customers(first_name,last_name)').eq('status', 'active').gt('expires_at', iso).lte('expires_at', new Date(now.getTime() + 30 * 86400000).toISOString()),
  ]);
  // séances passées dont des réservations confirmées n'ont aucune présence saisie
  const pastIds = (noAtt.data ?? []).map((s: any) => s.id);
  const { data: open } = pastIds.length ? await svc.from('bookings').select('id,session_id,attendance_records(id)').in('session_id', pastIds).eq('status', 'confirmed') : { data: [] as any[] };
  const toMark = new Set((open ?? []).filter((b: any) => !b.attendance_records || (Array.isArray(b.attendance_records) ? !b.attendance_records.length : false)).map((b: any) => b.session_id));
  const toMarkList = (noAtt.data ?? []).filter((s: any) => toMark.has(s.id));
  const lowIds = ((lowRows.data ?? []) as any[]).map(r => r.customer_id);
  const { data: lowC } = lowIds.length ? await svc.from('customers').select('id,first_name,last_name').in('id', lowIds) : { data: [] as any[] };
  const nameOf = new Map(((lowC ?? []) as any[]).map(c => [c.id, `${c.first_name} ${c.last_name}`]));
  const Card = ({ n, label, href }: { n: number; label: string; href: string }) => <a href={href} className="panel" style={{ padding: 16, textDecoration: 'none' }}><div style={{ fontSize: 34, fontWeight: 900 }}>{n}</div><div className="muted">{label}</div></a>;
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="dashboard" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Tableau de bord</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 24 }}>
        <Card n={pend.count ?? 0} label="Demandes en attente" href="/admin/agenda" />
        <Card n={week.count ?? 0} label="Séances sur 7 jours" href="/admin/agenda" />
        <Card n={groups.count ?? 0} label="Groupes actifs" href="/admin/groupes" />
        <Card n={toMarkList.length} label="Présences à saisir" href="/admin/agenda" />
        <Card n={makeups.data?.length ?? 0} label="Rattrapages en attente" href="/admin/joueurs" />
      </div>
      <div className="grid2">
        <section><h2 style={{ marginBottom: 10 }}>Prochaines séances</h2>
          {(week.data ?? []).length === 0 ? <div className="panel empty">Aucune séance dans les 7 jours.</div> : <div className="panel scroll"><table><tbody>
            {(week.data as any[]).map(s => <tr key={s.id}><td><span className="cap">{formatDay(s.starts_at)}</span> · {formatTime(s.starts_at)}</td><td>{s.title ?? s.course_types?.label}</td><td><a href={`/admin/seances/${s.id}`}>Ouvrir</a></td></tr>)}</tbody></table></div>}
          <h2 style={{ margin: '22px 0 10px' }}>Présences à saisir</h2>
          {toMarkList.length === 0 ? <div className="panel empty">Tout est à jour.</div> : <div className="panel scroll"><table><tbody>
            {toMarkList.slice(0, 10).map((s: any) => <tr key={s.id}><td><span className="cap">{formatDay(s.starts_at)}</span> · {formatTime(s.starts_at)}</td><td>{s.title ?? s.course_types?.label}</td><td><a href={`/admin/seances/${s.id}`}>Saisir</a></td></tr>)}</tbody></table></div>}
        </section>
        <aside><h2 style={{ marginBottom: 10 }}>Crédits à surveiller</h2>
          {(lowRows.data ?? []).length === 0 ? <div className="panel empty">Aucun joueur avec 1 crédit ou moins.</div> : <div className="panel scroll"><table><tbody>
            {(lowRows.data as any[]).map(r => <tr key={r.customer_id}><td>{nameOf.get(r.customer_id)}</td><td>{r.available} dispo · {r.reserved} réservé(s)</td><td><a href={`/admin/joueurs/fiche/${r.customer_id}`}>Fiche</a></td></tr>)}</tbody></table></div>}
          <h2 style={{ margin: '22px 0 10px' }}>Packs bientôt expirés (30 j)</h2>
          {(exp.data ?? []).length === 0 ? <div className="panel empty">Aucun.</div> : <div className="panel scroll"><table><tbody>
            {(exp.data as any[]).map(a => <tr key={a.id}><td>{a.customers?.first_name} {a.customers?.last_name}</td><td>{a.name}</td><td>{new Date(a.expires_at).toLocaleDateString('fr-FR')}</td></tr>)}</tbody></table></div>}
        </aside>
      </div>
    </div></main>
  );
}
