-- Dedicated WhatsApp notification number per agency. The bot sends owner
-- notifications here (falls back to the owner member's phone if unset).
-- Kept separate from agency_members.phone so the owner can point notifications
-- at any number without touching membership records.

alter table agencies add column if not exists whatsapp_number text;
