import { useEffect, useState } from 'react';
import { supabase } from '../supabase/config';
import { syncBaoCaoMktDayFromManualReports } from '../services/baoCaoMktDaySync';

const columns = [
    ['ngay', 'Ngày'],
    ['mkt', 'MKT'],
    ['ca', 'Ca'],
    ['sp', 'Sản phẩm'],
    ['thi_truong', 'Thị trường'],
    ['so_don', 'Số đơn'],
    ['ds', 'Doanh số'],
    ['cpqc', 'CPQC'],
    ['so_don_huy', 'Số đơn hủy'],
    ['ds_huy', 'Doanh số hủy'],
    ['so_don_ok', 'Đơn OK'],
    ['doanh_so_ok', 'Doanh số OK'],
];
const moneyColumns = new Set(['ds', 'cpqc', 'ds_huy', 'doanh_so_ok']);
const SUM_NUMERIC_KEYS = ['so_don', 'ds', 'cpqc', 'so_don_huy', 'ds_huy', 'so_don_ok', 'doanh_so_ok'];
const pageSize = 50;

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function addDaysYmd(ymd, deltaDays) {
    const [y, m, d] = String(ymd || '').split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function emptyFilterTotals() {
    return SUM_NUMERIC_KEYS.reduce((acc, k) => {
        acc[k] = 0;
        return acc;
    }, {});
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('vi-VN');
}

function formatCurrency(value) {
    return Number(value || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

function formatCell(key, value) {
    const n = Number(value) || 0;
    if (moneyColumns.has(key)) return formatCurrency(n);
    return formatNumber(n);
}

export default function BaoCaoMktDayTab({ isAdmin, personnelNames = [] }) {
    const [filters, setFilters] = useState(() => ({
        start: `${today().slice(0, 7)}-01`,
        end: today(),
        mkt: '',
        sp: '',
        thi_truong: '',
    }));
    const [applied, setApplied] = useState(filters);
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [filterTotals, setFilterTotals] = useState(emptyFilterTotals);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [selected, setSelected] = useState([]);
    const [deleting, setDeleting] = useState(false);
    const [notice, setNotice] = useState('');
    const scope = JSON.stringify(personnelNames);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setSelected([]);
            setError('');
            setRows([]);
            setCount(0);
            setFilterTotals(emptyFilterTotals());
            try {
                const names = JSON.parse(scope)
                    .map((name) => String(name || '').trim().replace(/\s+/g, ' '))
                    .filter(Boolean);
                if (!isAdmin && !names.length) return;

                const applyFilters = (query) => {
                    if (applied.start) query = query.gte('ngay', applied.start);
                    if (applied.end) query = query.lte('ngay', applied.end);
                    if (!isAdmin) query = query.in('mkt', names);
                    for (const key of ['mkt', 'sp', 'thi_truong']) {
                        if (applied[key].trim()) query = query.ilike(key, `%${applied[key].trim()}%`);
                    }
                    return query;
                };

                const selectCols = columns.map(([key]) => key).concat('id').join(',');
                const query = applyFilters(
                    supabase.from('bao_cao_mkt_day').select(selectCols, { count: 'exact' })
                );
                const result = await query
                    .order('ngay', { ascending: false })
                    .order('id')
                    .range((page - 1) * pageSize, page * pageSize - 1);
                if (result.error) throw result.error;

                const totals = emptyFilterTotals();
                for (let offset = 0; !cancelled; ) {
                    const batch = await applyFilters(
                        supabase.from('bao_cao_mkt_day').select(SUM_NUMERIC_KEYS.join(','))
                    )
                        .order('ngay', { ascending: false })
                        .order('id')
                        .range(offset, offset + 499);
                    if (batch.error) throw batch.error;
                    const values = batch.data || [];
                    if (!values.length) break;
                    for (const row of values) {
                        for (const key of SUM_NUMERIC_KEYS) {
                            totals[key] += Number(row[key]) || 0;
                        }
                    }
                    offset += values.length;
                }

                if (!cancelled) {
                    setFilterTotals(totals);
                    setRows(result.data || []);
                    setCount(result.count || 0);
                }
            } catch (err) {
                if (!cancelled) setError(`Không tải được báo cáo: ${err.message || String(err)}`);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [applied, page, isAdmin, scope]);

    async function deleteSelected() {
        if (!isAdmin || deleting || syncing || loading || !selected.length) return;
        const ids = selected.filter((id) => rows.some((row) => row.id === id));
        if (!ids.length || !window.confirm(`Xóa vĩnh viễn ${ids.length} dòng đã chọn?`)) return;
        setDeleting(true);
        setError('');
        setNotice('');
        try {
            const { data, error: deleteError } = await supabase
                .from('bao_cao_mkt_day')
                .delete()
                .in('id', ids)
                .select('id');
            if (deleteError) throw deleteError;
            const deletedCount = data?.length || 0;
            setNotice(`Đã xóa ${deletedCount}/${ids.length} dòng đã chọn.`);
            setSelected([]);
            setPage((current) =>
                Math.min(current, Math.max(1, Math.ceil((count - deletedCount) / pageSize)))
            );
            setApplied((previous) => ({ ...previous }));
        } catch (err) {
            setError(`Không xóa được báo cáo: ${err.message || String(err)}`);
        } finally {
            setDeleting(false);
        }
    }

    async function syncDay() {
        if (deleting || syncing) return;
        if (!isAdmin) return setError('Chỉ Admin mới được đồng bộ.');
        const start = String(filters.start || '').trim();
        const end = String(filters.end || start).trim();
        if (!start) return setError('Vui lòng chọn Từ ngày.');
        if (end && start > end) return setError('Từ ngày phải trước hoặc bằng Đến ngày.');
        setSyncing(true);
        setError('');
        setNotice('');
        try {
            let upserted = 0;
            let sourceRows = 0;
            let soDonTotal = 0;
            let day = start;
            let dayIndex = 0;
            while (day && day <= end) {
                dayIndex += 1;
                setNotice(`Đang đồng bộ ${day} (${dayIndex})…`);
                const result = await syncBaoCaoMktDayFromManualReports(day);
                upserted += result.upserted ?? 0;
                sourceRows += result.sourceRows ?? 0;
                soDonTotal += result.soDonTotal ?? 0;
                if (day === end) break;
                day = addDaysYmd(day, 1);
            }
            setNotice(
                `Đã đồng bộ ${dayIndex} ngày: ${soDonTotal} đơn → ${upserted} dòng (từ ${sourceRows} báo cáo tay).`
            );
            setApplied({ ...filters });
            setPage(1);
        } catch (err) {
            setError(`Đồng bộ thất bại: ${err.message || String(err)}`);
        } finally {
            setSyncing(false);
        }
    }

    const summaryCards = [
        { label: 'Tổng dòng', value: formatNumber(count), plain: true },
        { label: 'CPQC', value: formatNumber(filterTotals.cpqc) },
        { label: 'Số đơn', value: formatNumber(filterTotals.so_don) },
        { label: 'Số đơn hủy', value: formatNumber(filterTotals.so_don_huy) },
        { label: 'Đơn OK', value: formatNumber(filterTotals.so_don_ok) },
        { label: 'Doanh số', value: formatCurrency(filterTotals.ds) },
        { label: 'Doanh số hủy', value: formatCurrency(filterTotals.ds_huy) },
        {
            label: 'Doanh số sau Huỷ',
            value: formatCurrency(filterTotals.ds),
            highlight: true,
            title: 'Doanh số (ds) đã là net sau hủy khi đồng bộ từ báo cáo tay',
        },
        { label: 'Doanh số OK', value: formatCurrency(filterTotals.doanh_so_ok) },
    ];

    const dimColSpan = 5;

    return (
        <section className="p-4 bg-white" aria-label="Báo cáo MKT theo ngày">
            <h2 className="text-xl font-bold text-green-800 mb-4">BÁO CÁO MKT THEO NGÀY</h2>
            <form
                className="flex flex-wrap items-end gap-3 mb-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (deleting) return;
                    if (filters.start && filters.end && filters.start > filters.end) {
                        setError('Từ ngày phải trước hoặc bằng đến ngày.');
                        return;
                    }
                    setPage(1);
                    setApplied({ ...filters });
                }}
            >
                {[
                    ['start', 'Từ ngày'],
                    ['end', 'Đến ngày'],
                    ['mkt', 'MKT'],
                    ['sp', 'Sản phẩm'],
                    ['thi_truong', 'Thị trường'],
                ].map(([key, label]) => (
                    <label key={key} className="text-sm text-gray-700">
                        <span className="block mb-1">{label}</span>
                        <input
                            type={key === 'start' || key === 'end' ? 'date' : 'text'}
                            value={filters[key]}
                            onChange={(event) =>
                                setFilters((previous) => ({ ...previous, [key]: event.target.value }))
                            }
                            className="border border-gray-300 rounded px-3 py-2"
                        />
                    </label>
                ))}
                <button type="submit" className="bg-green-700 text-white rounded px-4 py-2">
                    Lọc / Tải lại
                </button>
                <button
                    type="button"
                    onClick={syncDay}
                    disabled={deleting || syncing || !isAdmin}
                    className="bg-indigo-700 text-white rounded px-4 py-2 disabled:opacity-50"
                    title="Ghi bao_cao_mkt_day từ báo cáo tay theo Từ/Đến ngày"
                >
                    {syncing ? 'Đang đồng bộ…' : 'Đồng bộ dữ liệu'}
                </button>
                {isAdmin && (
                    <button
                        type="button"
                        onClick={deleteSelected}
                        disabled={deleting || syncing || loading || !selected.length}
                        className="bg-red-700 text-white rounded px-4 py-2 disabled:opacity-50"
                    >
                        {deleting ? 'Đang xóa…' : `Xóa đã chọn (${selected.length})`}
                    </button>
                )}
            </form>

            <div
                className="flex flex-wrap gap-3 mb-4"
                role="status"
                aria-label="Tổng hợp theo bộ lọc"
                aria-live="polite"
            >
                {summaryCards.map((item) => (
                    <div
                        key={item.label}
                        title={item.title || undefined}
                        className={`rounded-lg border px-4 py-3 min-w-[9rem] ${
                            item.highlight
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-green-200 bg-green-50'
                        }`}
                    >
                        <div className="text-sm text-gray-600">{item.label}</div>
                        <div
                            className={`text-xl font-bold ${
                                item.highlight ? 'text-emerald-900' : 'text-green-800'
                            }`}
                        >
                            {loading ? '…' : item.value}
                        </div>
                    </div>
                ))}
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 min-w-[9rem]">
                    <div className="text-sm text-gray-600">Dòng trên trang</div>
                    <div className="text-xl font-bold text-slate-800">
                        {loading ? '…' : formatNumber(rows.length)}
                    </div>
                </div>
            </div>

            {notice && (
                <p role="status" className="text-green-800 mb-3">
                    {notice}
                </p>
            )}
            {error && (
                <p role="alert" className="text-red-700 mb-3">
                    {error}
                </p>
            )}

            <div className="overflow-x-auto border rounded" aria-busy={loading}>
                <table className="min-w-full text-sm whitespace-nowrap">
                    <thead className="bg-green-700 text-white">
                        <tr>
                            {isAdmin && (
                                <th className="px-3 py-3">
                                    <input
                                        type="checkbox"
                                        aria-label="Chọn tất cả dòng trên trang này"
                                        disabled={loading || deleting || syncing || !rows.length}
                                        checked={
                                            rows.length > 0 &&
                                            rows.every((row) => selected.includes(row.id))
                                        }
                                        ref={(node) => {
                                            if (node) {
                                                node.indeterminate =
                                                    selected.length > 0 && selected.length < rows.length;
                                            }
                                        }}
                                        onChange={(event) =>
                                            setSelected(
                                                event.target.checked ? rows.map((row) => row.id) : []
                                            )
                                        }
                                    />
                                </th>
                            )}
                            {columns.map(([key, label]) => (
                                <th key={key} className="px-3 py-3 text-left">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length + (isAdmin ? 1 : 0)} className="p-6 text-center">
                                    Đang tải dữ liệu…
                                </td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (isAdmin ? 1 : 0)} className="p-6 text-center">
                                    {error ? 'Vui lòng thử tải lại.' : 'Không có báo cáo trong phạm vi đã chọn.'}
                                </td>
                            </tr>
                        ) : (
                            <>
                                <tr className="bg-amber-50 border-b-2 border-amber-200 font-semibold">
                                    {isAdmin && <td />}
                                    <td colSpan={dimColSpan} className="px-3 py-2 text-amber-900">
                                        TỔNG CỘNG (toàn bộ bộ lọc)
                                    </td>
                                    {SUM_NUMERIC_KEYS.map((key) => (
                                        <td key={key} className="px-3 py-2 text-right text-amber-900">
                                            {formatCell(key, filterTotals[key])}
                                        </td>
                                    ))}
                                </tr>
                                {rows.map((row) => (
                                    <tr key={row.id} className="border-t hover:bg-green-50">
                                        {isAdmin && (
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Chọn báo cáo ${row.mkt || ''} ngày ${row.ngay}`}
                                                    disabled={deleting || syncing}
                                                    checked={selected.includes(row.id)}
                                                    onChange={(event) =>
                                                        setSelected((previous) =>
                                                            event.target.checked
                                                                ? [...previous, row.id]
                                                                : previous.filter((id) => id !== row.id)
                                                        )
                                                    }
                                                />
                                            </td>
                                        )}
                                        {columns.map(([key], index) => (
                                            <td
                                                key={key}
                                                className={`px-3 py-2 ${index >= 5 ? 'text-right' : ''}`}
                                            >
                                                {key === 'ngay'
                                                    ? String(row[key] || '').split('-').reverse().join('/')
                                                    : index >= 5
                                                      ? formatCell(key, row[key])
                                                      : row[key] || '—'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>
            <div className="flex items-center justify-between gap-3 mt-4 text-sm">
                <span>
                    {count.toLocaleString('vi-VN')} dòng · Trang {page}/
                    {Math.max(1, Math.ceil(count / pageSize))}
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={deleting || loading || page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="border rounded px-3 py-2 disabled:opacity-40"
                    >
                        Trước
                    </button>
                    <button
                        type="button"
                        disabled={deleting || loading || page * pageSize >= count}
                        onClick={() => setPage((p) => p + 1)}
                        className="border rounded px-3 py-2 disabled:opacity-40"
                    >
                        Sau
                    </button>
                </div>
            </div>
        </section>
    );
}
