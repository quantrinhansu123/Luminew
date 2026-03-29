import { parseBaoCaoVanDonHistogram, sumBaoCaoVanDonHistogramValues } from './baoCaoVanDonFormat';

const classifyTrangThaiGiaoHangKey = (key) => {
    const d = String(key).trim();
    if (!d) return 'Trống trạng thái';
    const l = d.toLowerCase();
    if (
        l === 'trống' ||
        l === 'là trống' ||
        l.includes('là trống') ||
        l === 'trống trạng thái' ||
        /^trống\s*trạng\s*thái$/i.test(d)
    ) {
        return 'Trống trạng thái';
    }
    if (l.includes('giao thành công')) return 'Giao Thành Công';
    if (l.includes('đang giao')) return 'Đang Giao';
    if (l.includes('chưa giao')) return 'Chưa Giao';
    if (l.includes('huỷ') || l.includes('hủy') || l.includes('cancel')) return 'Hủy';
    if (l.includes('hoàn')) return 'Hoàn';
    if (l.includes('chờ check')) return 'chờ check';
    return 'Trống trạng thái';
};

const normalizeHistogramKeyLabel = (key) =>
    String(key)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

const isMaTrackingHistogramKey = (key) => normalizeHistogramKeyLabel(key) === 'mã tracking';

function sumKeyMatch(histogram, pred) {
    const o = parseBaoCaoVanDonHistogram(histogram);
    let s = 0;
    for (const [k, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (pred(k)) s += n;
    }
    return s;
}

function sumDeliveryBucket(delH, bucketName) {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (isMaTrackingHistogramKey(key)) continue;
        if (classifyTrangThaiGiaoHangKey(key) === bucketName) s += n;
    }
    return s;
}

function sumMaTracking(delH) {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (!isMaTrackingHistogramKey(key)) continue;
        s += Number(raw) || 0;
    }
    return s;
}

function sumDonCoBillFull(payH) {
    const o = parseBaoCaoVanDonHistogram(payH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        const k = String(key);
        if (k.includes('Có bill 1 phần') || (k.includes('1 phần') && k.toLowerCase().includes('bill'))) continue;
        if (k.includes('Có bill') || k.toLowerCase().includes('có bill')) s += n;
    }
    return s;
}

/** Cột trạng thái thu tiền (mẫu báo cáo vận hành) — gán key histogram vào đúng cột (ưu tiên thứ tự). */
export const BC_VH_PAYMENT_COLUMNS = [
    { id: 'bom', label: 'Bom_bùng_chặn', test: (k) => /bom|bùng|chặn/i.test(String(k)) },
    { id: 'henTT', label: 'Hẹn thanh toán', test: (k) => /hẹn\s*thanh\s*toán|hẹn thanh toán/i.test(String(k)) },
    { id: 'khoDoi', label: 'Khó Đòi', test: (k) => /khó\s*đòi/i.test(String(k)) },
    {
        id: 'hoanHang',
        label: 'Hoàn Hàng',
        test: (k) =>
            /hoàn\s*hàng/i.test(String(k)) && !/phí\s*hoàn|phi hoan|thanh toán phí hoàn/i.test(String(k))
    },
    { id: 'khongNhan', label: 'Không nhận được hàng', test: (k) => /không nhận được hàng/i.test(String(k)) },
    { id: 'khongPH', label: 'Không PH dưới AN', test: (k) => /không\s*ph|ph\s*dưới\s*an/i.test(String(k)) },
    { id: 'kphNhieuNgay', label: 'KPH nhiều ngày', test: (k) => /kph.*nhiều ngày|nhiều ngày/i.test(String(k)) },
    {
        id: 'phiHoan',
        label: 'Thanh toán phí hoàn',
        test: (k) => /thanh toán phí hoàn|phí hoàn|phi hoan/i.test(String(k))
    }
];

function mergePaymentHistogramIntoBuckets(payH, buckets) {
    const o = parseBaoCaoVanDonHistogram(payH);
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        let placed = false;
        for (const col of BC_VH_PAYMENT_COLUMNS) {
            if (col.test(key)) {
                buckets[col.id] = (buckets[col.id] || 0) + n;
                placed = true;
                break;
            }
        }
        if (!placed) {
            buckets.__other = (buckets.__other || 0) + n;
        }
    }
}

/**
 * Một dòng báo cáo vận hành (đủ cột như mẫu Excel).
 * `slice`: virtual rows từ bao_cao_van_don.
 */
export function aggregateOperationalReportSlice(slice) {
    const payBuckets = {};
    BC_VH_PAYMENT_COLUMNS.forEach((c) => {
        payBuckets[c.id] = 0;
    });

    let tongNoiBo = 0;
    let ok = 0;
    let treo = 0;
    let doiHang = 0;
    let huyNoiBo = 0;
    let khachHen = 0;
    let vanDonXL = 0;
    let donCoBill = 0;
    let coMa = 0;
    let giaoTC = 0;
    let dangGiao = 0;
    let chuaGiao = 0;
    let hoan = 0;
    let huyVH = 0;
    let choCheck = 0;
    let trongTT = 0;

    for (const r of slice) {
        tongNoiBo += sumBaoCaoVanDonHistogramValues(r._ket_qua_check);
        ok += sumKeyMatch(r._ket_qua_check, (k) => String(k).trim().toLowerCase() === 'ok');
        treo += sumKeyMatch(r._ket_qua_check, (k) => /treo/i.test(String(k)));
        doiHang += sumKeyMatch(
            r._ket_qua_check,
            (k) => /đợi|doi/i.test(String(k)) && /hàng|hang/i.test(String(k))
        );
        huyNoiBo += sumKeyMatch(r._ket_qua_check, (k) => /huỷ|hủy|cancel/i.test(String(k)));
        khachHen += sumKeyMatch(r._ket_qua_check, (k) => /hẹn|hen/i.test(String(k)));
        vanDonXL += sumKeyMatch(
            r._ket_qua_check,
            (k) => /\bxl\b/i.test(String(k)) || /vận đơn\s*xl/i.test(String(k))
        );
        donCoBill += sumDonCoBillFull(r._trang_thai_thanh_toan);
        mergePaymentHistogramIntoBuckets(r._trang_thai_thanh_toan, payBuckets);

        coMa += sumMaTracking(r._trang_thai_giao_hang);
        giaoTC += sumDeliveryBucket(r._trang_thai_giao_hang, 'Giao Thành Công');
        dangGiao += sumDeliveryBucket(r._trang_thai_giao_hang, 'Đang Giao');
        chuaGiao += sumDeliveryBucket(r._trang_thai_giao_hang, 'Chưa Giao');
        hoan += sumDeliveryBucket(r._trang_thai_giao_hang, 'Hoàn');
        huyVH += sumDeliveryBucket(r._trang_thai_giao_hang, 'Hủy');
        choCheck += sumDeliveryBucket(r._trang_thai_giao_hang, 'chờ check');
        trongTT += sumDeliveryBucket(r._trang_thai_giao_hang, 'Trống trạng thái');
    }

    const daCkChuaDay = Math.max(0, ok - coMa);
    const chuaCoMa = Math.max(0, dangGiao + chuaGiao);

    const tyLeVHNoiBo = tongNoiBo > 0 ? (100 * coMa) / tongNoiBo : null;
    const tyLeTTTrenPhi = coMa > 0 ? (100 * donCoBill) / coMa : null;
    const tyLeTTThanhCong = giaoTC > 0 ? (100 * donCoBill) / giaoTC : null;

    return {
        tongNoiBo,
        donCoBill,
        coMa,
        chuaCoMa,
        tyLeVHNoiBo,
        tyLeTTTrenPhi,
        tyLeTTThanhCong,
        giaoTC,
        dangGiao,
        chuaGiao,
        hoan,
        huyVH,
        choCheck,
        trongTT,
        huyNoiBo,
        doiHang,
        khachHen,
        treo,
        vanDonXL,
        daCkChuaDay,
        payment: payBuckets
    };
}

export function formatPctComma(p) {
    if (p == null || Number.isNaN(p)) return '—';
    return `${p.toFixed(2).replace('.', ',')}%`;
}

export function formatNumVi(n) {
    return Number(n || 0).toLocaleString('vi-VN');
}

/** Các cặp (sản phẩm, thị trường) xuất hiện trong dữ liệu — mỗi cặp một dòng. */
export function deriveProductMarketLineRows(rawData) {
    const map = new Map();
    for (const r of rawData) {
        const p = (r['Mặt hàng'] || '').trim() || '—';
        const m = (r['khu vực'] || '').trim() || '—';
        const k = `${p}\t${m}`;
        if (!map.has(k)) map.set(k, { product: p, market: m });
    }
    return [...map.values()].sort((a, b) => {
        const c = a.market.localeCompare(b.market, 'vi');
        return c !== 0 ? c : a.product.localeCompare(b.product, 'vi');
    });
}

export function filterSliceByProductMarket(rawData, product, market) {
    return rawData.filter((r) => {
        const p = (r['Mặt hàng'] || '').trim() || '—';
        const m = (r['khu vực'] || '').trim() || '—';
        return p === product && m === market;
    });
}

/**
 * Lọc theo khoảng ngày (Ngày lên đơn) + tùy chọn sản phẩm / thị trường (chuỗi rỗng = tất cả).
 * @param {{ startDate: string; endDate: string; product: string; market: string }} criteria
 */
export function filterSliceForCriteriaRow(rawData, criteria) {
    const { startDate, endDate, product, market } = criteria;
    return rawData.filter((r) => {
        const d = (r['Ngày lên đơn'] || '').slice(0, 10);
        if (startDate && d && d < startDate) return false;
        if (endDate && d && d > endDate) return false;
        if (product) {
            const p = (r['Mặt hàng'] || '').trim();
            if (p !== product) return false;
        }
        if (market) {
            const m = (r['khu vực'] || '').trim();
            if (m !== market) return false;
        }
        return true;
    });
}
