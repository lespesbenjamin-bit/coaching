'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { sessionClient } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/admin';
import { tooManyAttempts } from '@/lib/rate-limit';
import { normalizeCode } from '@/lib/vouchers';

const MSG: Record<string, string> = { P0091: 'Code inconnu : vérifiez la saisie.', P0092: 'Ce bon a déjà été utilisé.', P0093: 'Ce bon n’est pas utilisable.', P0094: 'Ce bon a expiré.' };
const back = (k: 'ok' | 'err', m: string): never => redirect(`/bon-cadeau/utiliser?${k}=${encodeURIComponent(m)}`);

export async function redeemMyVoucher(fd: FormData) {
  const supa = await sessionClient(); const { data } = await supa.auth.getUser(); const user = data.user; if (!user) redirect('/connexion');
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (await tooManyAttempts(ip)) return back('err', 'Trop de tentatives. Réessayez dans quelques minutes.');   // freine la devinette de codes
  const code = normalizeCode(String(fd.get('code') ?? ''));
  if (!/^[A-Z2-9]{10}$/.test(code)) return back('err', 'Code invalide : 10 caractères attendus.');
  const svc = serviceClient();
  let { data: c } = await svc.from('customers').select('id').eq('user_id', user.id).limit(1).maybeSingle();
  if (!c) {                                                 // joueur sans fiche : on la crée à partir de son profil, e-mail vérifié uniquement
    if (!user.email || !user.email_confirmed_at) return back('err', 'Confirmez d’abord votre adresse e-mail.');
    const email = user.email.trim().toLowerCase();
    const { data: ex } = await svc.from('customers').select('id,user_id').eq('email', email).maybeSingle();
    if (ex && ex.user_id && ex.user_id !== user.id) return back('err', 'Un compte existe déjà avec cette adresse. Contactez le coach.');
    if (ex) { await svc.from('customers').update({ user_id: user.id }).eq('id', ex.id); c = { id: ex.id }; }
    else {
      const { data: p } = await svc.from('profiles').select('first_name,last_name,phone').eq('user_id', user.id).maybeSingle();
      if (!p?.first_name) return back('err', 'Complétez d’abord votre profil dans votre espace joueur.');
      const ins = await svc.from('customers').insert({ user_id: user.id, first_name: p.first_name, last_name: p.last_name || '-', email, phone: p.phone || '-' }).select('id').single();
      if (ins.error || !ins.data) return back('err', 'Impossible de rattacher votre compte. Contactez le coach.');
      c = ins.data;
    }
  }
  const { data: r, error } = await svc.rpc('redeem_voucher', { p_code: code, p_customer: c.id, p_by: null });
  if (error) return back('err', MSG[error.code ?? ''] ?? 'Utilisation impossible.');
  return back('ok', `${r.credits} cours ajouté${r.credits > 1 ? 's' : ''} à votre compte.`);
}
