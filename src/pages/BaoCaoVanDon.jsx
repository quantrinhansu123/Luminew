/**
 * Báo cáo vận đơn — giao diện tab NV (public/baocao-vandon-nv), nguồn đơn: bảng `orders`.
 */
const BAO_CAO_VAN_DON_NV_SRC = '/baocao-vandon-nv/index.html?table=orders';

export default function BaoCaoVanDon() {
    return (
        <div className="w-full h-[calc(100vh-64px)] overflow-hidden">
            <iframe
                src={BAO_CAO_VAN_DON_NV_SRC}
                className="w-full h-full border-none"
                title="Báo cáo vận đơn"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    );
}
