/**
 * View React — trùng layout & logic với nhanSuSaleLumiMoi.html
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase/config';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import '../styles/NhanSuSaleLumiMoiView.css';
import {
  NSSL_IFRAME_THU_CONG,
  buildKpiEmbedUrl,
  buildVanDonEmbedUrl,
  fetchLatestSalesReportNDayRange,
  fetchSalesReportsMapped,
  getLastNDaysRangeLocal,
  filterRawData,
  filterRawForRestrictedPopulate,
  formatCurrency,
  formatDateDisplay,
  formatNumber,
  formatPercent,
  summarizeAndSortSalesData,
  dedupeSalesReportRowsByTTKey,
  uniqueSorted,
} from '../utils/nhanSuSaleLumiMoiLogic';

const LOGO_URL =
  'https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg';

function useResolvedIdsheet() {
  const [searchParams] = useSearchParams();
  const fromQuery = searchParams.get('id');
  const [resolved, setResolved] = useState(fromQuery || localStorage.getItem('idAppsheet') || '');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (fromQuery) {
        if (!cancelled) setResolved(fromQuery);
        return;
      }
      let id = localStorage.getItem('idAppsheet') || '';
      if (id) {
        if (!cancelled) setResolved(id);
        return;
      }
      const userEmail = localStorage.getItem('userEmail') || '';
      const userId = localStorage.getItem('userId') || '';
      if (!userId && !userEmail) return;
      try {
        let q = supabase.from('users').select('id_appsheet');
        if (userId) q = q.eq('id', userId);
        else q = q.eq('email', userEmail);
        const { data } = await q.single();
        if (data?.id_appsheet) {
          id = data.id_appsheet;
          localStorage.setItem('idAppsheet', id);
          if (!cancelled) setResolved(id);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromQuery]);

  return resolved;
}

function flatListFilteredNoTeamNghi(flatList) {
  return flatList.filter((item) => (item.team || '').trim() !== 'Đã nghỉ');
}

/** Danh sách nhân sự dạng employeeData cũ (gamma) — lấy từ Supabase `users` + `id_appsheet`. */
async function fetchEmployeeDataForRestrict() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id_appsheet, email, name, username, role, team, branch, position')
      .not('id_appsheet', 'is', null);
    if (error) throw error;
    return (data || [])
      .filter((u) => String(u.id_appsheet || '').trim() !== '')
      .map((u) => ({
        id: String(u.id_appsheet).trim(),
        Email: (u.email || '').trim(),
        'Họ Và Tên': (u.name || u.username || '').trim(),
        'Chức vụ': (u.position || '').trim(),
        'Vị trí': (u.position || '').trim(),
        Team: (u.team || '').trim(),
        'Chi nhánh': (u.branch || '').trim(),
        'chi nhánh': (u.branch || '').trim(),
      }));
  } catch (e) {
    console.warn('[NhanSuSaleLumiMoi] users for restrict:', e);
    return [];
  }
}

function normalizeTeamLabel(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export default function NhanSuSaleLumiMoiView({
  reportTableName = 'Báo cáo sale',
  thuCongTableName = 'Báo cáo sale',
  /** Lọc team chứa chuỗi (giống BaoCaoSale: sale | cskh). Bỏ qua khi có `teamExactFilter`. */
  teamKeyword = 'sale',
  /** Chỉ giữ dòng có Team khớp đúng (sau trim/gom khoảng trắng), ví dụ CSKH- Lý. */
  teamExactFilter = null,
  /**
   * Hiện lọc theo tên Sale: danh sách checkbox = `users.selected_personnel` (đã resolve tên);
   * admin / không có selected_personnel → liệt kê theo tên có trong dữ liệu đã lọc.
   */
  showPersonnelNameFilter = false,
}) {
  const idSheet = useResolvedIdsheet();
  const { role } = usePermissions();

  /** Admin / Finance: không lọc theo selected_personnel */
  const isAdmin = useMemo(() => {
    const roleFromHook = (role || '').toUpperCase();
    const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
    let roleFromUserObj = '';
    try {
      const userJson = localStorage.getItem('user');
      const userObj = userJson ? JSON.parse(userJson) : null;
      roleFromUserObj = (userObj?.role || '').toLowerCase();
    } catch {
      /* ignore */
    }
    const h = (roleFromHook || '').toLowerCase();
    return (
      h === 'admin' ||
      h === 'super_admin' ||
      h === 'finance' ||
      roleFromStorage === 'admin' ||
      roleFromStorage === 'super_admin' ||
      roleFromStorage === 'finance' ||
      roleFromUserObj === 'admin' ||
      roleFromUserObj === 'super_admin' ||
      roleFromUserObj === 'finance'
    );
  }, [role]);

  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);

  const [reportTitle, setReportTitle] = useState('DỮ LIỆU TỔNG HỢP');
  const [isRestrictedView, setIsRestrictedView] = useState(false);
  const [allowedNames, setAllowedNames] = useState([]);
  /** Khớp dòng báo cáo với user qua `sales_reports.email` khi `name` khác `users.name`. */
  const [allowedUserEmail, setAllowedUserEmail] = useState(null);
  const [allowedTeam, setAllowedTeam] = useState(null);
  const [allowedBranch, setAllowedBranch] = useState(null);
  const [currentUserInfo, setCurrentUserInfo] = useState(null);
  const [showThuCongTab, setShowThuCongTab] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [productAll, setProductAll] = useState(true);
  const [productSel, setProductSel] = useState([]);
  const [caAll, setCaAll] = useState(true);
  const [caSel, setCaSel] = useState([]);
  const [teamAll, setTeamAll] = useState(true);
  const [teamSel, setTeamSel] = useState([]);
  const [marketAll, setMarketAll] = useState(true);
  const [marketSel, setMarketSel] = useState([]);
  const [nameAll, setNameAll] = useState(true);
  const [nameSel, setNameSel] = useState([]);

  const [activeTab, setActiveTab] = useState('sau-huy');
  const [selectedRowKey, setSelectedRowKey] = useState(null);

  const [iframeKpi, setIframeKpi] = useState(() => buildKpiEmbedUrl(''));
  const [iframeVanDon, setIframeVanDon] = useState(() => buildVanDonEmbedUrl(''));
  const [iframeThuCong, setIframeThuCong] = useState('about:blank');

  /**
   * Tên nhân sự được phép xem (users.selected_personnel → khớp cột name/ten trên dòng báo cáo).
   * null = không áp dụng lọc (admin hoặc chưa cấu hình).
   */
  const [allowedPersonnelNames, setAllowedPersonnelNames] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAdmin) {
        setAllowedPersonnelNames(null);
        return;
      }
      const email = (localStorage.getItem('userEmail') || '').toLowerCase().trim();
      if (!email) {
        setAllowedPersonnelNames(null);
        return;
      }
      try {
        const map = await rbacService.getSelectedPersonnel([email]);
        const raw = map[email] || [];
        const emails = [];
        const directNames = [];
        for (const x of raw) {
          const s = String(x ?? '').trim();
          if (!s) continue;
          if (s.includes('@')) emails.push(s.toLowerCase());
          else directNames.push(s);
        }
        let fromEmails = [];
        if (emails.length) {
          const nameByEmail = await rbacService.getEmployeeNamesByEmails(emails);
          for (const e of emails) {
            const n = nameByEmail[e] ?? nameByEmail[String(e).toLowerCase()];
            if (n && String(n).trim()) fromEmails.push(String(n).trim());
          }
        }
        const merged = [...new Set([...directNames, ...fromEmails])].filter(Boolean);
        if (!cancelled) setAllowedPersonnelNames(merged.length ? merged : null);
      } catch (e) {
        console.warn('[NhanSuSaleLumiMoi] selected_personnel:', e);
        if (!cancelled) setAllowedPersonnelNames(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const setDefaultDates = useCallback(() => {
    const { startDateStr, endDateStr } = getLastNDaysRangeLocal(3);
    setStartDate(startDateStr);
    setEndDate(endDateStr);
  }, []);

  /** Mặc định Từ/Đến ngày: 3 ngày kết thúc tại ngày mới nhất trong `sales_reports` (Supabase); không có thì 3 ngày gần nhất (máy). */
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      try {
        const range = await fetchLatestSalesReportNDayRange(ac.signal, 3);
        if (cancelled) return;
        if (range?.startDateStr && range?.endDateStr) {
          setStartDate(range.startDateStr);
          setEndDate(range.endDateStr);
          return;
        }
      } catch (e) {
        if (e?.name === 'AbortError') return;
        console.warn('[NhanSuSaleLumiMoi] default 3 days from Supabase:', e);
      }
      if (!cancelled) setDefaultDates();
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [setDefaultDates]);

  /** Dữ liệu `sales_reports` (Supabase / fallback API) theo bộ lọc ngày. Phân quyền `?id=`: users Supabase. */
  useEffect(() => {
    if (!startDate || !endDate) return;
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [mappedRaw, emp] = await Promise.all([
          fetchSalesReportsMapped(startDate, endDate, ac.signal),
          fetchEmployeeDataForRestrict(),
        ]);
        if (cancelled) return;
        const exactWant = normalizeTeamLabel(teamExactFilter);
        let mapped = mappedRaw;
        if (exactWant) {
          mapped = mappedRaw.filter((r) => normalizeTeamLabel(r.team) === exactWant);
        } else {
          const kw = String(teamKeyword || '').toLowerCase();
          if (kw === 'cskh') {
            mapped = mappedRaw.filter((r) => String(r.team || '').toLowerCase().includes('cskh'));
          } else if (kw) {
            mapped = mappedRaw.filter((r) => !String(r.team || '').toLowerCase().includes('cskh'));
          }
        }
        setEmployeeData(emp);
        setRawData(mapped);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        console.error(e);
        alert('Không thể tải dữ liệu. Vui lòng kiểm tra lại đường link hoặc kết nối mạng.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [startDate, endDate, teamKeyword, teamExactFilter]);

  /** Phân quyền + bộ lọc + iframe — chạy khi có dữ liệu hoặc đổi id (không gọi lại API). */
  useEffect(() => {
    const emp = employeeData;
    const mapped = rawData;
    const idFromUrl = idSheet;

    const resetFilterLists = (restricted, branch, team, names, emailForRow) => {
      const dataForFilters = filterRawForRestrictedPopulate(
        mapped,
        restricted,
        branch,
        team,
        names,
        null,
        emailForRow
      );
      setProductAll(true);
      setCaAll(true);
      setTeamAll(true);
      setMarketAll(true);
      setNameAll(true);
      setNameSel([]);
      setProductSel(uniqueSorted(dataForFilters, 'sanPham'));
      setCaSel(uniqueSorted(dataForFilters, 'ca').map(String));
      setTeamSel(uniqueSorted(dataForFilters, 'team').map(String));
      setMarketSel(uniqueSorted(dataForFilters, 'thiTruong'));
    };

    if (!idFromUrl) {
      setIsRestrictedView(false);
      setAllowedNames([]);
      setAllowedTeam(null);
      setAllowedBranch(null);
      setCurrentUserInfo(null);
      setShowThuCongTab(false);
      setIframeKpi(buildKpiEmbedUrl(''));
      setIframeVanDon(buildVanDonEmbedUrl(''));
      setReportTitle('DỮ LIỆU TỔNG HỢP');
      setAllowedUserEmail(null);
      resetFilterLists(false, null, null, [], null);
      return;
    }

    if (!emp.length && !mapped.length) return;

    let restricted = true;
    let names = [];
    let team = null;
    let branch = null;
    let userInfo = null;
    let showThu = false;
    let userEmailForRowMatch = null;

    if (!emp.length) {
      setReportTitle('KHÔNG TÌM THẤY DỮ LIỆU');
      setIsRestrictedView(true);
      setAllowedNames([]);
      setAllowedUserEmail(null);
      setAllowedTeam(null);
      setAllowedBranch(null);
      setCurrentUserInfo(null);
      setShowThuCongTab(false);
      resetFilterLists(true, null, null, [], null);
      return;
    }

    const currentUserRecord = emp.find(
      (record) => record['id'] === idFromUrl && record['Email'] != null && record['Email'] !== ''
    );

    if (currentUserRecord) {
      const cleanName = (currentUserRecord['Họ Và Tên'] || '').trim();
      const userRole = (currentUserRecord['Chức vụ'] || currentUserRecord['Vị trí'] || '').trim();
      const userBranch =
        (currentUserRecord['chi nhánh'] || currentUserRecord['Chi nhánh'] || '').trim() ||
        'Không xác định';
      const userTeam = (currentUserRecord['Team'] || '').trim();

      userInfo = {
        ten: cleanName,
        email: (currentUserRecord['Email'] || '').trim(),
      };
      showThu = true;

      if (userRole === 'Sale Leader') {
        branch = userBranch;
        team = null;
        names = [];
        userEmailForRowMatch = null;
        setReportTitle(`DỮ LIỆU CHI NHÁNH - ${userBranch}`);
      } else if (userRole === 'Leader') {
        team = userTeam ? userTeam.trim() : null;
        branch = null;
        names = [];
        userEmailForRowMatch = null;
        setReportTitle(`DỮ LIỆU TEAM - ${userTeam}`);
      } else if (userRole === 'NV') {
        setReportTitle(`DỮ LIỆU CÁ NHÂN - ${cleanName}`);
        names = [cleanName];
        team = null;
        userEmailForRowMatch = (currentUserRecord['Email'] || '').toLowerCase().trim() || null;
      } else {
        setReportTitle(`DỮ LIỆU CÁ NHÂN - ${cleanName}`);
        names = [cleanName];
        team = null;
        branch = null;
        userEmailForRowMatch = (currentUserRecord['Email'] || '').toLowerCase().trim() || null;
      }
    } else {
      setReportTitle('KHÔNG TÌM THẤY DỮ LIỆU');
      names = [];
      team = null;
      branch = null;
      userEmailForRowMatch = null;
    }

    setIsRestrictedView(restricted);
    setAllowedNames(names);
    setAllowedUserEmail(userEmailForRowMatch);
    setAllowedTeam(team);
    setAllowedBranch(branch);
    setCurrentUserInfo(userInfo);
    setShowThuCongTab(showThu);

    setIframeKpi(buildKpiEmbedUrl(idFromUrl));
    setIframeVanDon(buildVanDonEmbedUrl(idFromUrl));

    resetFilterLists(restricted, branch, team, names, userEmailForRowMatch);
  }, [idSheet, employeeData, rawData]);

  const filteredData = useMemo(() => {
    return filterRawData({
      rawData,
      isRestrictedView,
      allowedBranch,
      allowedTeam,
      allowedNames,
      allowedUserEmail,
      allowedPersonnelNames,
      startDateStr: startDate,
      endDateStr: endDate,
      productAll,
      selectedProducts: productAll ? null : productSel,
      caAll,
      selectedShifts: caAll ? null : caSel,
      teamAll,
      selectedTeams: teamAll ? null : teamSel,
      marketAll,
      selectedMarkets: marketAll ? null : marketSel,
      nameAll: showPersonnelNameFilter ? nameAll : true,
      selectedNames:
        showPersonnelNameFilter && !nameAll ? nameSel : null,
    });
  }, [
    rawData,
    isRestrictedView,
    allowedBranch,
    allowedTeam,
    allowedNames,
    allowedUserEmail,
    allowedPersonnelNames,
    startDate,
    endDate,
    productAll,
    productSel,
    caAll,
    caSel,
    teamAll,
    teamSel,
    marketAll,
    marketSel,
    showPersonnelNameFilter,
    nameAll,
    nameSel,
  ]);

  /** Dùng chung cho sidebar — tránh gọi filterRawForRestrictedPopulate hàng chục lần mỗi render */
  const restrictedForPopulate = useMemo(
    () =>
      filterRawForRestrictedPopulate(
        rawData,
        isRestrictedView,
        allowedBranch,
        allowedTeam,
        allowedNames,
        allowedPersonnelNames,
        allowedUserEmail
      ),
    [rawData, isRestrictedView, allowedBranch, allowedTeam, allowedNames, allowedPersonnelNames, allowedUserEmail]
  );

  /** Checkbox Tên Sale: ưu tiên danh sách `selected_personnel`; không có thì theo tên trong báo cáo. */
  const personnelNameFilterOptions = useMemo(() => {
    if (!showPersonnelNameFilter) return [];
    if (allowedPersonnelNames && allowedPersonnelNames.length > 0) {
      return [...allowedPersonnelNames].sort((a, b) =>
        String(a).localeCompare(String(b), 'vi')
      );
    }
    return uniqueSorted(restrictedForPopulate, 'ten');
  }, [showPersonnelNameFilter, allowedPersonnelNames, restrictedForPopulate]);

  /** Tính lại bảng sau khi React rảnh — bớt lag khi đổi checkbox / ngày (dữ liệu lớn). */
  const deferredFiltered = useDeferredValue(filteredData);

  /** Trùng key Ngày+Tên+SP+TT → gộp trước khi cộng Số đơn TT (tránh nhân đôi). */
  const deferredFilteredDeduped = useMemo(
    () => dedupeSalesReportRowsByTTKey(deferredFiltered),
    [deferredFiltered]
  );

  const summaryMain = useMemo(() => {
    const { flatList, total } = summarizeAndSortSalesData(deferredFilteredDeduped);
    const flatListFiltered = flatListFilteredNoTeamNghi(flatList);
    const doanhSoMap = {};
    flatListFiltered.forEach((item) => {
      doanhSoMap[item.name] = item.doanhThuChotThucTe;
    });
    /* Tổng dòng — giữ công thức file HTML */
    const soDonSauHuyTotal2 = total.soDonThucTe - total.soDonHoanHuyThucTe;
    const dsSauHuyTTTotal = total.doanhThuChotThucTe - total.doanhSoHoanHuyThucTe;
    const totalRateSauHuy = total.mess ? soDonSauHuyTotal2 / total.mess : 0;
    const soDonHuyTotal = total.soDonThucTe - soDonSauHuyTotal2;
    const tiLeHuyTotal = total.soDonThucTe > 0 ? soDonHuyTotal / total.soDonThucTe : 0;

    return {
      flatListFiltered,
      total,
      doanhSoMap,
      soDonSauHuyTotal2,
      dsSauHuyTTTotal,
      totalRateSauHuy,
      soDonHuyTotal,
      tiLeHuyTotal,
    };
  }, [deferredFilteredDeduped]);

  const onTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'thu-cong' && currentUserInfo) {
      const params = new URLSearchParams({
        hoten: currentUserInfo.ten,
        email: currentUserInfo.email,
        tableName: thuCongTableName,
      });
      setIframeThuCong(`${NSSL_IFRAME_THU_CONG}?${params.toString()}`);
    }
  };

  const toggleMaster = (all, setAll, setSel) => {
    if (all) {
      setAll(false);
      setSel([]);
    } else {
      setAll(true);
      setSel([]);
    }
  };

  const { flatListFiltered, total, doanhSoMap, soDonSauHuyTotal2, dsSauHuyTTTotal, totalRateSauHuy, soDonHuyTotal, tiLeHuyTotal } =
    summaryMain;

  const totalRateChot = total.mess ? total.soDonThucTe / total.mess : 0;

  return (
    <div className="nssl-root" data-report-table={reportTableName}>
      <div className={`nssl-loading-overlay ${loading ? 'visible' : ''}`}>Đang tải dữ liệu...</div>

      <div className="report-container">
        <div className="sidebar">
          <h3>Bộ lọc</h3>
          <label>
            Từ ngày:
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            Đến ngày:
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>

          {showPersonnelNameFilter && personnelNameFilterOptions.length > 0 && (
            <>
              <h3>Tên Sale</h3>
              <p className="nssl-filter-hint">
                {allowedPersonnelNames?.length
                  ? 'Danh sách theo selected_personnel trên tài khoản.'
                  : 'Danh sách theo tên có trong báo cáo (quyền xem tất cả).'}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={nameAll}
                  onChange={() => {
                    if (nameAll) {
                      setNameAll(false);
                      setNameSel([...personnelNameFilterOptions]);
                    } else {
                      setNameAll(true);
                      setNameSel([]);
                    }
                  }}
                />{' '}
                Tất cả
              </label>
              <div className="indent">
                {personnelNameFilterOptions.map((val) => (
                  <label key={val}>
                    <input
                      type="checkbox"
                      checked={nameAll || nameSel.includes(val)}
                      onChange={() => {
                        if (nameAll) {
                          setNameAll(false);
                          setNameSel([val]);
                          return;
                        }
                        const next = nameSel.includes(val)
                          ? nameSel.filter((x) => x !== val)
                          : [...nameSel, val];
                        setNameSel(next);
                        if (next.length === personnelNameFilterOptions.length) {
                          setNameAll(true);
                          setNameSel([]);
                        }
                      }}
                    />{' '}
                    {val}
                  </label>
                ))}
              </div>
            </>
          )}

          <h3>Sản phẩm</h3>
          <label>
            <input
              type="checkbox"
              checked={productAll}
              onChange={() => toggleMaster(productAll, setProductAll, setProductSel, [])}
            />{' '}
            Tất cả
          </label>
          <div className="indent">
            {productSel.length > 0 || !productAll
              ? uniqueSorted(restrictedForPopulate, 'sanPham').map((val) => (
                  <label key={val}>
                    <input
                      type="checkbox"
                      className="filter-product"
                      checked={productAll || productSel.includes(val)}
                      onChange={() => {
                        if (productAll) {
                          setProductAll(false);
                          setProductSel([val]);
                          return;
                        }
                        const next = productSel.includes(val)
                          ? productSel.filter((x) => x !== val)
                          : [...productSel, val];
                        setProductSel(next);
                        const allKeys = uniqueSorted(
                          restrictedForPopulate,
                          'sanPham'
                        );
                        if (next.length === allKeys.length) {
                          setProductAll(true);
                          setProductSel([]);
                        }
                      }}
                    />{' '}
                    {val}
                  </label>
                ))
              : uniqueSorted(
restrictedForPopulate,
                  'sanPham'
                ).map((val) => (
                  <label key={val}>
                    <input type="checkbox" checked readOnly /> {val}
                  </label>
                ))}
          </div>

          <h3>Ca</h3>
          <label>
            <input
              type="checkbox"
              checked={caAll}
              onChange={() => {
                if (caAll) {
                  setCaAll(false);
                  setCaSel([]);
                } else {
                  setCaAll(true);
                  setCaSel([]);
                }
              }}
            />{' '}
            Tất cả
          </label>
          <div className="indent">
            {uniqueSorted(
              restrictedForPopulate,
              'ca'
            ).map((val) => (
              <label key={String(val)}>
                <input
                  type="checkbox"
                  checked={caAll || caSel.includes(String(val))}
                  onChange={() => {
                    if (caAll) {
                      setCaAll(false);
                      setCaSel([String(val)]);
                      return;
                    }
                    const s = String(val);
                    const next = caSel.includes(s) ? caSel.filter((x) => x !== s) : [...caSel, s];
                    setCaSel(next);
                    const allKeys = uniqueSorted(
restrictedForPopulate,
                      'ca'
                    ).map(String);
                    if (next.length === allKeys.length) {
                      setCaAll(true);
                      setCaSel([]);
                    }
                  }}
                />{' '}
                {String(val)}
              </label>
            ))}
          </div>

          <h3>Team</h3>
          <label>
            <input
              type="checkbox"
              checked={teamAll}
              onChange={() => {
                if (teamAll) {
                  setTeamAll(false);
                  setTeamSel([]);
                } else {
                  setTeamAll(true);
                  setTeamSel([]);
                }
              }}
            />{' '}
            Tất cả
          </label>
          <div className="indent">
            {uniqueSorted(
              restrictedForPopulate,
              'team'
            ).map((val) => (
              <label key={val}>
                <input
                  type="checkbox"
                  checked={teamAll || teamSel.includes(val)}
                  onChange={() => {
                    if (teamAll) {
                      setTeamAll(false);
                      setTeamSel([val]);
                      return;
                    }
                    const next = teamSel.includes(val) ? teamSel.filter((x) => x !== val) : [...teamSel, val];
                    setTeamSel(next);
                    const allKeys = uniqueSorted(
restrictedForPopulate,
                      'team'
                    );
                    if (next.length === allKeys.length) {
                      setTeamAll(true);
                      setTeamSel([]);
                    }
                  }}
                />{' '}
                {val}
              </label>
            ))}
          </div>

          <h3>Thị trường</h3>
          <label>
            <input
              type="checkbox"
              checked={marketAll}
              onChange={() => {
                if (marketAll) {
                  setMarketAll(false);
                  setMarketSel([]);
                } else {
                  setMarketAll(true);
                  setMarketSel([]);
                }
              }}
            />{' '}
            Tất cả
          </label>
          <div className="indent">
            {uniqueSorted(
              restrictedForPopulate,
              'thiTruong'
            ).map((val) => (
              <label key={val}>
                <input
                  type="checkbox"
                  checked={marketAll || marketSel.includes(val)}
                  onChange={() => {
                    if (marketAll) {
                      setMarketAll(false);
                      setMarketSel([val]);
                      return;
                    }
                    const next = marketSel.includes(val)
                      ? marketSel.filter((x) => x !== val)
                      : [...marketSel, val];
                    setMarketSel(next);
                    const allKeys = uniqueSorted(
restrictedForPopulate,
                      'thiTruong'
                    );
                    if (next.length === allKeys.length) {
                      setMarketAll(true);
                      setMarketSel([]);
                    }
                  }}
                />{' '}
                {val}
              </label>
            ))}
          </div>
        </div>

        <div className="main-detailed">
          <div className="header">
            <img src={LOGO_URL} alt="Logo" />
            <h2>{reportTitle}</h2>
          </div>

          <div className="tabs-container">
            <button
              type="button"
              className={`tab-button ${activeTab === 'sau-huy' ? 'active' : ''}`}
              onClick={() => onTabClick('sau-huy')}
            >
              Sale đã trừ hủy
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'chot' ? 'active' : ''}`}
              onClick={() => onTabClick('chot')}
            >
              Dữ liệu báo cáo tay
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'kpi-sale' ? 'active' : ''}`}
              onClick={() => onTabClick('kpi-sale')}
            >
              KPIs Sale
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'van-don-sale' ? 'active' : ''}`}
              onClick={() => onTabClick('van-don-sale')}
            >
              Vận đơn Sale
            </button>
            {showThuCongTab && (
              <button
                type="button"
                className={`tab-button ${activeTab === 'thu-cong' ? 'active' : ''}`}
                onClick={() => onTabClick('thu-cong')}
              >
                Báo cáo thủ công
              </button>
            )}
          </div>

          <div id="tab-sau-huy" className={`tab-content ${activeTab === 'sau-huy' ? 'active' : ''}`}>
            <div className="table-responsive-container">
              <table id="summary-table-sau-huy">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số đơn hủy</th>
                    <th>Số đơn TT</th>
                    <th>Số đơn sau huỷ</th>
                    <th>Doanh số TT</th>
                    <th>DS Sau Hủy TT</th>
                    <th>Tỉ lệ chốt</th>
                    <th>Tỉ lệ hủy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td className="total-label" colSpan={3}>
                      TỔNG CỘNG
                    </td>
                    <td className="total-value">{formatNumber(soDonHuyTotal)}</td>
                    <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                    <td className="total-value">{formatNumber(soDonSauHuyTotal2)}</td>
                    <td className="total-value">{formatCurrency(total.doanhThuChotThucTe)}</td>
                    <td className="total-value">{formatCurrency(dsSauHuyTTTotal)}</td>
                    <td className="total-value">{formatPercent(totalRateSauHuy)}</td>
                    <td className="total-value">{formatPercent(tiLeHuyTotal)}</td>
                  </tr>
                  {flatListFiltered.map((item, index) => {
                    const soDonSauHuy = item.soDonThucTe - item.soDonHoanHuyThucTe;
                    const dsSauHuyTT = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                    const rate = item.mess ? soDonSauHuy / item.mess : 0;
                    const rateClass = rate >= 0.1 ? 'bg-green' : rate > 0.05 ? 'bg-yellow' : '';
                    const soDonTT = item.soDonThucTe;
                    const soDonHuy = soDonTT - soDonSauHuy;
                    const tiLeHuy = soDonTT > 0 ? soDonHuy / soDonTT : 0;
                    const key = `s-${item.name}-${index}`;
                    return (
                      <tr
                        key={key}
                        style={{ '--row-index': index }}
                        className={selectedRowKey === key ? 'row-selected' : ''}
                        onClick={() => setSelectedRowKey((k) => (k === key ? null : key))}
                      >
                        <td className="text-center">{index + 1}</td>
                        <td className="text-left">{item.team}</td>
                        <td className="text-left">{item.name}</td>
                        <td>{formatNumber(soDonHuy)}</td>
                        <td>{formatNumber(soDonTT)}</td>
                        <td>{formatNumber(soDonSauHuy)}</td>
                        <td>{formatCurrency(doanhSoMap[item.name] || 0)}</td>
                        <td>{formatCurrency(dsSauHuyTT)}</td>
                        <td className={rateClass}>{formatPercent(rate)}</td>
                        <td>{formatPercent(tiLeHuy)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activeTab === 'sau-huy' && <DailyBreakdownSauHuy filteredData={deferredFilteredDeduped} />}
          </div>

          <div id="tab-chot" className={`tab-content ${activeTab === 'chot' ? 'active' : ''}`}>
            <div className="table-responsive-container">
              <table id="summary-table-chot">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số Đơn</th>
                    <th>Số đơn TT</th>
                    <th>DS Chốt</th>
                    <th>Doanh số TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td className="total-label" colSpan={3}>
                      TỔNG CỘNG
                    </td>
                    <td className="total-value">{formatNumber(total.mess)}</td>
                    <td className="total-value">{formatNumber(total.phanHoi)}</td>
                    <td className="total-value">{formatNumber(total.don)}</td>
                    <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                    <td className="total-value">{formatCurrency(total.chot)}</td>
                    <td className="total-value">{formatCurrency(total.doanhThuChotThucTe)}</td>
                    <td className="total-value">{formatPercent(totalRateChot)}</td>
                  </tr>
                  {flatListFiltered.map((item, index) => {
                    const rate = item.mess ? item.soDonThucTe / item.mess : 0;
                    const rateClass = rate >= 0.1 ? 'bg-green' : rate > 0.05 ? 'bg-yellow' : '';
                    const key = `c-${item.name}-${index}`;
                    return (
                      <tr
                        key={key}
                        style={{ '--row-index': index }}
                        className={selectedRowKey === key ? 'row-selected' : ''}
                        onClick={() => setSelectedRowKey((k) => (k === key ? null : key))}
                      >
                        <td className="text-center">{index + 1}</td>
                        <td className="text-left">{item.team}</td>
                        <td className="text-left">{item.name}</td>
                        <td>{formatNumber(item.mess)}</td>
                        <td>{formatNumber(item.phanHoi)}</td>
                        <td>{formatNumber(item.don)}</td>
                        <td>{formatNumber(item.soDonThucTe)}</td>
                        <td>{formatCurrency(item.chot)}</td>
                        <td>{formatCurrency(item.doanhThuChotThucTe)}</td>
                        <td className={rateClass}>{formatPercent(rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {activeTab === 'chot' && <DailyBreakdownChot filteredData={deferredFilteredDeduped} />}
          </div>

          <div id="tab-kpi-sale" className={`tab-content ${activeTab === 'kpi-sale' ? 'active' : ''}`}>
            {activeTab === 'kpi-sale' && (
              <iframe title="KPIs Sale" className="nssl-iframe-kpi" src={iframeKpi} loading="lazy" />
            )}
          </div>
          <div id="tab-van-don-sale" className={`tab-content ${activeTab === 'van-don-sale' ? 'active' : ''}`}>
            {activeTab === 'van-don-sale' && (
              <iframe title="Vận đơn Sale" className="nssl-iframe-van" src={iframeVanDon} loading="lazy" />
            )}
          </div>
          <div id="tab-thu-cong" className={`tab-content ${activeTab === 'thu-cong' ? 'active' : ''}`}>
            {activeTab === 'thu-cong' && (
              <iframe title="Báo cáo thủ công" className="nssl-iframe-thucong" src={iframeThuCong} loading="lazy" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyBreakdownSauHuy({ filteredData }) {
  if (!filteredData.length) {
    return (
      <div className="daily-breakdown">
        <h3>Không có dữ liệu chi tiết để hiển thị.</h3>
      </div>
    );
  }
  const groupedByDate = filteredData.reduce((acc, r) => {
    const dateKey = formatDateDisplay(r.ngay);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) =>
      new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-'))
  );

  return (
    <div className="daily-breakdown">
      {sortedDates.map((date) => {
        const dailyData = groupedByDate[date];
        const { flatList, total } = summarizeAndSortSalesData(dailyData);
        const flatListFiltered = flatListFilteredNoTeamNghi(flatList);
        const soDonSauHuyTotal = total.soDonThucTe - total.soDonHoanHuyThucTe;
        const dsSauHuyTTTotal = total.doanhThuChotThucTe - total.doanhSoHoanHuyThucTe;
        const totalRateSauHuy = total.mess ? soDonSauHuyTotal / total.mess : 0;
        return (
          <div key={date}>
            <h3>Chi tiết ngày: {date}</h3>
            <div className="table-responsive-container">
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số đơn TT</th>
                    <th>Doanh số TT</th>
                    <th>Số đơn sau huỷ</th>
                    <th>DS Sau Hủy TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td colSpan={3} className="total-label">
                      TỔNG NGÀY {date}
                    </td>
                    <td className="total-value">{formatNumber(total.mess)}</td>
                    <td className="total-value">{formatNumber(total.phanHoi)}</td>
                    <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                    <td className="total-value">{formatCurrency(total.doanhThuChotThucTe)}</td>
                    <td className="total-value">{formatNumber(soDonSauHuyTotal)}</td>
                    <td className="total-value">{formatCurrency(dsSauHuyTTTotal)}</td>
                    <td className="total-value">{formatPercent(totalRateSauHuy)}</td>
                  </tr>
                  {flatListFiltered.map((item, index) => {
                    const soDonSauHuy = item.soDonThucTe - item.soDonHoanHuyThucTe;
                    const dsSauHuyTT = item.doanhThuChotThucTe - item.doanhSoHoanHuyThucTe;
                    const rate = item.mess ? soDonSauHuy / item.mess : 0;
                    const rateClass = rate >= 0.1 ? 'bg-green' : rate > 0.05 ? 'bg-yellow' : '';
                    return (
                      <tr key={`${date}-${item.name}`} style={{ '--row-index': index }}>
                        <td className="text-center">{index + 1}</td>
                        <td className="text-left">{item.team}</td>
                        <td className="text-left">{item.name}</td>
                        <td>{formatNumber(item.mess)}</td>
                        <td>{formatNumber(item.phanHoi)}</td>
                        <td>{formatNumber(item.soDonThucTe)}</td>
                        <td>{formatCurrency(item.doanhThuChotThucTe)}</td>
                        <td>{formatNumber(soDonSauHuy)}</td>
                        <td>{formatCurrency(dsSauHuyTT)}</td>
                        <td className={rateClass}>{formatPercent(rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyBreakdownChot({ filteredData }) {
  if (!filteredData.length) {
    return (
      <div className="daily-breakdown">
        <h3>Không có dữ liệu chi tiết để hiển thị.</h3>
      </div>
    );
  }
  const groupedByDate = filteredData.reduce((acc, r) => {
    const dateKey = formatDateDisplay(r.ngay);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) =>
      new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-'))
  );

  return (
    <div className="daily-breakdown">
      {sortedDates.map((date) => {
        const dailyData = groupedByDate[date];
        const { flatList, total } = summarizeAndSortSalesData(dailyData);
        const flatListFiltered = flatListFilteredNoTeamNghi(flatList);
        const totalRateChot = total.mess ? total.soDonThucTe / total.mess : 0;
        return (
          <div key={date}>
            <h3>Chi tiết ngày: {date}</h3>
            <div className="table-responsive-container">
              <table>
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số Đơn</th>
                    <th>Số đơn TT</th>
                    <th>DS Chốt</th>
                    <th>Doanh số TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td colSpan={3} className="total-label">
                      TỔNG NGÀY {date}
                    </td>
                    <td className="total-value">{formatNumber(total.mess)}</td>
                    <td className="total-value">{formatNumber(total.phanHoi)}</td>
                    <td className="total-value">{formatNumber(total.don)}</td>
                    <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                    <td className="total-value">{formatCurrency(total.chot)}</td>
                    <td className="total-value">{formatCurrency(total.doanhThuChotThucTe)}</td>
                    <td className="total-value">{formatPercent(totalRateChot)}</td>
                  </tr>
                  {flatListFiltered.map((item, index) => {
                    const rate = item.mess ? item.soDonThucTe / item.mess : 0;
                    const rateClass = rate >= 0.1 ? 'bg-green' : rate > 0.05 ? 'bg-yellow' : '';
                    return (
                      <tr key={`${date}-${item.name}`} style={{ '--row-index': index }}>
                        <td className="text-center">{index + 1}</td>
                        <td className="text-left">{item.team}</td>
                        <td className="text-left">{item.name}</td>
                        <td>{formatNumber(item.mess)}</td>
                        <td>{formatNumber(item.phanHoi)}</td>
                        <td>{formatNumber(item.don)}</td>
                        <td>{formatNumber(item.soDonThucTe)}</td>
                        <td>{formatCurrency(item.chot)}</td>
                        <td>{formatCurrency(item.doanhThuChotThucTe)}</td>
                        <td className={rateClass}>{formatPercent(rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
