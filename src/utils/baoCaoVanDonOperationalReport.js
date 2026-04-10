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

const isLenVanHanhHistogramKey = (key) => normalizeHistogramKeyLabel(key) === 'lên vận hành';
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

/** Giống `sumKeyMatch` nhưng chỉ trên nhãn thật của cột «Trạng thái giao hàng NB» (bỏ Mã Tracking / Lên vận hành). */
function sumKeyMatchTrangThaiNb(histogram, pred) {
    const o = parseBaoCaoVanDonHistogram(histogram);
    let s = 0;
    for (const [k, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (isGiaoHangHistogramSyntheticKey(k)) continue;
        if (pred(k)) s += n;
    }
    return s;
}

const normalizeCheckLabel = (value) =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

/** «Treo»: không dùng includes('treo') — nhãn «Không treo» chuẩn hóa vẫn chứa "treo" → đếm thừa. */
const checkLabelIsTreoOnly = (key) => {
    const nk = normalizeCheckLabel(key);
    if (nk === 'treo') return true;
    if (/^treo(\s|[\/\-]|$)/.test(nk)) return true;
    return false;
};

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

/** Tổng số đơn ghi trong bucket «Lên vận hành» (shipping_unit khác rỗng). */
function sumLenVanHanh(delH) {
    const o = parseBaoCaoVanDonHistogram(delH);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        if (!isLenVanHanhHistogramKey(key)) continue;
        s += Number(raw) || 0;
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

/** «Kết quả check» = OK (bỏ dấu, không phân biệt hoa thường) — khớp histogram `_ket_qua_check`. */
function rowKetQuaCheckIsOk(r) {
    return sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k) === 'ok') > 0;
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
    { id: 'khongPH', label: 'Không phản hồi dưới 3N', test: (k) => /không\s*ph|ph\s*dưới\s*an/i.test(String(k)) },
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
    let treo = 0;
    let doiHang = 0;
    let huyNoiBo = 0;
    let khachHen = 0;
    let vanDonXL = 0;
    let donCoBill = 0;
    let donCoBillAmount = 0;
    let coMa = 0;
    /** Tab2 «TỔNG ĐƠN LÊN VẬN HÀNH»: đơn có đơn vị giao hàng / shipping_unit khác trống (histogram «Lên vận hành»). */
    let tongDonLenVanHanh = 0;
    /** Tổng tiền (tong_tien_vnd, fallback total_amount_vnd trên virtual row) cho đúng các đơn được tính vào coMa. */
    let coMaAmount = 0;
    let giaoTC = 0;
    let dangGiao = 0;
    let chuaGiao = 0;
    let hoan = 0;
    let huyVH = 0;
    let choCheck = 0;
    /** «Tổng đơn chưa mã» / «Doanh số đơn chưa mã»: đã lên VH, trống mã tracking, và Kết quả check = OK. */
    let chuaCoMa = 0;
    let daCkChuaDay = 0;
    /** Doanh số (chỉ tong_tien_vnd qua _ds_tong_tien_vnd) trên cùng tập đơn `chuaCoMa`. */
    let doanhSoDonChuaMa = 0;
    /** Tổng VNĐ theo jsonb tien_trang_thai_thanh_toan (reconciled_vnd theo trạng thái TT) — cột BC VH "Tổng thanh toán giao hàng NB". */
    let tongThanhToanGiaoHangNb = 0;

    for (const r of slice) {
        // Tổng đơn nội bộ mới: đếm trực tiếp số đơn theo bộ lọc (mỗi row = 1 đơn).
        tongNoiBo += 1;

        const maTrackingCount = sumMaTracking(r._trang_thai_giao_hang);
        const hasMaTracking = maTrackingCount > 0;
        // Orders: theo `shipping_unit` (virtual `_len_vh_don_vi`); bao_cao: histogram «Lên vận hành».
        const lenVhDonVi =
            r._source === 'orders' ? Number(r._len_vh_don_vi) || 0 : sumLenVanHanh(r._trang_thai_giao_hang);
        const chuaLenVh = lenVhDonVi <= 0;

        // Khối «TỔNG ĐƠN CHƯA LÊN VẬN HÀNH»: chỉ đơn chưa có ĐVVC (chưa lên VH) — tránh cộng thừa đơn đã có shipping_unit.
        if (chuaLenVh) {
            treo += sumKeyMatchTrangThaiNb(r._trang_thai_giao_hang, (k) => checkLabelIsTreoOnly(k));
            doiHang += sumKeyMatch(
                r._ket_qua_check,
                (k) => normalizeCheckLabel(k).includes('doi hang')
            );
            huyNoiBo += sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('huy'));
            khachHen += sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('khach hen'));
            vanDonXL += sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('van don xl'));
            if (
                sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k) === 'ok') > 0 &&
                !hasMaTracking
            ) {
                daCkChuaDay += 1;
            }
        }

        donCoBill += sumDonCoBillFullCount(r._trang_thai_thanh_toan);
        donCoBillAmount += sumDonCoBillFullAmount(r._tien_trang_thai_thanh_toan);
        mergePaymentHistogramIntoBuckets(r._trang_thai_thanh_toan, payBuckets);

        if (lenVhDonVi > 0) {
            tongDonLenVanHanh += 1;
        }

        // «Đơn có mã»: có mã tracking (orders.tracking_code / histogram «Mã Tracking»).
        if (hasMaTracking) {
            coMa += 1;
            coMaAmount += Number(r._tong_tien_vnd ?? 0) || 0;
        }
        if (lenVhDonVi > 0 && !hasMaTracking && rowKetQuaCheckIsOk(r)) {
            chuaCoMa += 1;
            doanhSoDonChuaMa += Number(r._ds_tong_tien_vnd ?? 0) || 0;
        }
        giaoTC += sumDeliveryBucket(r._trang_thai_giao_hang, 'Giao Thành Công');
        dangGiao += sumDeliveryBucket(r._trang_thai_giao_hang, 'Đang Giao');
        chuaGiao += sumDeliveryBucket(r._trang_thai_giao_hang, 'Chưa Giao');
        hoan += sumDeliveryBucket(r._trang_thai_giao_hang, 'Hoàn');
        huyVH += sumDeliveryBucket(r._trang_thai_giao_hang, 'Hủy');
        choCheck += sumDeliveryBucket(r._trang_thai_giao_hang, 'chờ check');
        tongThanhToanGiaoHangNb += sumBaoCaoVanDonHistogramValues(r._tien_trang_thai_thanh_toan);
    }

    const tyLeVHNoiBo = tongNoiBo > 0 ? (100 * tongDonLenVanHanh) / tongNoiBo : null;
    const tyLeTTTrenPhi = coMa > 0 ? (100 * donCoBill) / coMa : null;
    const tyLeTTThanhCong = giaoTC > 0 ? (100 * donCoBill) / giaoTC : null;

    return {
        tongNoiBo,
        donCoBill,
        donCoBillAmount,
        coMa,
        coMaAmount,
        tongDonLenVanHanh,
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
        tongThanhToanGiaoHangNb,
        huyNoiBo,
        doiHang,
        khachHen,
        treo,
        vanDonXL,
        daCkChuaDay,
        doanhSoDonChuaMa,
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

/** Chuẩn hóa SP/TT: chuỗi (legacy) hoặc mảng — rỗng = không lọc. */
function criteriaProductMarketSets(product, market) {
    const toSet = (v) => {
        if (Array.isArray(v)) {
            return new Set(v.map((x) => String(x).trim()).filter(Boolean));
        }
        if (v != null && v !== '') {
            const s = String(v).trim();
            return s ? new Set([s]) : new Set();
        }
        return new Set();
    };
    return { pSet: toSet(product), mSet: toSet(market) };
}

/**
 * Lọc theo khoảng ngày (Ngày lên đơn) + tùy chọn sản phẩm / thị trường (mảng hoặc chuỗi; rỗng = tất cả).
 * @param {{ startDate: string; endDate: string; product?: string|string[]; market?: string|string[] }} criteria
 */
export function filterSliceForCriteriaRow(rawData, criteria) {
    const { startDate, endDate, product, market } = criteria;
    const { pSet, mSet } = criteriaProductMarketSets(product, market);
    return rawData.filter((r) => {
        const d = (r['Ngày lên đơn'] || '').slice(0, 10);
        if (startDate && d && d < startDate) return false;
        if (endDate && d && d > endDate) return false;
        if (pSet.size > 0) {
            const p = (r['Mặt hàng'] || '').trim();
            if (!pSet.has(p)) return false;
        }
        if (mSet.size > 0) {
            const m = (r['khu vực'] || '').trim();
            if (!mSet.has(m)) return false;
        }
        return true;
    });
}

/**
 * Tab BC Vận hành: sau khi tải dữ liệu, nếu dòng để trống Sản phẩm / Thị trường thì tách thành
 * các dòng theo từng giá trị có trong rawData (theo khoảng ngày của từng dòng).
 * @param {Array<{ id: string; startDate: string; endDate: string; product: string; market: string }>} prevRows
 * @param {Array<Record<string, unknown>>} rawRows
 * @param {() => string} newRowId
 */
export function expandBcvhCriteriaRowsFromRawData(prevRows, rawRows, newRowId) {
    const sliceForCriteria = (criteria) =>
        rawRows.filter((r) => {
            const d = (r['Ngày lên đơn'] || '').slice(0, 10);
            if (criteria.startDate && d && d < criteria.startDate) return false;
            if (criteria.endDate && d && d > criteria.endDate) return false;
            return true;
        });

    let changed = false;
    const next = [];

    for (const row of prevRows) {
        const productTrim = String(row.product ?? '').trim();
        const marketTrim = String(row.market ?? '').trim();
        const emptyP = !productTrim;
        const emptyM = !marketTrim;
        const slice = sliceForCriteria(row);

        if (emptyP && emptyM) {
            const seen = new Set();
            const pairs = [];
            for (const r of slice) {
                const p = String(r['Mặt hàng'] ?? '').trim();
                const m = String(r['khu vực'] ?? '').trim();
                const k = `${p}\u0000${m}`;
                if (seen.has(k)) continue;
                seen.add(k);
                pairs.push({ p, m });
            }
            pairs.sort((a, b) => a.p.localeCompare(b.p, 'vi') || a.m.localeCompare(b.m, 'vi'));
            if (pairs.length === 0) {
                next.push(row);
            } else {
                changed = true;
                for (const { p, m } of pairs) {
                    next.push({
                        id: newRowId(),
                        startDate: row.startDate,
                        endDate: row.endDate,
                        product: p,
                        market: m
                    });
                }
            }
        } else if (emptyP && !emptyM) {
            const seen = new Set();
            const products = [];
            for (const r of slice) {
                const m = String(r['khu vực'] ?? '').trim();
                if (m !== marketTrim) continue;
                const p = String(r['Mặt hàng'] ?? '').trim();
                if (seen.has(p)) continue;
                seen.add(p);
                products.push(p);
            }
            products.sort((a, b) => a.localeCompare(b, 'vi'));
            if (products.length === 0) {
                next.push(row);
            } else {
                changed = true;
                for (const p of products) {
                    next.push({
                        id: newRowId(),
                        startDate: row.startDate,
                        endDate: row.endDate,
                        product: p,
                        market: row.market
                    });
                }
            }
        } else if (!emptyP && emptyM) {
            const seen = new Set();
            const markets = [];
            for (const r of slice) {
                const p = String(r['Mặt hàng'] ?? '').trim();
                if (p !== productTrim) continue;
                const m = String(r['khu vực'] ?? '').trim();
                if (seen.has(m)) continue;
                seen.add(m);
                markets.push(m);
            }
            markets.sort((a, b) => a.localeCompare(b, 'vi'));
            if (markets.length === 0) {
                next.push(row);
            } else {
                changed = true;
                for (const m of markets) {
                    next.push({
                        id: newRowId(),
                        startDate: row.startDate,
                        endDate: row.endDate,
                        product: row.product,
                        market: m
                    });
                }
            }
        } else {
            next.push(row);
        }
    }

    return changed ? next : prevRows;
}

function rowLenVhDonViForDrill(r) {
    return r._source === 'orders' ? Number(r._len_vh_don_vi) || 0 : sumLenVanHanh(r._trang_thai_giao_hang);
}

function rowChuaLenVhForDrill(r) {
    return rowLenVhDonViForDrill(r) <= 0;
}

function rowHasMaTrackingForDrill(r) {
    return sumMaTracking(r._trang_thai_giao_hang) > 0;
}

function rowMatchesPaymentCol(r, col) {
    const o = parseBaoCaoVanDonHistogram(r._trang_thai_thanh_toan);
    for (const [k, raw] of Object.entries(o)) {
        if (Number(raw) > 0 && col.test(k)) return true;
    }
    return false;
}

/** Tiêu đề drill-down theo `metricId` (trừ payment — dùng `bcvhDrillMetricTitle`). */
export const BCVH_DRILL_METRIC_LABELS = {
    donCoBill: 'Đã thanh toán (có bill) — Số đơn',
    donCoBillAmount: 'Đã thanh toán (có bill) — Thành tiền',
    tongNoiBo: 'TỔNG ĐƠN SALE LÊN FILE NỘI BỘ',
    tongDonLenVanHanh: 'TỔNG ĐƠN LÊN VẬN HÀNH',
    chuaCoMa: 'TỔNG ĐƠN CHƯA CÓ MÃ (đã lên VH, trống mã, Kết quả check OK)',
    giaoTC: 'Giao thành công',
    dangGiao: 'Đang giao',
    chuaGiao: 'Chưa giao',
    hoan: 'Hoàn',
    huyVH: 'Hủy vận hành',
    choCheck: 'Chờ check',
    tongThanhToanGiaoHangNb: 'Tổng thanh toán giao hàng NB',
    huyNoiBo: 'Huỷ nội bộ',
    doiHang: 'Đợi hàng',
    khachHen: 'Khách hẹn',
    treo: 'Treo',
    vanDonXL: 'Vận đơn XL',
    daCkChuaDay: 'Đơn Ok nhưng chưa có mã'
};

export function bcvhDrillMetricTitle(metricId) {
    if (metricId && String(metricId).startsWith('payment:')) {
        const pid = String(metricId).slice('payment:'.length);
        return BC_VH_PAYMENT_COLUMNS.find((c) => c.id === pid)?.label ?? metricId;
    }
    return BCVH_DRILL_METRIC_LABELS[metricId] ?? metricId;
}

/**
 * Danh sách đơn (virtual row) khớp một ô số BC Vận hành — cùng rule `aggregateOperationalReportSlice`.
 * @param {string} metricId — key metric hoặc `payment:${id}` (theo BC_VH_PAYMENT_COLUMNS)
 */
export function filterSliceByBcvhDrillMetric(slice, metricId) {
    if (!slice?.length) return [];
    switch (metricId) {
        case 'tongNoiBo':
            return [...slice];
        case 'donCoBill':
        case 'donCoBillAmount':
            return slice.filter((r) => sumDonCoBillFullCount(r._trang_thai_thanh_toan) > 0);
        case 'tongDonLenVanHanh':
            return slice.filter((r) => rowLenVhDonViForDrill(r) > 0);
        case 'chuaCoMa':
            return slice.filter(
                (r) =>
                    rowLenVhDonViForDrill(r) > 0 &&
                    !rowHasMaTrackingForDrill(r) &&
                    rowKetQuaCheckIsOk(r)
            );
        case 'giaoTC':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'Giao Thành Công') > 0);
        case 'dangGiao':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'Đang Giao') > 0);
        case 'chuaGiao':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'Chưa Giao') > 0);
        case 'hoan':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'Hoàn') > 0);
        case 'huyVH':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'Hủy') > 0);
        case 'choCheck':
            return slice.filter((r) => sumDeliveryBucket(r._trang_thai_giao_hang, 'chờ check') > 0);
        case 'tongThanhToanGiaoHangNb':
            return slice.filter((r) => sumBaoCaoVanDonHistogramValues(r._tien_trang_thai_thanh_toan) > 0);
        case 'huyNoiBo':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('huy')) > 0
            );
        case 'doiHang':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('doi hang')) > 0
            );
        case 'khachHen':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('khach hen')) > 0
            );
        case 'treo':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    sumKeyMatchTrangThaiNb(r._trang_thai_giao_hang, (k) => checkLabelIsTreoOnly(k)) > 0
            );
        case 'vanDonXL':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k).includes('van don xl')) > 0
            );
        case 'daCkChuaDay':
            return slice.filter(
                (r) =>
                    rowChuaLenVhForDrill(r) &&
                    !rowHasMaTrackingForDrill(r) &&
                    sumKeyMatch(r._ket_qua_check, (k) => normalizeCheckLabel(k) === 'ok') > 0
            );
        default: {
            if (metricId && String(metricId).startsWith('payment:')) {
                const pid = String(metricId).slice('payment:'.length);
                const col = BC_VH_PAYMENT_COLUMNS.find((c) => c.id === pid);
                if (!col) return [];
                return slice.filter((r) => rowMatchesPaymentCol(r, col));
            }
            return [];
        }
    }
}
