-- Locar.ma — Vehicle Intelligence ("Suivi Intelligent" / État Véhicule).
--
-- Adds an ISSUES/PROBLEMS log per vehicle. This is the missing input the
-- operational-status engine needs to decide "can this car be rented today?".
-- Legal papers (vehicles.*_expiry) and mechanical service (service_records)
-- already exist; issues cover everything else: mechanical faults, accidents,
-- admin holds, cleaning holds, and the garage workflow.
--
-- The decision itself (rentable / not rentable / garage / blocked …) is COMPUTED
-- at read time from these three sources by src/lib/intelligence.ts — it is not
-- stored, so it can never go stale.

create table if not exists vehicle_issues (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies on delete cascade,
  vehicle_id    uuid not null references vehicles on delete cascade,
  -- What kind of thing this is. Drives auto-blocking in the engine:
  --   accident  → blocks (blocked_accident) until resolved
  --   garage    → the car is physically at the garage (garage status)
  --   problem / admin / cleaning → block only if severity=critical or blocks_rental
  kind          text not null default 'problem',   -- problem / accident / admin / cleaning / garage
  category      text,                               -- mechanical / electrical / body / tyres / brakes / other
  severity      text not null default 'medium',     -- low / medium / critical
  status        text not null default 'open',       -- open / in_progress / resolved
  -- Manual override: force the car off the road regardless of severity.
  blocks_rental boolean not null default false,
  title         text not null,
  description   text,
  photo_keys    text[] not null default '{}',       -- R2 object keys
  cost          numeric,
  garage        text,
  opened_at     date not null default current_date,
  resolved_at   date,
  created_by    uuid references agency_members,
  created_at    timestamptz not null default now()
);
create index if not exists vehicle_issues_vehicle_idx on vehicle_issues (vehicle_id, status, opened_at desc);
create index if not exists vehicle_issues_agency_idx on vehicle_issues (agency_id);
-- Hot path for the fleet grid: "all still-open issues for this agency".
create index if not exists vehicle_issues_open_idx on vehicle_issues (agency_id) where status <> 'resolved';

-- ── RLS (mirror service_records: read = member, write = member AND active) ──
alter table vehicle_issues enable row level security;
create policy vehicle_issues_select on vehicle_issues
  for select using (is_agency_member(agency_id));
create policy vehicle_issues_insert on vehicle_issues
  for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy vehicle_issues_update on vehicle_issues
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy vehicle_issues_delete on vehicle_issues
  for delete using (is_agency_member(agency_id) and is_agency_active(agency_id));

-- Replicate over Realtime (RLS-scoped per subscriber; see 0010).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vehicle_issues') then
      execute 'alter publication supabase_realtime add table public.vehicle_issues';
    end if;
  end if;
end $$;
