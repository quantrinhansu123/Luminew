-- Đồng bộ schema với orders cho trang /van-don-hcm
-- để tránh lỗi select thiếu cột khi hiển thị Ngày đối soát bill/cước.

alter table public.order_code_hcm
  add column if not exists ngay_doi_soat_bill date,
  add column if not exists ngay_doi_soat_cuoc date;

create index if not exists order_code_hcm_ngay_doi_soat_bill_idx
  on public.order_code_hcm (ngay_doi_soat_bill);

create index if not exists order_code_hcm_ngay_doi_soat_cuoc_idx
  on public.order_code_hcm (ngay_doi_soat_cuoc);

