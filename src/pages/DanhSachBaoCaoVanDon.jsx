import { useEffect, useMemo, useState } from 'react';
import { Calendar, RefreshCw, Package } from 'lucide-react';
import { toast } from 'react-toastify';
import { supabase } from '../supabase/config';
import MultiSelect from '../components/MultiSelect';
import {
  SQL_ADD_BAO_CAO_VAN_DON_TIEN_COLUMN,
  syncBaoCaoVanDonFromOrders,
} from '../services/baoCaoVanDonSyncFromOrders';
import {
  formatBaoCaoVanDonPaymentStatusWithMoney,
  parseBaoCaoVanDonHistogram,
  formatBaoCaoVanDonStatusHistogram,
  sumBaoCaoVanDonHistogramValues,
} from '../utils/baoCaoVanDonFormat';

const formatDate = (dateValue) => {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return dateValue;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatDateTime = (dateValue) => {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleString('vi-VN', { hour12: false });
};

/** Thứ tự cột chuẩn bảng bao_cao_van_don; cột thêm từ DB được nối sau, sắp alphabet. */
const BAO_CAO_VAN_DON_COLUMN_ORDER = [
  'id',
  'ngay',
  'nhan_vien',
  'san_pham',
  'thi_truong',
  'ket_qua_check',
  'trang_thai_giao_hang',
  'trang_thai_thanh_toan',
  'created_at',
  'updated_at',
];

const COLUMN_LABEL = {
  id: 'ID',
  ngay: 'Ngày',
  nhan_vien: 'Nhân viên',
  san_pham: 'Sản phẩm',
  thi_truong: 'Thị trường',
  ket_qua_check: 'Kết quả check',
  trang_thai_giao_hang: 'Trạng thái giao hàng',
  trang_thai_thanh_toan: 'Trạng thái thanh toán',
  created_at: 'Tạo lúc',
  updated_at: 'Cập nhật lúc',
};

const HISTOGRAM_KEYS = new Set(['ket_qua_check', 'trang_thai_giao_hang']);

/** Cột DB vẫn select * nhưng không render cột riêng (đã gộp vào trang_thai_thanh_toan). */
const TABLE_COLUMNS_EXCLUDE = new Set(['tien_trang_thai_thanh_toan']);

function labelForColumn(key) {
  return COLUMN_LABEL[key] || key;
}

function formatCell(columnKey, value) {
  if (value === null || value === undefined) return '—';
  if (HISTOGRAM_KEYS.has(columnKey)) {
    return formatBaoCaoVanDonStatusHistogram(value);
  }
  if (columnKey === 'ngay') return formatDate(value);
  if (columnKey === 'created_at' || columnKey === 'updated_at') {
    return formatDateTime(value);
  }
  if (columnKey === 'id') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function useTableColumns(rows) {
  return useMemo(() => {
    const found = new Set();
    for (const row of rows || []) {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach((k) => found.add(k));
      }
    }
    const rest = [...found]
      .filter((k) => !BAO_CAO_VAN_DON_COLUMN_ORDER.includes(k) && !TABLE_COLUMNS_EXCLUDE.has(k))
      .sort((a, b) => a.localeCompare(b, 'vi'));
    return [
      ...BAO_CAO_VAN_DON_COLUMN_ORDER.filter((k) => found.has(k) && !TABLE_COLUMNS_EXCLUDE.has(k)),
      ...rest,
    ];
  }, [rows]);
}

function isVanDonSyncAdmin() {
  const userRole = localStorage.getItem('userRole') || '';
  const r = userRole.toLowerCase();
  return (
    r === 'admin' ||
    r === 'super_admin' ||
    r === 'administrator' ||
    userRole === 'ADMIN' ||
    userRole === 'SUPER_ADMIN' ||
    userRole === 'ADMINISTRATOR'
  );
}

export default function DanhSachBaoCaoVanDon() {
  const [loading, setLoading] = useState(true);
  const [baseData, setBaseData] = useState([]);

  const [filterStartDate, setFilterStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [filterMarkets, setFilterMarkets] = useState([]);
  const [filterProducts, setFilterProducts] = useState([]);
  const [filterKetQuaCheck, setFilterKetQuaCheck] = useState([]);
  const [filterTrangThaiGiaoHangNb, setFilterTrangThaiGiaoHangNb] = useState([]);
  const [filterTrangThaiThanhToan, setFilterTrangThaiThanhToan] = useState([]);
  const [filterNhanVienVanDon, setFilterNhanVienVanDon] = useState([]);

  const [syncStartDate, setSyncStartDate] = useState(() => filterStartDate);
  const [syncEndDate, setSyncEndDate] = useState(() => filterEndDate);
  const [syncLoading, setSyncLoading] = useState(false);
  const [canRunSync, setCanRunSync] = useState(false);

  useEffect(() => {
    setCanRunSync(isVanDonSyncAdmin());
  }, []);

  useEffect(() => {
    setSyncStartDate(filterStartDate);
    setSyncEndDate(filterEndDate);
  }, [filterStartDate, filterEndDate]);

  const loadBaseData = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('bao_cao_van_don')
        .select('*')
        .order('ngay', { ascending: false })
        .order('updated_at', { ascending: false });

      if (filterStartDate) query = query.gte('ngay', filterStartDate);
      if (filterEndDate) query = query.lte('ngay', filterEndDate);

      if (filterMarkets?.length) query = query.in('thi_truong', filterMarkets);
      if (filterProducts?.length) query = query.in('san_pham', filterProducts);
      if (filterNhanVienVanDon?.length) query = query.in('nhan_vien', filterNhanVienVanDon);

      const { data: result, error } = await query;

      if (error) {
        console.error('Error loading bao_cao_van_don:', error);
        toast.error('Lỗi khi tải dữ liệu: ' + error.message);
        return;
      }

      setBaseData(result || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterStartDate && filterEndDate && filterStartDate > filterEndDate) {
      toast.warn('Từ ngày phải <= đến ngày.');
      return;
    }
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStartDate, filterEndDate, filterMarkets, filterProducts, filterNhanVienVanDon]);

  const handleRefresh = () => {
    loadBaseData();
  };

  const matchesAnyHistogramKey = (hist, selectedKeys) => {
    if (!selectedKeys?.length) return true;
    const o = parseBaoCaoVanDonHistogram(hist);
    for (const k of selectedKeys) {
      if (Number(o[k]) > 0) return true;
    }
    return false;
  };

  const data = useMemo(() => {
    return baseData.filter((row) => {
      if (!matchesAnyHistogramKey(row.ket_qua_check, filterKetQuaCheck)) return false;
      if (!matchesAnyHistogramKey(row.trang_thai_giao_hang, filterTrangThaiGiaoHangNb)) return false;
      if (!matchesAnyHistogramKey(row.trang_thai_thanh_toan, filterTrangThaiThanhToan)) return false;
      return true;
    });
  }, [baseData, filterKetQuaCheck, filterTrangThaiGiaoHangNb, filterTrangThaiThanhToan]);

  const counters = useMemo(() => {
    let totalRows = data.length;
    let totalDonKetQuaCheck = 0;
    let totalDonGiaoHangNb = 0;
    let totalDonThanhToan = 0;
    let totalTienThanhToan = 0;

    for (const row of data) {
      totalDonKetQuaCheck += sumBaoCaoVanDonHistogramValues(row.ket_qua_check);
      totalDonGiaoHangNb += sumBaoCaoVanDonHistogramValues(row.trang_thai_giao_hang);
      totalDonThanhToan += sumBaoCaoVanDonHistogramValues(row.trang_thai_thanh_toan);
      totalTienThanhToan += sumBaoCaoVanDonHistogramValues(row.tien_trang_thai_thanh_toan);
    }

    return {
      totalRows,
      totalDonKetQuaCheck,
      totalDonGiaoHangNb,
      totalDonThanhToan,
      totalTienThanhToan,
    };
  }, [data]);

  const marketOptions = useMemo(() => {
    return [...new Set(baseData.map((r) => r?.thi_truong).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [baseData]);

  const productOptions = useMemo(() => {
    return [...new Set(baseData.map((r) => r?.san_pham).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [baseData]);

  const nhanVienVanDonOptions = useMemo(() => {
    return [...new Set(baseData.map((r) => r?.nhan_vien).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [baseData]);

  const histogramKeyOptions = (histograms, getHist) => {
    const set = new Set();
    for (const row of histograms) {
      const o = parseBaoCaoVanDonHistogram(getHist(row));
      for (const [k, raw] of Object.entries(o)) {
        if (k && Number(raw) > 0) set.add(k);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  };

  const ketQuaCheckOptions = useMemo(
    () => histogramKeyOptions(baseData, (r) => r.ket_qua_check),
    [baseData]
  );
  const trangThaiGiaoHangNbOptions = useMemo(
    () => histogramKeyOptions(baseData, (r) => r.trang_thai_giao_hang),
    [baseData]
  );
  const trangThaiThanhToanOptions = useMemo(
    () => histogramKeyOptions(baseData, (r) => r.trang_thai_thanh_toan),
    [baseData]
  );

  const tableColumns = useTableColumns(data);

  const handleSyncBaoCaoVanDon = async () => {
    if (syncLoading) return;

    const ok = window.confirm(
      'Đồng bộ bảng bao_cao_van_don từ orders (theo Từ ngày / Đến ngày bên dưới).\n\n' +
        'Key: ngay + nhan_vien + san_pham + thi_truong khớp order_date + delivery_staff + product + country.\n' +
        'Chưa có dòng thì insert; có rồi thì update.\n' +
        'Cột trang_thai_giao_hang, ket_qua_check, trang_thai_thanh_toan (jsonb): mỗi cột là object { "Giá trị": số đơn } trong nhóm key.\n' +
        'Nguồn đếm: delivery_status, check_result, payment_status_detail (nếu trống thì payment_status). Gồm cả đơn order_date trống nhưng created_at trong khoảng.\n\n' +
        'Chạy?'
    );
    if (!ok) return;

    const normStart = String(syncStartDate || '').trim();
    const normEnd = String(syncEndDate || '').trim();
    if (!normStart || !normEnd) {
      toast.warn('Vui lòng nhập đầy đủ Từ ngày và Đến ngày.');
      return;
    }
    if (normStart > normEnd) {
      toast.warn('Từ ngày phải <= đến ngày.');
      return;
    }

    try {
      setSyncLoading(true);
      toast.info('Đang đồng bộ bao_cao_van_don...', { autoClose: false });

      const vd = await syncBaoCaoVanDonFromOrders({
        startDate: normStart,
        endDate: normEnd,
      });

      toast.dismiss();
      const vdN = vd?.upserted ?? 0;
      const vdUp = vd?.updatedExisting ?? 0;
      const vdCr = vd?.createdMissing ?? 0;
      const vdDel = vd?.deletedObsolete ?? 0;
      toast.success(`bao_cao_van_don: ${vdN} thao tác (cập nhật ${vdUp}, tạo mới ${vdCr}, xóa cũ ${vdDel}).`);
      if (vd?.tienColumnSkippedInSync) {
        toast.warn(
          `Thiếu cột tien_trang_thai_thanh_toan trên Supabase — cột tiền chưa được lưu. Chạy SQL (SQL Editor): ${SQL_ADD_BAO_CAO_VAN_DON_TIEN_COLUMN}`,
          { autoClose: 25000 }
        );
      }
      await loadBaseData();
    } catch (error) {
      console.error('sync bao_cao_van_don error:', error);
      toast.dismiss();
      const msg = error?.message || String(error);
      const fetchHint = /failed to fetch/i.test(msg)
        ? ' Kiểm tra: mạng/VPN, .env Supabase, bảng bao_cao_van_don đã migration.'
        : '';
      toast.error('Lỗi đồng bộ bao_cao_van_don: ' + msg + fetchHint, { autoClose: 12000 });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-none w-full mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Dữ liệu báo cáo vận đơn hàng ngày</h1>
              <p className="text-sm text-gray-500 mt-1">
                Bảng <span className="font-mono">bao_cao_van_don</span> — histogram trạng thái theo nhóm ngày / nhân viên / SP / thị trường.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-gray-700 font-medium">
                <Calendar className="w-5 h-5" />
                Từ ngày:
              </label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-gray-700 font-medium ml-2">
                <Calendar className="w-5 h-5" />
                Đến ngày:
              </label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Thị trường"
                  placeholder="Tất cả"
                  options={marketOptions}
                  selected={filterMarkets}
                  onChange={setFilterMarkets}
                  mainFilter
                />
              </div>
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Sản phẩm"
                  placeholder="Tất cả"
                  options={productOptions}
                  selected={filterProducts}
                  onChange={setFilterProducts}
                  mainFilter
                />
              </div>
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Kết quả check"
                  placeholder="Tất cả"
                  options={ketQuaCheckOptions}
                  selected={filterKetQuaCheck}
                  onChange={setFilterKetQuaCheck}
                  mainFilter
                />
              </div>
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Trạng thái giao hàng NB"
                  placeholder="Tất cả"
                  options={trangThaiGiaoHangNbOptions}
                  selected={filterTrangThaiGiaoHangNb}
                  onChange={setFilterTrangThaiGiaoHangNb}
                  mainFilter
                />
              </div>
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Trạng thái thanh toán"
                  placeholder="Tất cả"
                  options={trangThaiThanhToanOptions}
                  selected={filterTrangThaiThanhToan}
                  onChange={setFilterTrangThaiThanhToan}
                  mainFilter
                />
              </div>
              <div className="min-w-[220px]">
                <MultiSelect
                  label="Nhân viên vận đơn"
                  placeholder="Tất cả"
                  options={nhanVienVanDonOptions}
                  selected={filterNhanVienVanDon}
                  onChange={setFilterNhanVienVanDon}
                  mainFilter
                />
              </div>
            </div>

            {!loading && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="text-sm font-semibold text-gray-800 mb-2">Bộ đếm theo bộ lọc</div>
                <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Tổng bản ghi:</span> {counters.totalRows}
                  </div>
                  <div>
                    <span className="font-medium">Tổng đơn (Kết quả check):</span> {counters.totalDonKetQuaCheck}
                  </div>
                  <div>
                    <span className="font-medium">Tổng đơn (Giao hàng NB):</span> {counters.totalDonGiaoHangNb}
                  </div>
                  <div>
                    <span className="font-medium">Tổng đơn (Thanh toán):</span> {counters.totalDonThanhToan}
                  </div>
                  <div>
                    <span className="font-medium">Tổng tiền (từ tien_trang_thai_thanh_toan):</span>{' '}
                    {Number(counters.totalTienThanhToan || 0).toLocaleString('vi-VN')}
                  </div>
                </div>
              </div>
            )}

            {canRunSync && (
              <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 space-y-3">
                <div className="text-sm font-semibold text-gray-800">Đếm trạng thái &amp; cập nhật báo cáo vận đơn</div>
                <p className="text-xs text-gray-600">
                  Gom đơn từ <span className="font-mono">orders</span> theo ngày (hoặc ngày{' '}
                  <span className="font-mono">created_at</span> nếu thiếu order_date) + NV vận đơn + SP + thị trường; cập nhật các cột{' '}
                  jsonb trạng thái.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Từ ngày</span>
                    <input
                      type="date"
                      value={syncStartDate}
                      onChange={(e) => setSyncStartDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Đến ngày</span>
                    <input
                      type="date"
                      value={syncEndDate}
                      onChange={(e) => setSyncEndDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleSyncBaoCaoVanDon}
                    disabled={syncLoading || loading}
                    title="Gom đơn theo khoảng ngày; đếm từng giá trị trạng thái giao / check / thanh toán → jsonb { giá trị: số đơn }"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-medium text-sm transition shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {syncLoading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Đang đếm &amp; đồng bộ...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4 shrink-0" />
                        Đếm trạng thái &amp; cập nhật báo cáo vận đơn
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Đang tải dữ liệu...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>Không có dữ liệu cho bộ lọc đã chọn</p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto w-full h-[calc(100vh-320px)]">
              <table className="min-w-max divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                      #
                    </th>
                    {tableColumns.map((col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-600 tracking-wide whitespace-nowrap"
                        title={col}
                      >
                        {labelForColumn(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((row, rowIdx) => (
                    <tr key={row.id ?? rowIdx} className="group hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white px-3 py-3 text-sm text-gray-500 border-r border-gray-200 group-hover:bg-gray-50">
                        {rowIdx + 1}
                      </td>
                      {tableColumns.map((col) => {
                        const isHist =
                          HISTOGRAM_KEYS.has(col) || col === 'trang_thai_thanh_toan';
                        const isId = col === 'id';
                        const isObject =
                          row[col] !== null &&
                          typeof row[col] === 'object' &&
                          !Array.isArray(row[col]) &&
                          !isHist;
                        return (
                          <td
                            key={col}
                            className={
                              isHist || isObject
                                ? 'px-4 py-3 text-sm text-gray-800 align-top whitespace-pre-line min-w-[14rem] max-w-md'
                                : isId
                                  ? 'px-4 py-3 text-xs text-gray-900 font-mono align-top break-all max-w-[20rem]'
                                  : 'px-4 py-3 text-sm text-gray-700 align-top whitespace-nowrap'
                            }
                          >
                            {col === 'trang_thai_thanh_toan'
                              ? formatBaoCaoVanDonPaymentStatusWithMoney(
                                  row.trang_thai_thanh_toan,
                                  row.tien_trang_thai_thanh_toan
                                )
                              : formatCell(col, row[col])}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* bộ đếm đã nằm trong khối filter phía trên */}
        </div>
      </div>
    </div>
  );
}
