-- Doanh số các đơn có Kết quả Check = Ok (cùng key với cột «Đơn Ok»).
alter table if exists public.detail_reports
  add column if not exists "Doanh số Ok" numeric not null default 0;

alter table if exists public.marketing_report_hcm
  add column if not exists "Doanh số Ok" numeric not null default 0;

comment on column public.detail_reports."Doanh số Ok"
  is 'Tổng VND các đơn doanh số hợp lệ có check_result = Ok; tự tính cùng key với cột Đơn Ok.';

comment on column public.marketing_report_hcm."Doanh số Ok"
  is 'Tổng VND các đơn doanh số hợp lệ có check_result = Ok; tự tính cùng key với cột Đơn Ok.';
