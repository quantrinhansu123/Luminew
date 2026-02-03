-- =====================================================
-- Function lấy dữ liệu Báo Cáo Sale Tổng Hợp (V4 - Fix Types)
-- Updated: Cast INTEGER columns to BIGINT to match RETURNS TABLE signature
-- =====================================================
CREATE OR REPLACE FUNCTION get_sales_analytics(
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  "Tên" TEXT,
  "Email" TEXT,
  "Team" TEXT,
  "Chi nhánh" TEXT,
  "Ngày" DATE,
  "Ca" TEXT,
  "Sản phẩm" TEXT,
  "Thị trường" TEXT,
  "Chức vụ" TEXT,
  
  -- Số liệu
  "Số Mess" BIGINT,
  "Phản hồi" BIGINT,
  "Đơn Mess" BIGINT,
  "Doanh số Mess" NUMERIC,
  
  -- Số liệu thực tế
  "Số đơn thực tế" BIGINT,
  "Doanh thu chốt thực tế" NUMERIC,
  "Số đơn Hoàn huỷ" BIGINT,
  "Doanh số hoàn huỷ" NUMERIC,
  "Số đơn thành công" BIGINT,
  "Doanh số thành công" NUMERIC,
  
  "Doanh số đi" NUMERIC,
  "Doanh số đi thực tế" NUMERIC,
  "Số đơn hoàn hủy thực tế" BIGINT,
  "Doanh số hoàn hủy thực tế" NUMERIC,
  "Doanh số sau hoàn hủy thực tế" NUMERIC
) 
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sr.name as "Tên",
    sr.email as "Email",
    COALESCE(sr.team, 'Unknown') as "Team",
    COALESCE(sr.branch, 'Unknown') as "Chi nhánh",
    sr.date as "Ngày",
    COALESCE(sr.shift, '') as "Ca",
    COALESCE(sr.product, '') as "Sản phẩm",
    COALESCE(sr.market, '') as "Thị trường",
    COALESCE(sr.position, 'Sale Member') as "Chức vụ",
    
    -- Metrics (Cast to BIGINT)
    COALESCE(sr.mess_count, 0)::BIGINT as "Số Mess",
    COALESCE(sr.response_count, 0)::BIGINT as "Phản hồi",
    COALESCE(sr.order_count, 0)::BIGINT as "Đơn Mess",
    COALESCE(sr.revenue_mess, 0)::NUMERIC as "Doanh số Mess",
    
    -- Actual Metrics (Cast to BIGINT/NUMERIC)
    COALESCE(sr.order_count_actual, 0)::BIGINT as "Số đơn thực tế",
    COALESCE(sr.revenue_actual, 0)::NUMERIC as "Doanh thu chốt thực tế",
    COALESCE(sr.order_cancel_count, 0)::BIGINT as "Số đơn Hoàn huỷ",
    COALESCE(sr.revenue_cancel, 0)::NUMERIC as "Doanh số hoàn huỷ",
    COALESCE(sr.order_success_count, 0)::BIGINT as "Số đơn thành công",
    COALESCE(sr.revenue_success, 0)::NUMERIC as "Doanh số thành công",
    
    COALESCE(sr.revenue_go, 0)::NUMERIC as "Doanh số đi",
    COALESCE(sr.revenue_go_actual, 0)::NUMERIC as "Doanh số đi thực tế",
    COALESCE(sr.order_cancel_count_actual, 0)::BIGINT as "Số đơn hoàn hủy thực tế",
    COALESCE(sr.revenue_cancel_actual, 0)::NUMERIC as "Doanh số hoàn hủy thực tế",
    COALESCE(sr.revenue_after_cancel_actual, 0)::NUMERIC as "Doanh số sau hoàn hủy thực tế"
    
  FROM public.sales_reports sr
  WHERE sr.date BETWEEN p_start_date AND p_end_date
  ORDER BY sr.date DESC, sr.name ASC;
END;
$$ LANGUAGE plpgsql;

SELECT 'Function get_sales_analytics V4 (Type Fixed) updated!' as message;
