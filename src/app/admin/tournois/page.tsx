import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import AdminNav from '@/components/AdminNav';
import Flash from '@/components/Flash';
import { Calendar, EventList, EventTable, FilterForm, ViewSwitch, type Marks } from '@/components/tournois/Views';
import { PART_STATUS, parseFilters, matchEvent, validDay, mondayOf, addDays, todayKey, type EventRow } from '@/lib/tournois';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tournois — administration', robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const f = parseFilters(sp); const svc = serviceClient();
  const view = (['mois', 'semaine', 'liste', 'tableau'].includes(sp.vue ?? '') ? sp.vue : 'mois') as 'mois' | 'semaine' | 'liste' | 'tableau';
  const anchor = validDay(sp.d); const today = todayKey();
  const [{ data: evs }, { data: parts }, { data: cats }, { data: fmts }, { data: clubs }, { data: groups }, { data: customers }, { data: mships }] = await Promise.all([
    svc.from('tournament_events').select('*, clubs(name,city)').order('start_date').limit(2000),
    svc.from('tournament_participations').select('tournament_id,customer_id,status'),
    svc.from('tournament_categories').select('code,label').eq('active', true).order('sort_order'),
    svc.from('tournament_formats').select('code,label').eq('active', true).order('sort_order'),
    svc.from('clubs').select('id,name').order('name'),
    svc.from('groups').select('id,name').neq('status', 'archived').order('name'),
    svc.from('customers').select('id,first_name,last_name').order('last_name').limit(1000),
    svc.from('group_memberships').select('group_id,customer_id').eq('status', 'active'),
  ]);
  const P = (parts ?? []) as any[];
  const groupMembers = f.groupe ? new Set(((mships ?? []) as any[]).filter(m => m.group_id === f.groupe).map(m => m.customer_id)) : null;
  // filtres sur les participations : joueur, groupe, statut
  const keepPart = (p: any) => (!f.joueur || p.customer_id === f.joueur) && (!groupMembers || groupMembers.has(p.customer_id)) && (!f.statut || p.status === f.statut);
  const needPart = !!(f.joueur || f.groupe || f.statut);
  const withPart = new Set(P.filter(keepPart).map(p => p.tournament_id));
  const marks: Marks = {}; for (const p of P) if (p.status !== 'cancelled') { marks[p.tournament_id] = { count: (marks[p.tournament_id]?.count ?? 0) + 1 }; }
  let events = ((evs ?? []) as EventRow[]).filter(e => matchEvent(e, f) && (!needPart || withPart.has(e.id)));
  const calendar = view === 'mois' || view === 'semaine';
  if (!calendar && !f.passes && !f.from) events = events.filter(e => (e.end_date ?? e.start_date) >= today);
  const evHref = (e: EventRow) => `/admin/tournois/${e.id}`;
  const proposed = ((evs ?? []) as EventRow[]).filter(e => e.publication === 'proposed').length;
  const opt = (rows: any[] | null, v: string, l: string) => (rows ?? []).map(r => ({ value: r[v], label: r[l] }));
  return (
    <main className="main"><div className="wrap">
      <AdminNav current="tournois" />
      <div className="bar"><h1>Tournois</h1><a className="btn" href="/admin/tournois/nouveau">Nouveau tournoi</a></div>
      <Flash ok={sp.ok} err={sp.err} />
      {proposed > 0 && <div className="notice warn">{proposed} tournoi(s) proposé(s) par des joueurs à valider (repérés « À valider » dans le tableau).</div>}
      <ViewSwitch base="/admin/tournois" sp={sp} view={view} views={[['mois', 'Mois'], ['semaine', 'Semaine'], ['liste', 'Liste'], ['tableau', 'Tableau']]} />
      <FilterForm f={f} sp={sp} cats={opt(cats, 'code', 'label')} fmts={opt(fmts, 'code', 'label')} clubs={opt(clubs, 'id', 'name')}
        extra={{ groups: opt(groups, 'id', 'name'), players: (customers ?? []).map((c: any) => ({ value: c.id, label: `${c.last_name} ${c.first_name}` })), statuses: Object.entries(PART_STATUS).map(([value, label]) => ({ value, label })), sources: true }} />
      {calendar ? <Calendar base="/admin/tournois" sp={sp} view={view as 'mois' | 'semaine'} anchor={view === 'semaine' ? mondayOf(anchor) : anchor} events={events} evHref={evHref} marks={marks} />
        : view === 'liste' ? <EventList events={events} evHref={evHref} marks={marks} /> : <EventTable events={events} evHref={evHref} marks={marks} />}
      <p className="muted" style={{ marginTop: 10 }}>Données : « Saisi à la main », « Importé » ou « Vérifié » sont distingués sur chaque tournoi. Aucun tournoi n’est inventé : le catalogue ne contient que ce que vous ou vos joueurs y ajoutez.</p>
    </div></main>
  );
}
