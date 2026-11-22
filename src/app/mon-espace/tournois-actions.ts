'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform(s => s || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const back = (fd: FormData, ok?: string, err?: string): never => {
  const raw = String(fd.get('back') ?? '/mon-espace?tab=tournois'); const base = raw.startsWith('/mon-espace') ? raw : '/mon-espace?tab=tournois';
  const u = new URL(base, 'http://x'); u.searchParams.delete('ok'); u.searchParams.delete('err'); if (ok) u.searchParams.set('ok', ok); if (err) u.searchParams.set('err', err);
  revalidatePath('/mon-espace'); redirect(u.pathname + u.search);
};
async function me() {
  const supa = await sessionClient(); const { data } = await supa.auth.getUser();
  if (!data.user) redirect('/connexion');
  const { data: profile } = await supa.from('profiles').select('adult_confirmed_at,consent_at').eq('user_id', data.user.id).single();
  if (!profile?.adult_confirmed_at || !profile?.consent_at) redirect('/mon-espace?tab=profil');
  // un seul référentiel : la fiche joueur (customers) est créée ou rattachée une fois pour toutes
  const { data: customerId } = await serviceClient().rpc('ensure_customer_for_user', { p_user: data.user.id });
  return { supa, user: data.user, customerId: customerId as string | null };
}

export async function toggleFavorite(fd: FormData) {
  const { supa, user } = await me(); const id = uuid.safeParse(fd.get('event')); if (!id.success) return back(fd, undefined, 'Requête invalide');
  const { data: ex } = await supa.from('tournament_favorites').select('tournament_id').eq('tournament_id', id.data).eq('user_id', user.id).maybeSingle();
  if (ex) await supa.from('tournament_favorites').delete().eq('tournament_id', id.data).eq('user_id', user.id);
  else await supa.from('tournament_favorites').insert({ tournament_id: id.data, user_id: user.id });
  back(fd, ex ? 'Retiré des favoris' : 'Ajouté aux favoris');
}

const status = z.enum(['interested', 'planned', 'declared', 'finished', 'cancelled']);
export async function setMyParticipation(fd: FormData) {
  const { supa, customerId } = await me();
  const p = z.object({ event: uuid, status, partner: text(100), objective: text(500) }).safeParse({ event: fd.get('event'), status: fd.get('status'), partner: fd.get('partner') ?? '', objective: fd.get('objective') ?? '' });
  if (!p.success || !customerId) return back(fd, undefined, 'Merci de vérifier les champs');
  const { data: ex } = await supa.from('tournament_participations').select('id,status').eq('tournament_id', p.data.event).eq('customer_id', customerId).maybeSingle();
  if (ex?.status === 'confirmed' && p.data.status !== 'cancelled' && p.data.status !== 'finished') return back(fd, undefined, 'Inscription confirmée : contactez votre coach pour la modifier.');
  const row = { status: p.data.status, partner_name: p.data.partner, player_objective: p.data.objective };
  const { error } = ex ? await supa.from('tournament_participations').update(row).eq('id', ex.id) : await supa.from('tournament_participations').insert({ tournament_id: p.data.event, customer_id: customerId, declared_by: 'player', ...row });
  back(fd, error ? undefined : 'Enregistré', error ? 'Enregistrement impossible' : undefined);
}
export async function setMyResult(fd: FormData) {
  const { supa } = await me(); const p = z.object({ id: uuid, result: text(120), feedback: text(1500) }).safeParse({ id: fd.get('id'), result: fd.get('result') ?? '', feedback: fd.get('feedback') ?? '' });
  if (!p.success) return back(fd, undefined, 'Merci de vérifier les champs');
  await supa.from('tournament_participations').update({ result_text: p.data.result, player_feedback: p.data.feedback }).eq('id', p.data.id);
  back(fd, 'Résultat enregistré (déclaratif)');
}
export async function proposeEvent(fd: FormData) {
  const { supa, user } = await me();
  const p = z.object({ name: z.string().trim().min(2).max(140), start_date: day, city: text(80), category_code: text(10), official_url: z.string().trim().max(300).refine(v => !v || /^https?:\/\//i.test(v)).transform(v => v || null) })
    .safeParse({ name: fd.get('name'), start_date: fd.get('start_date'), city: fd.get('city') ?? '', category_code: fd.get('category_code') ?? '', official_url: fd.get('official_url') ?? '' });
  if (!p.success) return back(fd, undefined, 'Merci de vérifier les champs');
  const { error } = await supa.from('tournament_events').insert({ ...p.data, source: 'manual', publication: 'proposed', created_by: user.id });
  back(fd, error ? undefined : 'Tournoi proposé : votre coach le validera pour le publier', error ? (error.code === '23505' ? 'Ce tournoi existe déjà dans le calendrier.' : 'Proposition impossible') : undefined);
}
