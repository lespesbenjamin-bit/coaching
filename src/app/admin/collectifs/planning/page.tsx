import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase/admin';
import { shiftRecurrence } from '../actions';
import Shell, { Notice } from '@/components/pgm/Shell';
import { Badge } from '@/components/pgm/ui';
import { WEEKDAYS } from '@/lib/collectifs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Planning — collectifs', robots: { index: false, follow: false } };
const add = (k: string, n: number) => { const d = new Date(`${k}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = (k: string) => add(k, -((new Date(`${k}T12:00:00Z`).getUTCDay() + 6) % 7));
const pk = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', ...o }).format(new Date(iso));
const dayOf = (iso: string) => pk(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = (iso: string) => pk(iso, { hour: '2-digit', minute: '2-digit' });
const TONE: Record<string, 'info' | 'ok' | 'bad' | 'warn'> = { open: 'info', done: 'ok', cancelled: 'bad', suspended: 'warn' };
const LABEL: Record<string, string> = { open: 'À venir', done: 'Réalisée', cancelled: 'Annulée', suspended: 'Suspendue' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await getAdminUser())) redirect('/admin/login');
  const sp = await searchParams; const svc = serviceClient();
  const today = new Date().toISOString().slice(0, 10); const anchor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today; const month = sp.vue === 'mois';
  const first = month ? anchor.slice(0, 7) + '-01' : monday(anchor); const start = month ? monday(first) : first; const days = month ? 42 : 7; const end = add(start, days);
  let q = svc.from('sessions').select('id,starts_at,status,group_id,cycle_id,cycle_index,is_exceptional,groups(name,level),bookings(status)').not('group_id', 'is', null).gte('starts_at', `${start}T00:00:00Z`).lt('starts_at', `${end}T23:59:59Z`).order('starts_at');
  if (sp.groupe) q = q.eq('group_id', sp.groupe);
  const [{ data }, { data: prog }, { data: groups }] = await Promise.all([q, svc.from('v_cycle_progress').select('cycle_id,total'), svc.from('groups').select('id,name').neq('status', 'archived').order('name')]);
  const total = new Map(((prog ?? []) as any[]).map(p => [p.cycle_id, p.total]));
  const by = new Map<string, any[]>(); for (const s of (data ?? []) as any[]) { const k = dayOf(s.starts_at); (by.get(k) ?? by.set(k, []).get(k)!).push(s); }
  const step = month ? 31 : 7; const mk = (d: string, extra = '') => `?vue=${month ? 'mois' : 'semaine'}&d=${d}${sp.groupe ? `&groupe=${sp.groupe}` : ''}${extra}`;
  const prev = month ? add(first, -1).slice(0, 7) + '-01' : add(first, -7); const next = month ? add(first, 32).slice(0, 7) + '-01' : add(first, 7);
  const title = month ? new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${first}T12:00:00Z`)) : `Semaine du ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${first}T12:00:00Z`))}`;
  void step;
  // cycles disponibles pour « modifier la récurrence »
  const cyclesWithFuture = [...new Map(((data ?? []) as any[]).filter(s => s.cycle_id && s.status === 'open' && s.cycle_index).map(s => [s.cycle_id, s])).values()];
  return (
    <Shell current="planning" title="Planning">
      <Notice ok={sp.ok} err={sp.err} />
      <div className="pgm-filters">
        <a className="pgm-btn ghost" href={mk(prev)}>←</a><a className="pgm-btn ghost" href={mk(today)}>Aujourd’hui</a><a className="pgm-btn ghost" href={mk(next)}>→</a>
        <b style={{ alignSelf: 'center', textTransform: 'capitalize' }}>{title}</b>
        <span style={{ flex: 1 }} />
        <a className={`pgm-btn ${month ? 'ghost' : 'dark'}`} href={`?vue=semaine&d=${anchor}${sp.groupe ? `&groupe=${sp.groupe}` : ''}`}>Semaine</a><a className={`pgm-btn ${month ? 'dark' : 'ghost'}`} href={`?vue=mois&d=${anchor}${sp.groupe ? `&groupe=${sp.groupe}` : ''}`}>Mois</a>
        <form method="get" className="pgm-actions"><input type="hidden" name="vue" value={month ? 'mois' : 'semaine'} /><input type="hidden" name="d" value={anchor} /><select name="groupe" defaultValue={sp.groupe ?? ''} style={{ width: 180 }} aria-label="Groupe"><option value="">Tous les groupes</option>{(groups ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select><button className="pgm-btn ghost">OK</button></form>
      </div>
      <div className={`pgm-plan ${month ? 'month' : 'week'}`}>
        {Array.from({ length: days }, (_, i) => add(start, i)).map(k => { const list = by.get(k) ?? []; const wd = (new Date(`${k}T12:00:00Z`).getUTCDay() + 6) % 7 + 1; const other = month && k.slice(0, 7) !== first.slice(0, 7);
          return <div key={k} className={`pgm-day${k === today ? ' today' : ''}${other ? ' other' : ''}`}><div className="pgm-dh">{WEEKDAYS[wd].slice(0, 3)} {Number(k.slice(8))}</div>
            {list.map(s => { const n = (s.bookings ?? []).filter((b: any) => ['confirmed', 'completed'].includes(b.status)).length;
              return <a key={s.id} href={`/admin/collectifs/seances/${s.id}`} className={`pgm-ev ${s.status}`}><b>{hm(s.starts_at)} · {s.groups.name}</b>
                <span>{s.groups.level ?? ''} · {n} joueur(s){s.is_exceptional ? ' · exc.' : s.cycle_index ? ` · ${s.cycle_index}/${total.get(s.cycle_id) ?? '?'}` : ''}</span><Badge tone={TONE[s.status] ?? 'neutral'}>{LABEL[s.status] ?? s.status}</Badge></a>; })}
          </div>; })}
      </div>
      {cyclesWithFuture.length > 0 && <details className="pgm-card" style={{ marginTop: 16 }}><summary>Modifier la récurrence (séances futures d’un cycle)</summary>
        <form action={shiftRecurrence} className="pgm-form c2"><input type="hidden" name="back" value={`/admin/collectifs/planning${mk(anchor)}`} />
          <label>Cycle<select name="cycle">{cyclesWithFuture.map((s: any) => <option key={s.cycle_id} value={s.cycle_id}>{s.groups.name}</option>)}</select></label>
          <label>À partir de la séance n°<input name="from_index" type="number" min={1} defaultValue={1} required /></label>
          <label>Nouveau jour<select name="weekday" defaultValue=""><option value="">Inchangé</option>{WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
          <label>Nouvelle heure<input name="time" type="time" /></label><label>Durée (min)<input name="duration" type="number" min={15} max={360} placeholder="Inchangée" /></label>
          <button className="pgm-btn full">Appliquer aux séances futures</button><p className="pgm-muted full" style={{ margin: 0 }}>Seules les séances à venir changent ; les séances passées et validées ne sont jamais touchées. En cas de conflit, rien n’est modifié.</p></form></details>}
    </Shell>
  );
}
