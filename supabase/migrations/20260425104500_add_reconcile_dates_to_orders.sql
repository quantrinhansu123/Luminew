-- Thêm 2 cột ngày đối soát vào orders để ghi nhận ngày đồng bộ Bill/Cước

alter table public.orders
  add column if not exists ngay_doi_soat_bill date,
  add column if not exists ngay_doi_soat_cuoc date;

create index if not exists orders_ngay_doi_soat_bill_idx
  on public.orders (ngay_doi_soat_bill);

create index if not exists orders_ngay_doi_soat_cuoc_idx
  on public.orders (ngay_doi_soat_cuoc);

