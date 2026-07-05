-- Dynamic document alert rules config per agency.
create table document_alert_rules (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agencies on delete cascade,
  field           text not null, -- 'insurance_expiry' / 'vignette_expiry' / 'visite_tech_expiry'
  label           text not null,
  threshold_days  int not null check (threshold_days > 0),
  created_at      timestamptz not null default now()
);

-- Indexing for fast lookups by tenant agency_id
create index on document_alert_rules (agency_id);

-- Enable Row Level Security (RLS)
alter table document_alert_rules enable row level security;

-- RLS policies: full CRUD access granted to members of the owning agency
create policy document_alert_rules_all on document_alert_rules
  for all using (is_agency_member(agency_id))
  with check (is_agency_member(agency_id));
