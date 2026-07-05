-- Locar.ma — Row Level Security
-- Every tenant table is readable/writable only by members of the owning agency.

-- Helpers run SECURITY DEFINER so they bypass RLS internally — this avoids
-- infinite recursion when a policy on agency_members needs to read agency_members.
create or replace function public.is_agency_member(a uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from agency_members
    where agency_id = a and user_id = auth.uid()
  );
$$;

create or replace function public.agency_role(a uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from agency_members
  where agency_id = a and user_id = auth.uid()
  limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- agencies
-- ─────────────────────────────────────────────────────────────
alter table agencies enable row level security;

create policy agencies_select on agencies
  for select using (is_agency_member(id));

create policy agencies_update on agencies
  for update using (agency_role(id) = 'owner')
  with check (agency_role(id) = 'owner');

-- Insert of a new agency + its first owner is done server-side with the
-- service-role client (onboarding), so no INSERT policy is exposed here.

-- ─────────────────────────────────────────────────────────────
-- agency_members
-- ─────────────────────────────────────────────────────────────
alter table agency_members enable row level security;

create policy members_select on agency_members
  for select using (is_agency_member(agency_id));

create policy members_insert on agency_members
  for insert with check (agency_role(agency_id) = 'owner');

create policy members_update on agency_members
  for update using (agency_role(agency_id) = 'owner')
  with check (agency_role(agency_id) = 'owner');

create policy members_delete on agency_members
  for delete using (agency_role(agency_id) = 'owner');

-- ─────────────────────────────────────────────────────────────
-- Generic tenant tables: full access to any member of the agency.
-- ─────────────────────────────────────────────────────────────
alter table vehicles enable row level security;
create policy vehicles_all on vehicles
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

alter table clients enable row level security;
create policy clients_all on clients
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

alter table reservations enable row level security;
create policy reservations_all on reservations
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

alter table contracts enable row level security;
create policy contracts_all on contracts
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

alter table damage_reports enable row level security;
create policy damage_reports_all on damage_reports
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

alter table maintenance_alerts enable row level security;
create policy maintenance_alerts_all on maintenance_alerts
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));
