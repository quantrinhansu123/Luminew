import {
    isGiaoHangHistogramSyntheticKey,
    parseBaoCaoVanDonHistogram,
    sumBaoCaoVanDonHistogramValues,
    sumDonCoBillFullAmount,
    sumDonCoBillFullCount
} from './baoCaoVanDonFormat';

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

/** Số đơn ghi trong bucket «Lên vận hành» (đơn có ĐVVC / đẩy VH trong dòng bao_cao_van_don). */
function sumLenVanHanhHistogram(delH) {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (normalizeHistogramKeyLabel(key) === 'lên vận hành') s += Number(raw) || 0;
    }
    return s;
}

/** Đếm phần histogram khớp predicate (dùng chung tab 5 — đồng bộ SL/DS). */
export function sumHistogramKeyMatch(histogram, pred) {
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
        if (isGiaoHangHistogramSyntheticKey(key)) continue;
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

function marketKeyOfRow(row) {
    const v = (row['khu vực'] || row['Khu vực'] || '').trim();
    return v || 'Không xác định';
}

/** Tổng tiền VNĐ hiển thị trên virtual row (khớp Tab1 / `_tong_tien_vnd`). */
function rowTongTienVnd(r) {
    return Number(r._tong_tien_vnd ?? 0) || 0;
}

function emptyMetrics() {
    return {
        tongLenDon: 0,
        ok: 0,
        treo: 0,
        khachHen: 0,
        doiHang: 0,
        huyCheck: 0,
        /** Có ĐVVC (đẩy VH) và histogram kết quả check có Huỷ — khớp định nghĩa «Huỷ vận hành». */
        huyVanHanh: 0,
        sauHuy: 0,
        /** Đơn có ĐVVC (orders: shipping_unit; bao_cao: histogram «Lên vận hành»). */
        donDayVanHanh: 0,
        giaoTC: 0,
        dangGiao: 0,
        coMa: 0,
        mgt: 0,
        dayVH: 0,
        donCoBill: 0,
        donCoBillAmount: 0,
        tongLenDonAmount: 0,
        okAmount: 0,
        treoAmount: 0,
        khachHenAmount: 0,
        doiHangAmount: 0,
        huyCheckAmount: 0,
        huyVanHanhAmount: 0,
        sauHuyAmount: 0,
        donDayVanHanhAmount: 0,
        giaoTCAmount: 0,
        mgtAmount: 0,
        coMaAmount: 0,
        dayVHAmount: 0
    };
}

/** Gom metrics cho một tập dòng virtual `bao_cao_van_don`. */
export function aggregateVanHanhSlice(slice) {
    const m = emptyMetrics();
    for (const r of slice) {
        const amt = rowTongTienVnd(r);
        const totChk = sumBaoCaoVanDonHistogramValues(r._ket_qua_check);
        const okRow = sumHistogramKeyMatch(r._ket_qua_check, (k) => String(k).trim().toLowerCase() === 'ok');
        const treoRow = sumHistogramKeyMatch(r._ket_qua_check, (k) => /treo/i.test(String(k)));
        const khachHenRow = sumHistogramKeyMatch(r._ket_qua_check, (k) => {
            const s = String(k ?? '')
                .trim()
                .normalize('NFC')
                .toLowerCase()
                .replace(/\s+/g, ' ');
            return s.includes('khách hẹn') || s.includes('khach hen');
        });
        const doiRow = sumHistogramKeyMatch(
            r._ket_qua_check,
            (k) => /đợi|doi/i.test(String(k)) && /hàng|hang/i.test(String(k))
        );
        const huyRow = sumHistogramKeyMatch(r._ket_qua_check, (k) => /huỷ|hủy|cancel/i.test(String(k)));
        const hasCarrier =
            r._source === 'orders'
                ? (Number(r._len_vh_don_vi) || 0) > 0
                : sumLenVanHanhHistogram(r._trang_thai_giao_hang) > 0;

        m.tongLenDon += totChk;
        m.ok += okRow;
        m.treo += treoRow;
        m.khachHen += khachHenRow;
        m.doiHang += doiRow;
        m.huyCheck += huyRow;

        if (totChk > 0) m.tongLenDonAmount += amt;
        if (okRow > 0) m.okAmount += amt;
        if (treoRow > 0) m.treoAmount += amt;
        if (khachHenRow > 0) m.khachHenAmount += amt;
        if (doiRow > 0) m.doiHangAmount += amt;
        if (huyRow > 0) m.huyCheckAmount += amt;
        if (hasCarrier && huyRow > 0) {
            m.huyVanHanh += huyRow;
            m.huyVanHanhAmount += amt;
        }
        if (totChk - huyRow > 0) m.sauHuyAmount += amt;

        if (r._source === 'orders') {
            if ((Number(r._len_vh_don_vi) || 0) > 0) {
                m.donDayVanHanh += totChk;
                if (totChk > 0) m.donDayVanHanhAmount += amt;
            }
        } else {
            const lenVhRow = sumLenVanHanhHistogram(r._trang_thai_giao_hang);
            m.donDayVanHanh += lenVhRow;
            if (lenVhRow > 0) m.donDayVanHanhAmount += amt;
        }

        const maTr = sumMaTracking(r._trang_thai_giao_hang);
        m.coMa += maTr;
        if (maTr > 0) m.coMaAmount += amt;

        const mgtRow = sumHistogramKeyMatch(r._trang_thai_giao_hang, (k) => /mgt/i.test(String(k)));
        m.mgt += mgtRow;
        if (mgtRow > 0) m.mgtAmount += amt;

        m.donCoBill += sumDonCoBillFullCount(r._trang_thai_thanh_toan);
        m.donCoBillAmount += sumDonCoBillFullAmount(r._tien_trang_thai_thanh_toan);
        const gtcRow = sumDeliveryBucket(r._trang_thai_giao_hang, 'Giao Thành Công');
        const dangRow = sumDeliveryBucket(r._trang_thai_giao_hang, 'Đang Giao');
        m.giaoTC += gtcRow;
        m.dangGiao += dangRow;
        if (gtcRow > 0) m.giaoTCAmount += amt;
        if (maTr > 0 || dangRow > 0) m.dayVHAmount += amt;
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

/** Placeholder khi chưa có số tiền (dòng cũ trước khi đồng bộ tien_trang_thai_thanh_toan). */
export const NO_AMOUNT = '—';

export function formatPct(numerator, denominator) {
    const d = Number(denominator) || 0;
    if (d <= 0) return '—';
    const p = (100 * Number(numerator || 0)) / d;
    return `${p.toFixed(1).replace('.', ',')}%`;
}
