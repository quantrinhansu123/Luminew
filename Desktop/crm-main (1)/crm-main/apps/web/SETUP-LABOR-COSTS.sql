-- ============================================
-- SETUP LABOR COSTS (BẢNG GIÁ CÔNG)
-- ============================================
-- Run in Supabase SQL Editor.

create table if not exists public.labor_costs (
  id bigserial primary key,

  -- Hành động (VD: Cắt, Bế, In, Dán...)
  action text not null,

  -- Loại vật liệu / Nhóm sản phẩm (liên kết product_groups)
  product_group_id bigint null,

  -- Loại vật liệu (liên kết kho vật liệu)
  material_id bigint null,

  -- Chi phí
  unit_cost numeric not null default 0,

  -- Đơn vị (VD: lần, m2, cái...)
  unit text null,

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table existed before (without material_id), add it BEFORE indexes/FKs.
alter table public.labor_costs
  add column if not exists material_id bigint;

create index if not exists idx_labor_costs_product_group_id on public.labor_costs(product_group_id);
create index if not exists idx_labor_costs_material_id on public.labor_costs(material_id);
create index if not exists idx_labor_costs_created_at on public.labor_costs(created_at desc);

-- Optional FK only when product_groups exists
do $$
begin
  if to_regclass('public.product_groups') is not null then
    begin
      alter table public.labor_costs
        add constraint labor_costs_product_group_id_fkey
        foreign key (product_group_id) references public.product_groups(id) on delete set null;
    exception
      when duplicate_object then null;
      when others then null;
    end;
  end if;
end $$;

-- Optional FK only when materials exists
do $$
begin
  if to_regclass('public.materials') is not null then
    begin
      alter table public.labor_costs
        add constraint labor_costs_material_id_fkey
        foreign key (material_id) references public.materials(id) on delete set null;
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

drop trigger if exists trg_labor_costs_updated_at on public.labor_costs;
create trigger trg_labor_costs_updated_at
before update on public.labor_costs
for each row execute function public.set_updated_at();

-- RLS: allow anon access (matches current app style)
alter table public.labor_costs enable row level security;
drop policy if exists "Allow anonymous access" on public.labor_costs;
create policy "Allow anonymous access"
on public.labor_costs
for all
using (true)
with check (true);

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

