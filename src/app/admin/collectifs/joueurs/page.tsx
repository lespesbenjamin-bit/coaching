import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import Shell, { Notice } from '@/components/pgm/Shell';
import { Badge } from '@/components/pgm/ui';
import { customCredits } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — collectifs', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const [{ data: mem }, { data: bal }, { data: att }] = await Promise.all([
    svc.from('group_memberships').select('customer_id,group_id,customers(first_name,last_name),groups(name)').eq('status', 'active'),
    svc.from('v_credit_balance').select('customer_id,available,consumed'),
    svc.from('attendance_records').select('status,bookings!inner(customer_id,sessions!inner(group_id))').eq('status', 'present').not('bookings.sessions.group_id', 'is', null).limit(20000),
  ]);
  const players = new Map<string, { name: string; groups: string[] }>();
  for (const m of (mem ?? []) as any[]) { const p = players.get(m.customer_id) ?? { name: `${m.customers.last_name} ${m.customers.first_name}`, groups: [] }; p.groups.push(m.groups.name); players.set(m.customer_id, p); }
  const balOf = new Map(((bal ?? []) as any[]).map(b => [b.customer_id, b]));
  const played = new Map<string, number>(); for (const a of (att ?? []) as any[]) { const c = a.bookings?.customer_id; if (c) played.set(c, (played.get(c) ?? 0) + 1); }
  const list = [...players.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  return (
    <Shell current="joueurs" title="Joueurs">
      <Notice ok={sp.ok} err={sp.err} />
      {list.length === 0 ? <div className="pgm-empty">Aucun joueur dans les groupes.</div> : <div className="pgm-scroll"><table className="pgm-table"><thead><tr><th>Joueur</th><th>Groupes</th><th>Séances jouées</th><th>Consommés</th><th>Disponibles</th><th>Ajouter des crédits</th></tr></thead><tbody>
        {list.map(([id, p]) => { const b: any = balOf.get(id); return <tr key={id}><td><a href={`/admin/joueurs/fiche/${id}`}><b>{p.name}</b></a></td><td>{p.groups.join(', ')}</td><td>{played.get(id) ?? 0}</td><td>{b?.consumed ?? 0}</td>
          <td>{b ? <Badge tone={b.available <= 0 ? 'bad' : b.available <= 2 ? 'warn' : 'ok'}>{b.available}{b.available <= 2 ? ' · forfait bientôt épuisé' : ''}</Badge> : <Badge>Sans forfait</Badge>}</td>
          <td><form action={customCredits} className="pgm-actions"><input type="hidden" name="customer" value={id} /><input name="credits" type="number" min={1} max={200} defaultValue={10} style={{ width: 80 }} aria-label="Crédits" /><button className="pgm-btn sm">Ajouter</button></form></td></tr>; })}
      </tbody></table></div>}
    </Shell>
  );
}
