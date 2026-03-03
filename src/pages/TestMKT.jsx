import { useEffect, useState, useMemo } from 'react';
import { getDetailReportsStatisticsByQuery } from '../services/detailReportsApiService';
import './TestMKT.css';
import '../pages/XemBaoCaoMKT.css';

function TestMKT() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Statistics');
  const [team, setTeam] = useState('');
  const [ca, setCa] = useState('');
  const [sanPham, setSanPham] = useState('');
  const [thiTruong, setThiTruong] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [teams, setTeams] = useState([]);
  const [cas, setCas] = useState([]);
  const [sanPhams, setSanPhams] = useState([]);
  const [thiTruongs, setThiTruongs] = useState([]);

  // Fetch filter options and initial data on mount
  useEffect(() => {
    fetchFilterOptions();
    fetchData(); // Fetch initial data on mount
  }, []);

  // Fetch filter options separately (without applying filters)
  const fetchFilterOptions = async () => {
    try {
      const params = {};
      const result = await getDetailReportsStatisticsByQuery(params);
      
      // Extract filter options from statistics
      if (result?.statistics?.by_team?.count) {
        const teamList = Object.keys(result.statistics.by_team.count);
        setTeams(teamList.sort());
      }
      if (result?.statistics?.by_ca?.count) {
        const caList = Object.keys(result.statistics.by_ca.count);
        setCas(caList.sort());
      }
      if (result?.statistics?.by_san_pham?.count) {
        const sanPhamList = Object.keys(result.statistics.by_san_pham.count);
        setSanPhams(sanPhamList.sort());
      }
      if (result?.statistics?.by_thi_truong?.count) {
        const thiTruongList = Object.keys(result.statistics.by_thi_truong.count);
        setThiTruongs(thiTruongList.sort());
      }
    } catch (err) {
      console.warn('⚠️ Could not fetch filter options, using mock data');
      // Use mock data
      setTeams(["MARKETING", "MKT - Đức Anh", "HN-MKT", "Team Test", "MKT-Công ty-HCM", "MKT - Đức Anh 1", "MKT-Công ty-HN"]);
      setCas(["Hết ca", "Giữa ca", "Unknown"]);
      setSanPhams(["Gel Trĩ", "Fitgum CAFE 20X", "Bakuchiol Retinol", "DG", "Kem Body", "Serum Sâm", "Bonavita Coffee", "Dán Kinoki", "Dragon Blood Cream", "Brusko coffe", "ComboGold24k", "Unknown", "Gel Xương Khớp", "Sữa tắm CUISHIFAN"]);
      setThiTruongs(["Nhật Bản", "Canada", "Hàn Quốc", "US", "Úc", "CĐ Nhật Bản", "Unknown"]);
    }
  };

  // Convert date from YYYY-MM-DD to DD/MM/YYYY for API
  const formatDateForAPI = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (team) params.team = team;
      if (ca) params.ca = ca;
      if (sanPham) params.san_pham = sanPham;
      if (thiTruong) params.thi_truong = thiTruong;
      if (fromDate) params.from_date = formatDateForAPI(fromDate);
      if (toDate) params.to_date = formatDateForAPI(toDate);
      
      console.log('📡 Fetching statistics with params:', params);
      const result = await getDetailReportsStatisticsByQuery(params);
      console.log('✅ Statistics received:', result);
      setData(result);
      
      // Extract teams list from statistics.by_team
      if (result?.statistics?.by_team?.count) {
        const teamList = Object.keys(result.statistics.by_team.count);
        setTeams(teamList.sort());
      }
    } catch (err) {
      console.error('❌ Error fetching statistics:', err);
      
      // Use mock data if API fails (for development/testing)
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Không thể kết nối')) {
        console.warn('⚠️ Using mock data due to API connection failure');
        const mockData = {
          statistics: {
            total_records: 1000,
            total_cpqc: 2561956965.71,
            total_mess_cmt: 36378,
            average_mess_cmt: 36.38,
            by_ten: {
              count: {
                "admin@marketing.com": 1,
                "Lâm Thị Thu Thảo": 23,
                "Nguyễn Danh Nam": 102,
                "Nguyễn Đức Anh": 94,
                "Nguyễn Duy Hiếu": 20,
                "Nguyễn Quang Minh": 92,
                "Nguyễn Văn Việt": 36,
                "Lê Thanh Quốc": 4,
                "Nguyễn Nam Khánh": 4,
                "Nguyễn Hiền Lương": 58,
                "Lục Trần Minh Trí": 78,
                "Nguyễn Thị Hiếu": 74,
                "Trần Quốc Khải": 57,
                "Mạnh Cường": 29,
                "Nguyễn Quang Trường": 85,
                "Vũ Viết Anh": 48,
                "Nguyễn Văn Hoàng": 25,
                "Trần Huy Hùng": 41,
                "Nguyễn Thị Như Quỳnh": 3,
                "Phạm Tiến Thành": 45,
                "Lê Trung Hiếu": 33,
                "Đoàn Ngọc Huân": 5,
                "Hoàng Tuấn Cường": 3,
                "Nguyễn Đức Anh 2": 2,
                "Đinh Văn Khải": 19,
                "MKT LumiGlobal_HCM": 3,
                "MKT LumiGlobal_HN": 5,
                "Đỗ Mạnh Cường": 10,
                "Bùi Đức Tài": 1
              },
              total_mess_cmt: {
                "admin@marketing.com": 13,
                "Lâm Thị Thu Thảo": 346,
                "Nguyễn Danh Nam": 5068,
                "Nguyễn Đức Anh": 6976,
                "Nguyễn Duy Hiếu": 533,
                "Nguyễn Quang Minh": 4043,
                "Nguyễn Văn Việt": 223,
                "Lê Thanh Quốc": 16,
                "Nguyễn Nam Khánh": 16,
                "Nguyễn Hiền Lương": 1348,
                "Lục Trần Minh Trí": 1123,
                "Nguyễn Thị Hiếu": 1453,
                "Trần Quốc Khải": 2758,
                "Mạnh Cường": 1205,
                "Nguyễn Quang Trường": 2320,
                "Vũ Viết Anh": 1444,
                "Nguyễn Văn Hoàng": 1653,
                "Trần Huy Hùng": 1698,
                "Nguyễn Thị Như Quỳnh": 214,
                "Phạm Tiến Thành": 1486,
                "Lê Trung Hiếu": 1463,
                "Đoàn Ngọc Huân": 269,
                "Hoàng Tuấn Cường": 121,
                "Nguyễn Đức Anh 2": 122,
                "Đinh Văn Khải": 364,
                "MKT LumiGlobal_HCM": 0,
                "MKT LumiGlobal_HN": 0,
                "Đỗ Mạnh Cường": 102,
                "Bùi Đức Tài": 1
              },
              total_cpqc: {
                "admin@marketing.com": 13,
                "Lâm Thị Thu Thảo": 37336512,
                "Nguyễn Danh Nam": 404703988,
                "Nguyễn Đức Anh": 449687665,
                "Nguyễn Duy Hiếu": 54335533,
                "Nguyễn Quang Minh": 378231844,
                "Nguyễn Văn Việt": 19758734,
                "Lê Thanh Quốc": 1885472,
                "Nguyễn Nam Khánh": 1707144,
                "Nguyễn Hiền Lương": 94522979.48,
                "Lục Trần Minh Trí": 17382334.53,
                "Trần Quốc Khải": 230379174.64,
                "Mạnh Cường": 77169477.57,
                "Nguyễn Quang Trường": 156035159.43,
                "Vũ Viết Anh": 133336155.05,
                "Nguyễn Văn Hoàng": 125476274,
                "Trần Huy Hùng": 93757195.35,
                "Nguyễn Thị Như Quỳnh": 22010766,
                "Phạm Tiến Thành": 176524412.99,
                "Lê Trung Hiếu": 7822.73,
                "Đoàn Ngọc Huân": 17242071.4,
                "Hoàng Tuấn Cường": 7776142,
                "Nguyễn Đức Anh 2": 2300000,
                "Nguyễn Thị Hiếu": 54831757.09,
                "Đinh Văn Khải": 5556790.87,
                "Đỗ Mạnh Cường": 1546.59,
                "Bùi Đức Tài": 1
              }
            },
            by_ca: {
              count: {
                "Hết ca": 898,
                "Giữa ca": 101,
                "Unknown": 1
              },
              total_mess_cmt: {
                "Hết ca": 33797,
                "Giữa ca": 2581,
                "Unknown": 0
              },
              total_cpqc: {
                "Hết ca": 2399918538.67,
                "Giữa ca": 162038427.03
              }
            },
            by_san_pham: {
              count: {
                "Gel Trĩ": 1,
                "Fitgum CAFE 20X": 215,
                "Bakuchiol Retinol": 25,
                "DG": 120,
                "Kem Body": 176,
                "Serum Sâm": 2,
                "Bonavita Coffee": 344,
                "Dán Kinoki": 85,
                "Dragon Blood Cream": 9,
                "Brusko coffe": 17,
                "ComboGold24k": 1,
                "Unknown": 2,
                "Gel Xương Khớp": 1,
                "Sữa tắm CUISHIFAN": 2
              },
              total_mess_cmt: {
                "Gel Trĩ": 13,
                "Fitgum CAFE 20X": 5897,
                "Bakuchiol Retinol": 94,
                "DG": 6674,
                "Kem Body": 5621,
                "Serum Sâm": 4,
                "Bonavita Coffee": 10747,
                "Dán Kinoki": 6583,
                "Dragon Blood Cream": 370,
                "Brusko coffe": 332,
                "ComboGold24k": 0,
                "Unknown": 0,
                "Gel Xương Khớp": 0,
                "Sữa tắm CUISHIFAN": 43
              },
              total_cpqc: {
                "Gel Trĩ": 13,
                "Fitgum CAFE 20X": 522702378.69,
                "Bakuchiol Retinol": 10476159,
                "DG": 548622694,
                "Kem Body": 509950488.59,
                "Serum Sâm": 582721,
                "Bonavita Coffee": 531064064.35,
                "Dán Kinoki": 416362186,
                "Dragon Blood Cream": 19056380,
                "Brusko coffe": 3919.07,
                "Sữa tắm CUISHIFAN": 3135962
              }
            },
            by_thi_truong: {
              count: {
                "Nhật Bản": 30,
                "Canada": 204,
                "Hàn Quốc": 4,
                "US": 743,
                "Úc": 15,
                "CĐ Nhật Bản": 3,
                "Unknown": 1
              },
              total_mess_cmt: {
                "Nhật Bản": 398,
                "Canada": 5204,
                "Hàn Quốc": 67,
                "US": 29989,
                "Úc": 720,
                "CĐ Nhật Bản": 0,
                "Unknown": 0
              },
              total_cpqc: {
                "Nhật Bản": 18382511,
                "Canada": 367912640.89,
                "Hàn Quốc": 4299287,
                "US": 2113757195.81,
                "Úc": 54421332,
                "CĐ Nhật Bản": 3183999
              }
            },
            by_team: {
              count: {
                "MARKETING": 1,
                "MKT - Đức Anh": 397,
                "HN-MKT": 533,
                "Team Test": 56,
                "MKT-Công ty-HCM": 3,
                "MKT - Đức Anh 1": 5,
                "MKT-Công ty-HN": 5
              },
              total_mess_cmt: {
                "MARKETING": 13,
                "MKT - Đức Anh": 18996,
                "HN-MKT": 15420,
                "Team Test": 1949,
                "MKT-Công ty-HCM": 0,
                "MKT - Đức Anh 1": 0,
                "MKT-Công ty-HN": 0
              },
              total_cpqc: {
                "MARKETING": 13,
                "MKT - Đức Anh": 1475423166,
                "HN-MKT": 1073193030.1,
                "Team Test": 13340756.6
              }
            }
          },
          filters_applied: {
            team: team || "",
            ca: ca || "",
            san_pham: sanPham || "",
            thi_truong: thiTruong || "",
            from_date: fromDate ? formatDateForAPI(fromDate) : "",
            to_date: toDate ? formatDateForAPI(toDate) : ""
          },
          total_records_analyzed: 1000
        };
        setData(mockData);
        
        // Extract teams from mock data
        if (mockData?.statistics?.by_team?.count) {
          const teamList = Object.keys(mockData.statistics.by_team.count);
          setTeams(teamList.sort());
        }
        
        // Set special error flag to show warning banner instead of blocking view
        setError(`MOCK_DATA: ${err.message}`);
      } else {
        setError(err.message || 'Lỗi khi tải dữ liệu từ API. Vui lòng kiểm tra kết nối mạng.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(value));
  };

  const formatNumber = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  const formatPercent = (value) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(2)}%`;
  };

  // Process data for KPI table - MUST be before any early returns
  const kpiData = useMemo(() => {
    if (!data?.statistics?.by_ten) return { rows: [], total: {} };
    
    const byTen = data.statistics.by_ten;
    const rows = Object.keys(byTen.count || {}).map((ten, index) => {
      const count = byTen.count[ten] || 0;
      const mess = byTen.total_mess_cmt[ten] || 0;
      const cpqc = byTen.total_cpqc[ten] || 0;
      
      // Calculate metrics from available data
      const cp_ds = 0; // Not available in statistics
      const kpi_percent = 0; // Not available in statistics
      
      return {
        stt: index + 1,
        team: '', // Will be filled from team mapping if available
        name: ten,
        mess,
        cpqc,
        dsChot: 0,
        dsChotTT: 0,
        soDonHuyTT: 0,
        dsHuyTT: 0,
        dsThanhCongTT: 0,
        cp_ds,
        kpi_percent
      };
    });
    
    const total = rows.reduce((acc, row) => ({
      mess: acc.mess + row.mess,
      cpqc: acc.cpqc + row.cpqc,
      dsChot: acc.dsChot + row.dsChot,
      dsChotTT: acc.dsChotTT + row.dsChotTT,
      soDonHuyTT: acc.soDonHuyTT + row.soDonHuyTT,
      dsHuyTT: acc.dsHuyTT + row.dsHuyTT,
      dsThanhCongTT: acc.dsThanhCongTT + row.dsThanhCongTT,
      cp_ds_sau_ship: 0,
      kpi_percent: 0
    }), {
      mess: 0, cpqc: 0, dsChot: 0, dsChotTT: 0, soDonHuyTT: 0, dsHuyTT: 0, dsThanhCongTT: 0,
      cp_ds_sau_ship: 0, kpi_percent: 0
    });
    
    return { rows, total };
  }, [data]);

  const fmtCurrency = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(Math.round(value));
  };

  const fmtNum = (value) => {
    if (!value && value !== 0) return '0';
    return new Intl.NumberFormat('vi-VN').format(value);
  };

  const fmtPct = (value) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(2)}%`;
  };

  const renderTable = (title, dataObj, keyName) => {
    if (!dataObj || !dataObj.count) return null;

    const keys = Object.keys(dataObj.count);
    if (keys.length === 0) return null;

    const rows = keys.map(key => ({
      key,
      count: dataObj.count[key] || 0,
      mess: dataObj.total_mess_cmt?.[key] || 0,
      cpqc: dataObj.total_cpqc?.[key] || 0,
    }));

    // Calculate totals
    const totals = rows.reduce((acc, row) => ({
      count: acc.count + row.count,
      mess: acc.mess + row.mess,
      cpqc: acc.cpqc + row.cpqc,
    }), { count: 0, mess: 0, cpqc: 0 });

    return (
      <div className="statistics-section">
        <h3>{title}</h3>
        <table className="statistics-table">
          <thead>
            <tr>
              <th>{keyName}</th>
              <th>Số Đơn</th>
              <th>Số Mess</th>
              <th>CPQC</th>
              <th>Tỉ Lệ Chốt</th>
              <th>Giá Mess</th>
              <th>CPS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const tiLeChot = row.mess ? (row.count / row.mess) * 100 : 0;
              const giaMess = row.mess ? row.cpqc / row.mess : 0;
              const cps = row.count ? row.cpqc / row.count : 0;
              
              return (
                <tr key={index}>
                  <td className="text-left">{row.key}</td>
                  <td className="text-right">{formatNumber(row.count)}</td>
                  <td className="text-right">{formatNumber(row.mess)}</td>
                  <td className="text-right">{formatCurrency(row.cpqc)}</td>
                  <td className="text-right">{formatPercent(tiLeChot)}</td>
                  <td className="text-right">{formatCurrency(giaMess)}</td>
                  <td className="text-right">{formatCurrency(cps)}</td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td className="text-left font-bold">TỔNG CỘNG</td>
              <td className="text-right font-bold">{formatNumber(totals.count)}</td>
              <td className="text-right font-bold">{formatNumber(totals.mess)}</td>
              <td className="text-right font-bold">{formatCurrency(totals.cpqc)}</td>
              <td className="text-right font-bold">
                {formatPercent(totals.mess ? (totals.count / totals.mess) * 100 : 0)}
              </td>
              <td className="text-right font-bold">
                {formatCurrency(totals.mess ? totals.cpqc / totals.mess : 0)}
              </td>
              <td className="text-right font-bold">
                {formatCurrency(totals.count ? totals.cpqc / totals.count : 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="test-mkt-container">
        <div className="loading">Đang tải dữ liệu...</div>
      </div>
    );
  }

  // Check if using mock data (show warning banner but still display data)
  const isUsingMockData = error && error.includes('MOCK_DATA');
  
  // Only show error screen if it's a real error (not mock data)
  if (error && !isUsingMockData) {
    return (
      <div className="test-mkt-container">
        <div className="error">
          <h3>❌ Lỗi khi tải dữ liệu</h3>
          <p>{error}</p>
          <button onClick={fetchData} className="retry-button">Thử lại</button>
        </div>
      </div>
    );
  }

  if (!data || !data.statistics) {
    return (
      <div className="test-mkt-container">
        <div className="error">Không có dữ liệu</div>
      </div>
    );
  }

  const stats = data.statistics;

  return (
    <div className="test-mkt-container">
      {isUsingMockData && (
        <div className="warning-banner">
          ⚠️ Đang sử dụng dữ liệu mẫu (Mock Data) vì không thể kết nối đến API. 
          <button onClick={fetchData} className="retry-button-small">Thử lại</button>
        </div>
      )}
      
      {/* Tab Navigation */}
      <div className="tab-container" style={{ marginBottom: '20px' }}>
        <button
          className={`tablinks ${activeTab === 'Statistics' ? 'active' : ''}`}
          onClick={() => setActiveTab('Statistics')}
        >
          Thống Kê
        </button>
        <button
          className={`tablinks ${activeTab === 'KPIs' ? 'active' : ''}`}
          onClick={() => setActiveTab('KPIs')}
        >
          KPIs
        </button>
      </div>

      <div className="header-section">
        <h1>Báo Cáo Thống Kê MKT</h1>
        
        <div className="filters">
          <div className="filter-group">
            <label>Team:</label>
            <select
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '200px',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả</option>
              {teams.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Ca:</label>
            <select
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '200px',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả</option>
              {cas.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Sản phẩm:</label>
            <select
              value={sanPham}
              onChange={(e) => setSanPham(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '200px',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả</option>
              {sanPhams.map(sp => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Thị trường:</label>
            <select
              value={thiTruong}
              onChange={(e) => setThiTruong(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '200px',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả</option>
              {thiTruongs.map(tt => (
                <option key={tt} value={tt}>{tt}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Từ ngày:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '150px'
              }}
            />
          </div>
          <div className="filter-group">
            <label>Đến ngày:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || ''}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                minWidth: '150px'
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  fetchData();
                }
              }}
            />
          </div>
          <button onClick={fetchData} className="refresh-button" disabled={loading}>
            {loading ? 'Đang tải...' : 'Xem'}
          </button>
        </div>
      </div>

      {/* Tổng quan */}
      <div className="overview-section">
        <h2>Tổng Quan</h2>
        <div className="overview-grid">
          <div className="overview-card">
            <div className="overview-label">Tổng Số Bản Ghi</div>
            <div className="overview-value">{formatNumber(stats.total_records || 0)}</div>
          </div>
          <div className="overview-card">
            <div className="overview-label">Tổng CPQC</div>
            <div className="overview-value">{formatCurrency(stats.total_cpqc || 0)}</div>
          </div>
          <div className="overview-card">
            <div className="overview-label">Tổng Số Mess</div>
            <div className="overview-value">{formatNumber(stats.total_mess_cmt || 0)}</div>
          </div>
          <div className="overview-card">
            <div className="overview-label">Trung Bình Mess/Cmt</div>
            <div className="overview-value">{stats.average_mess_cmt?.toFixed(2) || '0'}</div>
          </div>
        </div>
      </div>

      {/* TAB: Statistics */}
      {activeTab === 'Statistics' && (
        <>
          {/* Bảng theo Tên */}
          {renderTable('Theo Tên (Marketing)', stats.by_ten, 'Tên')}
        </>
      )}

      {/* TAB: KPIs */}
      {activeTab === 'KPIs' && (
        <div className="report-container" style={{ marginTop: '20px', display: 'flex' }}>
          <div className="main-content-area" style={{ width: '100%' }}>
            <div className="header">
              <div style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: '#2d7c2d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '24px', fontWeight: 'bold' }}>MKT</div>
              <h2>BÁO CÁO HIỆU SUẤT KPI</h2>
            </div>
            <div className="table-responsive-container">
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="green-header">STT</th>
                    <th className="green-header">Team</th>
                    <th className="green-header">Marketing</th>
                    <th className="green-header">Số Mess</th>
                    <th className="green-header">CPQC</th>
                    <th className="green-header">DS Chốt</th>
                    <th className="blue-header">DS Chốt (TT)</th>
                    <th className="blue-header">Số đơn hủy (TT)</th>
                    <th className="blue-header">Doanh số Hủy (TT)</th>
                    <th className="blue-header">DS Thành Công (TT)</th>
                    <th className="yellow-header">%CP/DS</th>
                    <th className="yellow-header">% KPI</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="total-row">
                    <td colSpan={3} className="text-center">TỔNG CỘNG</td>
                    <td>{fmtNum(kpiData.total.mess)}</td>
                    <td>{fmtCurrency(kpiData.total.cpqc)}</td>
                    <td>{fmtCurrency(kpiData.total.dsChot)}</td>
                    <td>{fmtCurrency(kpiData.total.dsChotTT)}</td>
                    <td>{fmtNum(kpiData.total.soDonHuyTT)}</td>
                    <td>{fmtCurrency(kpiData.total.dsHuyTT)}</td>
                    <td>{fmtCurrency(kpiData.total.dsThanhCongTT)}</td>
                    <td className="text-center">{fmtPct(kpiData.total.cp_ds_sau_ship)}</td>
                    <td className="text-center">{fmtPct(kpiData.total.kpi_percent)}</td>
                  </tr>
                  {kpiData.rows.map((row) => (
                    <tr key={row.stt}>
                      <td className="text-center">{row.stt}</td>
                      <td>{row.team}</td>
                      <td>{row.name}</td>
                      <td>{fmtNum(row.mess)}</td>
                      <td>{fmtCurrency(row.cpqc)}</td>
                      <td>{fmtCurrency(row.dsChot)}</td>
                      <td>{fmtCurrency(row.dsChotTT)}</td>
                      <td>{fmtNum(row.soDonHuyTT)}</td>
                      <td>{fmtCurrency(row.dsHuyTT)}</td>
                      <td>{fmtCurrency(row.dsThanhCongTT)}</td>
                      <td className="text-center">{fmtPct(row.cp_ds)}</td>
                      <td className="text-center">{fmtPct(row.kpi_percent)}</td>
                    </tr>
                  ))}
                  {kpiData.rows.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center" style={{ padding: '30px' }}>
                        Không có dữ liệu
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Filters Applied */}
      {data.filters_applied && (
        <div className="filters-applied">
          <h3>Bộ Lọc Đã Áp Dụng</h3>
          <div className="filters-info">
            <div><strong>Team:</strong> {data.filters_applied.team || 'Tất cả'}</div>
            <div><strong>Từ ngày:</strong> {data.filters_applied.ngay || 'Tất cả'}</div>
            <div><strong>Đến ngày:</strong> {data.filters_applied.ngay_to || data.filters_applied.ngay || 'Tất cả'}</div>
            <div><strong>Tổng Bản Ghi Phân Tích:</strong> {formatNumber(data.total_records_analyzed || 0)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestMKT;
