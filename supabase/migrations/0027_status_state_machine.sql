-- 0027_status_state_machine.sql
--
-- Make the reservation / vehicle / contract state machine authoritative at the
-- DATABASE level so every client (web app AND the native mobile app, which writes
-- straight to PostgREST) stays consistent. Previously this logic lived only in the
-- web server functions (syncVehicleStatus / createContractFromReservation /
-- closeContract); mobile bypassed it, leaving vehicle status stale, reservations
-- never marked `active`/`closed`, and duplicate contracts possible.
--
-- Invariants enforced here:
--   • vehicle.status is DERIVED from its bookings (blocked→maintenance,
--     covering-today→rented, future→reserved, else available; a manual
--     maintenance hold is preserved).
--   • creating a contract flips its reservation → active.
--   • closing a contract (closed_at set) flips its reservation → closed.
--   • at most ONE contract per reservation.

-- ── 1. Derive + persist a single vehicle's status from its bookings ───────────
create or replace function recompute_vehicle_status(vid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today  date := (now() at time zone 'Africa/Casablanca')::date;
  stored text;
  nextst text;
begin
  if vid is null then return; end if;
  select status into stored from vehicles where id = vid;
  if stored is null then return; end if; -- vehicle gone

  with b as (
    select date_start, date_end, status
    from reservations
    where vehicle_id = vid
      and status not in ('cancelled', 'closed')
      and date_end >= today
  )
  select case
    when exists (select 1 from b where status =  'blocked' and date_start <= today and date_end >= today) then 'maintenance'
    when exists (select 1 from b where status <> 'blocked' and date_start <= today and date_end >= today) then 'rented'
    when exists (select 1 from b where status <> 'blocked' and date_start > today)                         then 'reserved'
    else 'available'
  end
  into nextst;

  -- Preserve a manual repair hold when no booking forces a change.
  if stored = 'maintenance' and nextst = 'available' then
    nextst := 'maintenance';
  end if;

  if stored is distinct from nextst then
    update vehicles set status = nextst where id = vid;
  end if;
end;
$$;

-- ── 2. Reservations → keep the vehicle's status in sync ───────────────────────
create or replace function trg_reservations_sync_vehicle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform recompute_vehicle_status(old.vehicle_id);
    return old;
  end if;

  perform recompute_vehicle_status(new.vehicle_id);
  -- If the booking was moved to another car, refresh the old one too.
  if tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id then
    perform recompute_vehicle_status(old.vehicle_id);
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_sync_vehicle on reservations;
create trigger reservations_sync_vehicle
after insert or update or delete on reservations
for each row execute function trg_reservations_sync_vehicle();

-- ── 3. Contracts → drive the reservation lifecycle ────────────────────────────
-- INSERT  → reservation becomes `active` (→ trigger #2 re-derives the vehicle).
-- closed  → reservation becomes `closed` (→ trigger #2 frees the vehicle).
create or replace function trg_contracts_sync_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.reservation_id is not null then
      update reservations
        set status = 'active'
        where id = new.reservation_id
          and status not in ('closed', 'cancelled');
    end if;
  elsif tg_op = 'UPDATE' then
    if new.closed_at is not null and old.closed_at is null and new.reservation_id is not null then
      update reservations set status = 'closed' where id = new.reservation_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_sync_reservation on contracts;
create trigger contracts_sync_reservation
after insert or update on contracts
for each row execute function trg_contracts_sync_reservation();

-- ── 4. One contract per reservation ───────────────────────────────────────────
-- Duplicates can exist from the old mobile path (raw insert, no reuse check).
-- Resolve them WITHOUT losing data:
--   (a) delete purely-throwaway duplicates (unsigned, no PDF, not closed);
--   (b) for any remaining duplicates, keep the "best" contract linked and DETACH
--       the losers by nulling reservation_id (they stay for audit, just unlinked).
-- "Best" = signed first, then has-PDF, then closed, then most recent.

-- (a) drop empty throwaway dups, keeping the oldest per reservation
delete from contracts c
using (
  select reservation_id, min(created_at) as keep_created
  from contracts
  where reservation_id is not null
  group by reservation_id
  having count(*) > 1
) dup
where c.reservation_id = dup.reservation_id
  and c.created_at > dup.keep_created
  and c.signed_at is null
  and c.pdf_key   is null
  and c.closed_at is null;

-- (b) detach any still-duplicated losers (meaningful contracts are preserved)
with ranked as (
  select
    id,
    row_number() over (
      partition by reservation_id
      order by (signed_at is not null) desc,
               (pdf_key   is not null) desc,
               (closed_at is not null) desc,
               created_at desc
    ) as rn
  from contracts
  where reservation_id is not null
)
update contracts c
  set reservation_id = null
from ranked
where c.id = ranked.id
  and ranked.rn > 1;

create unique index if not exists contracts_one_per_reservation
  on contracts (reservation_id)
  where reservation_id is not null;

-- ── 5. Backfill: reconcile every vehicle with its current bookings ────────────
do $$
declare r record;
begin
  for r in select id from vehicles loop
    perform recompute_vehicle_status(r.id);
  end loop;
end;
$$;
