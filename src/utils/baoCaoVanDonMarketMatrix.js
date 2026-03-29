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

/** Đếm đơn có bill đủ (không tính bill 1 phần) — cùng quy tắc BaoCaoVanDon. */
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

function marketKeyOfRow(row) {
    const v = (row['khu vực'] || row['Khu vực'] || '').trim();
    return v || 'Không xác định';
}

function emptyMetrics() {
    return {
        tongLenDon: 0,
        ok: 0,
        treo: 0,
        doiHang: 0,
        huyCheck: 0,
        sauHuy: 0,
        giaoTC: 0,
        dangGiao: 0,
        coMa: 0,
        mgt: 0,
        dayVH: 0,
        donCoBill: 0
    };
}

/** Gom metrics cho một tập dòng virtual `bao_cao_van_don`. */
export function aggregateVanHanhSlice(slice) {
    const m = emptyMetrics();
    for (const r of slice) {
        m.tongLenDon += sumBaoCaoVanDonHistogramValues(r._ket_qua_check);
        m.ok += sumKeyMatch(r._ket_qua_check, (k) => String(k).trim().toLowerCase() === 'ok');
        m.treo += sumKeyMatch(r._ket_qua_check, (k) => /treo/i.test(String(k)));
        m.doiHang += sumKeyMatch(
            r._ket_qua_check,
            (k) => /đợi|doi/i.test(String(k)) && /hàng|hang/i.test(String(k))
        );
        m.huyCheck += sumKeyMatch(r._ket_qua_check, (k) => /huỷ|hủy|cancel/i.test(String(k)));
        m.coMa += sumMaTracking(r._trang_thai_giao_hang);
        m.mgt += sumKeyMatch(r._trang_thai_giao_hang, (k) => /mgt/i.test(String(k)));
        m.donCoBill += sumDonCoBillFull(r._trang_thai_thanh_toan);
        m.giaoTC += sumDeliveryBucket(r._trang_thai_giao_hang, 'Giao Thành Công');
        m.dangGiao += sumDeliveryBucket(r._trang_thai_giao_hang, 'Đang Giao');
    }
    m.sauHuy = m.tongLenDon - m.huyCheck;
    m.dayVH = m.coMa + m.dangGiao;
    return m;
}

/**
 * Gom số đơn (histogram jsonb) theo từng thị trường + cột TỔNG.
 * `rows`: virtual row như mapBaoCaoRowToVirtual trong BaoCaoVanDon.
 */
export function buildBaoCaoVanHanhMatrix(rows) {
    const keys = [...new Set(rows.map(marketKeyOfRow))].sort((a, b) => a.localeCompare(b, 'vi'));
    const byMarket = {};
    for (const mk of keys) {
        byMarket[mk] = aggregateVanHanhSlice(rows.filter((r) => marketKeyOfRow(r) === mk));
    }
    const total = aggregateVanHanhSlice(rows);
    return { markets: keys, byMarket, total };
}

export function formatSlVi(n) {
    return Number(n || 0).toLocaleString('vi-VN');
}

/** Cột tiền không có trong bao_cao_van_don — hiển thị placeholder. */
export const NO_AMOUNT = '—';

export function formatPct(numerator, denominator) {
    const d = Number(denominator) || 0;
    if (d <= 0) return '—';
    const p = (100 * Number(numerator || 0)) / d;
    return `${p.toFixed(2).replace('.', ',')}%`;
}
