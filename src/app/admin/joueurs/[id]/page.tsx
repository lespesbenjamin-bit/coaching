import { redirect, notFound } from 'next/navigation';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import ConfirmButton from '@/components/ConfirmButton';
import { addReport, toggleReport, deleteReport, addCoachGoal, setCoachGoalStatus, addProgress, commentTournament } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fiche joueur — administration', robots: { index: false, follow: false } };
const dshort = (d: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`));
const today = () => new Date().toISOString().slice(0, 10);

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const { id } = await params; const sp = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const svc = serviceClient();
  const { data: p } = await svc.from('profiles').select('*').eq('user_id', id).maybeSingle();
  if (!p) notFound();
  const [reports, goals, progress, tournaments] = await Promise.all([
    svc.from('session_reports').select('*').eq('player_id', id).order('session_date', { ascending: false }),
    svc.from('goals').select('*').eq('player_id', id).order('created_at', { ascending: false }),
    svc.from('progress_entries').select('*').eq('player_id', id).order('entered_on', { ascending: false }),
    svc.from('tournaments').select('*').eq('player_id', id).order('tournament_date', { ascending: false }),
  ]);
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Joueur';

  return (
    <main className="main"><div className="wrap">
      <AdminNav current="joueurs" />
      <p><a href="/admin/joueurs">← Tous les joueurs</a></p>
      <h1 style={{ fontSize: 30, marginBottom: 6 }}>{name}</h1>
      <p className="muted">Niveau : {p.level ?? '—'} · Tél. : {p.phone ?? '—'}</p>
      {sp.ok && <div className="notice ok">Enregistré.</div>}
      {sp.err && <div className="notice bad">Merci de vérifier les champs.</div>}

      <h2 style={{ margin: '24px 0 10px' }}>Comptes rendus</h2>
      <div className="grid2">
        <section>{!reports.data?.length ? <div className="panel empty">Aucun compte rendu.</div> : <div className="days">{reports.data.map(r => (
          <div className="panel" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{dshort(r.session_date)} — {r.title}</b>
              <span className={`badge ${r.published ? 'confirmed' : 'pending'}`}>{r.published ? 'Publié' : 'Brouillon (invisible)'}</span></div>
            {r.summary && <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{r.summary}</p>}
            <div className="row-actions">
              <form action={toggleReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="pid" value={id} /><input type="hidden" name="to" value={r.published ? '0' : '1'} /><button className="btn">{r.published ? 'Dépublier' : 'Publier au joueur'}</button></form>
              <form action={deleteReport}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="pid" value={id} /><ConfirmButton message="Supprimer ce compte rendu ?">Supprimer</ConfirmButton></form></div>
          </div>))}</div>}</section>
        <aside><form action={addReport} className="panel form" style={{ gridTemplateColumns: '1fr' }}>
          <h2 style={{ fontSize: 18 }}>Nouveau compte rendu</h2><input type="hidden" name="pid" value={id} />
          <label>Date de la séance<input name="date" type="date" required defaultValue={today()} /></label>
          <label>Titre<input name="title" required maxLength={120} placeholder="ex. Bandeja et sortie de vitre" /></label>
          <label>Résumé<textarea name="summary" rows={4} maxLength={4000} /></label>
          <label>Points forts<textarea name="strengths" rows={2} maxLength={2000} /></label>
          <label>À travailler<textarea name="to_work" rows={2} maxLength={2000} /></label>
          <label>Pour la prochaine fois<textarea name="homework" rows={2} maxLength={2000} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="publish" style={{ width: 'auto' }} />Publier tout de suite au joueur</label>
          <button className="btn">Enregistrer</button></form></aside>
      </div>

      <h2 style={{ margin: '28px 0 10px' }}>Objectifs</h2>
      <div className="grid2">
        <section>{!goals.data?.length ? <div className="panel empty">Aucun objectif.</div> : <div className="days">{goals.data.map(g => (
          <div className="panel" key={g.id}><b>{g.title}</b> <span className="badge">{g.status === 'active' ? 'En cours' : g.status === 'achieved' ? 'Atteint' : 'Abandonné'}</span>
            <span className="muted"> · {g.created_by_role === 'coach' ? 'fixé par vous' : 'créé par le joueur'}</span>
            {g.description && <p className="muted" style={{ margin: '6px 0' }}>{g.description}</p>}
            <form action={setCoachGoalStatus} className="row-actions"><input type="hidden" name="id" value={g.id} /><input type="hidden" name="pid" value={id} />
              <button name="status" value="achieved" className="btn ghost">Atteint</button><button name="status" value="active" className="btn ghost">En cours</button><button name="status" value="abandoned" className="btn ghost">Abandonné</button></form>
          </div>))}</div>}</section>
        <aside><form action={addCoachGoal} className="panel form" style={{ gridTemplateColumns: '1fr' }}>
          <h2 style={{ fontSize: 18 }}>Fixer un objectif</h2><input type="hidden" name="pid" value={id} />
          <label>Objectif<input name="title" required maxLength={120} /></label>
          <label>Détail<textarea name="description" rows={2} maxLength={500} /></label>
          <label>Échéance<input name="date" type="date" /></label>
          <button className="btn">Ajouter</button></form></aside>
      </div>

      <h2 style={{ margin: '28px 0 10px' }}>Progression</h2>
      <div className="grid2">
        <section>{!progress.data?.length ? <div className="panel empty">Aucune entrée.</div> : <div className="panel scroll"><table><thead><tr><th>Date</th><th>Niveau</th><th>Points</th><th>Note</th></tr></thead><tbody>
          {progress.data.map(e => <tr key={e.id}><td>{dshort(e.entered_on)}</td><td>{e.level_label ?? '—'}</td><td>{e.ranking_points ?? '—'}</td><td>{e.note ?? ''}</td></tr>)}</tbody></table></div>}</section>
        <aside><form action={addProgress} className="panel form" style={{ gridTemplateColumns: '1fr' }}>
          <h2 style={{ fontSize: 18 }}>Nouvelle entrée</h2><input type="hidden" name="pid" value={id} />
          <label>Date<input name="date" type="date" required defaultValue={today()} /></label>
          <label>Niveau<input name="level" maxLength={20} placeholder="ex. P100" /></label>
          <label>Points<input name="points" inputMode="numeric" /></label>
          <label>Note<textarea name="note" rows={2} maxLength={500} /></label>
          <button className="btn">Ajouter</button></form></aside>
      </div>

      <h2 style={{ margin: '28px 0 10px' }}>Tournois du joueur</h2>
      {!tournaments.data?.length ? <div className="panel empty">Aucun tournoi renseigné.</div> : <div className="days">{tournaments.data.map(t => (
        <div className="panel" key={t.id}><b>{t.name}</b> <span className="muted">· {dshort(t.tournament_date)}{t.category ? ` · ${t.category}` : ''}{t.partner ? ` · avec ${t.partner}` : ''}</span>
          {t.objective && <p className="muted" style={{ margin: '6px 0' }}>Objectif : {t.objective}</p>}
          <p style={{ margin: '6px 0' }}><b>Résultat :</b> {t.result ?? '—'}<br /><b>Ressenti :</b> <span style={{ whiteSpace: 'pre-wrap' }}>{t.feedback ?? '—'}</span></p>
          <form action={commentTournament} className="form" style={{ gridTemplateColumns: '1fr' }}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="pid" value={id} />
            <label>Votre commentaire (visible par le joueur)<textarea name="comment" rows={2} maxLength={1500} defaultValue={t.coach_comment ?? ''} /></label>
            <div className="row-actions"><button className="btn ghost">Enregistrer</button></div></form></div>))}</div>}
    </div></main>
  );
}
