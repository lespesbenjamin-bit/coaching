'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, go } from '@/lib/backoffice';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform(s => s || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dayOpt = day.or(z.literal('')).transform(v => v || null);
const get = (fd: FormData) => Object.fromEntries(fd.entries());
const url = z.string().trim().max(300).refine(v => !v || /^https?:\/\//i.test(v), 'Lien invalide').transform(v => v || null);

const eventInput = z.object({
  name: z.string().trim().min(2).max(140), start_date: day, end_date: dayOpt, category_code: text(10), format_code: text(20),
  city: text(80), address: text(200), club_id: text(40), club_name: text(100), registration_info: text(1000), registration_deadline: dayOpt, official_url: url, coach_comment: text(2000),
});

async function resolveClub(svc: Awaited<ReturnType<typeof guard>>, d: z.infer<typeof eventInput>) {
  if (d.club_id && uuid.safeParse(d.club_id).success) return d.club_id;
  if (!d.club_name) return null;
  const { data: ex } = await svc.from('clubs').select('id').ilike('name', d.club_name.replace(/[%_]/g, '')).limit(1).maybeSingle();
  if (ex) return ex.id as string;
  const { data } = await svc.from('clubs').insert({ name: d.club_name, city: d.city, address: d.address }).select('id').single();
  return (data?.id as string) ?? null;
}

export async function createEvent(fd: FormData) {
  const svc = await guard(); const p = eventInput.safeParse(get(fd));
  if (!p.success) go('/admin/tournois/nouveau', undefined, 'Champs invalides (nom, date de début et lien http obligatoires ou à corriger)');
  const d = p.data; if (d.end_date && d.end_date < d.start_date) go('/admin/tournois/nouveau', undefined, 'La date de fin précède le début');
  const club = await resolveClub(svc, d);
  const { data, error } = await svc.from('tournament_events').insert({ name: d.name, start_date: d.start_date, end_date: d.end_date, category_code: d.category_code, format_code: d.format_code, city: d.city, address: d.address,
    club_id: club, registration_info: d.registration_info, registration_deadline: d.registration_deadline, official_url: d.official_url, coach_comment: d.coach_comment, source: 'manual', publication: 'published' }).select('id').single();
  if (error?.code === '23505') go('/admin/tournois/nouveau', undefined, 'Ce tournoi existe déjà (même nom, même date, même club).');
  if (error || !data) go('/admin/tournois/nouveau', undefined, 'Création impossible');
  revalidatePath('/admin/tournois'); go(`/admin/tournois/${data.id}`, 'Tournoi créé');
}
export async function updateEvent(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); const p = eventInput.safeParse(get(fd));
  if (!id.success || !p.success) go('/admin/tournois', undefined, 'Champs invalides');
  const d = p.data; const to = `/admin/tournois/${id.data}`;
  if (d.end_date && d.end_date < d.start_date) go(to, undefined, 'La date de fin précède le début');
  const club = await resolveClub(svc, d);
  const { error } = await svc.from('tournament_events').update({ name: d.name, start_date: d.start_date, end_date: d.end_date, category_code: d.category_code, format_code: d.format_code, city: d.city, address: d.address,
    club_id: club, registration_info: d.registration_info, registration_deadline: d.registration_deadline, official_url: d.official_url, coach_comment: d.coach_comment }).eq('id', id.data);
  revalidatePath(to); go(to, error?.code === '23505' ? undefined : 'Tournoi mis à jour', error ? (error.code === '23505' ? 'Un autre tournoi identique existe déjà.' : 'Erreur') : undefined);
}
export async function setEventState(fd: FormData) {
  const svc = await guard(); const p = z.object({ id: uuid, op: z.enum(['publish', 'cancel', 'restore', 'finish', 'verify']) }).safeParse(get(fd)); if (!p.success) go('/admin/tournois', undefined, 'Requête invalide');
  const patch = { publish: { publication: 'published' }, cancel: { status: 'cancelled' }, restore: { status: 'scheduled' }, finish: { status: 'finished' }, verify: { source: 'verified' } }[p.data.op];
  await svc.from('tournament_events').update(patch).eq('id', p.data.id);
  revalidatePath(`/admin/tournois/${p.data.id}`); go(`/admin/tournois/${p.data.id}`, 'Tournoi mis à jour');
}
export async function deleteEvent(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); if (!id.success) go('/admin/tournois', undefined, 'Requête invalide');
  const { count } = await svc.from('tournament_participations').select('id', { count: 'exact', head: true }).eq('tournament_id', id.data);
  if ((count ?? 0) > 0) go(`/admin/tournois/${id.data}`, undefined, 'Des joueurs sont rattachés à ce tournoi : annulez-le plutôt que de le supprimer.');
  await svc.from('tournament_events').delete().eq('id', id.data); revalidatePath('/admin/tournois'); go('/admin/tournois', 'Tournoi supprimé');
}
const partStatus = z.enum(['interested', 'planned', 'declared', 'confirmed', 'finished', 'cancelled']);
export async function coachSetParticipation(fd: FormData) {
  const svc = await guard(); const p = z.object({ id: uuid, event: uuid, status: partStatus, source: text(200), partner_name: text(100), coach_comment: text(1500) }).safeParse(get(fd));
  if (!p.success) go('/admin/tournois', undefined, 'Champs invalides'); const to = `/admin/tournois/${p.data.event}`;
  if (p.data.status === 'confirmed' && !p.data.source) go(to, undefined, 'Indiquez la source fiable qui confirme l’inscription (liste officielle, e-mail du club…).');
  const { error } = await svc.from('tournament_participations').update({ status: p.data.status, confirmation_source: p.data.status === 'confirmed' ? p.data.source : null, partner_name: p.data.partner_name, coach_comment: p.data.coach_comment }).eq('id', p.data.id);
  revalidatePath(to); go(to, error ? undefined : 'Participation mise à jour', error ? 'Erreur' : undefined);
}
export async function coachAddParticipation(fd: FormData) {
  const svc = await guard(); const p = z.object({ event: uuid, customer: uuid, status: partStatus.exclude(['confirmed']) }).safeParse(get(fd)); if (!p.success) go('/admin/tournois', undefined, 'Choisissez un joueur');
  const to = `/admin/tournois/${p.data.event}`;
  const { error } = await svc.from('tournament_participations').insert({ tournament_id: p.data.event, customer_id: p.data.customer, status: p.data.status, declared_by: 'coach' });
  revalidatePath(to); go(to, error ? undefined : 'Joueur ajouté', error ? (error.code === '23505' ? 'Ce joueur est déjà rattaché à ce tournoi.' : 'Erreur') : undefined);
}
export async function removeParticipation(fd: FormData) {
  const svc = await guard(); const p = z.object({ id: uuid, event: uuid }).safeParse(get(fd)); if (!p.success) go('/admin/tournois', undefined, 'Requête invalide');
  await svc.from('tournament_participations').delete().eq('id', p.data.id); revalidatePath(`/admin/tournois/${p.data.event}`); go(`/admin/tournois/${p.data.event}`, 'Participation retirée');
}
export async function addRef(fd: FormData) {
  const svc = await guard(); const p = z.object({ table: z.enum(['tournament_categories', 'tournament_formats']), code: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9_-]+$/), label: z.string().trim().min(1).max(60) }).safeParse(get(fd));
  if (!p.success) go('/admin/parametres', undefined, 'Code (lettres, chiffres) et libellé obligatoires');
  const { count } = await svc.from(p.data.table).select('code', { count: 'exact', head: true });
  const { error } = await svc.from(p.data.table).insert({ code: p.data.code, label: p.data.label, sort_order: (count ?? 0) + 1 });
  revalidatePath('/admin/parametres'); go('/admin/parametres', error ? undefined : 'Ajouté', error ? 'Ce code existe déjà' : undefined);
}
export async function toggleRef(fd: FormData) {
  const svc = await guard(); const p = z.object({ table: z.enum(['tournament_categories', 'tournament_formats']), code: z.string().max(20), to: z.enum(['0', '1']) }).safeParse(get(fd)); if (!p.success) go('/admin/parametres', undefined, 'Requête invalide');
  await svc.from(p.data.table).update({ active: p.data.to === '1' }).eq('code', p.data.code); revalidatePath('/admin/parametres'); go('/admin/parametres', 'Mis à jour');
}
