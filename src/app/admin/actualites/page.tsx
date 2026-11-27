import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { THEMES, announcementState, type Announcement } from '@/lib/announcements';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import ConfirmButton from '@/components/ConfirmButton';
import { saveAnnouncement, toggleAnnouncement, deleteAnnouncement } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Actualités du site — administration', robots: { index: false, follow: false } };
const STATE = { live: 'Visible sur le site', scheduled: 'Programmée', expired: 'Terminée', off: 'Masquée' } as const;

function Fields({ a }: { a?: Announcement }) {
  return <>
    {a && <input type="hidden" name="id" value={a.id} />}
    <label>Étiquette (ex. « Offre de Noël »)<input name="kicker" maxLength={30} defaultValue={a?.kicker ?? ''} /></label>
    <label>Titre (obligatoire)<input name="title" required maxLength={80} defaultValue={a?.title ?? ''} /></label>
    <label>Texte (240 caractères max)<textarea name="body" rows={3} maxLength={240} defaultValue={a?.body ?? ''} /></label>
    <label>Prix ou mise en avant (ex. « 5 cours · 200 € »)<input name="price_label" maxLength={40} defaultValue={a?.price_label ?? ''} /></label>
    <label>Texte du bouton (ex. « Offrir un cours »)<input name="cta_label" maxLength={30} defaultValue={a?.cta_label ?? ''} /></label>
    <label>Lien du bouton (https://… ou /page)<input name="cta_url" maxLength={300} defaultValue={a?.cta_url ?? ''} placeholder="https://" /></label>
    <label>Couleur<select name="theme" defaultValue={a?.theme ?? 'volt'}>{Object.entries(THEMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    <label>Afficher à partir du (facultatif)<input name="starts_on" type="date" defaultValue={a?.starts_on ?? ''} /></label>
    <label>Jusqu’au, inclus (facultatif)<input name="ends_on" type="date" defaultValue={a?.ends_on ?? ''} /></label>
    <label>Ordre d’affichage (0 = en premier)<input name="sort" type="number" min={0} max={999} defaultValue={a?.sort ?? 0} /></label>
  </>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams;
  const { data } = await serviceClient().from('site_announcements').select('*').order('sort').order('created_at', { ascending: false });
  const list = (data ?? []) as Announcement[];
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="actualites" />
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Actualités du site</h1>
      <p className="muted" style={{ marginBottom: 14 }}>Ces cartes s’affichent juste sous l’en-tête de la page d’accueil (6 au maximum, dans l’ordre choisi). Sans actualité visible, la section n’apparaît pas. Les changements sont visibles sur le site en moins d’une minute.</p>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid2">
        <section>
          {list.length === 0 ? <div className="panel empty">Aucune actualité. Créez la première avec le formulaire.</div> : list.map(a => { const st = announcementState(a); return (
            <details key={a.id} className="panel" style={{ padding: 14, marginBottom: 10 }}>
              <summary style={{ cursor: 'pointer' }}><b>{a.title}</b> <span className={`badge ${st === 'live' ? 'ok' : ''}`}>{STATE[st]}</span>
                <br /><span className="muted">{[a.kicker, a.price_label, a.starts_on && `du ${a.starts_on}`, a.ends_on && `au ${a.ends_on}`].filter(Boolean).join(' · ') || 'Sans dates : toujours visible'}</span></summary>
              <form action={saveAnnouncement} className="form" style={{ marginTop: 10 }}><Fields a={a} /><button className="btn">Enregistrer</button></form>
              <div className="row-actions" style={{ marginTop: 8 }}>
                <form action={toggleAnnouncement}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value={a.active ? '0' : '1'} /><button className="btn ghost">{a.active ? 'Masquer du site' : 'Réactiver'}</button></form>
                <form action={deleteAnnouncement}><input type="hidden" name="id" value={a.id} /><ConfirmButton className="btn ghost" message="Supprimer définitivement cette actualité ?">Supprimer</ConfirmButton></form>
              </div></details>); })}
        </section>
        <aside><form action={saveAnnouncement} className="form panel" style={{ padding: 16 }}><h2>Nouvelle actualité</h2><Fields /><button className="btn">Publier sur le site</button></form></aside>
      </div>
    </div></main>
  );
}
