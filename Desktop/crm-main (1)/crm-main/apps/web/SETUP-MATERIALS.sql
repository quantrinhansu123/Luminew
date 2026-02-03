-- ============================================
-- SETUP MATERIALS (KHO VẬT LIỆU)
-- ============================================
-- Run in Supabase SQL Editor.

create table if not exists public.materials (
  id bigserial primary key,

  -- Nhóm sản phẩm (liên kết product_groups)
  product_group_id bigint null,

  -- Tên phần tử (vật liệu)
  element_name text not null,

  -- Đơn vị (VD: kg, tấm, cuộn...)
  unit text not null,

  -- Giá (đơn giá)
  unit_price numeric not null default 0,

  -- Tổng chi phí (tạm thời nhập tay; có thể tự động tính sau nếu thêm số lượng/định mức)
  total_cost numeric not null default 0,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_materials_product_group_id on public.materials(product_group_id);
create index if not exists idx_materials_created_at on public.materials(created_at desc);

-- Optional FK only when product_groups exists
do $$
begin
  if to_regclass('public.product_groups') is not null then
    begin
      alter table public.materials
        add constraint materials_product_group_id_fkey
        foreign key (product_group_id) references public.product_groups(id) on delete set null;
    exception
      when duplicate_object then null;
      when others then null;
    end;
  end if;
end $$;

-- Keep updated_at in sync (reuse existing function if present)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_materials_updated_at on public.materials;
create trigger trg_materials_updated_at
before update on public.materials
for each row execute function public.set_updated_at();

-- RLS: allow anon access (matches current app style)
alter table public.materials enable row level security;
drop policy if exists "Allow anonymous access" on public.materials;
create policy "Allow anonymous access"
on public.materials
for all
using (true)
with check (true);

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

