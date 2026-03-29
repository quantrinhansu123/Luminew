import { parseBaoCaoVanDonHistogram } from './baoCaoVanDonFormat';
import { aggregateVanHanhSlice } from './baoCaoVanDonMarketMatrix';

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

function monthStartIso(endIso) {
    const p = endIso.slice(0, 10).split('-');
    if (p.length !== 3) return endIso;
    return `${p[0]}-${p[1]}-01`;
}

function sumHuyGiao(slice) {
    let s = 0;
    for (const r of slice) {
        const o = parseBaoCaoVanDonHistogram(r._trang_thai_giao_hang);
        for (const [key, raw] of Object.entries(o)) {
            const n = Number(raw) || 0;
            if (n <= 0) continue;
            const nk = String(key).trim().toLowerCase();
            if (nk.includes('mã tracking')) continue;
            if (nk.includes('huỷ') || nk.includes('hủy') || nk.includes('cancel')) s += n;
        }
    }
    return s;
}

function sumKhachHen(slice) {
    let s = 0;
    for (const r of slice) {
        const o = parseBaoCaoVanDonHistogram(r._ket_qua_check);
        for (const [k, raw] of Object.entries(o)) {
            const n = Number(raw) || 0;
            if (n <= 0) continue;
            if (/hẹn|hen/i.test(String(k))) s += n;
        }
    }
    return s;
}

function sumVanDonXl(slice) {
    let s = 0;
    for (const r of slice) {
        const o = parseBaoCaoVanDonHistogram(r._ket_qua_check);
        for (const [k, raw] of Object.entries(o)) {
            const n = Number(raw) || 0;
            if (n <= 0) continue;
            if (/\bxl\b/i.test(String(k)) || /vận đơn\s*xl/i.test(String(k))) s += n;
        }
    }
    return s;
}

/**
 * Tab 5: theo từng ngày trong khoảng + dòng lũy kế từ đầu tháng (đến ngày cuối lọc).
 */
export function buildTrangThaiDonByDay(rows, startIso, endIso) {
    const dates = enumerateIsoDatesInclusive(startIso, endIso);
    const ms = monthStartIso(endIso);
    const monthRows = rows.filter((r) => {
        const d = (r['Ngày lên đơn'] || '').slice(0, 10);
        return d >= ms && d <= endIso.slice(0, 10);
    });
    const base = aggregateVanHanhSlice(monthRows);
    const monthRow = {
        label: 'Từ đầu tháng',
        ...base,
        huyGiao: sumHuyGiao(monthRows),
        khachHen: sumKhachHen(monthRows),
        vanDonXL: sumVanDonXl(monthRows),
        okChuaDay: Math.max(0, base.ok - base.coMa),
        pctDayOk: base.ok > 0 ? base.coMa / base.ok : null
    };

    const dayRows = dates.map((d) => {
        const slice = rows.filter((r) => (r['Ngày lên đơn'] || '').slice(0, 10) === d);
        const m = aggregateVanHanhSlice(slice);
        return {
            dateIso: d,
            label: isoToViDisplay(d),
            ...m,
            huyGiao: sumHuyGiao(slice),
            khachHen: sumKhachHen(slice),
            vanDonXL: sumVanDonXl(slice),
            okChuaDay: Math.max(0, m.ok - m.coMa),
            pctDayOk: m.ok > 0 ? m.coMa / m.ok : null
        };
    });

    return { monthRow, dayRows };
}
