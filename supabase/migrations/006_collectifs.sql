-- GESTION DES COLLECTIFS — migration 006, additive. Nécessite 001 à 005.
-- Réutilise groups, group_memberships, training_cycles, sessions, bookings, attendance_records, credit_transactions (migration 003).

-- ============ Colonnes ============
alter table public.sessions add column if not exists validated_at timestamptz;
alter table public.sessions add column if not exists validated_by uuid;
alter table public.sessions add column if not exists counts_in_cycle boolean not null default true;   -- séance exceptionnelle incluse ou non dans le cycle (décision du coach)
alter table public.sessions add column if not exists is_exceptional boolean not null default false;
alter table public.attendance_records add column if not exists credit_decision text check (credit_decision in ('consume', 'free'));   -- décision manuelle, indépendante de la présence
alter table public.training_cycles add column if not exists renewed_from uuid references public.training_cycles(id);
create unique index if not exists training_cycles_renewed_once on public.training_cycles (renewed_from) where renewed_from is not null;   -- un cycle ne se renouvelle qu'une fois

-- ============ Historique des corrections et idempotence ============
create table if not exists public.session_revisions (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  kind text not null,
  old_values jsonb, new_values jsonb,
  reason text not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists session_revisions_session_idx on public.session_revisions (session_id);
create trigger trg_revisions_no_update before update or delete on public.session_revisions for each row execute function public.ledger_append_only();

create table if not exists public.operation_requests (
  key text primary key,
  kind text not null,
  result jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- ============ Suivi des cycles : compteurs calculés à partir des séances réelles ============
create or replace view public.v_cycle_progress with (security_invoker = true) as
select c.id as cycle_id, c.group_id, c.label, c.status, c.start_date, c.sessions_count as total,
       (count(s.id) filter (where s.status = 'done' and s.counts_in_cycle))::int as validated,
       greatest(c.sessions_count - (count(s.id) filter (where s.status = 'done' and s.counts_in_cycle))::int, 0) as remaining,
       (count(s.id) filter (where s.status in ('open', 'suspended') and s.starts_at > now() and s.counts_in_cycle))::int as upcoming,
       (count(s.id) filter (where s.status = 'open' and s.ends_at <= now()))::int as pending_validation,
       max(s.starts_at) filter (where s.status <> 'cancelled' and s.counts_in_cycle) as last_planned,
       c.renewed_from,
       exists (select 1 from public.training_cycles r where r.renewed_from = c.id) as renewed
from public.training_cycles c
left join public.sessions s on s.cycle_id = c.id
group by c.id;

-- ============ Crédit d'une réservation de collectif : décision manuelle à la validation ============
create or replace function public.booking_desired_credit(p_booking uuid) returns text language plpgsql stable as $$
declare b public.bookings%rowtype; s public.sessions%rowtype; a public.attendance_records%rowtype;
begin
  select * into b from public.bookings where id = p_booking;
  select * into s from public.sessions where id = b.session_id;
  select * into a from public.attendance_records where booking_id = b.id;
  if s.status = 'cancelled' then return 'none'; end if;                 -- séance annulée par le coach : jamais consommée
  if s.group_id is not null then                                        -- collectif : la présence et le crédit sont deux informations indépendantes
    if b.status = 'cancelled' then return case when b.cancelled_late and public.setting_bool('late_cancel_consumes_credit', true) then 'consumed' else 'none' end; end if;
    if b.status in ('pending', 'refused') then return 'none'; end if;
    if s.status = 'done' then                                           -- séance validée : décision enregistrée, sinon valeur par défaut (présent = 1 crédit)
      if a.id is null then return 'none'; end if;
      return case coalesce(a.credit_decision, case when a.status = 'present' then 'consume' else 'free' end) when 'consume' then 'consumed' else 'none' end;
    end if;
    return case when public.setting_bool('hold_credit_on_booking', true) then 'held' else 'none' end;   -- avant validation : crédit simplement réservé
  end if;
  if a.id is not null then
    return case a.status
      when 'present' then 'consumed'
      when 'absent_unjustified' then case when public.setting_bool('unjustified_absence_consumes_credit', true) then 'consumed' else 'none' end
      else 'none' end;
  end if;
  if b.status = 'confirmed' then return case when public.setting_bool('hold_credit_on_booking', true) then 'held' else 'none' end; end if;
  if b.status = 'completed' then return 'consumed'; end if;
  if b.status = 'cancelled' then return case when b.cancelled_late and public.setting_bool('late_cancel_consumes_credit', true) then 'consumed' else 'none' end; end if;
  return 'none';
end $$;

-- ============ Présence + décision de crédit (corrections tracées après validation) ============
create or replace function public.record_attendance(p_booking uuid, p_status text, p_decision text, p_note text, p_by uuid, p_reason text default null)
returns jsonb language plpgsql as $$
declare b public.bookings%rowtype; s public.sessions%rowtype; o public.attendance_records%rowtype; v_before text;
begin
  if p_decision is not null and p_decision not in ('consume', 'free') then raise exception 'Décision de crédit invalide' using errcode = 'P0073'; end if;
  select * into b from public.bookings where id = p_booking;
  if not found then raise exception 'Réservation introuvable' using errcode = 'P0050'; end if;
  select * into s from public.sessions where id = b.session_id;
  if s.status = 'done' and coalesce(btrim(p_reason), '') = '' then raise exception 'Motif de correction obligatoire' using errcode = 'P0074'; end if;
  select * into o from public.attendance_records where booking_id = p_booking;
  v_before := public.booking_credit_state(p_booking);
  perform public.set_attendance(p_booking, p_status, p_note, p_by);
  update public.attendance_records set credit_decision = p_decision where booking_id = p_booking;
  perform public.sync_booking_credit(p_booking);
  if s.status = 'done' then
    insert into public.session_revisions (session_id, booking_id, kind, old_values, new_values, reason, changed_by)
    values (s.id, p_booking, 'attendance_correction',
            jsonb_build_object('status', o.status, 'decision', o.credit_decision, 'credit', v_before),
            jsonb_build_object('status', p_status, 'decision', p_decision, 'credit', public.booking_credit_state(p_booking)), p_reason, p_by);
  end if;
  return jsonb_build_object('credit', public.booking_credit_state(p_booking));
end $$;

-- ============ Validation d'une séance : atomique, idempotente ============
create or replace function public.validate_session(p_session uuid, p_by uuid, p_key text default null) returns jsonb language plpgsql as $$
declare s public.sessions%rowtype; r jsonb; b record; missing int; players int := 0; used int := 0;
begin
  if p_key is not null then
    select result into r from public.operation_requests where key = 'validate:' || p_key;
    if found then return r || jsonb_build_object('replayed', true); end if;
  end if;
  select * into s from public.sessions where id = p_session for update;
  if not found then raise exception 'Séance introuvable' using errcode = 'P0050'; end if;
  if s.status = 'done' then return jsonb_build_object('already', true); end if;
  if s.status <> 'open' then raise exception 'Cette séance ne peut pas être validée' using errcode = 'P0072'; end if;
  select count(*) into missing from public.bookings bk left join public.attendance_records a on a.booking_id = bk.id
   where bk.session_id = p_session and bk.status in ('confirmed', 'completed') and a.id is null;
  if missing > 0 then raise exception 'Présences non renseignées : % joueur(s)', missing using errcode = 'P0070'; end if;
  update public.attendance_records a set credit_decision = case when a.status = 'present' then 'consume' else 'free' end
    from public.bookings bk where a.booking_id = bk.id and bk.session_id = p_session and bk.status in ('confirmed', 'completed') and a.credit_decision is null;
  update public.sessions set status = 'done', validated_at = now(), validated_by = p_by where id = p_session;
  for b in select id from public.bookings where session_id = p_session and status in ('confirmed', 'completed') loop
    perform public.sync_booking_credit(b.id);
    players := players + 1;
    if public.booking_credit_state(b.id) = 'consumed' then used := used + 1; end if;
  end loop;
  r := jsonb_build_object('validated', true, 'players', players, 'credits_consumed', used);
  if p_key is not null then insert into public.operation_requests (key, kind, result, created_by) values ('validate:' || p_key, 'validate_session', r, p_by) on conflict do nothing; end if;
  return r;
end $$;

-- ============ Cycles : renouvellement, séance exceptionnelle, modification de la récurrence ============
create or replace function public.renew_cycle(p_cycle uuid, p_start date, p_count int, p_weekday int, p_time time, p_duration int, p_label text, p_key text, p_by uuid)
returns jsonb language plpgsql as $$
declare o public.training_cycles%rowtype; n uuid; r jsonb; res jsonb;
begin
  if p_key is not null then
    select result into r from public.operation_requests where key = 'renew:' || p_key;
    if found then return r || jsonb_build_object('replayed', true); end if;
  end if;
  select * into o from public.training_cycles where id = p_cycle for update;
  if not found then raise exception 'Cycle introuvable' using errcode = 'P0050'; end if;
  if o.status = 'cancelled' then raise exception 'Cycle annulé : non renouvelable' using errcode = 'P0072'; end if;
  if exists (select 1 from public.training_cycles where renewed_from = p_cycle) then raise exception 'Ce cycle a déjà été renouvelé' using errcode = 'P0071'; end if;
  begin
    insert into public.training_cycles (group_id, label, sessions_count, start_date, weekday, start_time, duration_min, excluded_dates, status, renewed_from)
    values (o.group_id, coalesce(nullif(btrim(p_label), ''), 'Cycle suivant'), coalesce(p_count, o.sessions_count), p_start, coalesce(p_weekday, o.weekday),
            coalesce(p_time, o.start_time), coalesce(p_duration, o.duration_min), '{}', 'active', p_cycle) returning id into n;
  exception when unique_violation then raise exception 'Ce cycle a déjà été renouvelé' using errcode = 'P0071'; end;
  if (select remaining from public.v_cycle_progress where cycle_id = p_cycle) = 0 then update public.training_cycles set status = 'completed' where id = p_cycle and status = 'active'; end if;
  res := public.generate_cycle_sessions(n) || jsonb_build_object('cycle_id', n);
  if p_key is not null then insert into public.operation_requests (key, kind, result, created_by) values ('renew:' || p_key, 'renew_cycle', res, p_by) on conflict do nothing; end if;
  return res;
end $$;

create or replace function public.add_cycle_session(p_group uuid, p_cycle uuid, p_start timestamptz, p_duration int, p_counts boolean, p_by uuid) returns uuid language plpgsql as $$
declare g public.groups%rowtype; v_id uuid; v_type uuid;
begin
  select * into g from public.groups where id = p_group;
  if not found then raise exception 'Groupe introuvable' using errcode = 'P0050'; end if;
  v_type := coalesce(g.course_type_id, (select id from public.course_types where code = 'collectif'));
  insert into public.sessions (course_type_id, starts_at, ends_at, booking_mode, court_secured, court_id, capacity, price_per_person_cents, status,
                               group_id, cycle_id, visibility, title, counts_in_cycle, is_exceptional)
  values (v_type, p_start, p_start + make_interval(mins => coalesce(p_duration, g.duration_min)), 'manual', false, g.court_id, g.capacity, g.price_per_person_cents, 'open',
          g.id, p_cycle, case when g.visibility = 'public' then 'public' else 'group_only' end, g.name, coalesce(p_counts, false), true) returning id into v_id;
  perform public.enroll_group_members_in_session(v_id);
  return v_id;
end $$;

-- Modifie l'horaire de toutes les séances FUTURES d'un cycle à partir d'un numéro (récurrence), sans toucher au passé
create or replace function public.shift_future_sessions(p_cycle uuid, p_from_index int, p_weekday int, p_time time, p_duration int) returns int language plpgsql as $$
declare s record; d date; nd date; ns timestamptz; n int := 0;
begin
  for s in select * from public.sessions where cycle_id = p_cycle and cycle_index >= coalesce(p_from_index, 1) and starts_at > now() and status in ('open', 'suspended') order by cycle_index loop
    d := (s.starts_at at time zone 'Europe/Paris')::date;
    nd := d + case when p_weekday is null then 0 else p_weekday - extract(isodow from d)::int end;
    ns := (nd + coalesce(p_time, (s.starts_at at time zone 'Europe/Paris')::time)) at time zone 'Europe/Paris';
    update public.sessions set starts_at = ns, ends_at = ns + make_interval(mins => coalesce(p_duration, round(extract(epoch from (s.ends_at - s.starts_at)) / 60)::int)) where id = s.id;
    n := n + 1;
  end loop;
  update public.training_cycles set weekday = coalesce(p_weekday, weekday), start_time = coalesce(p_time, start_time), duration_min = coalesce(p_duration, duration_min) where id = p_cycle;
  return n;
end $$;

-- ============ Joueurs : déplacement, joueur temporaire, composition passée ============
create or replace function public.move_group_member(p_from uuid, p_to uuid, p_customer uuid) returns jsonb language plpgsql as $$
declare cancelled int; added jsonb;
begin
  if p_from = p_to then raise exception 'Choisissez un autre groupe' using errcode = 'P0075'; end if;
  added := public.add_group_member(p_to, p_customer);                 -- échoue (groupe complet / inactif) avant tout retrait : l'ensemble est annulé
  cancelled := public.remove_group_member(p_from, p_customer);
  return jsonb_build_object('released', cancelled) || added;
end $$;

create or replace function public.add_temporary_player(p_group uuid, p_customer uuid, p_n int) returns int language plpgsql as $$
declare s record; n int := 0;
begin
  for s in select id from public.sessions where group_id = p_group and starts_at > now() and status = 'open' order by starts_at limit greatest(coalesce(p_n, 1), 1) loop
    if public.enroll_member_in_session(s.id, p_customer) then
      update public.bookings set source = 'manual' where session_id = s.id and customer_id = p_customer and source = 'group';   -- joueur de passage, pas membre
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.group_members_at(p_group uuid, p_at timestamptz) returns setof uuid language sql stable as $$
  select customer_id from (
    select distinct on (customer_id) customer_id, event from public.group_membership_events
     where group_id = p_group and at <= p_at order by customer_id, at desc, id desc
  ) x where event = 'joined' $$;

-- ============ Sécurité ============
alter table public.session_revisions   enable row level security;
alter table public.operation_requests  enable row level security;
create policy admin_all on public.session_revisions  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.operation_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());
do $$ declare t text; begin
  for t in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('record_attendance','validate_session','renew_cycle','add_cycle_session','shift_future_sessions','move_group_member','add_temporary_player','group_members_at') loop
    execute format('revoke all on function %s from public, anon, authenticated', t);
    execute format('grant execute on function %s to service_role', t);
  end loop;
end $$;
