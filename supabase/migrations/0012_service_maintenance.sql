-- Locar.ma — Maintenance / "suivi" redesign.
--
-- Replaces the single-snapshot oil-change columns on `vehicles` with a proper
-- service LOG (service_records) plus recurring RULES (service_plans). Service
-- is now dual-axis: due at km OR time, whichever comes first. The old columns
-- stay for back-compat/migration but are no longer the source of truth.
--
-- Also drops the never-used maintenance_alerts table.

drop table if exists maintenance_alerts cascade;

-- Recurring maintenance rule. A NULL vehicle_id is the agency-wide default for
-- that service type; a per-vehicle row overrides it.
create table if not exists service_plans (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agencies on delete cascade,
  vehicle_id      uuid references vehicles on delete cascade,
  type            text not null,           -- vidange / courroie / freins / pneus / filtre / autre
  interval_km     integer,                 -- due every N km (null = time-only)
  interval_months integer,                 -- due every N months (null = km-only)
  soon_km         integer not null default 1000,
  soon_days       integer not null default 30,
  created_at      timestamptz not null default now()
);
create index if not exists service_plans_agency_idx on service_plans (agency_id);
-- One default per (agency, type) and one override per (agency, vehicle, type).
create unique index if not exists service_plans_default_uniq
  on service_plans (agency_id, type) where vehicle_id is null;
create unique index if not exists service_plans_vehicle_uniq
  on service_plans (agency_id, vehicle_id, type) where vehicle_id is not null;

-- A performed service (the history log).
create table if not exists service_records (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies on delete cascade,
  vehicle_id    uuid not null references vehicles on delete cascade,
  type          text not null,
  performed_at  date not null default current_date,
  odometer_km   integer,
  cost          numeric,
  garage        text,
  notes         text,
  next_due_km   integer,                    -- snapshot of the schedule at log time
  next_due_date date,
  created_by    uuid references agency_members,
  created_at    timestamptz not null default now()
);
create index if not exists service_records_vehicle_idx on service_records (vehicle_id, type, performed_at desc);
create index if not exists service_records_agency_idx on service_records (agency_id);

-- Preserve existing oil-change data: seed a first vidange record from the
-- legacy snapshot columns so no history is lost on cut-over.
insert into service_records (agency_id, vehicle_id, type, performed_at, odometer_km)
select agency_id, id, 'vidange', coalesce(oil_change_last_date, current_date), oil_change_last_km
from vehicles
where oil_change_last_km is not null;

-- ── RLS (mirror 0009: read = member, write = member AND active agency) ──
alter table service_plans enable row level security;
create policy service_plans_select on service_plans
  for select using (is_agency_member(agency_id));
create policy service_plans_insert on service_plans
  for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy service_plans_update on service_plans
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy service_plans_delete on service_plans
  for delete using (is_agency_member(agency_id) and is_agency_active(agency_id));

alter table service_records enable row level security;
create policy service_records_select on service_records
  for select using (is_agency_member(agency_id));
create policy service_records_insert on service_records
  for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy service_records_update on service_records
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy service_records_delete on service_records
  for delete using (is_agency_member(agency_id) and is_agency_active(agency_id));

-- Replicate over Realtime (RLS-scoped per subscriber; see 0010).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_records') then
      execute 'alter publication supabase_realtime add table public.service_records';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='service_plans') then
      execute 'alter publication supabase_realtime add table public.service_plans';
    end if;
  end if;
end $$;
