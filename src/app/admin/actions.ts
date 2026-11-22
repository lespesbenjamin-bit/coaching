'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, friendly, go } from '@/lib/backoffice';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform(s => s || null);
const num = z.coerce.number().int();
const time = z.string().regex(/^\d{2}:\d{2}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const get = (fd: FormData) => Object.fromEntries(fd.entries());
const back = (fd: FormData, fallback: string) => String(fd.get('back') ?? '').startsWith('/admin') ? String(fd.get('back')) : fallback;

/* ---------- Groupes ---------- */
export async function createGroup(fd: FormData) {
  const svc = await guard();
  const p = z.object({ name: z.string().trim().min(1).max(80), level: text(40), description: text(500), capacity: num.min(1).max(12), weekday: num.min(1).max(7),
    start_time: time, duration_min: num.min(15).max(360), price: z.coerce.number().min(0).max(1000), visibility: z.enum(['public', 'private']) }).safeParse(get(fd));
  if (!p.success) go('/admin/groupes', undefined, 'Champs invalides');
  const d = p.data;
  const { data: ct } = await svc.from('course_types').select('id').eq('code', 'collectif').maybeSingle();
  const { data, error } = await svc.from('groups').insert({ name: d.name, level: d.level, description: d.description, capacity: d.capacity, weekday: d.weekday,
    start_time: d.start_time, duration_min: d.duration_min, price_per_person_cents: Math.round(d.price * 100), visibility: d.visibility, course_type_id: ct?.id ?? null }).select('id').single();
  if (error || !data) go('/admin/groupes', undefined, friendly(error));
  revalidatePath('/admin/groupes'); go(`/admin/groupes/${data.id}`, 'Groupe créé');
}
export async function updateGroup(fd: FormData) {
  const svc = await guard();
  const p = z.object({ id: uuid, name: z.string().trim().min(1).max(80), level: text(40), description: text(500), capacity: num.min(1).max(12),
    price: z.coerce.number().min(0).max(1000), visibility: z.enum(['public', 'private']), status: z.enum(['active', 'suspended', 'archived']) }).safeParse(get(fd));
  if (!p.success) go('/admin/groupes', undefined, 'Champs invalides');
  const d = p.data;
  const { count } = await svc.from('group_memberships').select('id', { count: 'exact', head: true }).eq('group_id', d.id).eq('status', 'active');
  if ((count ?? 0) > d.capacity) go(`/admin/groupes/${d.id}`, undefined, `Capacité inférieure au nombre de membres (${count}).`);
  await svc.from('groups').update({ name: d.name, level: d.level, description: d.description, capacity: d.capacity, price_per_person_cents: Math.round(d.price * 100), visibility: d.visibility, status: d.status }).eq('id', d.id);
  revalidatePath(`/admin/groupes/${d.id}`); go(`/admin/groupes/${d.id}`, 'Groupe mis à jour');
}
export async function addMember(fd: FormData) {
  const svc = await guard(); const p = z.object({ group: uuid, customer: uuid }).safeParse({ group: fd.get('group'), customer: fd.get('customer') });
  if (!p.success) go('/admin/groupes', undefined, 'Choisissez un joueur');
  const { error, data } = await svc.rpc('add_group_member', { p_group: p.data.group, p_customer: p.data.customer });
  const to = `/admin/groupes/${p.data.group}`;
  if (error) go(to, undefined, friendly(error));
  revalidatePath(to);
  go(to, data?.already ? 'Déjà membre' : `Joueur ajouté (${data?.enrolled ?? 0} séance(s) à venir)${data?.not_enrolled ? `, ${data.not_enrolled} complète(s)` : ''}`);
}
export async function removeMember(fd: FormData) {
  const svc = await guard(); const p = z.object({ group: uuid, customer: uuid }).safeParse({ group: fd.get('group'), customer: fd.get('customer') });
  if (!p.success) go('/admin/groupes', undefined, 'Requête invalide');
  const { data, error } = await svc.rpc('remove_group_member', { p_group: p.data.group, p_customer: p.data.customer });
  const to = `/admin/groupes/${p.data.group}`; revalidatePath(to);
  go(to, error ? undefined : `Joueur retiré (${data} séance(s) à venir libérée(s))`, error ? friendly(error) : undefined);
}

/* ---------- Cycles ---------- */
export async function createCycle(fd: FormData) {
  const svc = await guard();
  const p = z.object({ group: uuid, label: text(80), count: num.min(1).max(60), start: date, weekday: num.min(1).max(7), time, duration: num.min(15).max(360), excluded: z.string().max(400).optional() }).safeParse(get(fd));
  if (!p.success) go('/admin/groupes', undefined, 'Champs invalides');
  const d = p.data; const to = `/admin/groupes/${d.group}`;
  const excluded = (d.excluded ?? '').split(/[\s,;]+/).filter(Boolean);
  if (excluded.some(x => !/^\d{4}-\d{2}-\d{2}$/.test(x))) go(to, undefined, 'Dates exclues : format AAAA-MM-JJ séparées par des virgules');
  const { data: cyc, error } = await svc.from('training_cycles').insert({ group_id: d.group, label: d.label, sessions_count: d.count, start_date: d.start, weekday: d.weekday, start_time: d.time, duration_min: d.duration, excluded_dates: excluded }).select('id').single();
  if (error || !cyc) go(to, undefined, friendly(error));
  const { data: r, error: e2 } = await svc.rpc('generate_cycle_sessions', { p_cycle: cyc.id });
  revalidatePath(to);
  if (e2) go(to, undefined, friendly(e2));
  const c = (r?.conflicts ?? []) as string[];
  go(to, `Cycle créé : ${r.created} séance(s)${c.length ? ` — ${c.length} date(s) en conflit horaire non créée(s) : ${c.join(', ')}` : ''}`);
}
export async function cycleAction(fd: FormData) {
  const svc = await guard(); const p = z.object({ cycle: uuid, group: uuid, op: z.enum(['suspend', 'resume', 'extend', 'regenerate', 'cancel']), extra: num.min(1).max(30).optional() }).safeParse(get(fd));
  if (!p.success) go('/admin/groupes', undefined, 'Requête invalide');
  const d = p.data; const to = `/admin/groupes/${d.group}`; let msg = '';
  if (d.op === 'suspend' || d.op === 'resume') { const { data } = await svc.rpc('set_cycle_suspended', { p_cycle: d.cycle, p_suspend: d.op === 'suspend' }); msg = `${data ?? 0} séance(s) ${d.op === 'suspend' ? 'suspendue(s)' : 'reprise(s)'}`; }
  else if (d.op === 'extend' || d.op === 'regenerate') {
    const { data, error } = d.op === 'extend' ? await svc.rpc('extend_cycle', { p_cycle: d.cycle, p_extra: d.extra ?? 1 }) : await svc.rpc('generate_cycle_sessions', { p_cycle: d.cycle });
    if (error) go(to, undefined, friendly(error));
    msg = `${data.created} séance(s) créée(s)${data.conflicts?.length ? `, ${data.conflicts.length} conflit(s)` : ''}`;
  } else {
    const { data: ss } = await svc.from('sessions').select('id').eq('cycle_id', d.cycle).gt('starts_at', new Date().toISOString()).neq('status', 'cancelled');
    for (const s of ss ?? []) await svc.rpc('cancel_session', { p_session: s.id });
    await svc.from('training_cycles').update({ status: 'cancelled' }).eq('id', d.cycle);
    msg = `Cycle annulé (${ss?.length ?? 0} séance(s) à venir annulée(s))`;
  }
  revalidatePath(to); go(to, msg);
}

/* ---------- Séances, présences, rattrapages ---------- */
export async function setAttendance(fd: FormData) {
  const svc = await guard(); const p = z.object({ booking: uuid, status: z.enum(['present', 'absent_justified', 'absent_unjustified', 'cancelled', 'to_makeup']), note: text(300).optional() }).safeParse(get(fd));
  const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Requête invalide');
  const adm = (await import('@/lib/auth')).getAdminUser; const u = await adm();
  const { error } = await svc.rpc('set_attendance', { p_booking: p.data.booking, p_status: p.data.status, p_note: p.data.note ?? null, p_by: u?.id ?? null });
  revalidatePath(to); go(to, error ? undefined : 'Présence enregistrée', error ? friendly(error) : undefined);
}
export async function markAllPresent(fd: FormData) {
  const svc = await guard(); const p = uuid.safeParse(fd.get('session')); const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Requête invalide');
  const u = await (await import('@/lib/auth')).getAdminUser();
  const { data, error } = await svc.rpc('mark_session_present', { p_session: p.data, p_by: u?.id ?? null });
  revalidatePath(to); go(to, error ? undefined : `${data} joueur(s) marqué(s) présent(s)`, error ? friendly(error) : undefined);
}
export async function cancelSession(fd: FormData) {
  const svc = await guard(); const p = uuid.safeParse(fd.get('session')); const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Requête invalide');
  const { data, error } = await svc.rpc('cancel_session', { p_session: p.data });
  revalidatePath(to); go(to, error ? undefined : `Séance annulée (${data} réservation(s), crédits rendus)`, error ? friendly(error) : undefined);
}
export async function rescheduleSession(fd: FormData) {
  const svc = await guard(); const p = z.object({ session: uuid, date, time, duration: num.min(15).max(360) }).safeParse(get(fd)); const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Champs invalides');
  const { parisToUtcIso } = await import('@/lib/dates');
  const { error } = await svc.rpc('reschedule_session', { p_session: p.data.session, p_start: parisToUtcIso(p.data.date, p.data.time), p_duration_min: p.data.duration });
  revalidatePath(to); go(to, error ? undefined : 'Horaire modifié (inscriptions conservées)', error ? friendly(error) : undefined);
}
export async function cancelBookingCredit(fd: FormData) {
  const svc = await guard(); const p = uuid.safeParse(fd.get('booking')); const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Requête invalide');
  const force = fd.get('force'); const { data, error } = await svc.rpc('cancel_booking', { p_booking: p.data, p_force_late: force === 'late' ? true : force === 'ontime' ? false : null });
  revalidatePath(to); go(to, error ? undefined : data?.already ? 'Déjà annulée' : data?.late ? 'Annulée tardivement (crédit consommé)' : 'Annulée (crédit rendu)', error ? friendly(error) : undefined);
}
export async function bookMakeup(fd: FormData) {
  const svc = await guard(); const p = z.object({ entitlement: uuid, session: uuid }).safeParse(get(fd)); const to = back(fd, '/admin/joueurs'); if (!p.success) go(to, undefined, 'Choisissez une séance');
  const { error } = await svc.rpc('book_makeup', { p_entitlement: p.data.entitlement, p_session: p.data.session });
  revalidatePath(to); go(to, error ? undefined : 'Rattrapage réservé', error ? friendly(error) : undefined);
}
export async function addToSession(fd: FormData) {
  const svc = await guard(); const p = z.object({ session: uuid, customer: uuid }).safeParse(get(fd)); const to = back(fd, '/admin/agenda'); if (!p.success) go(to, undefined, 'Choisissez un joueur');
  const { data } = await svc.rpc('enroll_member_in_session', { p_session: p.data.session, p_customer: p.data.customer });
  revalidatePath(to); go(to, data ? 'Joueur inscrit' : undefined, data ? undefined : 'Inscription impossible (séance complète, fermée ou joueur déjà inscrit)');
}

/* ---------- Packs, crédits, paramètres ---------- */
export async function createPack(fd: FormData) {
  const svc = await guard(); const p = z.object({ name: z.string().trim().min(1).max(80), credits: num.min(1).max(200), price: z.coerce.number().min(0).max(10000), validity: z.string().optional() }).safeParse(get(fd));
  if (!p.success) go('/admin/packs', undefined, 'Champs invalides');
  const codes = (fd.getAll('codes') as string[]).filter(c => ['individuel', 'duo', 'collectif'].includes(c));
  if (!codes.length) go('/admin/packs', undefined, 'Choisissez au moins un type de cours');
  const v = p.data.validity ? Number(p.data.validity) : null;
  await svc.from('pack_definitions').insert({ name: p.data.name, credits: p.data.credits, price_cents: Math.round(p.data.price * 100), eligible_course_codes: codes, validity_days: v && v > 0 ? v : null });
  revalidatePath('/admin/packs'); go('/admin/packs', 'Pack créé');
}
export async function togglePack(fd: FormData) {
  const svc = await guard(); const id = uuid.safeParse(fd.get('id')); if (id.success) await svc.from('pack_definitions').update({ active: fd.get('to') === '1' }).eq('id', id.data);
  revalidatePath('/admin/packs'); go('/admin/packs', 'Pack mis à jour');
}
export async function grantPack(fd: FormData) {
  const svc = await guard(); const p = z.object({ customer: uuid, pack: uuid, note: text(200).optional() }).safeParse(get(fd)); const to = back(fd, '/admin/packs'); if (!p.success) go(to, undefined, 'Choisissez un joueur et un pack');
  const u = await (await import('@/lib/auth')).getAdminUser();
  const { data: alloc, error } = await svc.rpc('grant_pack', { p_customer: p.data.customer, p_pack: p.data.pack, p_note: p.data.note ?? null, p_by: u?.id ?? null });
  if (error) go(to, undefined, friendly(error));
  // les séances confirmées à venir du joueur, jusque-là sans crédit, en prennent un
  const { data: bks } = await svc.from('bookings').select('id,sessions!inner(starts_at)').eq('customer_id', p.data.customer).eq('status', 'confirmed').gt('sessions.starts_at', new Date().toISOString());
  for (const b of bks ?? []) await svc.rpc('sync_booking_credit', { p_booking: b.id });
  void alloc; revalidatePath(to); go(to, 'Pack attribué');
}
export async function adjustCredits(fd: FormData) {
  const svc = await guard(); const p = z.object({ customer: uuid, alloc: uuid, delta: num.refine(n => n !== 0 && Math.abs(n) <= 100), reason: z.string().trim().min(3).max(200) }).safeParse(get(fd));
  const to = back(fd, '/admin/packs'); if (!p.success) go(to, undefined, 'Pack, quantité et motif obligatoires');
  const u = await (await import('@/lib/auth')).getAdminUser();
  const { error } = await svc.rpc('adjust_credits', { p_customer: p.data.customer, p_alloc: p.data.alloc, p_delta: p.data.delta, p_reason: p.data.reason, p_by: u?.id ?? null });
  revalidatePath(to); go(to, error ? undefined : 'Correction enregistrée', error ? friendly(error) : undefined);
}
export async function expireCredits() {
  const svc = await guard(); const { data } = await svc.rpc('expire_credits'); revalidatePath('/admin/packs'); go('/admin/packs', `${data ?? 0} crédit(s) expiré(s)`);
}
export async function saveSettings(fd: FormData) {
  const svc = await guard(); const h = z.coerce.number().int().min(0).max(720).safeParse(fd.get('cancel_deadline_hours')); if (!h.success) go('/admin/parametres', undefined, 'Délai invalide');
  const rows = [{ key: 'cancel_deadline_hours', value: h.data }, ...['late_cancel_consumes_credit', 'unjustified_absence_consumes_credit', 'hold_credit_on_booking'].map(k => ({ key: k, value: fd.get(k) === 'on' }))]
    .map(r => ({ ...r, updated_at: new Date().toISOString() }));
  await svc.from('app_settings').upsert(rows);
  revalidatePath('/admin/parametres'); go('/admin/parametres', 'Paramètres enregistrés (appliqués aux prochains calculs)');
}
export async function createCustomer(fd: FormData) {
  const svc = await guard(); const p = z.object({ first: z.string().trim().min(1).max(60), last: z.string().trim().min(1).max(60), email: z.string().trim().toLowerCase().email().max(120), phone: z.string().trim().min(6).max(30), level: text(40) }).safeParse(get(fd));
  if (!p.success) go('/admin/joueurs', undefined, 'Champs invalides');
  const { data: ex } = await svc.from('customers').select('id').eq('email', p.data.email).maybeSingle();
  if (ex) go(`/admin/joueurs/fiche/${ex.id}`, 'Un joueur avec cet e-mail existe déjà : fiche ouverte');
  const { data, error } = await svc.from('customers').insert({ first_name: p.data.first, last_name: p.data.last, email: p.data.email, phone: p.data.phone, level: p.data.level }).select('id').single();
  if (error || !data) go('/admin/joueurs', undefined, 'Création impossible');
  go(`/admin/joueurs/fiche/${data.id}`, 'Fiche joueur créée');
}
