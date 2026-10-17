-- =========================================================
-- Jurnal Harian Guru — skema database Supabase (PostgreSQL)
-- Jalankan sekali di: Supabase Dashboard > SQL Editor > New query
-- Semua tabel dilindungi Row Level Security: setiap akun
-- hanya dapat membaca & mengubah datanya sendiri.
-- =========================================================

create table if not exists public.jhg_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.jhg_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date        date not null,
  description text not null,
  unit        text not null default '',
  quantity    text not null default '',
  evidence    text not null default '',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists jhg_entries_user_date on public.jhg_entries (user_id, date);

create table if not exists public.jhg_templates (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  file_name   text not null,
  docx_base64 text not null,
  updated_at  timestamptz not null default now()
);

alter table public.jhg_profiles  enable row level security;
alter table public.jhg_entries   enable row level security;
alter table public.jhg_templates enable row level security;

drop policy if exists "own profile"  on public.jhg_profiles;
drop policy if exists "own entries"  on public.jhg_entries;
drop policy if exists "own template" on public.jhg_templates;

-- Hak akses tabel hanya untuk pengguna yang sudah login (role authenticated).
-- Role anon sengaja TIDAK diberi akses. RLS di bawah membatasi baris per akun.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.jhg_profiles  to authenticated;
grant select, insert, update, delete on table public.jhg_entries   to authenticated;
grant select, insert, update, delete on table public.jhg_templates to authenticated;

create policy "own profile"  on public.jhg_profiles  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own entries"  on public.jhg_entries   for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own template" on public.jhg_templates for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
