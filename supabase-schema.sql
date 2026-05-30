-- PIRAMID BD Management prototype database.
-- Run this in the Supabase SQL editor for the target free-tier project.

create table if not exists public.bd_app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bd_app_state enable row level security;

drop policy if exists "bd_app_state_public_read" on public.bd_app_state;
create policy "bd_app_state_public_read"
on public.bd_app_state
for select
to anon, authenticated
using (true);

drop policy if exists "bd_app_state_public_insert" on public.bd_app_state;
create policy "bd_app_state_public_insert"
on public.bd_app_state
for insert
to anon, authenticated
with check (true);

drop policy if exists "bd_app_state_public_update" on public.bd_app_state;
create policy "bd_app_state_public_update"
on public.bd_app_state
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on public.bd_app_state to anon, authenticated;

