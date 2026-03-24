/**
 * View React — trùng layout & logic với nhanSuSaleLumiMoi.html
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase/config';
import '../styles/NhanSuSaleLumiMoiView.css';
import {
  NSSL_API_BASE,
  NSSL_IFRAME_THU_CONG,
  buildKpiEmbedUrl,
  buildVanDonEmbedUrl,
  filterRawData,
  filterRawForRestrictedPopulate,
  formatCurrency,
  formatDateDisplay,
  formatNumber,
  formatPercent,
  mapApiToRawRows,
  summarizeAndSortSalesData,
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

export default function NhanSuSaleLumiMoiView({
  reportTableName = 'Báo cáo sale',
  thuCongTableName = 'Báo cáo sale',
}) {
  const idSheet = useResolvedIdsheet();

  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);

  const [reportTitle, setReportTitle] = useState('DỮ LIỆU TỔNG HỢP');
  const [isRestrictedView, setIsRestrictedView] = useState(false);
  const [allowedNames, setAllowedNames] = useState([]);
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

  const [activeTab, setActiveTab] = useState('sau-huy');
  const [selectedRowKey, setSelectedRowKey] = useState(null);

  const [iframeKpi, setIframeKpi] = useState(() => buildKpiEmbedUrl(''));
  const [iframeVanDon, setIframeVanDon] = useState(() => buildVanDonEmbedUrl(''));
  const [iframeThuCong, setIframeThuCong] = useState('about:blank');

  const setDefaultDates = useCallback(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const fmt = (d) => d.toISOString().split('T')[0];
    setStartDate(fmt(firstDay));
    setEndDate(fmt(lastDay));
  }, []);

  useEffect(() => {
    setDefaultDates();
  }, [setDefaultDates]);

  /** Chỉ fetch 1 lần / đổi bảng — không fetch lại khi idSheet cập nhật sau Supabase (giảm ~50% thời gian chờ). */
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      setLoading(true);
      const url = `${NSSL_API_BASE}/report/generate?tableName=${encodeURIComponent(reportTableName)}`;
      try {
        const res = await fetch(url, { signal: ac.signal });
        const result = await res.json();
        if (cancelled) return;
        const apiData = result.data || [];
        const emp = result.employeeData || [];
        setEmployeeData(emp);
        const mapped = mapApiToRawRows(apiData);
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
  }, [reportTableName]);

  /** Phân quyền + bộ lọc + iframe — chạy khi có dữ liệu hoặc đổi id (không gọi lại API). */
  useEffect(() => {
    const emp = employeeData;
    const mapped = rawData;
    const idFromUrl = idSheet;

    const resetFilterLists = (restricted, branch, team, names) => {
      const dataForFilters = filterRawForRestrictedPopulate(mapped, restricted, branch, team, names);
      setProductAll(true);
      setCaAll(true);
      setTeamAll(true);
      setMarketAll(true);
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
      resetFilterLists(false, null, null, []);
      return;
    }

    if (!emp.length && !mapped.length) return;

    let restricted = true;
    let names = [];
    let team = null;
    let branch = null;
    let userInfo = null;
    let showThu = false;

    if (!emp.length) {
      setReportTitle('KHÔNG TÌM THẤY DỮ LIỆU');
      setIsRestrictedView(true);
      setAllowedNames([]);
      setAllowedTeam(null);
      setAllowedBranch(null);
      setCurrentUserInfo(null);
      setShowThuCongTab(false);
      resetFilterLists(true, null, null, []);
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
        setReportTitle(`DỮ LIỆU CHI NHÁNH - ${userBranch}`);
      } else if (userRole === 'Leader') {
        team = userTeam ? userTeam.trim() : null;
        branch = null;
        names = [];
        setReportTitle(`DỮ LIỆU TEAM - ${userTeam}`);
      } else if (userRole === 'NV') {
        setReportTitle(`DỮ LIỆU CÁ NHÂN - ${cleanName}`);
        names = [cleanName];
        team = null;
      } else {
        setReportTitle(`DỮ LIỆU CÁ NHÂN - ${cleanName}`);
        names = [cleanName];
        team = null;
        branch = null;
      }
    } else {
      setReportTitle('KHÔNG TÌM THẤY DỮ LIỆU');
      names = [];
      team = null;
      branch = null;
    }

    setIsRestrictedView(restricted);
    setAllowedNames(names);
    setAllowedTeam(team);
    setAllowedBranch(branch);
    setCurrentUserInfo(userInfo);
    setShowThuCongTab(showThu);

    setIframeKpi(buildKpiEmbedUrl(idFromUrl));
    setIframeVanDon(buildVanDonEmbedUrl(idFromUrl));

    resetFilterLists(restricted, branch, team, names);
  }, [idSheet, employeeData, rawData]);

  const filteredData = useMemo(() => {
    return filterRawData({
      rawData,
      isRestrictedView,
      allowedBranch,
      allowedTeam,
      allowedNames,
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
    });
  }, [
    rawData,
    isRestrictedView,
    allowedBranch,
    allowedTeam,
    allowedNames,
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
  ]);

  /** Dùng chung cho sidebar — tránh gọi filterRawForRestrictedPopulate hàng chục lần mỗi render */
  const restrictedForPopulate = useMemo(
    () => filterRawForRestrictedPopulate(rawData, isRestrictedView, allowedBranch, allowedTeam, allowedNames),
    [rawData, isRestrictedView, allowedBranch, allowedTeam, allowedNames]
  );

  /** Tính lại bảng sau khi React rảnh — bớt lag khi đổi checkbox / ngày (dữ liệu lớn). */
  const deferredFiltered = useDeferredValue(filteredData);

  const summaryMain = useMemo(() => {
    const { flatList, total } = summarizeAndSortSalesData(deferredFiltered);
    const flatListFiltered = flatListFilteredNoTeamNghi(flatList);
    const doanhSoMap = {};
    flatListFiltered.forEach((item) => {
      doanhSoMap[item.name] = item.chot;
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
  }, [deferredFiltered]);

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
    <div className="nssl-root">
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
                    <th>Chi nhánh</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số đơn hủy</th>
                    <th>Số đơn TT</th>
                    <th>Số đơn sau huỷ</th>
                    <th>Doanh số</th>
                    <th>DS Sau Hủy TT</th>
                    <th>Tỉ lệ chốt</th>
                    <th>Tỉ lệ hủy</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td className="total-label" colSpan={4}>
                      TỔNG CỘNG
                    </td>
                    <td className="total-value">{formatNumber(soDonHuyTotal)}</td>
                    <td className="total-value">{formatNumber(total.soDonThucTe)}</td>
                    <td className="total-value">{formatNumber(soDonSauHuyTotal2)}</td>
                    <td className="total-value" />
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
                        <td className="text-left">{item.chiNhanh}</td>
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
            {activeTab === 'sau-huy' && <DailyBreakdownSauHuy filteredData={deferredFiltered} />}
          </div>

          <div id="tab-chot" className={`tab-content ${activeTab === 'chot' ? 'active' : ''}`}>
            <div className="table-responsive-container">
              <table id="summary-table-chot">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Chi nhánh</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số Đơn</th>
                    <th>Số Đơn TT</th>
                    <th>DS Chốt</th>
                    <th>DS Chốt TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td className="total-label" colSpan={4}>
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
                        <td className="text-left">{item.chiNhanh}</td>
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
            {activeTab === 'chot' && <DailyBreakdownChot filteredData={deferredFiltered} />}
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
                    <th>Chi nhánh</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số đơn sau huỷ</th>
                    <th>DS Sau Hủy TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td colSpan={4} className="total-label">
                      TỔNG NGÀY {date}
                    </td>
                    <td className="total-value">{formatNumber(total.mess)}</td>
                    <td className="total-value">{formatNumber(total.phanHoi)}</td>
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
                        <td className="text-left">{item.chiNhanh}</td>
                        <td className="text-left">{item.team}</td>
                        <td className="text-left">{item.name}</td>
                        <td>{formatNumber(item.mess)}</td>
                        <td>{formatNumber(item.phanHoi)}</td>
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
                    <th>Chi nhánh</th>
                    <th>Team</th>
                    <th>Sale</th>
                    <th>Số Mess</th>
                    <th>Phản hồi</th>
                    <th>Số Đơn</th>
                    <th>Số Đơn TT</th>
                    <th>DS Chốt</th>
                    <th>DS Chốt TT</th>
                    <th>Tỉ lệ chốt</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td colSpan={4} className="total-label">
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
                        <td className="text-left">{item.chiNhanh}</td>
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
