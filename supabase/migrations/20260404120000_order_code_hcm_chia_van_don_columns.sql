-- Cột chia vận đơn trên order_code_hcm (trang /van-don-hcm + api VAN_DON_SELECT_QUERY_ORDER_CODE_HCM).
alter table public.order_code_hcm
  add column if not exists thu_tu_chia integer;

alter table public.order_code_hcm
  add column if not exists ngay_chia_van_don date;

comment on column public.order_code_hcm.thu_tu_chia is
  'STT chia vận đơn trong ngày (toàn cục khi chạy chia đơn).';

comment on column public.order_code_hcm.ngay_chia_van_don is
  'Ngày gán NV vận đơn (chia đơn).';
