import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/auth';
import { formatDay, formatTime, euros } from '@/lib/dates';
import { STATUS_LABELS, type BookingStatus } from '@/lib/booking-rules';
import ConfirmButton from '@/components/ConfirmButton';
import Sidebar from '@/components/Sidebar';
import Tournois from './Tournois';
import { saveProfile, addGoal, setGoalStatus, deleteGoal, addTournament, updateTournament, deleteTournament, signOut, deleteAccount } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon espace joueur', robots: { index: false, follow: false } };

const TABS = [['seances', 'Séances'], ['rapports', 'Comptes rendus'], ['objectifs', 'Objectifs'], ['progression', 'Progression'], ['tournois', 'Mes tournois'], ['profil', 'Profil']] as const;
const dshort = (d: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`));

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supa = await sessionClient();
  const { data: auth } = await supa.auth.getUser();
  const user = auth.user; if (!user) redirect('/connexion');

  // Rattache les réservations passées au compte, UNIQUEMENT si l'e-mail est vérifié
  if (user.email && user.email_confirmed_at) {
    await serviceClient().from('customers').update({ user_id: user.id }).eq('email', user.email.trim().toLowerCase()).is('user_id', null);
  }
  const { data: profile } = await supa.from('profiles').select('*').eq('user_id', user.id).single();
  const incomplete = !profile?.adult_confirmed_at || !profile?.consent_at || !profile?.first_name;
  const tab = incomplete ? 'profil' : (TABS.some(t => t[0] === sp.tab) ? sp.tab! : 'seances');
  const isAdmin = !!(await getAdminUser());

  return (
    <>
      <section className="hero"><div className="wrap">
        <div className="eyebrow">Espace joueur</div>
        <h1>{profile?.first_name ? `Salut ${profile.first_name}` : 'Bienvenue'}</h1>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="btn" href="/reservation">Réserver un cours</a>
          {isAdmin && <a className="btn ghost" href="/admin/agenda">Espace coach</a>}
          <form action={signOut}><button className="btn ghost">Déconnexion</button></form>
        </div>
      </div></section>
      <main className="main"><div className="wrap">
        {sp.ok && tab !== 'tournois' && <div className="notice ok">Enregistré.</div>}
        {sp.err === 'champs' && <div className="notice bad">Merci de vérifier les champs saisis.</div>}
        {sp.err === 'consentement' && <div className="notice bad">Pour continuer, confirmez que vous avez 18 ans ou plus et acceptez le traitement de vos données.</div>}
        {sp.err === 'confirmation' && <div className="notice bad">Tapez exactement SUPPRIMER pour confirmer.</div>}
        {!incomplete && <Sidebar title="Espace joueur" items={TABS.map(([k, l]) => ({ key: k, href: `?tab=${k}`, label: l }))} current={tab} footer={<a href="/reservation">Réserver un cours</a>} />}
        {incomplete && <div className="notice warn">Complétez votre profil pour accéder à votre espace.</div>}

        {tab === 'seances' && await Seances(user.id)}
        {tab === 'rapports' && await Rapports(supa)}
        {tab === 'objectifs' && await Objectifs(supa)}
        {tab === 'progression' && await Progression(supa)}
        {tab === 'tournois' && await Tournois({ supa, userId: user.id, sp: sp as Record<string, string | undefined> })}
        {tab === 'profil' && <Profil p={profile} email={user.email ?? ''} incomplete={incomplete} />}
      </div></main>
    </>
  );
}

async function Seances(userId: string) {
  const svc = serviceClient();
  const { data: cust } = await svc.from('customers').select('id').eq('user_id', userId);
  const ids = (cust ?? []).map(c => c.id);
  const { data } = ids.length ? await svc.from('bookings').select('id,status,participants,price_total_cents,sessions(starts_at,ends_at,course_types(label))').in('customer_id', ids) : { data: [] };
  const rows = ((data ?? []) as any[]).sort((a, b) => b.sessions.starts_at.localeCompare(a.sessions.starts_at));
  const now = new Date().toISOString();
  const up = rows.filter(r => r.sessions.ends_at >= now && ['pending', 'confirmed'].includes(r.status)), past = rows.filter(r => !up.includes(r));
  const Row = (r: any) => <tr key={r.id}><td><b>{r.sessions.course_types.label}</b><br /><span className="cap">{formatDay(r.sessions.starts_at)}</span> · {formatTime(r.sessions.starts_at)}</td><td>{euros(r.price_total_cents)}</td><td><span className={`badge ${r.status}`}>{STATUS_LABELS[r.status as BookingStatus]}</span></td></tr>;
  return <>
    <h2 style={{ marginBottom: 10 }}>À venir</h2>
    {up.length ? <div className="panel scroll"><table><tbody>{up.map(Row)}</tbody></table></div> : <div className="panel empty">Aucune séance à venir. <a href="/reservation">Réserver un cours</a></div>}
    <h2 style={{ margin: '24px 0 10px' }}>Historique</h2>
    {past.length ? <div className="panel scroll"><table><tbody>{past.map(Row)}</tbody></table></div> : <div className="panel empty">Pas encore d’historique.</div>}
  </>;
}

async function Rapports(supa: Awaited<ReturnType<typeof sessionClient>>) {
  const { data } = await supa.from('session_reports').select('*').order('session_date', { ascending: false });
  if (!data?.length) return <div className="panel empty">Vos comptes rendus de séance apparaîtront ici après chaque cours.</div>;
  return <div className="days">{data.map(r => (
    <article className="day" key={r.id}><h3>{dshort(r.session_date)} — {r.title}</h3>
      <div style={{ padding: 16, display: 'grid', gap: 10 }}>
        {r.summary && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.summary}</p>}
        {r.strengths && <p style={{ margin: 0 }}><b>Points forts</b><br /><span style={{ whiteSpace: 'pre-wrap' }}>{r.strengths}</span></p>}
        {r.to_work && <p style={{ margin: 0 }}><b>À travailler</b><br /><span style={{ whiteSpace: 'pre-wrap' }}>{r.to_work}</span></p>}
        {r.homework && <p style={{ margin: 0 }}><b>Pour la prochaine fois</b><br /><span style={{ whiteSpace: 'pre-wrap' }}>{r.homework}</span></p>}
      </div></article>))}</div>;
}

async function Objectifs(supa: Awaited<ReturnType<typeof sessionClient>>) {
  const { data } = await supa.from('goals').select('*').order('created_at', { ascending: false });
  const ST: Record<string, string> = { active: 'En cours', achieved: 'Atteint', abandoned: 'Abandonné' };
  return <div className="grid2">
    <section>{!data?.length ? <div className="panel empty">Aucun objectif pour le moment.</div> : <div className="days">{data.map(g => (
      <div className="panel" key={g.id}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <b>{g.title}</b><span className={`badge ${g.status === 'achieved' ? 'confirmed' : ''}`}>{ST[g.status]}</span></div>
        {g.description && <p className="muted" style={{ margin: '6px 0' }}>{g.description}</p>}
        <div className="muted">{g.target_date && <>Échéance : {dshort(g.target_date)} · </>}{g.created_by_role === 'coach' ? 'Fixé par votre coach' : 'Votre objectif'}</div>
        {g.created_by_role === 'player' && <div className="row-actions" style={{ marginTop: 10 }}>
          <form action={setGoalStatus}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value={g.status === 'achieved' ? 'active' : 'achieved'} /><button className="btn ghost">{g.status === 'achieved' ? 'Rouvrir' : 'Marquer atteint'}</button></form>
          <form action={deleteGoal}><input type="hidden" name="id" value={g.id} /><ConfirmButton message="Supprimer cet objectif ?">Supprimer</ConfirmButton></form></div>}
      </div>))}</div>}</section>
    <aside><form action={addGoal} className="panel form" style={{ gridTemplateColumns: '1fr' }}>
      <h2 style={{ fontSize: 18 }}>Mon objectif</h2>
      <label>Objectif<input name="title" required maxLength={120} placeholder="ex. Gagner un P250" /></label>
      <label>Détail<textarea name="description" rows={3} maxLength={500} /></label>
      <label>Échéance<input name="date" type="date" /></label>
      <button className="btn">Ajouter</button></form></aside></div>;
}

async function Progression(supa: Awaited<ReturnType<typeof sessionClient>>) {
  const { data } = await supa.from('progress_entries').select('*').order('entered_on', { ascending: false });
  if (!data?.length) return <div className="panel empty">Votre coach renseignera ici l’évolution de votre niveau.</div>;
  return <div className="panel scroll"><table><thead><tr><th>Date</th><th>Niveau</th><th>Points</th><th>Note du coach</th></tr></thead><tbody>
    {data.map(e => <tr key={e.id}><td>{dshort(e.entered_on)}</td><td>{e.level_label ?? '—'}</td><td>{e.ranking_points ?? '—'}</td><td>{e.note ?? ''}</td></tr>)}</tbody></table></div>;
}

function Profil({ p, email, incomplete }: { p: any; email: string; incomplete: boolean }) {
  return <div className="grid2">
    <form action={saveProfile} className="panel form">
      <h2 className="full" style={{ fontSize: 18 }}>Mon profil</h2>
      <label>Prénom<input name="first" required maxLength={60} defaultValue={p?.first_name ?? ''} /></label>
      <label>Nom<input name="last" required maxLength={60} defaultValue={p?.last_name ?? ''} /></label>
      <label>Téléphone<input name="phone" type="tel" maxLength={25} defaultValue={p?.phone ?? ''} /></label>
      <label>Niveau<input name="level" maxLength={40} defaultValue={p?.level ?? ''} placeholder="ex. P100" /></label>
      <p className="muted full" style={{ margin: 0 }}>E-mail : {email}</p>
      {!p?.adult_confirmed_at && <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'start' }}><input type="checkbox" name="adult" style={{ width: 'auto', marginTop: 4 }} />Je certifie avoir 18 ans ou plus. (L’espace joueur est pour l’instant réservé aux adultes.)</label>}
      {!p?.consent_at && <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'start' }}><input type="checkbox" name="consent" style={{ width: 'auto', marginTop: 4 }} />J’accepte que mon coach enregistre mes séances, comptes rendus, objectifs et résultats de tournois pour mon suivi. Je peux demander l’effacement de mon compte à tout moment, ci-contre.</label>}
      <div className="full"><button className="btn">{incomplete ? 'Valider et accéder à mon espace' : 'Enregistrer'}</button></div>
    </form>
    {!incomplete && <aside className="panel">
      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Supprimer mon compte</h2>
      <p className="muted">Cette action efface définitivement votre profil, vos comptes rendus, objectifs, progression et tournois. Elle est irréversible.</p>
      <form action={deleteAccount} className="form" style={{ gridTemplateColumns: '1fr' }}>
        <label>Tapez SUPPRIMER pour confirmer<input name="confirm" autoComplete="off" /></label>
        <ConfirmButton message="Supprimer définitivement votre compte et toutes vos données ?">Supprimer mon compte</ConfirmButton></form></aside>}
  </div>;
}
