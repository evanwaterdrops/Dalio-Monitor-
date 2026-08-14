-- Sovereign Vitals schema. Server-only access via service role; RLS on, no anon policies.

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of timestamptz not null default now(),
  payload jsonb not null
);
create index if not exists snapshots_as_of on snapshots (as_of desc);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  trigger_key text not null,
  tier smallint not null,
  fired_at timestamptz not null default now(),
  payload jsonb,
  acknowledged boolean not null default false
);
create index if not exists alerts_fired on alerts (fired_at desc);

-- Curated inputs for series with no API. Keys in use:
--   rollover_share_12m          (share of marketable debt maturing <=12m; MSPD-derived)
--   japan_tic_delta_2m_bn       (until FRED TIC series id is pinned)
--   hyperscaler_bond_coverage   (Forbes/MS reporting; 4.9x Feb-26 -> <2x Jul-26)
--   moodys_uncommenced_leases_bn (662 as of YE-2025 reporting)
create table if not exists manual_inputs (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value numeric not null,
  source_url text,
  entered_at timestamptz not null default now()
);
create index if not exists manual_key on manual_inputs (key, entered_at desc);

alter table snapshots enable row level security;
alter table alerts enable row level security;
alter table manual_inputs enable row level security;
-- no policies: only the service role (server) can read/write.

-- seed the two defaults the assessor expects
insert into manual_inputs (key, value, source_url) values
  ('rollover_share_12m', 0.30, 'MSPD-derived placeholder; automate in v2'),
  ('hyperscaler_bond_coverage', 1.9, 'Forbes/Morgan Stanley Jul-2026 reporting');
