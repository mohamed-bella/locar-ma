-- Global brand catalog, shared across ALL agencies.
-- Any authenticated user can add a brand → everyone sees it.
-- "Deleting" a brand only hides it for the current agency (agency_hidden_brands),
-- never for other agencies.

create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  logo_key    text,                       -- R2 object key (public)
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);
-- Case-insensitive uniqueness so "Dacia" / "dacia" don't duplicate.
create unique index brands_name_lower_idx on brands (lower(name));

-- Per-agency hidden brands (soft, local removal).
create table agency_hidden_brands (
  agency_id  uuid not null references agencies on delete cascade,
  brand_id   uuid not null references brands on delete cascade,
  hidden_at  timestamptz not null default now(),
  primary key (agency_id, brand_id)
);

-- Link vehicles to the catalog (brand text kept as denormalized display name).
alter table vehicles add column if not exists brand_id uuid references brands on delete set null;

-- ── RLS ──────────────────────────────────────────────
alter table brands enable row level security;

-- Every authenticated user sees the whole catalog.
create policy brands_select on brands
  for select using (auth.uid() is not null);

-- Anyone signed in can contribute a brand (must stamp themselves as creator).
create policy brands_insert on brands
  for insert with check (auth.uid() = created_by);

-- Only the creator can edit a brand's name/logo (does not affect others' use).
create policy brands_update on brands
  for update using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

alter table agency_hidden_brands enable row level security;
create policy hidden_brands_all on agency_hidden_brands
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));
