create or replace function public.t_assert(c boolean, m text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'ECHEC : %', m; end if; raise notice 'OK    %', m; end $$;
create or replace function public.t_bal(c uuid) returns text language sql stable as $$
  select coalesce((select available||'/'||reserved||'/'||consumed||'/'||expired from public.v_credit_balance where customer_id = c), '0/0/0/0') $$;
-- conservation : les mouvements (hors attribution/correction) ne créent ni ne détruisent de crédit
create or replace function public.t_inv(c uuid) returns boolean language sql stable as $$
  select coalesce(sum(d_available + d_reserved + d_consumed + d_expired), 0) = coalesce(sum(case when kind in ('grant', 'adjust') then d_available else 0 end), 0)
  from public.credit_transactions where customer_id = c $$;
create or replace function public.t_cust(n text) returns uuid language sql as $$
  insert into public.customers (first_name, last_name, email, phone) values (n, 'Test', lower(n) || '@test.fr', '0600000000')
  on conflict (email) do update set first_name = excluded.first_name returning id $$;
