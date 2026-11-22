import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Joueurs — administration', robots: { index: false, follow: false } };

export default async function Page() {
  if (!(await getAdminUser())) redirect('/admin/login');
  const svc = serviceClient();
  const [{ data: profiles }, { data: admins }] = await Promise.all([
    svc.from('profiles').select('user_id,first_name,last_name,phone,level,consent_at,created_at').order('created_at', { ascending: false }),
    svc.from('admin_profiles').select('user_id'),
  ]);
  const adminIds = new Set((admins ?? []).map(a => a.user_id));
  const players = (profiles ?? []).filter(p => !adminIds.has(p.user_id));
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="joueurs" />
      <h1 style={{ fontSize: 30, marginBottom: 16 }}>Joueurs ({players.length})</h1>
      {players.length === 0 ? <div className="panel empty">Aucun joueur inscrit pour l’instant.</div> : (
        <div className="panel scroll"><table><thead><tr><th>Joueur</th><th>Niveau</th><th>Téléphone</th><th>Profil</th><th /></tr></thead><tbody>
          {players.map(p => (
            <tr key={p.user_id}>
              <td><b>{[p.first_name, p.last_name].filter(Boolean).join(' ') || 'Sans nom'}</b></td>
              <td>{p.level ?? '—'}</td><td>{p.phone ?? '—'}</td>
              <td>{p.consent_at ? <span className="badge confirmed">Complet</span> : <span className="badge pending">À compléter</span>}</td>
              <td><a className="btn ghost" style={{ padding: '6px 10px', fontSize: 11 }} href={`/admin/joueurs/${p.user_id}`}>Ouvrir</a></td>
            </tr>))}
        </tbody></table></div>)}
    </div></main>
  );
}
