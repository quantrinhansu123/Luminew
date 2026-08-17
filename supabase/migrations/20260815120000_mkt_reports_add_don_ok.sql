-- Lưu số đơn có Kết quả Check = Ok cho báo cáo MKT, tương tự báo cáo Sale.
alter table if exists public.detail_reports
  add column if not exists "Đơn Ok" integer not null default 0;

alter table if exists public.marketing_report_hcm
  add column if not exists "Đơn Ok" integer not null default 0;

comment on column public.detail_reports."Đơn Ok"
  is 'Số đơn doanh số hợp lệ có check_result = Ok; tự tính cùng key và cùng luồng với cột hoàn huỷ.';

comment on column public.marketing_report_hcm."Đơn Ok"
  is 'Số đơn doanh số hợp lệ có check_result = Ok; tự tính cùng key và cùng luồng với cột hoàn huỷ.';
