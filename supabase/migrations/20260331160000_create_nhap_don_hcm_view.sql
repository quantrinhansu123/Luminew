-- View cho luồng "Nhập đơn HCM":
-- cấu trúc dữ liệu giống trang /nhap-don hiện tại (đọc từ orders),
-- nhưng nguồn là bảng public.order_code_hcm.

CREATE OR REPLACE VIEW public.nhap_don_hcm AS
SELECT *
FROM public.order_code_hcm;

COMMENT ON VIEW public.nhap_don_hcm IS
  'Nguồn dữ liệu nhập đơn HCM, clone từ orders nhưng lấy từ bảng order_code_hcm.';

GRANT SELECT ON public.nhap_don_hcm TO authenticated;

