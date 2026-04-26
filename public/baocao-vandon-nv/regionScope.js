/**
 * Phạm vi HN vs HCM cho báo cáo vận đơn nhân viên (static HTML).
 * URL: ?region=hcm → chỉ đơn/nhân sự HCM; mặc định / ?region=hn → loại team HCM.
 */
(function (global) {
  function getVandonNvRegion() {
    try {
      var p = new URLSearchParams(window.location.search);
      var r = (p.get('region') || p.get('scope') || 'hn').toString().toLowerCase();
      return r === 'hcm' ? 'hcm' : 'hn';
    } catch (e) {
      return 'hn';
    }
  }

  /** Team thuộc chi nhánh HCM (cột Team / team trên orders). */
  function isHcmTeam(teamRaw) {
    var t = (teamRaw || '').toString().trim().toLowerCase();
    if (!t) return false;
    if (t === 'hcm') return true;
    if (t.startsWith('hcm')) return true;
    if (t.indexOf(' hcm') !== -1 || t.indexOf('-hcm') !== -1 || t.indexOf('hcm-') !== -1) return true;
    return false;
  }

  function rowMatchesVandonNvRegion(row, region) {
    var team = row.Team != null ? row.Team : row.team;
    var h = isHcmTeam(team);
    if (region === 'hcm') return h;
    return !h;
  }

  function filterRowsByVandonNvRegion(rows, region) {
    if (!Array.isArray(rows)) return [];
    var r = region || getVandonNvRegion();
    return rows.filter(function (row) {
      return rowMatchesVandonNvRegion(row, r);
    });
  }

  global.VandonNvRegion = {
    get: getVandonNvRegion,
    isHcmTeam: isHcmTeam,
    rowMatches: rowMatchesVandonNvRegion,
    filterRows: filterRowsByVandonNvRegion,
    labelVi: function () {
      return getVandonNvRegion() === 'hcm' ? 'HCM' : 'Hà Nội';
    },
  };
})(typeof window !== 'undefined' ? window : this);
