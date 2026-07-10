-- Allow the native mobile app to enqueue a small, whitelisted set of
-- operational WhatsApp notifications without restoring broad table INSERT.

create or replace function public.enqueue_mobile_notification(
  p_agency_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from agency_members am
    where am.agency_id = p_agency_id
      and am.user_id = auth.uid()
  ) then
    raise exception 'No agency membership';
  end if;

  if p_type not in (
    'reservation_created',
    'reservation_cancelled',
    'contract_created',
    'contract_signed',
    'contract_closed',
    'vehicle_added',
    'service_record_created',
    'vehicle_issue_created'
  ) then
    raise exception 'Unsupported notification type';
  end if;

  if exists (
    select 1
    from agencies a
    where a.id = p_agency_id
      and a.whatsapp_enabled = false
  ) then
    return;
  end if;

  insert into notification_queue (agency_id, type, payload)
  values (p_agency_id, p_type, coalesce(p_payload, '{}'::jsonb));
end;
$$;

revoke all on function public.enqueue_mobile_notification(uuid, text, jsonb) from public;
grant execute on function public.enqueue_mobile_notification(uuid, text, jsonb) to authenticated;
