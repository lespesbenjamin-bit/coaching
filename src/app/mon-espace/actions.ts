'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';

const txt = (max: number) => z.string().trim().max(max).transform(s => s || null);
const uuid = z.string().uuid();

async function me() {
  const supa = await sessionClient();
  const { data } = await supa.auth.getUser();
  if (!data.user) redirect('/connexion');
  return { supa, user: data.user };
}
const done = (tab: string, ok = 1) => { revalidatePath('/mon-espace'); redirect(`/mon-espace?tab=${tab}&ok=${ok}`); };

export async function saveProfile(fd: FormData) {
  const { supa, user } = await me();
  const p = z.object({ first: z.string().trim().min(1).max(60), last: z.string().trim().min(1).max(60), phone: txt(25), level: txt(40),
    fft: z.string().regex(/^\d{1,6}$/).or(z.literal('')).transform(v => (v ? Number(v) : null)), hand: z.enum(['right', 'left']).or(z.literal('')).transform(v => v || null), side: z.enum(['right', 'left', 'both']).or(z.literal('')).transform(v => v || null) })
    .safeParse({ first: fd.get('first'), last: fd.get('last'), phone: fd.get('phone') ?? '', level: fd.get('level') ?? '', fft: fd.get('fft') ?? '', hand: fd.get('hand') ?? '', side: fd.get('side') ?? '' });
  if (!p.success) redirect('/mon-espace?tab=profil&err=champs');
  const patch: Record<string, unknown> = { first_name: p.data.first, last_name: p.data.last, phone: p.data.phone, level: p.data.level,
    dominant_hand: p.data.hand, preferred_side: p.data.side, notify_prefs: { booking: fd.get('n_booking') === 'on', reports: fd.get('n_reports') === 'on', tournaments: fd.get('n_tournaments') === 'on' } };
  const { data: before } = await supa.from('profiles').select('fft_ranking').eq('user_id', user.id).single();
  if ((p.data.fft ?? null) !== (before?.fft_ranking ?? null)) { patch.fft_ranking = p.data.fft; patch.ranking_source = 'declared'; }   // une saisie du joueur est toujours « déclarée »
  // consentements : requis à la première complétion du profil
  if (fd.get('adult') === 'on') patch.adult_confirmed_at = new Date().toISOString();
  if (fd.get('consent') === 'on') { patch.consent_at = new Date().toISOString(); patch.consent_version = '2026-11'; }
  const { data: cur } = await supa.from('profiles').select('adult_confirmed_at,consent_at').eq('user_id', user.id).single();
  const adult = cur?.adult_confirmed_at || patch.adult_confirmed_at, consent = cur?.consent_at || patch.consent_at;
  if (!adult || !consent) redirect('/mon-espace?tab=profil&err=consentement');
  await supa.from('profiles').update(patch).eq('user_id', user.id);
  done('profil');
}

export async function addGoal(fd: FormData) {
  const { supa, user } = await me();
  const p = z.object({ title: z.string().trim().min(1).max(120), description: txt(500), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).transform(v => v || null) })
    .safeParse({ title: fd.get('title'), description: fd.get('description') ?? '', date: fd.get('date') ?? '' });
  if (!p.success) redirect('/mon-espace?tab=objectifs&err=champs');
  await supa.from('goals').insert({ player_id: user.id, title: p.data.title, description: p.data.description, target_date: p.data.date, created_by_role: 'player' });
  done('objectifs');
}
export async function setGoalStatus(fd: FormData) {
  const { supa } = await me();
  const id = uuid.safeParse(fd.get('id')); const st = z.enum(['active', 'achieved', 'abandoned']).safeParse(fd.get('status'));
  if (id.success && st.success) await supa.from('goals').update({ status: st.data }).eq('id', id.data);   // RLS : seulement ses objectifs
  done('objectifs');
}
export async function deleteGoal(fd: FormData) {
  const { supa } = await me(); const id = uuid.safeParse(fd.get('id'));
  if (id.success) await supa.from('goals').delete().eq('id', id.data);
  done('objectifs');
}

export async function addTournament(fd: FormData) {
  const { supa, user } = await me();
  const p = z.object({ name: z.string().trim().min(1).max(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), category: txt(20), city: txt(60), partner: txt(80), objective: txt(500) })
    .safeParse({ name: fd.get('name'), date: fd.get('date'), category: fd.get('category') ?? '', city: fd.get('city') ?? '', partner: fd.get('partner') ?? '', objective: fd.get('objective') ?? '' });
  if (!p.success) redirect('/mon-espace?tab=tournois&err=champs');
  await supa.from('tournaments').insert({ player_id: user.id, name: p.data.name, tournament_date: p.data.date, category: p.data.category, city: p.data.city, partner: p.data.partner, objective: p.data.objective });
  done('tournois');
}
export async function updateTournament(fd: FormData) {
  const { supa } = await me();
  const p = z.object({ id: uuid, result: txt(120), feedback: txt(1500) }).safeParse({ id: fd.get('id'), result: fd.get('result') ?? '', feedback: fd.get('feedback') ?? '' });
  if (p.success) await supa.from('tournaments').update({ result: p.data.result, feedback: p.data.feedback }).eq('id', p.data.id);
  done('tournois');
}
export async function deleteTournament(fd: FormData) {
  const { supa } = await me(); const id = uuid.safeParse(fd.get('id'));
  if (id.success) await supa.from('tournaments').delete().eq('id', id.data);
  done('tournois');
}

export async function signOut() {
  const { supa } = await me(); await supa.auth.signOut(); redirect('/');
}

/** Droit à l'effacement (RGPD) : supprime le compte et, en cascade, toutes les données de suivi. */
export async function deleteAccount(fd: FormData) {
  const { supa, user } = await me();
  if (fd.get('confirm') !== 'SUPPRIMER') redirect('/mon-espace?tab=profil&err=confirmation');
  const svc = serviceClient();
  const { data: prof } = await svc.from('profiles').select('avatar_path').eq('user_id', user.id).maybeSingle();
  if (prof?.avatar_path) await svc.storage.from('avatars').remove([prof.avatar_path]);   // la photo est effacée avec le compte
  await svc.from('customers').update({ user_id: null }).eq('user_id', user.id);   // les réservations restent anonymisables côté coach
  await svc.auth.admin.deleteUser(user.id);
  await supa.auth.signOut();
  redirect('/?compte=supprime');
}

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
function sniff(b: Uint8Array): string | null {   // on vérifie le contenu réel, pas seulement le type annoncé par le navigateur
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
export async function uploadAvatar(fd: FormData) {
  const { supa, user } = await me();
  const f = fd.get('photo');
  if (!(f instanceof File) || f.size === 0 || f.size > 2 * 1024 * 1024) redirect('/mon-espace?tab=profil&err=photo');
  const bytes = new Uint8Array(await f.arrayBuffer()); const type = sniff(bytes);
  if (!type || !PHOTO_TYPES[type]) redirect('/mon-espace?tab=profil&err=photo');
  const svc = serviceClient(); const path = `${user.id}/avatar-${Date.now()}.${PHOTO_TYPES[type]}`;
  const { data: cur } = await supa.from('profiles').select('avatar_path').eq('user_id', user.id).single();
  const up = await svc.storage.from('avatars').upload(path, bytes, { contentType: type, upsert: false });
  if (up.error) redirect('/mon-espace?tab=profil&err=photo');
  await supa.from('profiles').update({ avatar_path: path }).eq('user_id', user.id);
  if (cur?.avatar_path) await svc.storage.from('avatars').remove([cur.avatar_path]);
  done('profil');
}
export async function removeAvatar() {
  const { supa, user } = await me();
  const { data: cur } = await supa.from('profiles').select('avatar_path').eq('user_id', user.id).single();
  if (cur?.avatar_path) { await serviceClient().storage.from('avatars').remove([cur.avatar_path]); await supa.from('profiles').update({ avatar_path: null }).eq('user_id', user.id); }
  done('profil');
}
