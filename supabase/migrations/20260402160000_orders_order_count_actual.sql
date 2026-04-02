-- Số dòng chi tiết cước theo đơn (đồng bộ từ trang đối soát bill/cước).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_count_actual integer;

COMMENT ON COLUMN public.orders.order_count_actual IS
  'Số bản ghi chitiet_cuoc gắn mã đơn khi đồng bộ từ /doi-soat-bill-cuoc.';
