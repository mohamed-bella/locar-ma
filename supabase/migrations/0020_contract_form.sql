-- Free-form contract fields for the printed PDF (2nd driver, permit details,
-- profession, pickup/return times, etc.) that don't warrant dedicated columns.
-- Stored as a flat string->string map the contract detail form edits directly.

alter table contracts add column if not exists form jsonb not null default '{}';
