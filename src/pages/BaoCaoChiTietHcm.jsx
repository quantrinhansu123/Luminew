import BaoCaoChiTiet from './BaoCaoChiTiet';

/**
 * Danh sách đơn chi tiết HCM — `order_code_hcm`.
 * UI (lưới, bộ lọc, xuất Excel, **tổng đơn / tiền / ship / kế toán**) dùng chung `BaoCaoChiTiet` với `dataSource="hcm"`.
 */
export default function BaoCaoChiTietHcm() {
    return <BaoCaoChiTiet dataSource="hcm" />;
}
