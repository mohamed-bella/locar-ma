-- Mechanical maintenance tracking: oil change (vidange), mileage-based.
alter table vehicles add column if not exists oil_change_last_km integer;
alter table vehicles add column if not exists oil_change_interval_km integer not null default 10000;
alter table vehicles add column if not exists oil_change_last_date date;
alter table vehicles add column if not exists next_service_note text;
