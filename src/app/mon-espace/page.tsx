import { redirect } from 'next/navigation';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/auth';
import { formatDay, formatTime, euros } from '@/lib/dates';
import { STATUS_LABELS, type BookingStatus } from '@/lib/booking-rules';
import ConfirmButton from '@/components/ConfirmButton';
import PlayerShell, { Avatar } from '@/components/pj/PlayerShell';
import Tournois from './Tournois';
import { PART_SHORT } from '@/lib/tournois';
import { saveProfile, addGoal, setGoalStatus, deleteGoal, addTournament, updateTournament, deleteTournament, signOut, deleteAccount, uploadAvatar, removeAvatar } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon espace joueur', robots: { index: false, follow: false } };

const TABS = ['accueil', 'cours', 'tournois', 'progression', 'profil'] as const;
const PSUB = [['rapports', 'Comptes rendus'], ['objectifs', 'Objectifs'], ['evolution', 'Niveau']] as const;
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
  const tab = incomplete ? 'profil' : (TABS.some(t => t === sp.tab) ? sp.tab! : 'accueil');
  const isAdmin = !!(await getAdminUser());
  const sub = PSUB.some(x => x[0] === sp.s) ? sp.s! : 'rapports';
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) { const { data: u } = await serviceClient().storage.from('avatars').createSignedUrl(profile.avatar_path, 3600); avatarUrl = u?.signedUrl ?? null; }

  return (
    <PlayerShell current={tab} name={profile?.first_name ?? 'Mon espace'} first={profile?.first_name} last={profile?.last_name} avatarUrl={avatarUrl} isAdmin={isAdmin} signOut={signOut}>
      {sp.ok && tab !== 'tournois' && <div className="pj-note" role="status">Enregistré.</div>}
      {sp.err === 'champs' && <div className="pj-note bad" role="alert">Merci de vérifier les champs saisis.</div>}
      {sp.err === 'photo' && <div className="pj-note bad" role="alert">Photo refusée : JPEG, PNG ou WebP, 2 Mo maximum.</div>}
      {sp.err === 'consentement' && <div className="pj-note bad" role="alert">Pour continuer, confirmez que vous avez 18 ans ou plus et acceptez le traitement de vos données.</div>}
      {sp.err === 'confirmation' && <div className="pj-note bad" role="alert">Tapez exactement SUPPRIMER pour confirmer.</div>}
      {incomplete && <div className="pj-note warn">Complétez votre profil pour accéder à votre espace.</div>}

      {tab === 'accueil' && await Accueil(user.id, profile, avatarUrl)}
      {tab === 'cours' && await Seances(user.id)}
      {tab === 'tournois' && await Tournois({ supa, userId: user.id, sp: sp as Record<string, string | undefined> })}
      {tab === 'progression' && <>
        <div className="pj-head"><div className="grow"><h1>Ma progression</h1></div></div>
        <div className="pj-sub-tabs">{PSUB.map(([k, l]) => <a key={k} href={`?tab=progression&s=${k}`} className={sub === k ? 'on' : ''}>{l}</a>)}</div>
        {sub === 'rapports' && await Rapports(supa)}{sub === 'objectifs' && await Objectifs(supa)}{sub === 'evolution' && await Progression(supa)}</>}
      {tab === 'profil' && <Profil p={profile} email={user.email ?? ''} incomplete={incomplete} avatarUrl={avatarUrl} />}
    </PlayerShell>
  );
}

const lbl = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));

async function Accueil(userId: string, profile: any, avatarUrl: string | null) {
  const svc = serviceClient(); const nowIso = new Date().toISOString(); const today = nowIso.slice(0, 10);
  const { data: cust } = await svc.from('customers').select('id').eq('user_id', userId); const ids = (cust ?? []).map(c => c.id);
  const [bk, bal, tp] = ids.length ? await Promise.all([
    svc.from('bookings').select('id,status,sessions!inner(starts_at,ends_at,title,course_types(label),groups(name))').in('customer_id', ids).in('status', ['pending', 'confirmed']).gt('sessions.starts_at', nowIso).order('starts_at', { referencedTable: 'sessions' }).limit(50),
    svc.from('v_credit_balance').select('available').in('customer_id', ids),
    svc.from('tournament_participations').select('id,status,tournament_events!inner(id,name,start_date,category_code,city,status,clubs(name))').in('customer_id', ids).in('status', ['interested', 'planned', 'declared', 'confirmed']).gte('tournament_events.start_date', today).neq('tournament_events.status', 'cancelled').limit(50),
  ]) : [{ data: [] }, { data: [] }, { data: [] }] as any[];
  const courses = ((bk.data ?? []) as any[]).sort((a, b) => a.sessions.starts_at.localeCompare(b.sessions.starts_at));
  const tours = ((tp.data ?? []) as any[]).sort((a, b) => a.tournament_events.start_date.localeCompare(b.tournament_events.start_date));
  const credits = ((bal.data ?? []) as any[]).reduce((n, b) => n + b.available, 0);
  return <>
    <div className="pj-head"><Avatar url={avatarUrl} first={profile?.first_name} last={profile?.last_name} />
      <div className="grow"><h1>Bonjour {profile?.first_name ?? ''}</h1>
        <div className="pj-sub">{[profile?.level && `Niveau ${profile.level}`, profile?.fft_ranking && `Classement FFT ${profile.fft_ranking}${profile.ranking_source === 'verified' ? ' (vérifié)' : ' (déclaré)'}`].filter(Boolean).join(' · ') || 'Renseignez votre niveau et votre classement dans votre profil.'}</div></div>
      <a className="pj-btn ghost" href="/mon-espace?tab=profil">Paramètres du profil</a></div>
    <div className="pj-grid c4">
      <div className="pj-card pj-stat"><div className="v">{courses.length}</div><div className="l">Cours à venir</div></div>
      <div className="pj-card pj-stat"><div className="v">{credits}</div><div className="l">Crédits de cours restants</div></div>
      <div className="pj-card pj-stat"><div className="v">{tours.length}</div><div className="l">Tournois à venir</div></div>
    </div>
    <section className="pj-section"><h2>Prochains cours</h2>
      {courses.length === 0 ? <div className="pj-empty">Aucun cours à venir. <a href="/reservation">Réserver un cours</a></div> : <ul className="pj-list">{courses.slice(0, 4).map(b => { const s = b.sessions; const dur = Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000);
        return <li key={b.id}><a className="pj-item" href="/mon-espace?tab=cours"><span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><span className="pj-date"><small>{lbl(s.starts_at, { month: 'short' })}</small>{lbl(s.starts_at, { day: 'numeric' })}</span>
          <span><b>{s.course_types?.label ?? 'Cours'}{s.groups?.name ? ` · ${s.groups.name}` : ''}</b><br /><span className="pj-sub">{lbl(s.starts_at, { weekday: 'long' })} {lbl(s.starts_at, { hour: '2-digit', minute: '2-digit' })} · {dur} min</span></span></span>
          <span className={`pj-badge${b.status === 'pending' ? ' warn' : ''}`}>{b.status === 'pending' ? 'En attente de validation' : 'Confirmé'}</span></a></li>; })}</ul>}</section>
    <section className="pj-section"><h2>Prochains tournois</h2>
      {tours.length === 0 ? <div className="pj-empty">Aucun tournoi suivi à venir. <a href="/mon-espace?tab=tournois">Voir le calendrier</a></div> : <ul className="pj-list">{tours.slice(0, 4).map(t => { const e = t.tournament_events;
        return <li key={t.id}><a className="pj-item" href={`/mon-espace?tab=tournois&t=${e.id}`}><span><b>{e.name}</b><br /><span className="pj-sub">{[e.category_code, lbl(`${e.start_date}T12:00:00Z`, { day: 'numeric', month: 'long' }), e.clubs?.name ?? e.city].filter(Boolean).join(' · ')}</span></span>
          <span className="pj-badge mute">{PART_SHORT[t.status] ?? t.status}</span></a></li>; })}</ul>}</section>
    <section className="pj-section"><h2>Actions rapides</h2><div className="pj-actions">
      <a className="pj-btn" href="/reservation">Réserver un cours</a><a className="pj-btn ghost" href="/mon-espace?tab=cours">Voir mon agenda</a>
      <a className="pj-btn ghost" href="/mon-espace?tab=tournois">Mes tournois</a><a className="pj-btn ghost" href="/mon-espace?tab=progression">Mes bilans</a></div></section>
  </>;
}

async function Seances(userId: string) {
  const svc = serviceClient();
  const { data: cust } = await svc.from('customers').select('id').eq('user_id', userId);
  const ids = (cust ?? []).map(c => c.id);
  const [{ data }, { data: bal }] = ids.length ? await Promise.all([
    svc.from('bookings').select('id,status,participants,price_total_cents,sessions(starts_at,ends_at,course_types(label))').in('customer_id', ids),
    svc.from('v_credit_balance').select('available,reserved,consumed,expired').in('customer_id', ids),
  ]) : [{ data: [] }, { data: [] }] as any[];
  const sum = (k: string) => ((bal ?? []) as any[]).reduce((n, b) => n + (b[k] ?? 0), 0);
  const rows = ((data ?? []) as any[]).sort((a, b) => b.sessions.starts_at.localeCompare(a.sessions.starts_at));
  const now = new Date().toISOString();
  const up = rows.filter(r => r.sessions.ends_at >= now && ['pending', 'confirmed'].includes(r.status)), past = rows.filter(r => !up.includes(r));
  const Row = (r: any) => <tr key={r.id}><td><b>{r.sessions.course_types.label}</b><br /><span className="pj-sub">{formatDay(r.sessions.starts_at)} · {formatTime(r.sessions.starts_at)}</span></td><td>{euros(r.price_total_cents)}</td><td><span className={`pj-badge${r.status === 'pending' ? ' warn' : r.status === 'cancelled' || r.status === 'refused' ? ' bad' : ''}`}>{STATUS_LABELS[r.status as BookingStatus]}</span></td></tr>;
  return <>
    <div className="pj-head"><div className="grow"><h1>Mes cours</h1></div><a className="pj-btn" href="/reservation">Réserver un cours</a></div>
    <section><h2 style={{ marginBottom: 10 }}>Crédits et forfaits</h2>
      {ids.length === 0 || (bal ?? []).length === 0 ? <div className="pj-empty">Aucun forfait enregistré pour le moment. Votre coach ajoutera vos crédits ici.</div> :
        <div className="pj-grid c4"><div className="pj-card pj-stat"><div className="v">{sum('available')}</div><div className="l">Disponibles</div></div><div className="pj-card pj-stat"><div className="v">{sum('reserved')}</div><div className="l">Réservés (cours à venir)</div></div>
          <div className="pj-card pj-stat"><div className="v">{sum('consumed')}</div><div className="l">Utilisés</div></div><div className="pj-card pj-stat"><div className="v">{sum('expired')}</div><div className="l">Expirés</div></div></div>}</section>
    <section className="pj-section"><h2>À venir</h2>
    {up.length ? <div className="pj-scroll"><table className="pj-table"><tbody>{up.map(Row)}</tbody></table></div> : <div className="pj-empty">Aucune séance à venir. <a href="/reservation">Réserver un cours</a></div>}</section>
    <section className="pj-section"><h2>Historique</h2>
    {past.length ? <div className="pj-scroll"><table className="pj-table"><tbody>{past.map(Row)}</tbody></table></div> : <div className="pj-empty">Pas encore d’historique.</div>}</section>
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

function Profil({ p, email, incomplete, avatarUrl }: { p: any; email: string; incomplete: boolean; avatarUrl: string | null }) {
  const np = p?.notify_prefs ?? {};
  return <>
    <div className="pj-head"><Avatar url={avatarUrl} first={p?.first_name} last={p?.last_name} /><div className="grow"><h1>Mon profil</h1><div className="pj-sub">{email}</div></div></div>
    <div className="pj-grid c2">
    <form action={saveProfile} className="pj-card pj-form c2">
      <h2 className="full">Informations</h2>
      <label>Prénom<input name="first" required maxLength={60} defaultValue={p?.first_name ?? ''} autoComplete="given-name" /></label>
      <label>Nom<input name="last" required maxLength={60} defaultValue={p?.last_name ?? ''} autoComplete="family-name" /></label>
      <label>Téléphone<input name="phone" type="tel" maxLength={25} defaultValue={p?.phone ?? ''} autoComplete="tel" /></label>
      <label>Niveau<input name="level" maxLength={40} defaultValue={p?.level ?? ''} placeholder="ex. P100" /></label>
      <label>Classement FFT (renseigné par vous)<input name="fft" type="number" min={1} max={999999} defaultValue={p?.fft_ranking ?? ''} /></label>
      <label>Main dominante<select name="hand" defaultValue={p?.dominant_hand ?? ''}><option value="">Non renseigné</option><option value="right">Droitier</option><option value="left">Gaucher</option></select></label>
      <label>Côté préféré<select name="side" defaultValue={p?.preferred_side ?? ''}><option value="">Non renseigné</option><option value="right">Droite</option><option value="left">Gauche</option><option value="both">Les deux</option></select></label>
      <p className="pj-sub full" style={{ margin: 0 }}>{p?.fft_ranking ? (p.ranking_source === 'verified' ? 'Classement vérifié par votre coach.' : 'Ce classement est déclaré par vous : il n’est pas vérifié.') : 'Le classement saisi est affiché comme « déclaré » tant que votre coach ne l’a pas vérifié.'}</p>
      <fieldset className="full" style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}><legend style={{ fontWeight: 700, color: 'var(--pj-muted)', fontSize: 13, marginBottom: 4 }}>Notifications par e-mail</legend>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="n_booking" defaultChecked={np.booking !== false} />Réservations et changements de cours</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="n_reports" defaultChecked={np.reports !== false} />Comptes rendus publiés</label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="n_tournaments" defaultChecked={np.tournaments !== false} />Tournois</label></fieldset>
      {!p?.adult_confirmed_at && <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'start' }}><input type="checkbox" name="adult" style={{ marginTop: 4 }} />Je certifie avoir 18 ans ou plus. (L’espace joueur est pour l’instant réservé aux adultes.)</label>}
      {!p?.consent_at && <label className="full" style={{ display: 'flex', gap: 8, alignItems: 'start' }}><input type="checkbox" name="consent" style={{ marginTop: 4 }} />J’accepte que mon coach enregistre mes séances, comptes rendus, objectifs et résultats de tournois pour mon suivi. Je peux demander l’effacement de mon compte à tout moment.</label>}
      <div className="full"><button className="pj-btn">{incomplete ? 'Valider et accéder à mon espace' : 'Enregistrer'}</button></div>
    </form>
    {!incomplete && <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      <form action={uploadAvatar} className="pj-card pj-form"><h2>Photo de profil</h2>
        <label>JPEG, PNG ou WebP — 2 Mo maximum<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required /></label>
        <div className="pj-actions"><button className="pj-btn">Envoyer la photo</button>{p?.avatar_path && <button className="pj-btn ghost" formAction={removeAvatar} formNoValidate>Retirer</button>}</div>
        <p className="pj-sub" style={{ margin: 0 }}>Sans photo, vos initiales sont affichées. Votre photo n’est visible que par vous et votre coach.</p></form>
      <aside className="pj-card"><h2 style={{ marginBottom: 8 }}>Supprimer mon compte</h2>
        <p className="pj-sub">Cette action efface définitivement votre profil, vos comptes rendus, objectifs, progression et tournois. Elle est irréversible.</p>
        <form action={deleteAccount} className="pj-form"><label>Tapez SUPPRIMER pour confirmer<input name="confirm" autoComplete="off" /></label>
          <ConfirmButton className="pj-btn danger" message="Supprimer définitivement votre compte et toutes vos données ?">Supprimer mon compte</ConfirmButton></form></aside></div>}
  </div></>;
}
