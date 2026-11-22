'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, friendly, go } from '@/lib/backoffice';
import { getAdminUser } from '@/lib/auth';
import { parisToUtcIso } from '@/lib/dates';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform(s => s || null);
const num = z.coerce.number().int();
const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const get = (fd: FormData) => Object.fromEntries(fd.entries());
const back = (fd: FormData, d: string) => { const b = String(fd.get('back') ?? ''); return b.startsWith('/admin/collectifs') ? b : d; };
const minutes = (a: string, b: string) => { const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); };
const done = (to: string, ok?: string, err?: string) => { revalidatePath('/admin/collectifs', 'layout'); return go(to, ok, err); };

export async function createCollectif(fd: FormData) {
  const svc = await guard();
  const p = z.object({ name: z.string().trim().min(1).max(80), level: text(40), weekday: num.min(1).max(7), start: time, end: time, capacity: num.min(1).max(12), start_date: date, sessions: num.min(0).max(60), status: z.enum(['active', 'suspended']) }).safeParse(get(fd));
  const to = '/admin/collectifs/groupes'; if (!p.success) return go(to, undefined, 'Champs invalides');
  const d = p.data; const dur = minutes(d.start, d.end); if (dur < 15) return go(to, undefined, 'L’heure de fin doit suivre l’heure de début.');
  const { data: ct } = await svc.from('course_types').select('id,price_per_person_cents').eq('code', 'collectif').maybeSingle();
  const { data: g, error } = await svc.from('groups').insert({ name: d.name, level: d.level, weekday: d.weekday, start_time: d.start, duration_min: dur, capacity: d.capacity, start_date: d.start_date, status: d.status,
    visibility: 'private', course_type_id: ct?.id ?? null, price_per_person_cents: ct?.price_per_person_cents ?? 2500 }).select('id').single();
  if (error || !g) return go(to, undefined, 'Création impossible');
  let msg = 'Groupe créé';
  if (d.sessions > 0) {
    const { data: c } = await svc.from('training_cycles').insert({ group_id: g.id, label: 'Cycle 1', sessions_count: d.sessions, start_date: d.start_date, weekday: d.weekday, start_time: d.start, duration_min: dur }).select('id').single();
    if (c) { const { data: r } = await svc.rpc('generate_cycle_sessions', { p_cycle: c.id }); msg = `Groupe créé, cycle de ${r?.created ?? 0} séance(s)${r?.conflicts?.length ? ` — ${r.conflicts.length} conflit(s) d’horaire` : ''}`; }
  }
  return done(`/admin/collectifs/groupes/${g.id}`, msg);
}
export async function updateCollectif(fd: FormData) {
  const svc = await guard();
  const p = z.object({ id: uuid, name: z.string().trim().min(1).max(80), level: text(40), capacity: num.min(1).max(12), status: z.enum(['active', 'suspended', 'archived']) }).safeParse(get(fd));
  if (!p.success) return go('/admin/collectifs/groupes', undefined, 'Champs invalides'); const to = `/admin/collectifs/groupes/${p.data.id}`;
  const { count } = await svc.from('group_memberships').select('id', { count: 'exact', head: true }).eq('group_id', p.data.id).eq('status', 'active');
  if ((count ?? 0) > p.data.capacity) return go(to, undefined, `Capacité inférieure au nombre de membres (${count}).`);
  await svc.from('groups').update({ name: p.data.name, level: p.data.level, capacity: p.data.capacity, status: p.data.status }).eq('id', p.data.id);
  return done(to, p.data.status === 'archived' ? 'Groupe archivé (l’historique est conservé)' : 'Groupe mis à jour');
}
export async function memberOp(fd: FormData) {
  const svc = await guard();
  const p = z.object({ op: z.enum(['add', 'remove', 'move', 'temp']), group: uuid, customer: uuid, to_group: uuid.optional().or(z.literal('')), n: num.min(1).max(30).optional() }).safeParse(get(fd));
  const to = `/admin/collectifs/groupes/${fd.get('group')}`; if (!p.success) return go(to, undefined, 'Choisissez un joueur');
  const d = p.data; let msg = ''; let err = '';
  if (d.op === 'add') { const { data, error } = await svc.rpc('add_group_member', { p_group: d.group, p_customer: d.customer }); if (error) err = friendly(error); else msg = data?.already ? 'Déjà membre' : `Joueur ajouté (${data?.enrolled ?? 0} séance(s) à venir)`; }
  if (d.op === 'remove') { const { data, error } = await svc.rpc('remove_group_member', { p_group: d.group, p_customer: d.customer }); if (error) err = friendly(error); else msg = `Joueur retiré (${data} séance(s) à venir libérée(s)) — séances passées conservées`; }
  if (d.op === 'move') { if (!d.to_group) return go(to, undefined, 'Choisissez le groupe d’arrivée'); const { error } = await svc.rpc('move_group_member', { p_from: d.group, p_to: d.to_group, p_customer: d.customer }); if (error) err = friendly(error) || 'Déplacement impossible'; else msg = 'Joueur déplacé'; }
  if (d.op === 'temp') { const { data, error } = await svc.rpc('add_temporary_player', { p_group: d.group, p_customer: d.customer, p_n: d.n ?? 1 }); if (error) err = friendly(error); else msg = `Joueur temporaire inscrit à ${data} séance(s)`; }
  return done(to, err ? undefined : msg, err || undefined);
}

/* ----- Cycles ----- */
export async function renewCycle(fd: FormData) {
  const svc = await guard(); const u = await getAdminUser();
  const p = z.object({ cycle: uuid, group: uuid, start_date: date, count: num.min(1).max(60), time: time.optional().or(z.literal('')), duration: num.min(15).max(360).optional(), label: text(80), key: z.string().max(80) }).safeParse(get(fd));
  const to = back(fd, '/admin/collectifs/cycles'); if (!p.success) return go(to, undefined, 'Champs invalides');
  const d = p.data;
  const { data, error } = await svc.rpc('renew_cycle', { p_cycle: d.cycle, p_start: d.start_date, p_count: d.count, p_weekday: null, p_time: d.time || null, p_duration: d.duration ?? null, p_label: d.label ?? '', p_key: d.key, p_by: u?.id ?? null });
  if (error) return done(to, undefined, error.code === 'P0071' ? 'Ce cycle a déjà été renouvelé.' : friendly(error) || 'Renouvellement impossible');
  const c = (data?.conflicts ?? []) as string[];
  return done(`/admin/collectifs/groupes/${d.group}`, data?.replayed ? 'Renouvellement déjà effectué (aucun doublon créé)' : `Cycle renouvelé : ${data?.created ?? 0} séance(s)${c.length ? ` — ${c.length} date(s) en conflit : ${c.join(', ')}` : ''}`);
}
export async function addExceptional(fd: FormData) {
  const svc = await guard(); const u = await getAdminUser();
  const p = z.object({ group: uuid, cycle: uuid.optional().or(z.literal('')), date, time, duration: num.min(15).max(360) }).safeParse(get(fd));
  const to = back(fd, '/admin/collectifs'); if (!p.success) return go(to, undefined, 'Champs invalides');
  const { error } = await svc.rpc('add_cycle_session', { p_group: p.data.group, p_cycle: p.data.cycle || null, p_start: parisToUtcIso(p.data.date, p.data.time), p_duration: p.data.duration, p_counts: fd.get('counts') === 'on', p_by: u?.id ?? null });
  return done(to, error ? undefined : 'Séance exceptionnelle ajoutée', error ? (error.code === '23P01' ? 'Conflit avec une autre séance ou une indisponibilité.' : friendly(error)) : undefined);
}
export async function shiftRecurrence(fd: FormData) {
  const svc = await guard();
  const p = z.object({ cycle: uuid, from_index: num.min(1).max(60), weekday: z.string().optional(), time: time.optional().or(z.literal('')), duration: z.string().optional() }).safeParse(get(fd));
  const to = back(fd, '/admin/collectifs'); if (!p.success) return go(to, undefined, 'Champs invalides');
  const { data, error } = await svc.rpc('shift_future_sessions', { p_cycle: p.data.cycle, p_from_index: p.data.from_index, p_weekday: p.data.weekday ? Number(p.data.weekday) : null, p_time: p.data.time || null, p_duration: p.data.duration ? Number(p.data.duration) : null });
  return done(to, error ? undefined : `${data} séance(s) future(s) modifiée(s)`, error ? (error.code === '23P01' ? 'Conflit d’horaire : aucune séance modifiée.' : 'Modification impossible') : undefined);
}
export async function cycleState(fd: FormData) {
  const svc = await guard(); const p = z.object({ cycle: uuid, suspend: z.enum(['0', '1']) }).safeParse(get(fd)); const to = back(fd, '/admin/collectifs');
  if (!p.success) return go(to, undefined, 'Requête invalide');
  const { data } = await svc.rpc('set_cycle_suspended', { p_cycle: p.data.cycle, p_suspend: p.data.suspend === '1' });
  return done(to, `${data ?? 0} séance(s) ${p.data.suspend === '1' ? 'suspendue(s)' : 'reprise(s)'}`);
}

/* ----- Séances ----- */
const UI_STATUS: Record<string, string> = { present: 'present', absent: 'absent_unjustified', excused: 'absent_justified', makeup: 'to_makeup' };
export async function saveSheet(fd: FormData) {
  const svc = await guard(); const u = await getAdminUser();
  const sid = uuid.safeParse(fd.get('session')); if (!sid.success) return go('/admin/collectifs', undefined, 'Requête invalide');
  const to = `/admin/collectifs/seances/${sid.data}`; const intent = String(fd.get('intent') ?? 'save'); const reason = String(fd.get('reason') ?? '').trim();
  const { data: s } = await svc.from('sessions').select('status').eq('id', sid.data).single();
  if (s?.status === 'done' && reason.length < 3) return go(to, undefined, 'Indiquez le motif de la correction.');
  let n = 0;
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('st_') || !v) continue; const booking = k.slice(3); if (!uuid.safeParse(booking).success) continue;
    const st = UI_STATUS[String(v)]; if (!st) continue; const cr = String(fd.get(`cr_${booking}`) ?? '');
    const { error } = await svc.rpc('record_attendance', { p_booking: booking, p_status: st, p_decision: cr === 'consume' || cr === 'free' ? cr : null, p_note: null, p_by: u?.id ?? null, p_reason: reason || null });
    if (error) return done(to, undefined, friendly(error) || error.message); n++;
  }
  if (intent === 'validate') {
    const { data, error } = await svc.rpc('validate_session', { p_session: sid.data, p_by: u?.id ?? null, p_key: sid.data });
    if (error) return done(to, undefined, error.code === 'P0070' ? error.message : friendly(error) || 'Validation impossible');
    return done(to, data?.already || data?.replayed ? 'Séance déjà validée (aucun crédit débité deux fois)' : `Séance validée : ${data?.players} joueur(s), ${data?.credits_consumed} crédit(s) consommé(s)`);
  }
  return done(to, s?.status === 'done' ? 'Correction enregistrée et tracée' : `Présences enregistrées (${n})`);
}
export async function allPresent(fd: FormData) {
  const svc = await guard(); const u = await getAdminUser(); const sid = uuid.safeParse(fd.get('session')); if (!sid.success) return go('/admin/collectifs', undefined, 'Requête invalide');
  const { data } = await svc.rpc('mark_session_present', { p_session: sid.data, p_by: u?.id ?? null });
  return done(`/admin/collectifs/seances/${sid.data}`, `${data ?? 0} joueur(s) marqué(s) présent(s) — pensez à valider la séance`);
}
export async function postponeSession(fd: FormData) {
  const svc = await guard(); const p = z.object({ session: uuid, date, time, duration: num.min(15).max(360) }).safeParse(get(fd)); const to = `/admin/collectifs/seances/${fd.get('session')}`;
  if (!p.success) return go(to, undefined, 'Champs invalides');
  const { error } = await svc.rpc('reschedule_session', { p_session: p.data.session, p_start: parisToUtcIso(p.data.date, p.data.time), p_duration_min: p.data.duration });
  return done(to, error ? undefined : 'Séance reportée — elle garde son cycle et ses inscrits', error ? (error.code === '23P01' ? 'Conflit avec une autre séance ou une indisponibilité.' : friendly(error)) : undefined);
}
export async function cancelOccurrence(fd: FormData) {
  const svc = await guard(); const sid = uuid.safeParse(fd.get('session')); if (!sid.success) return go('/admin/collectifs', undefined, 'Requête invalide');
  const { data, error } = await svc.rpc('cancel_session', { p_session: sid.data });
  return done(`/admin/collectifs/seances/${sid.data}`, error ? undefined : `Séance annulée (${data} inscription(s), crédits rendus) — non comptée comme réalisée`, error ? friendly(error) : undefined);
}

/* ----- Forfaits ----- */
export async function customCredits(fd: FormData) {
  const svc = await guard(); const u = await getAdminUser(); const p = z.object({ customer: uuid, credits: num.min(1).max(200), note: text(200) }).safeParse(get(fd)); const to = back(fd, '/admin/collectifs/joueurs');
  if (!p.success) return go(to, undefined, 'Joueur et nombre de crédits obligatoires');
  const { data: pk } = await svc.from('pack_definitions').insert({ name: `Forfait ${p.data.credits} séances`, credits: p.data.credits, price_cents: 0, eligible_course_codes: ['individuel', 'duo', 'collectif'], active: true }).select('id').single();
  if (!pk) return go(to, undefined, 'Création impossible');
  const { error } = await svc.rpc('grant_pack', { p_customer: p.data.customer, p_pack: pk.id, p_note: p.data.note ?? 'ajout de crédits', p_by: u?.id ?? null });
  await svc.from('pack_definitions').update({ active: false }).eq('id', pk.id);
  const { data: bks } = await svc.from('bookings').select('id,sessions!inner(starts_at)').eq('customer_id', p.data.customer).eq('status', 'confirmed').gt('sessions.starts_at', new Date().toISOString());
  for (const b of bks ?? []) await svc.rpc('sync_booking_credit', { p_booking: b.id });
  return done(to, error ? undefined : `${p.data.credits} crédit(s) ajouté(s)`, error ? friendly(error) : undefined);
}
