-- Dynamic user-defined document types configuration per agency
create table if not exists document_types (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  name        text not null,
  code        text not null,
  created_at  timestamptz not null default now(),
  unique (agency_id, name),
  unique (agency_id, code)
);

-- Indexing for tenant lookups
create index if not exists document_types_agency_id_idx on document_types (agency_id);

-- Enable RLS
alter table document_types enable row level security;

-- Policy for full CRUD on agency members
create policy document_types_all on document_types
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));

-- Add JSONB storage supporting custom doc expiries dynamically on vehicles
alter table vehicles add column if not exists document_expiries jsonb not null default '{}'::jsonb;
