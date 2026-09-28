-- =====================================================================
-- Manual cleanup script — run in the Supabase SQL Editor.
--
-- Part 1: End D002's active trip (mirrors what "End Trip" does in
--         driver-trip/index.ts, minus the GPS-derived mileage update —
--         see note below).
-- Part 2: Delete every "Not Started" delivery request — the same rule
--         DriverDeliveries.jsx/HelperDeliveries.jsx use to label a
--         delivery "Not Started" in the Past/History tab:
--         pickup_date < today AND status NOT IN (DELIVERED, COMPLETED, CANCELLED).
--
-- Review the SELECTs in each part before running the writes. Everything
-- is wrapped in a transaction — if anything looks wrong after the
-- SELECTs, run ROLLBACK instead of COMMIT.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PART 1: End D002's active trip
-- ---------------------------------------------------------------------

-- Preview: which session(s) this will touch.
select session_id, delivery_request_id, driver_id, truck_plate, status, start_time
from sessions
where driver_id = 'D002' and status = 'Active';

-- Close the Active session(s) for D002.
-- NOTE: does not recompute trucks.current_mileage from GPS distance the
-- way the real end-trip Edge Function does — do that manually afterward
-- if it matters for this record.
with closed as (
  update sessions
  set status = 'Completed',
      end_time = now(),
      session_duration = extract(epoch from (now() - start_time))
  where driver_id = 'D002' and status = 'Active'
  returning delivery_request_id
)
update delivery_requests
set status = 'DELIVERED',
    updated_at = now()
where id in (select delivery_request_id from closed where delivery_request_id is not null);

-- ---------------------------------------------------------------------
-- PART 2: Delete "Not Started" delivery requests
-- ---------------------------------------------------------------------

create temporary table _not_started_ids on commit drop as
select id
from delivery_requests
where pickup_date < current_date
  and status not in ('DELIVERED', 'COMPLETED', 'CANCELLED');

-- Preview: what's about to be deleted.
select id, status, pickup_date, assigned_driver_id, assigned_truck_plate
from delivery_requests
where id in (select id from _not_started_ids)
order by pickup_date;

-- Delete dependents first (no ON DELETE CASCADE is documented for these FKs).
-- Order matters: gps_logs.session_id references sessions, so gps_logs must
-- go before sessions or the delete fails with a FK violation.
delete from alerts
where session_id in (
  select session_id from sessions where delivery_request_id in (select id from _not_started_ids)
);

delete from gps_logs
where delivery_request_id in (select id from _not_started_ids);

delete from sessions
where delivery_request_id in (select id from _not_started_ids);

delete from reroute_events
where delivery_request_id in (select id from _not_started_ids);

delete from delivery_quotations
where delivery_id in (select id from _not_started_ids);

delete from delivery_requests
where id in (select id from _not_started_ids);

-- Review row counts above, then either:
commit;
-- or, if something looks off:
-- rollback;
