'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guard, go } from '@/lib/backoffice';
import { announcementInput } from '@/lib/announcements';

const to = '/admin/actualites';
function parse(fd: FormData) {
  const p = announcementInput.safeParse(Object.fromEntries(fd.entries()));
  return p.success ? { ok: true as const, d: p.data } : { ok: false as const, msg: p.error.issues[0]?.message ?? 'Champs invalides' };
}
export async function saveAnnouncement(fd: FormData) {
  const svc = await guard(); const p = parse(fd); if (!p.ok) return go(to, undefined, p.msg);
  const id = z.string().uuid().safeParse(fd.get('id'));
  const { error } = id.success ? await svc.from('site_announcements').update(p.d).eq('id', id.data) : await svc.from('site_announcements').insert({ ...p.d, active: true });
  revalidatePath(to); return go(to, error ? undefined : id.success ? 'Actualité mise à jour' : 'Actualité créée', error ? 'Enregistrement impossible (vérifiez les champs)' : undefined);
}
export async function toggleAnnouncement(fd: FormData) {
  const svc = await guard(); const id = z.string().uuid().safeParse(fd.get('id')); if (!id.success) return go(to, undefined, 'Requête invalide');
  await svc.from('site_announcements').update({ active: fd.get('to') === '1' }).eq('id', id.data);
  revalidatePath(to); return go(to, fd.get('to') === '1' ? 'Actualité activée' : 'Actualité masquée du site');
}
export async function deleteAnnouncement(fd: FormData) {
  const svc = await guard(); const id = z.string().uuid().safeParse(fd.get('id')); if (!id.success) return go(to, undefined, 'Requête invalide');
  await svc.from('site_announcements').delete().eq('id', id.data);
  revalidatePath(to); return go(to, 'Actualité supprimée');
}
