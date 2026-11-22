import type { EventRow } from '@/lib/tournois';
type O = { value: string; label: string };
export default function EventForm({ action, e, cats, fmts, clubs, submit }: { action: (fd: FormData) => void; e?: Partial<EventRow>; cats: O[]; fmts: O[]; clubs: O[]; submit: string }) {
  return (
    <form action={action} className="form panel" style={{ padding: 18 }}>
      {e?.id && <input type="hidden" name="id" value={e.id} />}
      <label className="full">Nom du tournoi<input name="name" required minLength={2} maxLength={140} defaultValue={e?.name ?? ''} /></label>
      <label>Date de début<input name="start_date" type="date" required defaultValue={e?.start_date ?? ''} /></label>
      <label>Date de fin (si plusieurs jours)<input name="end_date" type="date" defaultValue={e?.end_date ?? ''} /></label>
      <label>Catégorie<select name="category_code" defaultValue={e?.category_code ?? ''}><option value="">—</option>{cats.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Épreuve<select name="format_code" defaultValue={e?.format_code ?? ''}><option value="">—</option>{fmts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Club organisateur<select name="club_id" defaultValue={e?.club_id ?? ''}><option value="">— ou saisir un nouveau club</option>{clubs.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Nouveau club (si absent de la liste)<input name="club_name" maxLength={100} /></label>
      <label>Ville<input name="city" maxLength={80} defaultValue={e?.city ?? ''} /></label>
      <label>Adresse<input name="address" maxLength={200} defaultValue={e?.address ?? ''} /></label>
      <label>Date limite d’inscription<input name="registration_deadline" type="date" defaultValue={e?.registration_deadline ?? ''} /></label>
      <label>Lien officiel (https://…)<input name="official_url" type="url" maxLength={300} defaultValue={e?.official_url ?? ''} /></label>
      <label className="full">Informations d’inscription<textarea name="registration_info" rows={2} maxLength={1000} defaultValue={e?.registration_info ?? ''} /></label>
      <label className="full">Commentaires<textarea name="coach_comment" rows={2} maxLength={2000} defaultValue={e?.coach_comment ?? ''} /></label>
      <div className="full"><button className="btn">{submit}</button></div>
    </form>
  );
}
