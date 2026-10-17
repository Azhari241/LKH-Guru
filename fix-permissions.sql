-- =========================================================
-- Jurnal Harian Guru — PERBAIKAN HAK AKSES TABEL (error 42501)
-- Aman dijalankan berulang kali. TIDAK menghapus data,
-- TIDAK menonaktifkan RLS, TIDAK memberi akses ke role anon.
-- Jalankan di proyek Supabase yang SUDAH ADA: SQL Editor > New query.
-- =========================================================

-- ---------- BAGIAN A: DIAGNOSIS (hanya membaca) ----------
-- Jalankan bagian ini dulu untuk melihat kondisi saat ini.

-- A1. Hak akses tabel per role (yang dibutuhkan: authenticated = SELECT, INSERT, UPDATE, DELETE)
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('jhg_profiles', 'jhg_entries', 'jhg_templates')
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- A2. Hak USAGE pada skema public (keduanya harus true)
select has_schema_privilege('authenticated', 'public', 'USAGE') as authenticated_usage,
       has_schema_privilege('anon', 'public', 'USAGE')          as anon_usage;

-- A3. RLS aktif? (rowsecurity harus true untuk ketiga tabel)
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('jhg_profiles', 'jhg_entries', 'jhg_templates');

-- A4. Kebijakan RLS yang ada (harus memakai auth.uid() = user_id)
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jhg_profiles', 'jhg_entries', 'jhg_templates');

-- Jika A1 tidak menampilkan baris "authenticated" untuk sebuah tabel,
-- atau privileges-nya kurang dari DELETE, INSERT, SELECT, UPDATE,
-- maka itulah penyebab "permission denied for table ... (42501)".
-- Lanjutkan ke BAGIAN B.

-- ---------- BAGIAN B: PERBAIKAN MINIMAL ----------
grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.jhg_profiles  to authenticated;
grant select, insert, update, delete on table public.jhg_entries   to authenticated;
grant select, insert, update, delete on table public.jhg_templates to authenticated;

-- Pastikan RLS tetap aktif (tidak mengubah apa pun jika sudah aktif)
alter table public.jhg_profiles  enable row level security;
alter table public.jhg_entries   enable row level security;
alter table public.jhg_templates enable row level security;

-- Kebijakan RLS: dibuat hanya jika belum ada (tidak menghapus kebijakan yang sudah ada)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jhg_profiles' and policyname='own profile') then
    create policy "own profile" on public.jhg_profiles for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jhg_entries' and policyname='own entries') then
    create policy "own entries" on public.jhg_entries for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jhg_templates' and policyname='own template') then
    create policy "own template" on public.jhg_templates for all to authenticated
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Muat ulang cache skema Data API agar perubahan langsung terbaca
notify pgrst, 'reload schema';

-- Setelah selesai, jalankan ulang A1: baris "authenticated" harus berisi
-- DELETE, INSERT, SELECT, UPDATE untuk ketiga tabel. Role "anon" tidak perlu hak apa pun.
