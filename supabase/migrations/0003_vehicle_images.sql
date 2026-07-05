-- Vehicle photos (fleet gallery). Stored as R2 object keys; URLs built at render.
alter table vehicles
  add column if not exists image_keys text[] not null default '{}';
