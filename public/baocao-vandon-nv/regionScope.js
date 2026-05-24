/**
 * Báo cáo vận đơn nhân viên — đọc Supabase trực tiếp (`order_code_hcm`), không `/api/baocaoVandonNvData`.
 */
(function (global) {
  var VANDON_NV_REGION = 'hcm';

  function getVandonNvRegion() {
    return VANDON_NV_REGION;
  }

  function isHcmTeam(teamRaw) {
    var t = (teamRaw || '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.\-_/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return false;
    if (t === 'hcm' || t === 'tp hcm' || t === 'tphcm') return true;
    if (t.indexOf('hcm') !== -1 || t.indexOf('ho chi minh') !== -1) return true;
    return false;
  }

  /** Tab bộ phận: chỉ đơn Team/Chi nhánh HCM. */
  function isHcmOrderRow(row) {
    if (!row || typeof row !== 'object') return false;
    var team =
      row.team ||
      row.Team ||
      row.branch ||
      row.Branch ||
      row['Chi nhánh'] ||
      row.Chi_nhanh ||
      '';
    return isHcmTeam(team);
  }

  function rowMatchesVandonNvRegion(row, region) {
    void row;
    void region;
    return true;
  }

  function filterRowsByVandonNvRegion(rows) {
    return Array.isArray(rows) ? rows : [];
  }

  function normalizeApiRowsPayload(payload) {
    if (payload && typeof payload === 'object' && payload.error && !Array.isArray(payload.rows)) {
      return { error: String(payload.error), rows: [] };
    }
    if (Array.isArray(payload)) return { rows: payload };
    if (payload && typeof payload === 'object') {
      if (Array.isArray(payload.rows)) return { rows: payload.rows };
      if (Array.isArray(payload.data)) return { rows: payload.data };
      return {
        rows: Object.values(payload).filter(function (item) {
          return item && typeof item === 'object' && !Array.isArray(item);
        }),
      };
    }
    return { rows: [] };
  }

  /**
   * Trạng thái giao hàng NB — cột `delivery_status_nb` / «Trạng thái giao hàng NB».
   */
  /** NV Vận đơn trên đơn — cột `delivery_staff` / order_code_hcm. */
  function resolveNvVanDon(row) {
    if (!row || typeof row !== 'object') return '';
    var keys = ['NV Vận đơn', 'NV_Vận_đơn', 'delivery_staff'];
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function mergeVanDonStaffFilterList(orderRows, directoryNames) {
    var set = new Set();
    var i;
    var rows = Array.isArray(orderRows) ? orderRows : [];
    for (i = 0; i < rows.length; i++) {
      var n = resolveNvVanDon(rows[i]);
      if (n) set.add(n);
    }
    var dir = Array.isArray(directoryNames) ? directoryNames : [];
    for (i = 0; i < dir.length; i++) {
      var d = dir[i] != null ? String(dir[i]).trim() : '';
      if (d) set.add(d);
    }
    return Array.from(set).sort(function (a, b) {
      return a.localeCompare(b, 'vi');
    });
  }

  var supabaseModulePromise = null;

  function loadSupabaseModule() {
    if (!supabaseModulePromise) {
      supabaseModulePromise = import('./vandonNvSupabase.mjs');
    }
    return supabaseModulePromise;
  }

  function fetchVanDonNvStaffDirectory() {
    return loadSupabaseModule()
      .then(function (m) {
        return m.fetchStaffDirectory();
      })
      .catch(function (err) {
        console.warn('[VandonNvRegion] vandon-staff:', err && err.message);
        return [];
      });
  }

  function fetchOrderHcmRows(dateRange) {
    return loadSupabaseModule().then(function (m) {
      return m.fetchOrderHcmRows(dateRange);
    });
  }

  function fetchHrRows() {
    return loadSupabaseModule().then(function (m) {
      return m.fetchHrRows();
    });
  }

  function fetchMktRows() {
    return loadSupabaseModule().then(function (m) {
      return m.fetchMktRows();
    });
  }

  function resolveTrangThaiGiaoHangNb(row) {
    if (!row || typeof row !== 'object') return '';
    var keys = [
      'Trạng thái giao hàng NB',
      'Trạng_thái_giao_hàng_NB',
      'delivery_status_nb',
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  /**
   * Kết quả Check — cột `check_result` / «Kết quả Check».
   */
  function resolveKetQuaCheck(row) {
    if (!row || typeof row !== 'object') return '';
    var keys = ['Kết quả Check', 'Kết_quả_Check', 'check_result'];
    for (var i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  /**
   * Phân loại cột trạng thái giao (xanh) / Hoàn vận hành — if/else, khớp 1 lần.
   * Nguồn: «Trạng thái giao hàng NB» (delivery_status_nb).
   * @returns {'Giao Thành Công'|'Đang Giao'|'Chưa Giao'|'Hoàn'|'chờ check'|null}
   */
  function classifyTrangThaiGiaoHangNb(deliveryRaw) {
    var d = String(deliveryRaw || '');
    if (!d) return null;
    var lower = d.toLowerCase();
    if (lower.indexOf('giao thành công') !== -1 || lower.indexOf('đơn thành công') !== -1) {
      return 'Giao Thành Công';
    }
    if (d.indexOf('Đang Giao') !== -1) return 'Đang Giao';
    if (d.indexOf('Chưa Giao') !== -1) return 'Chưa Giao';
    if (d.indexOf('Hoàn') !== -1) return 'Hoàn';
    if (d.indexOf('chờ check') !== -1) return 'chờ check';
    return null;
  }

  function incrementDeliveryStatusCount(stats, deliveryRaw) {
    var bucket = classifyTrangThaiGiaoHangNb(deliveryRaw);
    if (bucket && stats && stats[bucket]) stats[bucket].count++;
  }

  /**
   * Báo cáo SP & khu vực / bộ phận — cùng nguồn & if/else như tab tổng kết (NB).
   * @param {{successful:number,returned:number,delivering:number,waitingForCheck:number,notShipped:number}} stats
   */
  function applyProductAreaDeliveryBuckets(stats, row) {
    if (!stats) return;
    var deliveryNb = resolveTrangThaiGiaoHangNb(row);
    var bucket = classifyTrangThaiGiaoHangNb(deliveryNb);
    if (bucket === 'Giao Thành Công') stats.successful++;
    else if (bucket === 'Đang Giao') stats.delivering++;
    else if (bucket === 'Hoàn') stats.returned++;
    else if (bucket === 'chờ check') stats.waitingForCheck++;
    else if (bucket === 'Chưa Giao') stats.notShipped++;
  }

  function ketQuaCheckIsOk(row) {
    var s = resolveKetQuaCheck(row);
    if (!s) return false;
    var n = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    return n === 'ok';
  }

  /**
   * Trạng thái thanh toán (bill): ưu tiên payment_status_detail / «Trạng thái thanh toán»,
   * fallback payment_status / «Trạng thái thu tiền» khi detail trống.
   */
  function resolveTrangThaiThanhToan(row) {
    if (!row || typeof row !== 'object') return '';
    var keysDetail = [
      'Trạng thái thanh toán',
      'Trạng_thái_thanh_toán',
      'payment_status_detail',
    ];
    var keysFallback = ['Trạng thái thu tiền', 'Trạng_thái_thu_tiền', 'payment_status'];
    var i;
    for (i = 0; i < keysDetail.length; i++) {
      var v = row[keysDetail[i]];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    for (i = 0; i < keysFallback.length; i++) {
      var f = row[keysFallback[i]];
      if (f != null && String(f).trim() !== '') return String(f).trim();
    }
    return '';
  }

  /** Mặc định preload: 10 ngày gần nhất (order_code_hcm). */
  var PRELOAD_ORDER_DAYS = 10;

  function formatDateInputLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getPreloadOrderDateRange(dayCount) {
    var days = dayCount == null ? PRELOAD_ORDER_DAYS : Number(dayCount);
    if (!days || days < 1) days = PRELOAD_ORDER_DAYS;
    var end = new Date();
    var start = new Date();
    start.setDate(end.getDate() - (days - 1));
    return { startDate: formatDateInputLocal(start), endDate: formatDateInputLocal(end) };
  }

  function applyPreloadDateRangeToInputs(startInputId, endInputId, dayCount) {
    var range = getPreloadOrderDateRange(dayCount);
    var s = typeof document !== 'undefined' ? document.getElementById(startInputId) : null;
    var e = typeof document !== 'undefined' ? document.getElementById(endInputId) : null;
    if (s) s.value = range.startDate;
    if (e) e.value = range.endDate;
    return range;
  }

  function readDateFilterValues(startInputId, endInputId) {
    var s = typeof document !== 'undefined' ? document.getElementById(startInputId) : null;
    var e = typeof document !== 'undefined' ? document.getElementById(endInputId) : null;
    return {
      startDate: s && s.value ? String(s.value).trim() : '',
      endDate: e && e.value ? String(e.value).trim() : '',
    };
  }

  var BAOCAO_MAX_ROWS = 25000;

  function resolveOrderHcmDateRange(dateRange) {
    var dr = dateRange || {};
    if (!dr.startDate || !dr.endDate) {
      dr = getPreloadOrderDateRange(PRELOAD_ORDER_DAYS);
    }
    if (dr.maxRows == null) dr.maxRows = BAOCAO_MAX_ROWS;
    return dr;
  }

  global.VandonNvRegion = {
    get: getVandonNvRegion,
    isHcmTeam: isHcmTeam,
    rowMatches: rowMatchesVandonNvRegion,
    filterRows: filterRowsByVandonNvRegion,
    normalizeApiRowsPayload: normalizeApiRowsPayload,
    PRELOAD_ORDER_DAYS: PRELOAD_ORDER_DAYS,
    BAOCAO_MAX_ROWS: BAOCAO_MAX_ROWS,
    getPreloadOrderDateRange: getPreloadOrderDateRange,
    applyPreloadDateRangeToInputs: applyPreloadDateRangeToInputs,
    readDateFilterValues: readDateFilterValues,
    resolveOrderHcmDateRange: resolveOrderHcmDateRange,
    fetchOrderHcmRows: fetchOrderHcmRows,
    fetchHrRows: fetchHrRows,
    fetchMktRows: fetchMktRows,
    isHcmOrderRow: isHcmOrderRow,
    resolveNvVanDon: resolveNvVanDon,
    mergeVanDonStaffFilterList: mergeVanDonStaffFilterList,
    fetchVanDonNvStaffDirectory: fetchVanDonNvStaffDirectory,
    resolveTrangThaiThanhToan: resolveTrangThaiThanhToan,
    resolveTrangThaiGiaoHangNb: resolveTrangThaiGiaoHangNb,
    resolveKetQuaCheck: resolveKetQuaCheck,
    classifyTrangThaiGiaoHangNb: classifyTrangThaiGiaoHangNb,
    incrementDeliveryStatusCount: incrementDeliveryStatusCount,
    applyProductAreaDeliveryBuckets: applyProductAreaDeliveryBuckets,
    ketQuaCheckIsOk: ketQuaCheckIsOk,
    labelVi: function () {
      return 'HCM (order_hcm / order_code_hcm)';
    },
    ORDER_HCM_TABLE: 'order_code_hcm',
  };
})(typeof window !== 'undefined' ? window : this);
