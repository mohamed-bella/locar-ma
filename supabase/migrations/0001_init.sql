-- Locar.ma — initial schema
-- Multi-tenant car rental management. Tenant boundary = agency_id.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists btree_gist;  -- equality in the no-overlap gist constraint

-- ─────────────────────────────────────────────────────────────
-- agencies
-- ─────────────────────────────────────────────────────────────
create table agencies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  city          text,
  logo_url      text,
  language      text not null default 'fr',   -- ar / fr / en
  plan          text not null default 'free', -- free / starter / pro / agency
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- agency_members  (role per agency, linked to Supabase auth.users)
-- ─────────────────────────────────────────────────────────────
create table agency_members (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null,  -- owner / agent / accountant
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  unique (agency_id, user_id)
);
create index on agency_members (user_id);

-- ─────────────────────────────────────────────────────────────
-- vehicles
-- ─────────────────────────────────────────────────────────────
create table vehicles (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references agencies on delete cascade,
  plate               text not null,
  brand               text,
  model               text,
  year                int,
  category            text,  -- economy / suv / luxury / utility
  daily_rate          numeric not null,
  status              text not null default 'available', -- available / rented / maintenance / reserved
  mileage_current     int not null default 0,
  insurance_expiry    date,
  vignette_expiry     date,
  visite_tech_expiry  date,
  notes               text,
  created_at          timestamptz not null default now(),
  unique (agency_id, plate)
);
create index on vehicles (agency_id);

-- ─────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────
create table clients (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agencies on delete cascade,
  full_name         text not null,
  cin_passport      text,
  phone             text,
  email             text,
  nationality       text,
  address           text,
  status            text not null default 'active',  -- active / flagged / blacklisted
  blacklist_reason  text,
  blacklist_date    date,
  blacklisted_by    uuid references agency_members,
  created_at        timestamptz not null default now()
);
create index on clients (agency_id);
create index on clients (agency_id, cin_passport);

-- ─────────────────────────────────────────────────────────────
-- reservations  (no double booking enforced at DB level)
-- ─────────────────────────────────────────────────────────────
create table reservations (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null references agencies on delete cascade,
  vehicle_id        uuid not null references vehicles,
  client_id         uuid references clients,
  date_start        date not null,
  date_end          date not null,
  pickup_location   text,
  dropoff_location  text,
  status            text not null default 'pending',
  -- pending / confirmed / active / closed / cancelled
  total_amount      numeric,
  daily_rate_snap   numeric,  -- rate at time of booking (immutable snapshot)
  notes             text,
  created_by        uuid references agency_members,
  created_at        timestamptz not null default now(),

  constraint no_overlap exclude using gist (
    vehicle_id with =,
    daterange(date_start, date_end, '[]') with &&
  ) where (status <> 'cancelled')
);
create index on reservations (agency_id);
create index on reservations (vehicle_id);
create index on reservations (client_id);

-- ─────────────────────────────────────────────────────────────
-- contracts
-- ─────────────────────────────────────────────────────────────
create table contracts (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid references reservations,
  agency_id       uuid not null references agencies on delete cascade,
  mileage_out     int,
  mileage_in      int,
  fuel_out        text,  -- empty / quarter / half / three_quarters / full
  fuel_in         text,
  check_number    text,
  check_bank      text,
  check_amount    numeric,
  check_status    text not null default 'held',  -- held / released / disputed
  extras          jsonb not null default '[]',   -- [{name, price}]
  pdf_key         text,  -- R2 object key (build URL at render time)
  signed_at       timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index on contracts (agency_id);
create index on contracts (reservation_id);

-- ─────────────────────────────────────────────────────────────
-- damage_reports  (agency_id added for clean RLS + indexing)
-- ─────────────────────────────────────────────────────────────
create table damage_reports (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agencies on delete cascade,
  contract_id  uuid references contracts on delete cascade,
  vehicle_id   uuid references vehicles,
  type         text not null,  -- pickup / return
  photo_keys   text[] not null default '{}',  -- R2 object keys
  notes        text,
  recorded_by  uuid references agency_members,
  recorded_at  timestamptz not null default now()
);
create index on damage_reports (agency_id);
create index on damage_reports (contract_id);

-- ─────────────────────────────────────────────────────────────
-- maintenance_alerts
-- ─────────────────────────────────────────────────────────────
create table maintenance_alerts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  vehicle_id  uuid not null references vehicles on delete cascade,
  type        text,  -- insurance / vignette / visite_tech / custom
  due_date    date,
  sent_at     timestamptz,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index on maintenance_alerts (agency_id);
create index on maintenance_alerts (vehicle_id);
