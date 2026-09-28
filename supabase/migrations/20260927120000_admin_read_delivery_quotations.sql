-- Admins could never read delivery_quotations: the only SELECT policies on the
-- table are Supervisor-wide ("Supervisors can read quotations") and
-- Customers-own-rows, so the Admin delivery details page
-- (/admin/deliveries/:deliveryId) always rendered an empty Quotation tab even
-- when quotations existed for the delivery. Grant Admins read access,
-- mirroring the "admins and supervisors ..." convention already used for
-- trucks, maintenance_records, and driver_records.
create policy "Admins can read quotations"
  on public.delivery_quotations for select to authenticated
  using (public.current_user_role() = 'Admin');
