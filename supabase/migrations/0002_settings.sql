-- Digital Fees Register v1 — settings key/value table
-- Stores the v1 production deploy date so the Dashboard ROI tile can compute
-- months_since_launch. §D2b of Docs/Mockup/Mockup_User_Functionality.md.
-- Idempotent: safe to re-run while iterating.

create table if not exists settings (
  key         text primary key,
  value       text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

drop trigger if exists settings_set_updated_at on settings;
create trigger settings_set_updated_at
before update on settings
for each row execute function set_updated_at();

-- Seed app_launched_at to today (2026-05-28) as a v1 placeholder. The real
-- production deploy can overwrite this with an UPDATE — months_since_launch
-- only becomes meaningful once it crosses 2 months anyway.
insert into settings (key, value) values ('app_launched_at', '2026-05-28')
on conflict (key) do nothing;

alter table settings enable row level security;

drop policy if exists settings_select on settings;
drop policy if exists settings_insert on settings;
drop policy if exists settings_update on settings;

create policy settings_select on settings for select to authenticated using (true);
create policy settings_insert on settings for insert to authenticated with check (true);
create policy settings_update on settings for update to authenticated using (true) with check (true);
