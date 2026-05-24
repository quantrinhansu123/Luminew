/**
 * Báo cáo vận đơn nhân viên — API kind=f3 LUÔN đọc Supabase `order_code_hcm` (không `orders`).
 * Không lọc thêm theo Team trên client.
 */
(function (global) {
  var VANDON_NV_REGION = 'hcm';

  function getVandonNvRegion() {
    return VANDON_NV_REGION;
  }

  function isHcmTeam(teamRaw) {
    var t = (teamRaw || '').toString().trim().toLowerCase();
    if (!t) return false;
    if (t === 'hcm') return true;
    if (t.startsWith('hcm')) return true;
    if (t.indexOf(' hcm') !== -1 || t.indexOf('-hcm') !== -1 || t.indexOf('hcm-') !== -1) return true;
    return false;
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
   * Nguồn: giá trị «Kết quả Check» (hoặc chuỗi truyền vào).
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

  function buildBaocaoVandonNvApiUrl(params) {
    var sp = new URLSearchParams();
    var p = params || {};
    Object.keys(p).forEach(function (k) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') {
        sp.set(k, String(p[k]));
      }
    });
    sp.set('region', VANDON_NV_REGION);
    return '/api/baocaoVandonNvData?' + sp.toString();
  }

  global.VandonNvRegion = {
    get: getVandonNvRegion,
    isHcmTeam: isHcmTeam,
    rowMatches: rowMatchesVandonNvRegion,
    filterRows: filterRowsByVandonNvRegion,
    normalizeApiRowsPayload: normalizeApiRowsPayload,
    buildApiUrl: buildBaocaoVandonNvApiUrl,
    resolveTrangThaiThanhToan: resolveTrangThaiThanhToan,
    resolveTrangThaiGiaoHangNb: resolveTrangThaiGiaoHangNb,
    resolveKetQuaCheck: resolveKetQuaCheck,
    classifyTrangThaiGiaoHangNb: classifyTrangThaiGiaoHangNb,
    incrementDeliveryStatusCount: incrementDeliveryStatusCount,
    labelVi: function () {
      return 'HCM (order_code_hcm)';
    },
  };
})(typeof window !== 'undefined' ? window : this);
