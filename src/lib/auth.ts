import 'server-only';
import { sessionClient } from './supabase/server';
import { serviceClient } from './supabase/admin';

/** Retourne l'utilisateur seulement s'il est authentifié ET présent dans admin_profiles. */
export async function getAdminUser() {
  try {
    const supa = await sessionClient();
    const { data } = await supa.auth.getUser();           // vérifie le jeton auprès de Supabase
    const user = data.user;
    if (!user) return null;
    const { data: row } = await serviceClient()
      .from('admin_profiles').select('user_id').eq('user_id', user.id).maybeSingle();
    return row ? user : null;
  } catch {
    return null;
  }
}
