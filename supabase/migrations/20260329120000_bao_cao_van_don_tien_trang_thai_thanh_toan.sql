-- Tổng tiền (VNĐ) theo key song song trang_thai_thanh_toan (đồng bộ từ orders.reconciled_vnd).
alter table public.bao_cao_van_don
  add column if not exists tien_trang_thai_thanh_toan jsonb not null default '{}'::jsonb;

comment on column public.bao_cao_van_don.tien_trang_thai_thanh_toan is
  'jsonb { "Trạng thái TT": tổng tiền VNĐ } — song song key với trang_thai_thanh_toan';
