-- ─────────────────────────────────────────────────────────────
-- Platform super-admins + agency billing (SaaS operator view)
-- ─────────────────────────────────────────────────────────────

-- Who can see/manage every agency. RLS enabled with NO policies → only the
-- service-role key (trusted server code) can touch it.
create table if not exists platform_admins (
  user_id     uuid primary key references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- Subscription / billing fields on each agency.
alter table agencies add column if not exists is_active boolean not null default true;
alter table agencies add column if not exists plan text not null default 'trial';
alter table agencies add column if not exists subscription_status text not null default 'trial'; -- trial / active / past_due / suspended
alter table agencies add column if not exists subscription_started date;
alter table agencies add column if not exists next_payment_date date;
alter table agencies add column if not exists monthly_fee numeric not null default 0;

-- Payment history (operator records what each agency paid).
create table if not exists agency_payments (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  amount      numeric not null,
  period      text,       -- e.g. '2026-07'
  method      text,       -- cash / bank / card
  notes       text,
  paid_at     date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists agency_payments_agency_idx on agency_payments (agency_id);
alter table agency_payments enable row level security;

-- Seed yourself as the first platform admin (replace the email).
insert into platform_admins (user_id)
  select id from auth.users where email = 'mohamedbella235@gmail.com'
  on conflict do nothing;
