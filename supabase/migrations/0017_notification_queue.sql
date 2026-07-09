-- WhatsApp notification queue. The app INSERTs rows; the Baileys bot
-- subscribes via Supabase Realtime and processes them.

create table notification_queue (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agencies on delete cascade,
  type        text not null,  -- reservation_created / contract_created / vehicle_added / contract_pdf_ready
  payload     jsonb not null default '{}',
  processed_at timestamptz,   -- bot stamps this after sending
  error       text,           -- last error if send failed
  attempts    int not null default 0,
  created_at  timestamptz not null default now()
);

create index on notification_queue (agency_id);
create index on notification_queue (created_at) where processed_at is null;

-- Enable Realtime so the bot can subscribe.
alter publication supabase_realtime add table notification_queue;

-- RLS: agency members can insert for their agency; service role reads all.
alter table notification_queue enable row level security;

create policy "Members can insert for own agency"
  on notification_queue for insert
  with check (
    agency_id in (
      select am.agency_id from agency_members am where am.user_id = auth.uid()
    )
  );

create policy "Members can read own agency notifications"
  on notification_queue for select
  using (
    agency_id in (
      select am.agency_id from agency_members am where am.user_id = auth.uid()
    )
  );
