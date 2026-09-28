-- Follow-up to 20260927000002_user_sessions.sql: the initial migration
-- revoked the default anon/authenticated grants but never re-granted the
-- table-level privileges to `authenticated`, so RLS aside, the role had no
-- access to the table at all. Re-grant here; the policies still restrict
-- each authenticated user to their own row.
revoke all on public.user_sessions from anon, authenticated;
grant select, insert, update, delete on public.user_sessions to service_role;
grant select, insert, update, delete on public.user_sessions to authenticated;
