import 'server-only';
import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';

export async function guard() {
  if (!(await getAdminUser())) redirect('/admin/login');
  return serviceClient();
}

const ERRORS: Record<string, string> = {
  P0010: 'Ce groupe est inactif.', P0011: 'Ce groupe est complet.', P0020: 'Le solde de crédits ne peut pas devenir négatif.',
  P0021: 'Le journal est en ajout seul.', P0030: 'Ce droit à rattrapage n’est plus disponible.', P0031: 'Cette séance n’est pas disponible.',
  P0032: 'Le type de cours n’est pas compatible avec la séance d’origine.', P0033: 'Cette séance est complète.', P0034: 'Ce joueur est déjà inscrit à cette séance.',
  P0040: 'Pack inconnu ou inactif.', P0041: 'Choisissez le pack à corriger.', P0050: 'Élément introuvable.', P0051: 'La séance est déjà réalisée.',
  P0052: 'Statut de présence invalide.', P0053: 'Réservation non confirmée.', '23P01': 'Conflit d’horaire avec une autre séance.',
  '23514': 'Valeur refusée (motif obligatoire pour une correction).',
};
export function friendly(e: { code?: string; message?: string } | null | undefined) {
  if (!e) return '';
  return ERRORS[e.code ?? ''] ?? (e.message?.includes('does not exist') ? 'La migration 003 n’est pas encore appliquée dans Supabase.' : 'Opération impossible.');
}
export function go(path: string, ok?: string, err?: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(err ? `${path}${sep}err=${encodeURIComponent(err)}` : ok ? `${path}${sep}ok=${encodeURIComponent(ok)}` : path);
}
export const ATTENDANCE_LABELS: Record<string, string> = {
  present: 'Présent', absent_justified: 'Absent justifié', absent_unjustified: 'Absent non justifié', cancelled: 'Annulé', to_makeup: 'À rattraper',
};
export const CREDIT_LABELS: Record<string, string> = { held: 'Crédit réservé', consumed: 'Crédit consommé', none: 'Sans crédit' };
export const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
