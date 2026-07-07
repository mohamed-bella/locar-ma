-- Locar.ma — per-vehicle free expenses.
--
-- Service records already capture scheduled maintenance (vidange, pneus…) with a
-- cost. This table is for everything else the car costs that isn't on a schedule:
-- car wash, a fine, a random repair, accessories… Just a name, an amount, a date.

create table if not exists vehicle_expenses (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  vehicle_id  uuid not null references vehicles on delete cascade,
  name        text not null,
  amount      numeric not null default 0,
  spent_at    date not null default current_date,
  created_by  uuid references agency_members,
  created_at  timestamptz not null default now()
);
create index if not exists vehicle_expenses_vehicle_idx on vehicle_expenses (vehicle_id, spent_at desc);
create index if not exists vehicle_expenses_agency_idx on vehicle_expenses (agency_id);

-- ── RLS (mirror service_records) ──
alter table vehicle_expenses enable row level security;
create policy vehicle_expenses_select on vehicle_expenses
  for select using (is_agency_member(agency_id));
create policy vehicle_expenses_insert on vehicle_expenses
  for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy vehicle_expenses_update on vehicle_expenses
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy vehicle_expenses_delete on vehicle_expenses
  for delete using (is_agency_member(agency_id) and is_agency_active(agency_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vehicle_expenses') then
      execute 'alter publication supabase_realtime add table public.vehicle_expenses';
    end if;
  end if;
end $$;
