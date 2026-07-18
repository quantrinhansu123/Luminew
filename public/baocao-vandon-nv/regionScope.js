/**
 * Báo cáo vận đơn nhân viên — đọc Supabase (`orders` hoặc `order_code_hcm`).
 */
(function (global) {
  var VANDON_NV_REGION = 'hcm';

  function getEmbedTableParam() {
    if (typeof window === 'undefined') return '';
    try {
      return new URLSearchParams(window.location.search).get('table') || '';
    } catch (e) {
      return '';
    }
  }

  function isOrdersTableMode() {
    var t = String(getEmbedTableParam()).toLowerCase();
    return t === 'orders' || t === 'order';
  }

  function getVandonNvRegion() {
    if (isOrdersTableMode()) return 'orders';
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

  /** Tab bộ phận: chỉ đơn Team/Chi nhánh HCM (bỏ qua khi `table=orders`). */
  function isHcmOrderRow(row) {
    if (isOrdersTableMode()) return true;
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

  /** Cộng thành tiền vào bucket «Giao Thành Công». */
  function addDeliverySuccessAmount(stats, deliveryRaw, amount) {
    var bucket = classifyTrangThaiGiaoHangNb(deliveryRaw);
    if (bucket !== 'Giao Thành Công' || !stats || !stats[bucket]) return;
    var amt = Number(amount) || 0;
    if (!stats[bucket].amount) stats[bucket].amount = 0;
    stats[bucket].amount += amt;
  }

  /**
   * Mã tracking thật (loại placeholder: "-", "null", "n/a", "0", …).
   * Tránh cộng thừa 1 đơn vào «đơn có mã» / mẫu số tỷ lệ tiền bill.
   */
  function isRealTrackingCode(raw) {
    if (raw == null) return false;
    var s = String(raw)
      .replace(/[\u00a0\u200b\ufeff]/g, '')
      .trim();
    if (!s) return false;
    var l = s.toLowerCase();
    var compact = l.replace(/\s+/g, '');
    if (!compact) return false;
    if (/^[\-–—_.\s,;/#*]+$/u.test(s)) return false;
    var emptySet = {
      null: 1,
      undefined: 1,
      none: 1,
      'n/a': 1,
      na: 1,
      '#n/a': 1,
      '#na': 1,
      trống: 1,
      '(trống)': 1,
      empty: 1,
      blank: 1,
      nil: 1,
      '-': 1,
      '--': 1,
      '—': 1,
      '0': 1,
      '00': 1,
      '000': 1,
      chua: 1,
      'chưa': 1,
      'chua co': 1,
      'chưa có': 1,
      'chua ma': 1,
      'chưa mã': 1,
    };
    if (emptySet[l] || emptySet[compact]) return false;
    return true;
  }

  /**
   * Tỷ lệ tiền (có bill + bill 1 phần) / tiền giao thành công.
   * @param {Record<string, {count?:number, amount?:number}>} stats
   */
  function calcBillAmountOnSuccessRate(stats) {
    if (!stats) return { billCount: 0, successCount: 0, billAmount: 0, successAmount: 0, rate: 0 };
    var paidCount = stats['Đã Thanh Toán (có bill)'] ? stats['Đã Thanh Toán (có bill)'].count || 0 : 0;
    var partialCount = stats['Bill 1 phần'] ? stats['Bill 1 phần'].count || 0 : 0;
    var successCount = stats['Giao Thành Công'] ? stats['Giao Thành Công'].count || 0 : 0;
    var paidAmount = stats['Đã Thanh Toán (có bill)'] ? stats['Đã Thanh Toán (có bill)'].amount || 0 : 0;
    var partialAmount = stats['Bill 1 phần'] ? stats['Bill 1 phần'].amount || 0 : 0;
    var successAmount = stats['Giao Thành Công'] ? stats['Giao Thành Công'].amount || 0 : 0;
    var billAmount = paidAmount + partialAmount;
    return {
      billCount: paidCount + partialCount,
      successCount: successCount,
      billAmount: billAmount,
      successAmount: successAmount,
      rate: successAmount > 0 ? (billAmount / successAmount * 100) : 0,
    };
  }

  /**
   * Tiền đơn khớp header «Tổng tiền» /van-don:
   * van_don_line_total_vnd (≠0) → tong_tien_vnd (≠0) → Tổng tiền VNĐ → total_amount_vnd.
   */
  function resolveVanDonReportMoney(row) {
    if (!row || typeof row !== 'object') return 0;
    var parseMoney = function (raw) {
      if (raw === undefined || raw === null || raw === '') return null;
      if (typeof raw === 'number' && isFinite(raw)) return raw;
      var n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
      return isFinite(n) ? n : null;
    };
    var line = parseMoney(row.van_don_line_total_vnd);
    if (line != null && line !== 0) return line;
    var tong = parseMoney(row.tong_tien_vnd != null ? row.tong_tien_vnd : row.tong_tien_VND);
    if (tong != null && tong !== 0) return tong;
    var display = parseMoney(row['Tổng tiền VNĐ'] != null ? row['Tổng tiền VNĐ'] : row['Tổng_tiền_VNĐ']);
    if (display != null) return display;
    var total = parseMoney(row.total_amount_vnd);
    if (total != null) return total;
    var sale = parseMoney(row.sale_price);
    if (sale != null) return sale;
    var goods = parseMoney(row.goods_amount);
    return goods != null ? goods : 0;
  }

  function formatVndAmount(n) {
    return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0));
  }

  /** Cộng thành tiền vào «Tổng đơn có mã tracking». */
  function addTrackingCodeOrderAmount(stats, hasTrackingCode, amount) {
    if (!hasTrackingCode || !stats || !stats['Tổng đơn có mã tracking']) return;
    var amt = Number(amount) || 0;
    if (!stats['Tổng đơn có mã tracking'].amount) stats['Tổng đơn có mã tracking'].amount = 0;
    stats['Tổng đơn có mã tracking'].amount += amt;
  }

  /**
   * Tỷ lệ tiền (có bill + bill 1 phần) / tiền đơn có mã tracking thật.
   * @param {Record<string, {count?:number, amount?:number}>} stats
   */
  function calcBillAmountOnTrackingCodeRate(stats) {
    if (!stats) return { billCount: 0, trackingCount: 0, billAmount: 0, trackingAmount: 0, rate: 0 };
    var paidCount = stats['Đã Thanh Toán (có bill)'] ? stats['Đã Thanh Toán (có bill)'].count || 0 : 0;
    var partialCount = stats['Bill 1 phần'] ? stats['Bill 1 phần'].count || 0 : 0;
    var trackingCount = stats['Tổng đơn có mã tracking'] ? stats['Tổng đơn có mã tracking'].count || 0 : 0;
    var paid = stats['Đã Thanh Toán (có bill)'] ? stats['Đã Thanh Toán (có bill)'].amount || 0 : 0;
    var partial = stats['Bill 1 phần'] ? stats['Bill 1 phần'].amount || 0 : 0;
    var trackingAmount = stats['Tổng đơn có mã tracking'] ? stats['Tổng đơn có mã tracking'].amount || 0 : 0;
    var billAmount = paid + partial;
    return {
      billCount: paidCount + partialCount,
      trackingCount: trackingCount,
      billAmount: billAmount,
      trackingAmount: trackingAmount,
      rate: trackingAmount > 0 ? (billAmount / trackingAmount * 100) : 0,
    };
  }

  /**
   * Dòng ghi Giao Thành Công nhưng trạng thái vẫn «Không PH dưới 3N» và chưa có phí ship
   * là dữ liệu chưa hoàn tất; /van-don không đưa dòng này vào tổng Giao TC đã chốt.
   */
  function isUnfinalizedDeliverySuccess(row, deliveryNb) {
    if (classifyTrangThaiGiaoHangNb(deliveryNb) !== 'Giao Thành Công') return false;
    var payment = String(resolveTrangThaiThanhToan(row)).trim();
    if (payment.indexOf('Không PH dưới 3N') === -1) return false;
    var rawShip = row.shipping_cost;
    if (rawShip == null || rawShip === '') {
      rawShip = row['Phí ship'] != null ? row['Phí ship'] : row.shipping_fee;
    }
    var ship = Number(String(rawShip == null ? '' : rawShip).replace(/[^\d.-]/g, ''));
    return !isFinite(ship) || ship <= 0;
  }

  function getRowField(row, keys) {
    if (!row || typeof row !== 'object') return '';
    var i;
    for (i = 0; i < keys.length; i++) {
      var v = row[keys[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  }

  function deliveryCountsAsLenVanHanh(deliveryNb) {
    var d = String(deliveryNb || '');
    if (!d) return false;
    if (d.indexOf('Chưa Giao') !== -1 || d.indexOf('chờ check') !== -1) return false;
    var lower = d.toLowerCase();
    if (lower.indexOf('huỷ') !== -1 || lower.indexOf('hủy') !== -1 || lower.indexOf('cancel') !== -1) {
      return false;
    }
    return true;
  }

  /**
   * Gom chỉ số 1 dòng đơn vào bucket tổng kết (HCM: check/ĐVVC; orders: bill + trạng thái giao).
   * Tiền luôn resolve giống header «Tổng tiền» /van-don (line → tong_tien → total).
   */
  function accumulateVanDonSummaryStats(stats, row, amount) {
    if (!stats || !row) return;
    var useOrdersLogic = isOrdersTableMode();
    var payment = String(resolveTrangThaiThanhToan(row));
    var deliveryNb = String(resolveTrangThaiGiaoHangNb(row));
    var ketQuaCheckOk = ketQuaCheckIsOk(row);
    var maTrackingRaw = getRowField(row, ['Mã Tracking', 'Mã_Tracking', 'tracking_code']);
    var maTracking = isRealTrackingCode(maTrackingRaw) ? String(maTrackingRaw).trim() : '';
    var dvvc = getRowField(row, ['Đơn vị vận chuyển', 'Đơn_vị_vận_chuyển', 'shipping_unit']);
    var resolved = resolveVanDonReportMoney(row);
    var passed = Number(amount);
    var amt = resolved > 0 ? resolved : (Number.isFinite(passed) ? passed : 0);

    stats['Tổng đơn lên nội bộ'].count++;

    if (maTracking !== '') {
      stats['Tổng đơn có mã tracking'].count++;
      addTrackingCodeOrderAmount(stats, true, amt);
    }
    if (dvvc !== '') {
      stats['Tổng đơn có dvvc'].count++;
    }

    if (useOrdersLogic) {
      if (payment.indexOf('Có bill') !== -1) {
        stats['Tổng đơn đủ đkien đẩy vh'].count++;
      }
      if (deliveryCountsAsLenVanHanh(deliveryNb)) {
        stats['Tổng đơn lên vận hành'].count++;
      }
      if (!deliveryNb) {
        stats['Trống trạng thái'].count++;
      }
      if (dvvc !== '' && maTracking === '') {
        stats['Tổng đơn chưa lên vận hành'].count++;
      }
      if (ketQuaCheckOk && dvvc === '') {
        stats['Đơn Ok chưa đẩy đi'].count++;
        stats['Tổng đơn OK'].count++;
      }
    } else {
      if (ketQuaCheckOk) {
        stats['Tổng đơn đủ đkien đẩy vh'].count++;
        stats['Tổng đơn OK'].count++;
        if (dvvc === '') {
          stats['Đơn Ok chưa đẩy đi'].count++;
        }
      }
      if (dvvc !== '') {
        stats['Tổng đơn lên vận hành'].count++;
      }
      if (dvvc !== '' && maTracking === '') {
        stats['Tổng đơn chưa lên vận hành'].count++;
      }
      if (ketQuaCheckOk && payment === '' && deliveryNb === '') {
        stats['Trống trạng thái'].count++;
      }
    }

    if (payment.indexOf('Có bill 1 phần') !== -1) {
      stats['Bill 1 phần'].count++;
      stats['Bill 1 phần'].amount += amt;
    } else if (payment.indexOf('Có bill') !== -1) {
      stats['Đã Thanh Toán (có bill)'].count++;
      stats['Đã Thanh Toán (có bill)'].amount += amt;
    }

    if (!isUnfinalizedDeliverySuccess(row, deliveryNb)) {
      incrementDeliveryStatusCount(stats, deliveryNb);
      addDeliverySuccessAmount(stats, deliveryNb, amt);
    }
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
    getOrdersTable: function () {
      return isOrdersTableMode() ? 'orders' : 'order_code_hcm';
    },
    isOrdersTableMode: isOrdersTableMode,
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
    addDeliverySuccessAmount: addDeliverySuccessAmount,
    calcBillAmountOnSuccessRate: calcBillAmountOnSuccessRate,
    addTrackingCodeOrderAmount: addTrackingCodeOrderAmount,
    calcBillAmountOnTrackingCodeRate: calcBillAmountOnTrackingCodeRate,
    isRealTrackingCode: isRealTrackingCode,
    accumulateVanDonSummaryStats: accumulateVanDonSummaryStats,
    formatVndAmount: formatVndAmount,
    resolveVanDonReportMoney: resolveVanDonReportMoney,
    applyProductAreaDeliveryBuckets: applyProductAreaDeliveryBuckets,
    ketQuaCheckIsOk: ketQuaCheckIsOk,
    labelVi: function () {
      if (isOrdersTableMode()) return 'Đơn hàng (orders)';
      return 'HCM (order_hcm / order_code_hcm)';
    },
    ORDER_HCM_TABLE: 'order_code_hcm',
    ORDER_TABLE: function () {
      return isOrdersTableMode() ? 'orders' : 'order_code_hcm';
    },
  };
})(typeof window !== 'undefined' ? window : this);
