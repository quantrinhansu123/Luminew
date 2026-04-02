import {
    isGiaoHangHistogramSyntheticKey,
    parseBaoCaoVanDonHistogram,
    sumBaoCaoVanDonHistogramValues
} from './baoCaoVanDonFormat';
import { aggregateVanHanhSlice, sumHistogramKeyMatch } from './baoCaoVanDonMarketMatrix';

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** yyyy-mm-dd -> dd/mm/yyyy */
export function isoToViDisplay(iso) {
    if (!iso || typeof iso !== 'string') return '';
    const p = iso.slice(0, 10).split('-');
    if (p.length !== 3) return iso;
    return `${p[2]}/${p[1]}/${p[0]}`;
}

export function enumerateIsoDatesInclusive(startIso, endIso) {
    const out = [];
    if (!startIso || !endIso) return out;
    const a = new Date(`${startIso.slice(0, 10)}T12:00:00`);
    const b = new Date(`${endIso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return out;
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
        const y = d.getFullYear();
        const m = pad2(d.getMonth() + 1);
        const day = pad2(d.getDate());
        out.push(`${y}-${m}-${day}`);
    }
    return out;
}

function rowMarket(r) {
    return (r['khu vực'] || '').trim() || 'Không xác định';
}

function rowProduct(r) {
    return (r['Mặt hàng'] || '').trim() || 'Không xác định';
}

function sumMaTrackingRow(r) {
    const o = parseBaoCaoVanDonHistogram(r._trang_thai_giao_hang);
    let s = 0;
    for (const [key, raw] of Object.entries(o)) {
        const nk = String(key).trim().toLowerCase().replace(/\s+/g, ' ');
        if (nk === 'mã tracking') s += Number(raw) || 0;
    }
    return s;
}

/**
 * Tab 4: đẩy đơn theo ngày — đếm "Mã tracking" theo ngày + thị trường + sản phẩm.
 */
export function buildPushDonByDayMatrix(rows, startIso, endIso) {
    const dates = enumerateIsoDatesInclusive(startIso, endIso);
    const dateSet = new Set(dates);
    /** @type {Map<string, { market: string; product: string; byDate: Record<string, number>; total: number }>} */
    const map = new Map();
    for (const r of rows) {
        const day = (r['Ngày lên đơn'] || '').slice(0, 10);
        if (!dateSet.has(day)) continue;
        const n = sumMaTrackingRow(r);
        if (n <= 0) continue;
        const key = `${rowMarket(r)}\t${rowProduct(r)}`;
        if (!map.has(key)) {
            map.set(key, { market: rowMarket(r), product: rowProduct(r), byDate: {}, total: 0 });
        }
        const e = map.get(key);
        e.byDate[day] = (e.byDate[day] || 0) + n;
        e.total += n;
    }
    const list = [...map.values()].sort((a, b) => {
        const c = a.market.localeCompare(b.market, 'vi');
        return c !== 0 ? c : a.product.localeCompare(b.product, 'vi');
    });
    const colTotals = {};
    for (const d of dates) colTotals[d] = 0;
    let grand = 0;
    for (const e of list) {
        grand += e.total;
        for (const d of dates) {
            colTotals[d] += e.byDate[d] || 0;
        }
    }
    return { dates, rows: list, colTotals, grandTotal: grand };
}

/** Ngày theo Asia/Ho_Chi_Minh (khớp báo cáo Từ/Đến ngày trong nước). */
function ffmLogDayKey(r) {
    const raw =
        r?.pushed_at ??
        r?.created_at ??
        r?.inserted_at ??
        r?.updated_at ??
        r?.push_date;
    if (raw == null || raw === '') return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    try {
        return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

function ffmLogMarket(r) {
    return String(r?.country ?? r?.['Khu vực'] ?? r?.market ?? '').trim() || 'Không xác định';
}

function ffmLogProduct(r) {
    return String(r?.product ?? r?.['Mặt hàng'] ?? '').trim() || 'Không xác định';
}

function ffmLogOrderDedupeKey(r) {
    const oc = r?.order_code != null ? String(r.order_code).trim() : '';
    if (oc) return `oc:${oc}`;
    const id = r?.id;
    if (id != null && id !== '') return `id:${id}`;
    return `row:${JSON.stringify([ffmLogDayKey(r), ffmLogMarket(r), ffmLogProduct(r), r?.batch_id])}`;
}

/**
 * Tab 4 (nguồn ffm_push_logs): số đơn theo từng ngày + thị trường + sản phẩm.
 * Cùng một order_code trong cùng ngày (cùng ô) chỉ tính 1 đơn; nhiều lần đẩy log không cộng dồn.
 */
export function buildPushDonByDayMatrixFromFfmLogs(rows, startIso, endIso) {
    const dates = enumerateIsoDatesInclusive(startIso, endIso);
    const dateSet = new Set(dates);
    /** @type {Map<string, { market: string; product: string; byDate: Record<string, Set<string>> }>} */
    const map = new Map();

    for (const r of rows || []) {
        const day = ffmLogDayKey(r);
        if (!dateSet.has(day)) continue;
        const key = `${ffmLogMarket(r)}\t${ffmLogProduct(r)}`;
        if (!map.has(key)) {
            map.set(key, { market: ffmLogMarket(r), product: ffmLogProduct(r), byDate: {} });
        }
        const e = map.get(key);
        if (!e.byDate[day]) e.byDate[day] = new Set();
        e.byDate[day].add(ffmLogOrderDedupeKey(r));
    }

    const list = [...map.values()]
        .map((e) => {
            const byDateNum = {};
            let total = 0;
            for (const d of dates) {
                const n = e.byDate[d] ? e.byDate[d].size : 0;
                byDateNum[d] = n;
                total += n;
            }
            return { market: e.market, product: e.product, byDate: byDateNum, total };
        })
        .sort((a, b) => {
            const c = a.market.localeCompare(b.market, 'vi');
            return c !== 0 ? c : a.product.localeCompare(b.product, 'vi');
        });

    const colTotals = {};
    for (const d of dates) colTotals[d] = 0;
    let grand = 0;
    for (const e of list) {
        grand += e.total;
        for (const d of dates) {
            colTotals[d] += e.byDate[d] || 0;
        }
    }
    return { dates, rows: list, colTotals, grandTotal: grand };
}

function sumHuyGiaoRow(r) {
    let s = 0;
    const o = parseBaoCaoVanDonHistogram(r._trang_thai_giao_hang);
    for (const [key, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (isGiaoHangHistogramSyntheticKey(key)) continue;
        const nk = String(key).trim().toLowerCase();
        if (nk.includes('huỷ') || nk.includes('hủy') || nk.includes('cancel')) s += n;
    }
    return s;
}

function sumHuyGiao(slice) {
    let s = 0;
    for (const r of slice) s += sumHuyGiaoRow(r);
    return s;
}

function sumKhachHenRow(r) {
    let s = 0;
    const o = parseBaoCaoVanDonHistogram(r._ket_qua_check);
    for (const [k, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (/hẹn|hen/i.test(String(k))) s += n;
    }
    return s;
}

function sumKhachHen(slice) {
    let s = 0;
    for (const r of slice) s += sumKhachHenRow(r);
    return s;
}

function sumVanDonXlRow(r) {
    let s = 0;
    const o = parseBaoCaoVanDonHistogram(r._ket_qua_check);
    for (const [k, raw] of Object.entries(o)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        if (/\bxl\b/i.test(String(k)) || /vận đơn\s*xl/i.test(String(k))) s += n;
    }
    return s;
}

function sumVanDonXl(slice) {
    let s = 0;
    for (const r of slice) s += sumVanDonXlRow(r);
    return s;
}

/** Tiền cho cột DS tab 5 — chỉ `tong_tien_vnd` trên virtual row (`_ds_tong_tien_vnd`). */
function orderAmountVnd(r) {
    return Number(r._ds_tong_tien_vnd ?? 0) || 0;
}

/** Doanh số (VNĐ) theo cùng điều kiện ô SL tab 5 — mỗi đơn cộng một lần nếu ô đó > 0. */
function aggregateTrangThaiDonMoneySlice(slice) {
    let dsTongLenDon = 0;
    let dsOk = 0;
    let dsTreo = 0;
    let dsDoiHang = 0;
    let dsHuyCheck = 0;
    let dsKhachHen = 0;
    let dsVanDonXL = 0;
    let dsHuyGiao = 0;
    for (const r of slice) {
        const amt = orderAmountVnd(r);
        if (sumBaoCaoVanDonHistogramValues(r._ket_qua_check) > 0) dsTongLenDon += amt;
        if (sumHistogramKeyMatch(r._ket_qua_check, (k) => String(k).trim().toLowerCase() === 'ok') > 0)
            dsOk += amt;
        if (sumHistogramKeyMatch(r._ket_qua_check, (k) => /treo/i.test(String(k))) > 0) dsTreo += amt;
        if (
            sumHistogramKeyMatch(
                r._ket_qua_check,
                (k) => /đợi|doi/i.test(String(k)) && /hàng|hang/i.test(String(k))
            ) > 0
        )
            dsDoiHang += amt;
        if (sumHistogramKeyMatch(r._ket_qua_check, (k) => /huỷ|hủy|cancel/i.test(String(k))) > 0)
            dsHuyCheck += amt;
        if (sumKhachHenRow(r) > 0) dsKhachHen += amt;
        if (sumVanDonXlRow(r) > 0) dsVanDonXL += amt;
        if (sumHuyGiaoRow(r) > 0) dsHuyGiao += amt;
    }
    return { dsTongLenDon, dsOk, dsTreo, dsDoiHang, dsHuyCheck, dsKhachHen, dsVanDonXL, dsHuyGiao };
}

/**
 * Tab 5: mỗi ngày trong khoảng Từ/Đến + dòng «Tổng» = cộng SL/DS các ngày; % = trung bình các ngày có tỷ lệ.
 */
export function buildTrangThaiDonByDay(rows, startIso, endIso) {
    const dates = enumerateIsoDatesInclusive(startIso, endIso);
    const dayRows = dates.map((d) => {
        const slice = rows.filter((r) => (r['Ngày lên đơn'] || '').slice(0, 10) === d);
        const m = aggregateVanHanhSlice(slice);
        const money = aggregateTrangThaiDonMoneySlice(slice);
        return {
            dateIso: d,
            label: isoToViDisplay(d),
            ...m,
            ...money,
            huyGiao: sumHuyGiao(slice),
            khachHen: sumKhachHen(slice),
            vanDonXL: sumVanDonXl(slice),
            okChuaDay: Math.max(0, m.ok - m.coMa),
            pctDayOk: m.ok > 0 ? m.coMa / m.ok : null
        };
    });

    const sumK = (key) => dayRows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
    const pctOkVals = dayRows.map((r) => r.pctDayOk).filter((x) => x != null);
    const pctDayOkAvg =
        pctOkVals.length > 0 ? pctOkVals.reduce((a, b) => a + b, 0) / pctOkVals.length : null;
    const huyRatios = dayRows
        .filter((r) => (Number(r.tongLenDon) || 0) > 0)
        .map((r) => (Number(r.huyCheck) || 0) / (Number(r.tongLenDon) || 0));
    const avgPctHuyVsTong =
        huyRatios.length > 0 ? huyRatios.reduce((a, b) => a + b, 0) / huyRatios.length : null;

    const monthRow = {
        label: 'Tổng',
        coMa: sumK('coMa'),
        okChuaDay: sumK('okChuaDay'),
        pctDayOk: pctDayOkAvg,
        tongLenDon: sumK('tongLenDon'),
        dsTongLenDon: sumK('dsTongLenDon'),
        ok: sumK('ok'),
        dsOk: sumK('dsOk'),
        treo: sumK('treo'),
        dsTreo: sumK('dsTreo'),
        doiHang: sumK('doiHang'),
        dsDoiHang: sumK('dsDoiHang'),
        khachHen: sumK('khachHen'),
        dsKhachHen: sumK('dsKhachHen'),
        vanDonXL: sumK('vanDonXL'),
        dsVanDonXL: sumK('dsVanDonXL'),
        huyCheck: sumK('huyCheck'),
        dsHuyCheck: sumK('dsHuyCheck'),
        huyGiao: sumK('huyGiao'),
        dsHuyGiao: sumK('dsHuyGiao'),
        avgPctHuyVsTong
    };

    return { monthRow, dayRows };
}
