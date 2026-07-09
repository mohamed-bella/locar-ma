-- Security + scale hardening.

-- 1) notification_queue: clients must NOT be able to write arbitrary rows —
--    payload is rendered into a WhatsApp message to the owner, so a member
--    could inject text. The app enqueues via the service-role client, which
--    bypasses RLS, so no client INSERT policy is needed. Drop it.
drop policy if exists "Members can insert for own agency" on notification_queue;

-- 2) Indexed phone lookups for the bot's inbound-command authorization
--    (was scanning the whole agencies + agency_members tables per message).
create index if not exists idx_agencies_whatsapp_number on agencies (whatsapp_number);
create index if not exists idx_agency_members_phone on agency_members (phone);
