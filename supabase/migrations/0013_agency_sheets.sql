-- Locar.ma — per-agency Google Sheets mirror.
--
-- One spreadsheet per agency; the app provisions it (service account) and
-- stores its id + tab→sheetId map. A Supabase Database Webhook on each mirrored
-- table POSTs row changes to /api/sheet-sync, which upserts them one-way
-- (DB → Sheet). The sheet is a live read-only mirror; edits never sync back.

create table if not exists agency_sheets (
  agency_id       uuid primary key references agencies on delete cascade,
  spreadsheet_id  text not null,
  spreadsheet_url text,
  tabs            jsonb not null default '{}',   -- { "Cars": <sheetId>, ... }
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table agency_sheets enable row level security;

-- Members can see whether sync is on + the link. All writes happen via the
-- service-role client in trusted server code (provisioning verifies ownership).
create policy agency_sheets_select on agency_sheets
  for select using (is_agency_member(agency_id));
