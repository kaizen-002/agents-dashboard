-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- One row holds the latest dashboard snapshot pushed from the laptop.

create table if not exists public.dashboard_state (
  id integer primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

-- Row level security on with no policies: the public anon key can read nothing.
-- Only the service key (laptop and Vercel, never the browser) can read and write.
alter table public.dashboard_state enable row level security;
