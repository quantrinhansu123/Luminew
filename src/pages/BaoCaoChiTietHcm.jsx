import BaoCaoChiTiet from './BaoCaoChiTiet';

/** Danh sách đơn chi tiết — nguồn `order_code_hcm` (tương đương /bao-cao-chi-tiet với `orders`). */
export default function BaoCaoChiTietHcm() {
    return <BaoCaoChiTiet dataSource="hcm" />;
}
