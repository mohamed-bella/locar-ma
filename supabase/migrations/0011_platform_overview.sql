-- Locar.ma — Platform admin agency overview as a single SQL aggregate.
--
-- The admin console previously pulled EVERY member / vehicle / reservation row
-- across ALL agencies into the server and tallied them in JS — fine at 5
-- agencies, quadratic pain at scale. This function does the counting in
-- Postgres and returns one row per agency.
--
-- SECURITY DEFINER + execute revoked from everyone except service_role: only
-- trusted server code (the admin client) can call it, so it never leaks
-- cross-tenant aggregates to a normal user.

create or replace function public.platform_agency_overview()
returns table (
  id uuid,
  name text,
  city text,
  created_at timestamptz,
  is_active boolean,
  plan text,
  subscription_status text,
  next_payment_date date,
  monthly_fee numeric,
  members bigint,
  vehicles bigint,
  reservations bigint,
  rev_month numeric
)
language sql
security definer
stable
set search_path = public
as $$
  with mo as (
    select
      date_trunc('month', (now() at time zone 'Africa/Casablanca'))::date as start,
      (date_trunc('month', (now() at time zone 'Africa/Casablanca')) + interval '1 month' - interval '1 day')::date as end
  )
  select
    a.id, a.name, a.city, a.created_at, a.is_active, a.plan,
    a.subscription_status, a.next_payment_date, a.monthly_fee,
    coalesce(m.c, 0), coalesce(v.c, 0), coalesce(r.c, 0), coalesce(rm.s, 0)
  from agencies a
  left join (select agency_id, count(*) c from agency_members group by agency_id) m on m.agency_id = a.id
  left join (select agency_id, count(*) c from vehicles group by agency_id) v on v.agency_id = a.id
  left join (select agency_id, count(*) c from reservations group by agency_id) r on r.agency_id = a.id
  left join (
    select res.agency_id, sum(coalesce(res.total_amount, 0)) s
    from reservations res, mo
    where res.status not in ('pending', 'cancelled', 'blocked')
      and res.date_start >= mo.start
      and res.date_start <= mo.end
    group by res.agency_id
  ) rm on rm.agency_id = a.id
  order by a.created_at desc
$$;

revoke all on function public.platform_agency_overview() from public;
grant execute on function public.platform_agency_overview() to service_role;
