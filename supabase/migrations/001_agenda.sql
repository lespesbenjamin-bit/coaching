-- AGENDA HYBRIDE — migration 001 (additive, non destructive)
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_profiles where user_id = auth.uid());
$$;

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  external_provider text,
  external_ref text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.course_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('individuel','duo','collectif')),
  label text not null,
  min_participants int not null default 1 check (min_participants >= 1),
  max_participants int not null default 1 check (max_participants >= min_participants),
  default_duration_min int not null default 60 check (default_duration_min > 0),
  price_per_person_cents int not null check (price_per_person_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_course_types_updated before update on public.course_types
  for each row execute function public.set_updated_at();

insert into public.course_types (code,label,min_participants,max_participants,default_duration_min,price_per_person_cents) values
  ('individuel','Cours individuel',1,1,60,4500),
  ('duo','Cours duo',2,2,60,3000),
  ('collectif','Cours collectif',1,4,90,2500)
on conflict (code) do nothing;

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  course_type_id uuid not null references public.course_types(id),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_min int not null check (duration_min > 0),
  booking_mode text not null default 'manual' check (booking_mode in ('auto','manual')),
  court_secured boolean not null default false,
  capacity int not null default 1 check (capacity >= 1),
  price_per_person_cents int check (price_per_person_cents >= 0),
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  course_type_id uuid not null references public.course_types(id),
  rule_id uuid references public.availability_rules(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  booking_mode text not null default 'manual' check (booking_mode in ('auto','manual')),
  court_secured boolean not null default false,
  court_id uuid references public.courts(id),
  external_ref text,
  capacity int not null default 1 check (capacity >= 1),
  price_per_person_cents int not null check (price_per_person_cents >= 0),
  status text not null default 'open' check (status in ('open','blocked','cancelled')),
  group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  time_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  constraint sessions_no_overlap exclude using gist (time_range with &&) where (status <> 'cancelled')
);
create index if not exists sessions_starts_idx on public.sessions (starts_at);
create trigger trg_sessions_updated before update on public.sessions
  for each row execute function public.set_updated_at();

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  level text,
  created_at timestamptz not null default now(),
  unique (email)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id),
  customer_id uuid not null references public.customers(id),
  participants int not null default 1 check (participants >= 1),
  status text not null default 'pending'
    check (status in ('pending','confirmed','refused','cancelled','completed')),
  price_total_cents int not null check (price_total_cents >= 0),
  comment text,
  admin_note text,
  court_id uuid references public.courts(id),
  external_ref text,
  pack_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_session_idx on public.bookings (session_id, status);
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

create table if not exists public.booking_participants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  first_name text,
  last_name text
);

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('received','confirmed','refused','cancelled','admin_new')),
  idempotency_key text not null unique,
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table if not exists public.booking_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists booking_attempts_idx on public.booking_attempts (ip_hash, created_at);

create or replace function public.seats_taken(p_session uuid)
returns int language sql stable as $$
  select coalesce(sum(participants),0)::int from public.bookings
  where session_id = p_session and status in ('pending','confirmed');
$$;

create or replace view public.public_slots as
select s.id, ct.code as course_code, ct.label as course_label,
       s.starts_at, s.ends_at, s.booking_mode, s.court_secured,
       s.capacity, s.capacity - public.seats_taken(s.id) as seats_left,
       s.price_per_person_cents
from public.sessions s
join public.course_types ct on ct.id = s.course_type_id
where s.status = 'open' and s.starts_at > now() and ct.active;

grant select on public.public_slots to anon, authenticated;

create or replace function public.create_booking(
  p_session_id uuid, p_first text, p_last text, p_email text, p_phone text,
  p_level text, p_comment text, p_participants int, p_idempotency_key text
) returns table (booking_id uuid, booking_status text)
language plpgsql security definer set search_path = public as $$
declare
  v_session public.sessions%rowtype;
  v_customer uuid;
  v_status text;
  v_existing public.bookings%rowtype;
begin
  select * into v_existing from public.bookings where idempotency_key = p_idempotency_key;
  if found then return query select v_existing.id, v_existing.status; return; end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status <> 'open' or v_session.starts_at <= now() then
    raise exception 'Créneau indisponible' using errcode = 'P0001';
  end if;
  if p_participants < 1 or p_participants > v_session.capacity then
    raise exception 'Nombre de participants invalide' using errcode = 'P0002';
  end if;
  if public.seats_taken(v_session.id) + p_participants > v_session.capacity then
    raise exception 'Plus assez de places' using errcode = 'P0003';
  end if;

  insert into public.customers (first_name,last_name,email,phone,level)
  values (p_first,p_last,lower(p_email),p_phone,p_level)
  on conflict (email) do update
    set first_name = excluded.first_name, last_name = excluded.last_name,
        phone = excluded.phone, level = coalesce(excluded.level, public.customers.level)
  returning id into v_customer;

  v_status := case when v_session.booking_mode = 'auto' and v_session.court_secured
                   then 'confirmed' else 'pending' end;

  insert into public.bookings (session_id,customer_id,participants,status,price_total_cents,
                               comment,court_id,idempotency_key)
  values (v_session.id, v_customer, p_participants, v_status,
          v_session.price_per_person_cents * p_participants,
          p_comment, v_session.court_id, p_idempotency_key)
  returning id into booking_id;

  booking_status := v_status;
  return next;
end $$;

revoke all on function public.create_booking(uuid,text,text,text,text,text,text,int,text) from public, anon, authenticated;
grant execute on function public.create_booking(uuid,text,text,text,text,text,text,int,text) to service_role;

alter table public.admin_profiles       enable row level security;
alter table public.courts               enable row level security;
alter table public.course_types         enable row level security;
alter table public.availability_rules   enable row level security;
alter table public.calendar_exceptions  enable row level security;
alter table public.sessions             enable row level security;
alter table public.customers            enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_participants enable row level security;
alter table public.email_log            enable row level security;
alter table public.booking_attempts     enable row level security;

create policy admin_all on public.admin_profiles       for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.courts               for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.course_types         for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.availability_rules   for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.calendar_exceptions  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.sessions             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.customers            for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.bookings             for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.booking_participants for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all on public.email_log            for all to authenticated using (public.is_admin()) with check (public.is_admin());
