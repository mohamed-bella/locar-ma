-- Per-agency switch to pause WhatsApp notifications (temporary off).
-- When false, the app stops enqueuing notifications for that agency.
alter table agencies add column if not exists whatsapp_enabled boolean not null default true;
