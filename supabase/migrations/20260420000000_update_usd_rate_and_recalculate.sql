-- Cập nhật tỷ giá USD từ 25,000 → 24,000 và tính lại các đơn hàng đã có

-- Bước 1: Cập nhật tỷ giá USD trong bảng exchange_rates
UPDATE public.exchange_rates
SET gia_tri = 24000
WHERE ti_gia = 'USD';

-- Bước 2: Tính lại các cột tiền cho đơn hàng USD trong bảng orders
-- Chỉ cập nhật các đơn có:
-- - payment_type = 'USD' hoặc payment_currency = 'USD'
-- - exchange_rate = 25000 (tỷ giá cũ)
-- - sale_price > 0

DO $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Cập nhật total_vnd = sale_price × 24000 (cho các đơn có exchange_rate = 25000)
  UPDATE public.orders
  SET 
    exchange_rate = 24000,
    total_vnd = CASE 
      WHEN sale_price IS NOT NULL AND sale_price > 0 
      THEN sale_price * 24000 
      ELSE total_vnd 
    END,
    -- Cập nhật total_amount_vnd nếu nó được tính từ sale_price × exchange_rate
    total_amount_vnd = CASE
      WHEN sale_price IS NOT NULL AND sale_price > 0 
           AND (total_amount_vnd IS NULL OR total_amount_vnd = sale_price * 25000)
      THEN sale_price * 24000
      ELSE total_amount_vnd
    END,
    -- Cập nhật tong_tien_vnd nếu có
    tong_tien_vnd = CASE
      WHEN sale_price IS NOT NULL AND sale_price > 0
           AND (tong_tien_vnd IS NULL OR tong_tien_vnd = sale_price * 25000)
      THEN sale_price * 24000
      ELSE tong_tien_vnd
    END
  WHERE 
    (UPPER(payment_type) = 'USD' OR UPPER(payment_currency) = 'USD')
    AND exchange_rate = 25000
    AND sale_price > 0;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Đã cập nhật % đơn hàng USD trong bảng orders', updated_count;
END $$;

-- Bước 3: Tính lại cho bảng order_code_hcm (nếu có)
DO $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_code_hcm') THEN
    UPDATE public.order_code_hcm
    SET 
      exchange_rate = 24000,
      total_vnd = CASE 
        WHEN sale_price IS NOT NULL AND sale_price > 0 
        THEN sale_price * 24000 
        ELSE total_vnd 
      END,
      total_amount_vnd = CASE
        WHEN sale_price IS NOT NULL AND sale_price > 0 
             AND (total_amount_vnd IS NULL OR total_amount_vnd = sale_price * 25000)
        THEN sale_price * 24000
        ELSE total_amount_vnd
      END,
      tong_tien_vnd = CASE
        WHEN sale_price IS NOT NULL AND sale_price > 0
             AND (tong_tien_vnd IS NULL OR tong_tien_vnd = sale_price * 25000)
        THEN sale_price * 24000
        ELSE tong_tien_vnd
      END
    WHERE 
      (UPPER(payment_type) = 'USD' OR UPPER(payment_currency) = 'USD')
      AND exchange_rate = 25000
      AND sale_price > 0;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Đã cập nhật % đơn hàng USD trong bảng order_code_hcm', updated_count;
  END IF;
END $$;

-- Bước 4: Cập nhật tỷ giá trong bảng chi_tiet_bill_tien (nếu có)
DO $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chi_tiet_bill_tien') THEN
    UPDATE public.chi_tiet_bill_tien
    SET 
      ty_gia = 24000,
      tien_viet = CASE
        WHEN so_tien_doi_soat IS NOT NULL AND so_tien_doi_soat > 0
        THEN so_tien_doi_soat * 24000
        ELSE tien_viet
      END
    WHERE 
      UPPER(don_vi_tien) = 'USD'
      AND ty_gia = 25000
      AND so_tien_doi_soat > 0;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Đã cập nhật % bản ghi USD trong bảng chi_tiet_bill_tien', updated_count;
  END IF;
END $$;

-- Bước 5: Log kết quả
DO $$
BEGIN
  RAISE NOTICE '=== Hoàn thành cập nhật tỷ giá USD ===';
  RAISE NOTICE 'Tỷ giá mới: 24,000 VNĐ';
  RAISE NOTICE 'Đã tính lại tất cả các đơn hàng USD có exchange_rate = 25,000';
END $$;
