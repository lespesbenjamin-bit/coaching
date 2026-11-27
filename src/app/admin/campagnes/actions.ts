'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { guard, go } from '@/lib/backoffice';
import { campaignInput } from '@/lib/campaigns';

const to = '/admin/campagnes';
const BUCKET = 'campaign-media';
const MAX = 2 * 1024 * 1024;

function sniff(b: Uint8Array): { ext: string; type: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', type: 'image/webp' };
  return null;
}
const done = () => { revalidatePath(to); revalidatePath('/'); };

export async function saveCampaign(fd: FormData) {
  const svc = await guard();
  const p = campaignInput.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return go(to, undefined, p.error.issues[0]?.message ?? 'Champs invalides');
  const { price, reference, ...rest } = p.data;
  const row: Record<string, unknown> = { ...rest, price_cents: price, reference_price_cents: reference, updated_at: new Date().toISOString() };
  if (row.voucher_product) {
    const { data } = await svc.from('voucher_products').select('code').eq('code', row.voucher_product as string).maybeSingle();
    if (!data) return go(to, undefined, 'Formule de bon cadeau inconnue');
  }
  const file = fd.get('image');
  if (file instanceof File && file.size > 0) {                       // image : type vérifié sur les octets, 2 Mo max
    if (file.size > MAX) return go(to, undefined, 'Image trop lourde (2 Mo maximum)');
    const buf = new Uint8Array(await file.arrayBuffer()); const kind = sniff(buf);
    if (!kind) return go(to, undefined, 'Image refusée : JPEG, PNG ou WebP uniquement');
    const path = `${randomUUID()}.${kind.ext}`;
    const up = await svc.storage.from(BUCKET).upload(path, buf, { contentType: kind.type, upsert: false });
    if (up.error) return go(to, undefined, 'Import de l’image impossible (la migration 011 est-elle appliquée ?)');
    row.media_path = path;
  } else if (fd.get('remove_image') === 'on') row.media_path = null;
  const id = z.string().uuid().safeParse(fd.get('id'));
  const { error } = id.success ? await svc.from('campaigns').update(row).eq('id', id.data) : await svc.from('campaigns').insert({ ...row, status: 'draft' });
  done(); return go(to, error ? undefined : id.success ? 'Campagne enregistrée' : 'Campagne créée en brouillon', error ? 'Enregistrement impossible (vérifiez les champs)' : undefined);
}

export async function setCampaignStatus(fd: FormData) {
  const svc = await guard(); const id = z.string().uuid().safeParse(fd.get('id')); const st = z.enum(['draft', 'published', 'archived']).safeParse(fd.get('to'));
  if (!id.success || !st.success) return go(to, undefined, 'Requête invalide');
  await svc.from('campaigns').update({ status: st.data, updated_at: new Date().toISOString() }).eq('id', id.data);
  done(); return go(to, { published: 'Campagne publiée : elle apparaît sur l’accueil en moins d’une minute (si ses dates le permettent)', draft: 'Campagne repassée en brouillon (retirée du site)', archived: 'Campagne archivée' }[st.data]);
}

export async function duplicateCampaign(fd: FormData) {
  const svc = await guard(); const id = z.string().uuid().safeParse(fd.get('id')); if (!id.success) return go(to, undefined, 'Requête invalide');
  const { data: c } = await svc.from('campaigns').select('*').eq('id', id.data).single(); if (!c) return go(to, undefined, 'Campagne introuvable');
  const { id: _i, created_at: _c, updated_at: _u, ...copy } = c as Record<string, unknown>;
  const { error } = await svc.from('campaigns').insert({ ...copy, name: `${String(c.name).slice(0, 70)} (copie)`, status: 'draft', starts_on: null, ends_on: null });
  done(); return go(to, error ? undefined : 'Copie créée en brouillon (dates à renseigner)', error ? 'Duplication impossible' : undefined);
}
