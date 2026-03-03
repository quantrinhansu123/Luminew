-- SQL Script to create a view for orders table
-- Run this in Supabase SQL Editor

-- Tạo view để xem đơn hàng với các cột quan trọng (bao gồm payment_bill và payment_image)
CREATE OR REPLACE VIEW public.orders_view AS
SELECT 
    id,
    order_code AS "Mã đơn hàng",
    order_date AS "Ngày lên đơn",
    customer_name AS "Name*",
    customer_phone AS "Phone*",
    customer_address AS "Add",
    city AS "City",
    state AS "State",
    zipcode AS "Zipcode",
    product AS "Mặt hàng",
    total_amount_vnd AS "Tổng tiền VNĐ",
    tracking_code AS "Mã Tracking",
    delivery_status AS "Trạng thái giao hàng",
    payment_status AS "Trạng thái thu tiền",
    payment_bill AS "Payment Bill",
    payment_image AS "Payment Image",
    note AS "Ghi chú",
    team AS "Team",
    created_at,
    updated_at
FROM public.orders;

-- Grant permissions để users có thể query view
GRANT SELECT ON public.orders_view TO authenticated;
GRANT SELECT ON public.orders_view TO anon;

-- Comment để mô tả view
COMMENT ON VIEW public.orders_view IS 'View để xem đơn hàng với các cột quan trọng, bao gồm Payment Bill và Payment Image';
