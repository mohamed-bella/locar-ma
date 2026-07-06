-- Locar.ma — Realtime replication for tenant tables.
--
-- The app subscribes to postgres_changes to invalidate route loaders live.
-- Realtime evaluates each change against the subscribing user's RLS SELECT
-- policy, so a client only receives rows for its OWN agency — but that only
-- happens for tables that are members of the `supabase_realtime` publication.
-- This migration adds them (idempotently). The client additionally filters by
-- agency_id (see useRealtime.ts) for defense in depth and less channel noise.
--
-- RLS SELECT policies for these tables already exist (0002_rls, 0009_billing).

do $$
declare
  t text;
  tbls text[] := array[
    'vehicles', 'clients', 'reservations', 'contracts',
    'document_types', 'document_alert_rules'
  ];
begin
  -- On hosted Supabase the publication always exists; guard anyway.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  foreach t in array tbls loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
