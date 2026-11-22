export const PART_STATUS: Record<string, string> = {
  interested: 'Intéressé', planned: 'Inscription prévue', declared: 'Inscription déclarée',
  confirmed: 'Inscription confirmée par une source fiable', finished: 'Tournoi terminé', cancelled: 'Participation annulée',
};
export const PART_SHORT: Record<string, string> = { interested: 'Intéressé', planned: 'Prévue', declared: 'Déclarée', confirmed: 'Confirmée', finished: 'Terminé', cancelled: 'Annulée' };
export const SOURCE_LABELS: Record<string, string> = { manual: 'Saisi à la main', imported: 'Importé', verified: 'Vérifié' };
export const DECLARATION_NOTICE = 'Une déclaration de votre part n’est pas une inscription officielle auprès de l’organisateur.';

export type EventRow = {
  id: string; name: string; start_date: string; end_date: string | null; city: string | null; address: string | null; club_id: string | null;
  category_code: string | null; format_code: string | null; registration_info: string | null; registration_deadline: string | null; official_url: string | null;
  coach_comment: string | null; source: 'manual' | 'imported' | 'verified'; publication: 'published' | 'proposed'; status: 'scheduled' | 'cancelled' | 'finished';
  clubs?: { name: string; city: string | null } | null;
};

export type Filters = { q: string; cat: string; fmt: string; club: string; ville: string; from: string; to: string; statut: string; groupe: string; joueur: string; source: string; passes: boolean };
const g = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  return { q: g(sp.q).trim(), cat: g(sp.cat), fmt: g(sp.fmt), club: g(sp.club), ville: g(sp.ville).trim(), from: g(sp.from), to: g(sp.to),
    statut: g(sp.statut), groupe: g(sp.groupe), joueur: g(sp.joueur), source: g(sp.source), passes: g(sp.passes) === '1' };
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matchEvent(e: EventRow, f: Filters) {
  if (f.q && !norm(`${e.name} ${e.city ?? ''} ${e.clubs?.name ?? ''}`).includes(norm(f.q))) return false;
  if (f.cat && e.category_code !== f.cat) return false;
  if (f.fmt && e.format_code !== f.fmt) return false;
  if (f.club && e.club_id !== f.club) return false;
  if (f.ville && !norm(`${e.city ?? ''} ${e.clubs?.city ?? ''}`).includes(norm(f.ville))) return false;
  if (f.source && e.source !== f.source) return false;
  if (f.from && (e.end_date ?? e.start_date) < f.from) return false;
  if (f.to && e.start_date > f.to) return false;
  return true;
}

export const addDays = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = (key: string) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));
export const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const validDay = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : todayKey());
export const monthCells = (anchor: string) => { const first = anchor.slice(0, 7) + '-01'; return Array.from({ length: 42 }, (_, i) => addDays(mondayOf(first), i)); };
export const fmtDate = (d: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${d}T12:00:00Z`));
export const fmtShort = (d: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));
export const fmtRange = (e: { start_date: string; end_date: string | null }) => e.end_date && e.end_date !== e.start_date ? `${fmtShort(e.start_date)} → ${fmtShort(e.end_date)}` : fmtDate(e.start_date);
export const spans = (e: { start_date: string; end_date: string | null }, day: string) => e.start_date <= day && day <= (e.end_date ?? e.start_date);
/** Fabrique une URL en conservant les filtres courants. */
export function href(base: string, sp: Record<string, string | string[] | undefined>, over: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const s = g(v); if (s) p.set(k, s); }
  for (const [k, v] of Object.entries(over)) { if (v === null || v === '') p.delete(k); else p.set(k, v); }
  const q = p.toString(); return q ? `${base}?${q}` : base;
}
