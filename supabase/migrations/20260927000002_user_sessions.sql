-- Single active auth session per account: an account can only be signed in
-- in one browser/device at a time. On every fresh sign-in the row below is
-- upserted with the new auth session id, evicting whatever session was
-- recorded before it; a client-side guard (useSingleSessionGuard) polls
-- this row and signs the browser out when its own session id no longer
-- matches, i.e. when the same account signed in somewhere else.
create table if not exists public.user_sessions (
  user_id uuid primary key references public.users(id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

comment on table public.user_sessions is 'One row per account holding the currently active Supabase auth session id (single-sign-in enforcement).';

-- Only service_role (Edge Functions) gets broad access; authenticated users
-- may only touch their own row, and only through the policies below.
revoke all on public.user_sessions from anon, authenticated;
grant select, insert, update, delete on public.user_sessions to service_role;
grant select, insert, update, delete on public.user_sessions to authenticated;

alter table public.user_sessions enable row level security;

drop policy if exists "users can read own session" on public.user_sessions;
create policy "users can read own session"
  on public.user_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "users can claim own session" on public.user_sessions;
create policy "users can claim own session"
  on public.user_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can refresh own session" on public.user_sessions;
create policy "users can refresh own session"
  on public.user_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users can release own session" on public.user_sessions;
create policy "users can release own session"
  on public.user_sessions for delete
  using (auth.uid() = user_id);
