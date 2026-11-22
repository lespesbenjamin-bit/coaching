'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';

const uuid = z.string().uuid();
const txt = (max: number) => z.string().trim().max(max).transform(s => s || null);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function guard() { if (!(await getAdminUser())) redirect('/admin/login'); return serviceClient(); }
const back = (pid: string, tab = '') => { revalidatePath(`/admin/joueurs/${pid}`); redirect(`/admin/joueurs/${pid}?ok=1${tab}`); };

export async function addReport(fd: FormData) {
  const svc = await guard();
  const p = z.object({ pid: uuid, date, title: z.string().trim().min(1).max(120), summary: txt(4000), strengths: txt(2000), to_work: txt(2000), homework: txt(2000) })
    .safeParse({ pid: fd.get('pid'), date: fd.get('date'), title: fd.get('title'), summary: fd.get('summary') ?? '', strengths: fd.get('strengths') ?? '', to_work: fd.get('to_work') ?? '', homework: fd.get('homework') ?? '' });
  if (!p.success) redirect(`/admin/joueurs/${fd.get('pid')}?err=champs`);
  await svc.from('session_reports').insert({ player_id: p.data.pid, session_date: p.data.date, title: p.data.title, summary: p.data.summary, strengths: p.data.strengths, to_work: p.data.to_work, homework: p.data.homework, published: fd.get('publish') === 'on' });
  back(p.data.pid);
}
export async function toggleReport(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); const pid = uuid.safeParse(fd.get('pid'));
  if (id.success && pid.success) { await svc.from('session_reports').update({ published: fd.get('to') === '1' }).eq('id', id.data); back(pid.data); }
}
export async function deleteReport(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); const pid = uuid.safeParse(fd.get('pid'));
  if (id.success && pid.success) { await svc.from('session_reports').delete().eq('id', id.data); back(pid.data); }
}
export async function addCoachGoal(fd: FormData) {
  const svc = await guard();
  const p = z.object({ pid: uuid, title: z.string().trim().min(1).max(120), description: txt(500), date: date.or(z.literal('')).transform(v => v || null) })
    .safeParse({ pid: fd.get('pid'), title: fd.get('title'), description: fd.get('description') ?? '', date: fd.get('date') ?? '' });
  if (!p.success) redirect(`/admin/joueurs/${fd.get('pid')}?err=champs`);
  await svc.from('goals').insert({ player_id: p.data.pid, title: p.data.title, description: p.data.description, target_date: p.data.date, created_by_role: 'coach' });
  back(p.data.pid);
}
export async function setCoachGoalStatus(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); const pid = uuid.safeParse(fd.get('pid')); const st = z.enum(['active', 'achieved', 'abandoned']).safeParse(fd.get('status'));
  if (id.success && pid.success && st.success) { await svc.from('goals').update({ status: st.data }).eq('id', id.data); back(pid.data); }
}
export async function addProgress(fd: FormData) {
  const svc = await guard();
  const p = z.object({ pid: uuid, date, level: txt(20), points: z.string().regex(/^\d{0,6}$/).transform(v => (v ? Number(v) : null)), note: txt(500) })
    .safeParse({ pid: fd.get('pid'), date: fd.get('date'), level: fd.get('level') ?? '', points: String(fd.get('points') ?? ''), note: fd.get('note') ?? '' });
  if (!p.success) redirect(`/admin/joueurs/${fd.get('pid')}?err=champs`);
  await svc.from('progress_entries').insert({ player_id: p.data.pid, entered_on: p.data.date, level_label: p.data.level, ranking_points: p.data.points, note: p.data.note });
  back(p.data.pid);
}
export async function commentTournament(fd: FormData) {
  const svc = await guard();
  const p = z.object({ id: uuid, pid: uuid, comment: txt(1500) }).safeParse({ id: fd.get('id'), pid: fd.get('pid'), comment: fd.get('comment') ?? '' });
  if (p.success) { await svc.from('tournament_participations').update({ coach_comment: p.data.comment }).eq('id', p.data.id); back(p.data.pid); }
}
