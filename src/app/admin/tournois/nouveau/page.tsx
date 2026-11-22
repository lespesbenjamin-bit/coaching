import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import EventForm from '@/components/tournois/EventForm';
import { createEvent } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau tournoi — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const [{ data: cats }, { data: fmts }, { data: clubs }] = await Promise.all([
    svc.from('tournament_categories').select('code,label').eq('active', true).order('sort_order'),
    svc.from('tournament_formats').select('code,label').eq('active', true).order('sort_order'),
    svc.from('clubs').select('id,name').order('name'),
  ]);
  return (
    <main className="main"><div className="wrap" style={{ maxWidth: 760 }}>
      <AdminNav current="tournois" />
      <p className="muted"><a href="/admin/tournois">← Tournois</a></p>
      <h1 style={{ margin: '6px 0 16px' }}>Nouveau tournoi</h1>
      <Flash err={sp.err} />
      <EventForm action={createEvent} submit="Créer le tournoi" cats={(cats ?? []).map(c => ({ value: c.code, label: c.label }))} fmts={(fmts ?? []).map(c => ({ value: c.code, label: c.label }))} clubs={(clubs ?? []).map(c => ({ value: c.id, label: c.name }))} />
      <p className="muted" style={{ marginTop: 10 }}>Ce tournoi sera marqué « Saisi à la main ». L’import d’un calendrier arrive en phase C.</p>
    </div></main>
  );
}
