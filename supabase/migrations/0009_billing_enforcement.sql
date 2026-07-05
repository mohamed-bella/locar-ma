-- Locar.ma — Billing enforcement at the database layer.
-- A suspended / deactivated agency becomes READ-ONLY: members can still see
-- their data, but every INSERT / UPDATE / DELETE on operational tables is
-- rejected by RLS. This is the bulletproof backstop behind the UI paywall —
-- no code path can accidentally let a non-paying agency keep operating.
--
-- The platform admin (service-role client) bypasses RLS, so reactivating an
-- agency or recording a payment always works.

create or replace function public.is_agency_active(a uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select (is_active is distinct from false)
         and (subscription_status is distinct from 'suspended')
      from agencies
      where id = a
    ),
    false
  );
$$;

-- Rebuild each tenant table's blanket "_all" policy into a readable SELECT
-- (any member) plus write policies gated on an ACTIVE agency.
do $$
declare
  tbl text;
  pol text;
  tables text[] := array[
    'vehicles', 'clients', 'reservations', 'contracts',
    'damage_reports', 'maintenance_alerts',
    'document_types', 'document_alert_rules'
  ];
begin
  foreach tbl in array tables loop
    -- Drop the old combined policy (name pattern from earlier migrations).
    pol := case tbl
      when 'maintenance_alerts' then 'maintenance_alerts_all'
      when 'document_alert_rules' then 'document_alert_rules_all'
      when 'document_types' then 'document_types_all'
      else tbl || '_all'
    end;
    execute format('drop policy if exists %I on %I', pol, tbl);

    execute format(
      'create policy %I on %I for select using (is_agency_member(agency_id))',
      tbl || '_select', tbl);

    execute format(
      'create policy %I on %I for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id))',
      tbl || '_insert', tbl);

    execute format(
      'create policy %I on %I for update using (is_agency_member(agency_id)) with check (is_agency_member(agency_id) and is_agency_active(agency_id))',
      tbl || '_update', tbl);

    execute format(
      'create policy %I on %I for delete using (is_agency_member(agency_id) and is_agency_active(agency_id))',
      tbl || '_delete', tbl);
  end loop;
end $$;

-- agency_hidden_brands keyed on agency_id too — same treatment.
drop policy if exists hidden_brands_all on agency_hidden_brands;
create policy hidden_brands_select on agency_hidden_brands
  for select using (is_agency_member(agency_id));
create policy hidden_brands_insert on agency_hidden_brands
  for insert with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy hidden_brands_update on agency_hidden_brands
  for update using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id) and is_agency_active(agency_id));
create policy hidden_brands_delete on agency_hidden_brands
  for delete using (is_agency_member(agency_id) and is_agency_active(agency_id));
