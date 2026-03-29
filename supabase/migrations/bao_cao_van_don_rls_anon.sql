-- Cho phép role `anon` (client chỉ có VITE_SUPABASE_ANON_KEY, không có Supabase Auth JWT)
-- đọc/ghi bao_cao_van_don. Khớp mô hình các bảng khác trong app (xem rbacService upsertPagePermission).
-- Chạy sau bao_cao_van_don.sql.

grant select, insert, update, delete on public.bao_cao_van_don to anon;

drop policy if exists "bao_cao_van_don_select_anon" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_insert_anon" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_update_anon" on public.bao_cao_van_don;
drop policy if exists "bao_cao_van_don_delete_anon" on public.bao_cao_van_don;

create policy "bao_cao_van_don_select_anon"
  on public.bao_cao_van_don
  for select
  to anon
  using (true);

create policy "bao_cao_van_don_insert_anon"
  on public.bao_cao_van_don
  for insert
  to anon
  with check (true);

create policy "bao_cao_van_don_update_anon"
  on public.bao_cao_van_don
  for update
  to anon
  using (true)
  with check (true);

create policy "bao_cao_van_don_delete_anon"
  on public.bao_cao_van_don
  for delete
  to anon
  using (true);
