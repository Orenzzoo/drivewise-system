-- Remove buggy test entry: Mitsubishi L300 FB / AUV / 2026 / Ordinary / Available
-- This row was created through the Add Truck Modal with default year 2026
-- and should not exist in production.
delete from public.trucks
where brand = 'Mitsubishi'
  and model = 'L300 FB'
  and truck_type = 'AUV'
  and year_model = 2026
  and commodity_type = 'Ordinary'
  and status = 'Available';
