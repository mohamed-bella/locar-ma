-- Realtime postgres_changes filters INSERT events through the subscriber's RLS
-- SELECT policy. The bot connects with the service_role key; give it an explicit
-- SELECT + UPDATE policy so it can receive events and mark rows processed.
-- (REST already bypasses RLS with service_role, but Realtime delivery does not.)

create policy "Service role full access"
  on notification_queue for all
  to service_role
  using (true)
  with check (true);
