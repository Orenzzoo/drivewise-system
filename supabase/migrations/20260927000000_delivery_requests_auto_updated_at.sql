-- Recent Activity (SupDashboard.jsx) orders delivery_requests by updated_at
-- to show the most recently-changed rows first, but no code path ever sets
-- updated_at on an UPDATE (its `default now()` only applies at insert) --
-- e.g. SupDeliveries.jsx's confirmDecline (cancellation) and the
-- vehicle-assignment handler both change status/assigned_* columns without
-- touching updated_at, so those events silently never surface. Rather than
-- patch every current and future update() call site (easy to miss one, as
-- this bug demonstrates), auto-maintain updated_at at the DB level.
create or replace function public.set_delivery_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_delivery_requests_updated_at
  before update on public.delivery_requests
  for each row
  execute function public.set_delivery_requests_updated_at();
