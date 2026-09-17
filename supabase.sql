-- Run in Supabase: SQL Editor > paste > Run. Safe to run again.

-- One row holds the latest dashboard snapshot pushed from the laptop.
create table if not exists public.dashboard_state (
  id integer primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Login protection: failed attempts per address and overall, lockouts,
-- and the "sessions" row that ends every session when you log out everywhere.
create table if not exists public.login_guard (
  key text primary key,
  failures integer not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz
);

-- Row level security on with no policies: the public anon key can read nothing.
-- Only the service key (laptop and Vercel, never the browser) can read and write.
alter table public.dashboard_state enable row level security;
alter table public.login_guard enable row level security;
