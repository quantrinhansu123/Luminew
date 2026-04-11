import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';
import { buildEmailByNameLookup, emailFromName, findEmployeeByName } from '../utils/emailFromName';
import { recalcMktSoDonThucTeFromOrders } from '../services/mktRecalcSoDonThucTeFromOrders';
import { buildMktReportDedupeKey, normalizeMktReportDate } from '../utils/mktDetailReportKey';

/** Độ rộng cột nút — lưới nhập báo cáo MKT */
const MKT_REPORT_ACTION_COL = '5.75rem';

/** `grid-template-columns` theo từng field — header và ô cùng một cột → không lệch */
function mktReportGridColWidth(header) {
  switch (header) {
    case 'Tên':
      return 'minmax(13rem, 22rem)';
    case 'Email':
      return 'minmax(12rem, 18rem)';
    case 'Ngày':
      return '10rem';
    case 'ca':
      return '7.5rem';
    case 'Sản_phẩm':
      return 'minmax(14rem, 18rem)';
    case 'Thị_trường':
      return '8.5rem';
    case 'Team':
      return 'minmax(8rem, 12rem)';
    case 'TKQC':
    case 'CPQC':
      return '7rem';
    case 'Số_Mess_Cmt':
      return '8rem';
    case 'Số đơn':
    case 'Doanh số':
      return '7.5rem';
    default:
      return 'minmax(6.5rem, 10rem)';
  }
}

/**
 * Họ tên cho cột "Tên": ưu tiên trường Name / name trong JSON user (localStorage),
 * rồi các key tiếng Việt, cuối cùng username (sau đăng nhập thường trùng name từ bảng users).
 */
/** Chuẩn hóa để so khớp bộ phận / chi nhánh (bỏ dấu, thường). */
function normalizeKeyVi(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsersTableMktDepartment(department) {
  const n = normalizeKeyVi(department);
  if (!n) return false;
  return n.includes('mkt') || n.includes('marketing');
}

function isUsersTableHanoiBranch(branch) {
  const n = normalizeKeyVi(branch);
  if (!n) return false;
  return n.includes('ha noi') || n.includes('hanoi') || n === 'hn';
}

/** Chuẩn hóa tên để khớp `users.name` với cột `Tên` báo cáo. */
function normMktPersonNameForTeamLookup(s) {
  return normalizeKeyVi(String(s ?? '').trim().replace(/\s+/g, ' '));
}

function escapeIlikePatternFragment(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Admin / quản lý hoặc Trưởng nhóm MKT: được xóa/đổi cột Tên để chọn nhân viên MKT khác. */
function canEditMktReporterName(role) {
  const r = String(role ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (['admin', 'director', 'manager', 'super_admin', 'administrator'].includes(r)) return true;
  if (r === 'mkt_leader') return true;
  return false;
}

/**
 * Lấy `team` từ bảng `users` (Supabase) — chỉ theo khớp `name` với `Tên`, không dùng email / localStorage / MKT.
 */
async function fetchUserTeamByNameFromSupabase(displayName) {
  const raw = String(displayName || '').trim();
  if (!raw) return '';
  const target = normMktPersonNameForTeamLookup(raw);
  if (!target) return '';

  const esc = escapeIlikePatternFragment(raw);

  const run = async (pattern) => {
    const { data, error } = await supabase
      .from('users')
      .select('name, team')
      .ilike('name', pattern)
      .limit(40);
    if (error) {
      console.warn('fetchUserTeamByNameFromSupabase:', error);
      return [];
    }
    return data || [];
  };

  let rows = await run(esc);
  if (!rows.length) rows = await run(`%${esc}%`);

  for (const row of rows) {
    if (normMktPersonNameForTeamLookup(row?.name) === target) {
      const t = String(row?.team || '').trim();
      if (t) return t;
    }
  }
  return '';
}

/**
 * Lấy `team` từ bảng `users` theo email đăng nhập (khớp không phân biệt hoa thường).
 */
async function fetchUserTeamByEmailFromSupabase(email) {
  const raw = String(email || '').trim();
  if (!raw) return '';
  const esc = escapeIlikePatternFragment(raw);
  const { data, error } = await supabase
    .from('users')
    .select('email, team')
    .ilike('email', esc)
    .limit(15);
  if (error) {
    console.warn('fetchUserTeamByEmailFromSupabase:', error);
    return '';
  }
  const want = raw.toLowerCase();
  for (const row of data || []) {
    if (String(row?.email || '').trim().toLowerCase() === want) {
      const t = String(row?.team || '').trim();
      if (t) return t;
    }
  }
  return '';
}

function getDisplayNameFromStoredUser() {
  let user = null;
  try {
    const raw = localStorage.getItem('user');
    if (raw) user = JSON.parse(raw);
  } catch {
    user = null;
  }
  const fromObj =
    user?.Name ??
    user?.name ??
    user?.['Họ_và_tên'] ??
    user?.['Họ và tên'] ??
    user?.['Tên'] ??
    user?.username ??
    '';
  const t = String(fromObj || '').trim();
  if (t) return t;
  return String(localStorage.getItem('username') || '').trim();
}

/**
 * Sau khi insert báo cáo MKT: tham số recalc — chỉ quét ngày / key vừa gửi.
 * `reportsTableName` + `ordersSupabaseTable` phải là một trong hai stack cố định (gán ở handleSubmit theo route).
 */
function buildMktRecalcOptsFromSubmittedRows(toInsert, { reportsTableName, ordersSupabaseTable }) {
  const dates = [];
  const exactKeyMap = new Map();
  for (const row of toInsert) {
    const d = normalizeMktReportDate(row['Ngày']);
    if (d) dates.push(d);
    const name = String(row['Tên'] || '').trim();
    const product = String(row['Sản_phẩm'] || '').trim();
    const market = String(row['Thị_trường'] || '').trim();
    if (d && name && product && market) {
      const id = `${d}\0${name}\0${product}\0${market}`;
      if (!exactKeyMap.has(id)) exactKeyMap.set(id, { date: d, name, product, market });
    }
  }
  if (dates.length === 0) return null;
  dates.sort();
  const exactKeys = Array.from(exactKeyMap.values());
  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    exactKeys: exactKeys.length > 0 ? exactKeys : null,
    dryRun: false,
    createMissingRows: false,
    reportsTableName,
    ordersSupabaseTable,
    ordersApiPath: null,
  };
}

export default function BaoCaoMarketing({
  reportTableName = 'detail_reports',
  ordersTableName = 'orders',
  pageTitle = 'Báo Cáo MKT',
} = {}) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const teamFilter = searchParams.get('team'); // 'RD' or null

  // Permission Logic
  const { canView, role } = usePermissions();
  const isHcmReport = reportTableName === 'marketing_report_hcm';
  const pageAccessCodes =
    teamFilter === 'RD'
      ? ['RND_INPUT']
      : isHcmReport
        ? ['MKT_INPUT_HCM']
        : ['MKT_INPUT'];
  const hasPageAccess = pageAccessCodes.some((code) => canView(code));



  const [appData, setAppData] = useState({
    employeeDetails: [],
    /** Nhân viên lấy từ bảng `users`: bộ phận MKT + chi nhánh Hà Nội (ưu tiên cho cột Tên). */
    mktHnUserEmployees: [],
    /** Sheet / fallback khi không có user MKT HN trong DB */
    sheetLookupEmployees: [],
    shiftList: ['Hết ca', 'Giữa ca'],
    productList: [
      'Gel Dạ Dày',
      'Gel Trĩ',
      'ComboGold24k',
      'Fitgum CAFE 20X',
      'Bonavita Coffee',
      'Dragon Blood Cream',
      'Kem Body',
      'Bakuchiol Retinol',
      'Serum sâm',
      'DG',
      'Kẹo Táo',
      'Glutathione Collagen',
      'Glutathione Collagen NEW',
      'Gel trị ngứa',
      'Nám DR Hancy',
      'Gel Xương Khớp',
      'Gel XK Thái',
      'Gel XK Phi',
      'Dán Kinoki',
      'Sữa tắm CUISHIFAN',
    ],
    marketList: ['Nhật Bản', 'Hàn Quốc', 'Canada', 'US', 'Úc', 'Anh', 'CĐ Nhật Bản'],
  });

  // Load products from system_settings (type <> 'test')
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('name')
          .neq('type', 'test')
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          const products = data.map(item => item.name).filter(Boolean);
          setAppData(prev => ({
            ...prev,
            productList: products.length > 0 ? products : prev.productList
          }));
          console.log(`✅ Loaded ${products.length} products from system_settings (excluding test)`);
        }
      } catch (err) {
        console.error('Error fetching products from system_settings:', err);
      }
    };

    fetchProducts();
  }, []);

  const [tableHeaders, setTableHeaders] = useState([]);
  const [tableRows, setTableRows] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  /** Team của user đăng nhập — lấy từ bảng `users` (theo email), bổ sung localStorage `userTeam`. */
  const [loginUserTeam, setLoginUserTeam] = useState('');
  const [currentTableName, setCurrentTableName] = useState(pageTitle);
  const [employeeNameFromUrl, setEmployeeNameFromUrl] = useState('');
  const [status, setStatus] = useState('Đang khởi tạo ứng dụng...');
  const [responseMsg, setResponseMsg] = useState({ text: '', isSuccess: true, visible: false });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [realValuesMap, setRealValuesMap] = useState({}); // Map row ID to real values
  const [calculatingRealValues, setCalculatingRealValues] = useState({}); // Track which rows are calculating
  /** Lookup email theo tên từ human_resources */
  const [hrEmailLookup, setHrEmailLookup] = useState(() => buildEmailByNameLookup([]));
  /** Mọi "Họ Và Tên" trong human_resources — dropdown Tên đầy đủ theo name, không lọc email */
  const [hrAllDisplayNames, setHrAllDisplayNames] = useState([]);
  /** "Họ Và Tên" HR có bộ phận MKT — gộp vào sổ Tên để khớp cách viết với users.name */
  const [hrMktDisplayNames, setHrMktDisplayNames] = useState([]);
  const employeeDatalistRef = useRef(null);



  const EMPLOYEE_API_URL =
    'https://n-api-rouge.vercel.app/sheet/getSheets?rangeSheet=A:K&sheetName=Nh%C3%A2n%20s%E1%BB%B1&spreadsheetId=1Cl-56By1eYFB4G7ITuG0IQhH39ITwo0AkZPFvsLfo54';
  const SCRIPT_URL = 'https://n-api-gamma.vercel.app/bulk-insert';
  const SPREADSHEET_ID = '1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y';
  const headerMkt = [
    'id',
    'Tên',
    'Email',
    'Ngày',
    'ca',
    'Sản_phẩm',
    'Thị_trường',
    'TKQC',
    'CPQC',
    'Số_Mess_Cmt',
    'Số đơn',
    'Doanh số',
    'Team',
    'id_NS',
    'Doanh số đi',
    'Số đơn hoàn hủy',
    'DS chốt',
    'DS sau hoàn hủy',
    'Doanh số sau ship',
    'Doanh số TC',
    'KPIs',
    'CPQC theo TKQC',
    'Báo cáo theo Page',
    'Trạng thái',
    'Cảnh báo',
  ];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email') || localStorage.getItem('userEmail') || '';
    const hoten =
      urlParams.get('hoten') ||
      localStorage.getItem('userName') ||
      getDisplayNameFromStoredUser() ||
      '';

    setUserEmail(email);
    setEmployeeNameFromUrl(hoten);

    initializeApp(email, hoten);
  }, []);

  /** Khi đã biết team từ DB, đồng bộ cột Team mọi dòng (các dòng tạo trước khi fetch xong). */
  useEffect(() => {
    const t = String(loginUserTeam || '').trim();
    if (!t) return;
    setTableRows((prev) =>
      (prev || []).map((r) => ({
        ...r,
        data: { ...r.data, Team: t },
      }))
    );
  }, [loginUserTeam]);

  // Auto-calculate real values when rows change or when relevant fields are filled
  // Note: Real values calculation removed - Số đơn thực tế và Doanh số thực tế không còn được tính/hiển thị



  /** Danh sách Tên/Email/Team: ưu tiên Supabase `users` (department MKT, branch Hà Nội); Tên chỉ lấy từ `name`. */
  const fetchMktHanoiUsersFromSupabase = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('name, email, department, branch, team, id_appsheet')
      .order('name', { ascending: true });

    if (error) {
      console.error('BaoCaoMarketing — users (MKT HN):', error);
      return [];
    }

    return (data || [])
      .filter(
        (u) =>
          String(u.email || '').trim() &&
          isUsersTableMktDepartment(u.department) &&
          isUsersTableHanoiBranch(u.branch)
      )
      .map((u) => ({
        name: String(u.name ?? '').trim(),
        email: String(u.email || '').trim(),
        team: String(u.team || '').trim(),
        branch: String(u.branch || '').trim(),
        id_ns: u.id_appsheet != null && u.id_appsheet !== '' ? String(u.id_appsheet) : '',
      }))
      .filter((e) => e.name);
  };

  const fetchEmployeeList = async () => {
    updateStatus('Đang tải danh sách nhân viên (Sheet — dự phòng)...');
    try {
      const response = await fetch(EMPLOYEE_API_URL);
      if (!response.ok) throw new Error(`Lỗi HTTP! status: ${response.status}`);
      const result = await response.json();

      let headers, rowObjects;
      if (result.headers && result.rows) {
        headers = result.headers;
        rowObjects = result.rows;
      } else if (Array.isArray(result)) {
        rowObjects = result;
        headers = rowObjects.length > 0 ? Object.keys(rowObjects[0]) : [];
      } else {
        throw new Error('Cấu trúc dữ liệu API không được hỗ trợ');
      }

      const findHeader = (keywords) => headers.find((h) => keywords.every((kw) => h.toLowerCase().includes(kw))) || null;

      const nameCol = findHeader(['họ', 'tên']) || 'Họ và Tên';
      const deptCol = findHeader(['bộ', 'phận']) || 'Bộ phận';
      const emailCol = findHeader(['email']) || 'email';
      const teamCol = findHeader(['team']) || 'Team';
      const idCol = findHeader(['id']) || 'id';
      const branchCol = findHeader(['chi nhánh']) || 'chi nhánh';

      const targetDepts = ['MKT'];

      const rowToEmp = (row) => ({
        name: row[nameCol]?.toString().trim() || '',
        email: row[emailCol]?.toString().trim() || '',
        team: row[teamCol]?.toString().trim() || '',
        id_ns: row[idCol]?.toString().trim() || '',
        branch: row[branchCol]?.toString().trim() || '',
      });

      const sheetLookupEmployees = rowObjects
        .filter((row) => row[nameCol] && String(row[nameCol]).trim() !== '')
        .map(rowToEmp)
        .filter((emp) => emp.name)
        .filter((emp, idx, arr) => arr.findIndex((e) => e.name === emp.name) === idx);

      const filteredEmployees = rowObjects
        .filter((row) => {
          const dept = row[deptCol];
          const name = row[nameCol];
          const deptMatch = dept && targetDepts.some((target) => dept.toString().toUpperCase().includes(target.toUpperCase()));
          return deptMatch && name && name.toString().trim() !== '';
        })
        .map(rowToEmp)
        .filter((emp, idx, arr) => arr.findIndex((e) => e.name === emp.name) === idx);

      updateStatus(`Đã tải thành công ${filteredEmployees.length} nhân viên MKT (sheet: ${sheetLookupEmployees.length} tên để chọn).`);
      return { mktEmployees: filteredEmployees, sheetLookupEmployees };
    } catch (error) {
      console.error('Lỗi chi tiết:', error);
      updateStatus(`Lỗi khi tải danh sách nhân viên: ${error.message}`, true);
      return { mktEmployees: [], sheetLookupEmployees: [] };
    }
  };

  const updateStatus = (message, isError = false) => {
    setStatus(new Date().toLocaleTimeString() + ': ' + message);
  };

  const formatNumberInput = (value) => {
    const cleanValue = String(value).replace(/[^0-9]/g, '');
    return cleanValue ? new Intl.NumberFormat('de-DE').format(cleanValue) : '';
  };

  const parseVietnameseNumberInput = (value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    const str = String(value || '').trim();
    if (!str) return 0;

    // Keep digits (and optional leading minus), drop separators like . , spaces
    const negative = str.startsWith('-');
    const digitsOnly = str.replace(/[^0-9]/g, '');
    if (!digitsOnly) return 0;

    const parsed = Number((negative ? '-' : '') + digitsOnly);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getToday = () => {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
  };

  const newRowId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `row_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const initializeApp = async (email, hoten) => {
    try {
      updateStatus('Đang tải nhân viên MKT Hà Nội (bảng users)…');
      const [usersMktHn, hrRes] = await Promise.all([
        fetchMktHanoiUsersFromSupabase(),
        supabase.from('human_resources').select('"Họ Và Tên", email, "Bộ phận"'),
      ]);

      let employees;
      let sheetLookup;
      if (usersMktHn.length > 0) {
        employees = usersMktHn;
        sheetLookup = usersMktHn;
        updateStatus(`Đã tải ${usersMktHn.length} user — MKT, chi nhánh Hà Nội (bảng users).`);
      } else {
        const fetchPack = await fetchEmployeeList();
        employees = fetchPack.mktEmployees || [];
        sheetLookup = fetchPack.sheetLookupEmployees || [];
        if (!employees.length && !sheetLookup.length) {
          updateStatus('Không có user MKT HN trong users và không tải được Sheet — kiểm tra RLS / dữ liệu.', true);
        }
      }

      if (hrRes.error) {
        console.error('BaoCaoMarketing — human_resources:', hrRes.error);
      }

      const hrRows = hrRes.data || [];
      const hrLookup = buildEmailByNameLookup(hrRows);
      setHrEmailLookup(hrLookup);

      const allHrNames = [
        ...new Set(hrRows.map((r) => String(r['Họ Và Tên'] || '').trim()).filter(Boolean)),
      ];
      setHrAllDisplayNames(allHrNames);

      const hrMktNames = [
        ...new Set(
          hrRows
            .filter((r) => {
              const bp = normalizeKeyVi(r['Bộ phận']);
              return bp.includes('mkt') || bp.includes('marketing');
            })
            .map((r) => String(r['Họ Và Tên'] || '').trim())
            .filter(Boolean)
        ),
      ];
      setHrMktDisplayNames(hrMktNames);

      setAppData((prev) => ({
        ...prev,
        mktHnUserEmployees: usersMktHn,
        employeeDetails: employees,
        sheetLookupEmployees: sheetLookup,
      }));
      setTableHeaders(headerMkt);

      let fetchedTeam = '';
      const emTrim = String(email || '').trim();
      if (emTrim) {
        fetchedTeam = (await fetchUserTeamByEmailFromSupabase(emTrim)) || '';
      }
      if (!fetchedTeam) {
        try {
          fetchedTeam = String(localStorage.getItem('userTeam') || '').trim();
        } catch {
          /* ignore */
        }
      }
      setLoginUserTeam(fetchedTeam);

      const lookupByName = sheetLookup.length > 0 ? sheetLookup : employees;
      let employee = null;
      if (hoten) {
        employee = findEmployeeByName(lookupByName, hoten);
      }
      if (!employee && email) {
        employee = lookupByName.find((emp) => emp.email?.toLowerCase() === email.toLowerCase());
      }

      const employeeName = employee?.name || hoten || '';
      const firstRow = createRowData({ Tên: employeeName }, employees, hrLookup, sheetLookup);
      const login = String(email || '').trim();
      if (login) firstRow.data['Email'] = login;
      if (fetchedTeam) firstRow.data['Team'] = fetchedTeam;
      setTableRows([firstRow]);
      updateStatus('Ứng dụng đã sẵn sàng.');
    } catch (err) {
      console.error('BaoCaoMarketing initializeApp:', err);
      updateStatus('Lỗi khởi tạo — vẫn mở form nhập (kiểm tra console).', true);
      const login = String(email || '').trim();
      let fbTeam = '';
      try {
        fbTeam = String(localStorage.getItem('userTeam') || '').trim();
      } catch {
        /* ignore */
      }
      if (fbTeam) setLoginUserTeam(fbTeam);
      setTableRows([
        {
          id: newRowId(),
          data: {
            Ngày: getToday(),
            ...(login ? { Email: login } : {}),
            ...(fbTeam ? { Team: fbTeam } : {}),
          },
        },
      ]);
    }
  };

  /** Email theo tên: danh sách users/sheet (khớp tên) → human_resources → fallbackEmail */
  const resolveEmailFromPersonName = (displayName, nameLookupEmployees, lookup, fallbackEmail = '') => {
    const n = String(displayName || '').trim();
    if (!n) return String(fallbackEmail || '').trim();
    const fromList = findEmployeeByName(nameLookupEmployees, n)?.email;
    if (fromList) return String(fromList).trim();
    const fromHr = lookup?.list?.length ? emailFromName(n, lookup) : '';
    if (fromHr) return fromHr;
    return String(fallbackEmail || '').trim();
  };

  const createRowData = (
    data = {},
    employees = appData.employeeDetails,
    lookup = hrEmailLookup,
    sheetLookupOverride = null
  ) => {
    const sessionUserName = getDisplayNameFromStoredUser();

    const byNameList =
      (sheetLookupOverride && sheetLookupOverride.length > 0
        ? sheetLookupOverride
        : appData.mktHnUserEmployees && appData.mktHnUserEmployees.length > 0
          ? appData.mktHnUserEmployees
          : appData.sheetLookupEmployees && appData.sheetLookupEmployees.length > 0
            ? appData.sheetLookupEmployees
            : employees) || [];

    let employeeToUse = null;

    // Ưu tiên khớp theo Tên (full name), không ưu tiên email
    if (data['Tên']) {
      employeeToUse = findEmployeeByName(byNameList, data['Tên']);
    }

    if (!employeeToUse && data['Email']) {
      employeeToUse = byNameList.find((emp) => emp.email?.toLowerCase() === data['Email'].toLowerCase());
    }

    if (!employeeToUse && userEmail) {
      employeeToUse = byNameList.find((emp) => emp.email?.toLowerCase() === userEmail.toLowerCase());
    }

    if (employeeToUse) {
      data['Tên'] = data['Tên'] || employeeToUse.name;
      data['id_NS'] = data['id_NS'] || employeeToUse.id_ns;
      data['Chi nhánh'] = data['Chi nhánh'] || employeeToUse.branch;
    } else {
      if (employeeNameFromUrl) {
        data['Tên'] = data['Tên'] || employeeNameFromUrl;
      }
    }

    // Chưa có Tên → lấy tên từ user đăng nhập
    if (!String(data['Tên'] || '').trim() && sessionUserName) {
      data['Tên'] = sessionUserName;
    }

    // User thường: Tên theo profile đăng nhập; Email luôn email đăng nhập (xử lý cuối hàm)
    if (!canEditMktReporterName(role)) {
      if (sessionUserName) data['Tên'] = sessionUserName || data['Tên'];
      if (!employeeToUse) {
        const forcedEmp =
          findEmployeeByName(byNameList, data['Tên']) ||
          byNameList.find((emp) => emp.email?.toLowerCase() === String(userEmail || '').toLowerCase());
        if (forcedEmp) {
          data['Tên'] = forcedEmp.name;
          data['id_NS'] = data['id_NS'] || forcedEmp.id_ns;
          data['Chi nhánh'] = data['Chi nhánh'] || forcedEmp.branch;
        }
      }
    }

    if (!data['Ngày']) {
      data['Ngày'] = getToday();
    }

    const loginEm = String(userEmail || '').trim();
    if (loginEm) {
      data['Email'] = loginEm;
    } else if (data['Tên'] && !String(data['Email'] || '').trim()) {
      data['Email'] = resolveEmailFromPersonName(data['Tên'], byNameList, lookup, '');
    }

    const stTeam = String(loginUserTeam || '').trim();
    if (stTeam) {
      data['Team'] = stTeam;
    } else {
      try {
        const lsT = String(localStorage.getItem('userTeam') || '').trim();
        if (lsT) data['Team'] = lsT;
      } catch {
        /* ignore */
      }
    }

    return {
      id: newRowId(),
      data,
    };
  };

  /** ➕ trên dòng: chèn dòng mới ngay bên dưới, sao chép toàn bộ dữ liệu dòng nguồn (trừ id bản ghi). */
  const handleAddRow = (rowIndexToCopy) => {
    setTableRows((prev) => {
      const sourceRow = prev[rowIndexToCopy];
      if (!sourceRow?.data) return prev;

      const newRowData = { ...sourceRow.data };
      delete newRowData.id;

      const newRow = createRowData(newRowData, appData.employeeDetails, hrEmailLookup);
      const next = [...prev];
      next.splice(rowIndexToCopy + 1, 0, newRow);
      return next;
    });
  };

  const handleAddNewRow = () => {
    setTableRows([...tableRows, createRowData({}, appData.employeeDetails, hrEmailLookup)]);
  };

  const handleRemoveRow = (index) => {
    if (tableRows.length <= 1) {
      alert('Bạn không thể xóa dòng cuối cùng.');
      return;
    }

    // Confirm before deleting
    if (!window.confirm(`Bạn có chắc chắn muốn xóa dòng ${index + 1}?\n\nDữ liệu trong dòng này sẽ bị mất.`)) {
      return;
    }

    const rowId = tableRows[index]?.id;

    // Remove from table
    setTableRows(tableRows.filter((_, i) => i !== index));

    // Clean up real values map
    if (rowId) {
      setRealValuesMap(prev => {
        const newMap = { ...prev };
        delete newMap[rowId];
        return newMap;
      });
      setCalculatingRealValues(prev => {
        const newMap = { ...prev };
        delete newMap[rowId];
        return newMap;
      });
    }

    updateStatus(`Đã xóa dòng ${index + 1}.`);
  };

  // Calculate real values from orders table for a single report row
  const calculateRealValues = async (rowData, rowId) => {
    try {
      let reportDate = rowData['Ngày'];
      const reportName = rowData['Tên'];
      const reportCa = rowData['ca'];
      const reportProduct = rowData['Sản_phẩm'];
      const reportMarket = rowData['Thị_trường'];

      if (!reportName) {
        return {
          so_don_thuc_te: 0,
          doanh_so_thuc_te: 0
        };
      }

      // Nếu không có ngày, không tính toán
      if (!reportDate) {
        return {
          so_don_thuc_te: 0,
          doanh_so_thuc_te: 0
        };
      }

      // Normalize date format to YYYY-MM-DD for Supabase DATE comparison
      if (reportDate instanceof Date) {
        reportDate = reportDate.toISOString().split('T')[0];
      } else if (typeof reportDate === 'string') {
        // Handle different date formats
        // If format is DD/MM/YYYY, convert to YYYY-MM-DD
        if (reportDate.includes('/')) {
          const parts = reportDate.split('/');
          if (parts.length === 3) {
            // Assume DD/MM/YYYY
            reportDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        // Remove time part if present (YYYY-MM-DDTHH:mm:ss)
        reportDate = reportDate.split('T')[0];
      }

      console.log('📅 Date normalization:', {
        original: rowData['Ngày'],
        normalized: reportDate,
        type: typeof reportDate
      });

      // Build query
      let query = supabase
        .from(ordersTableName)
        .select('*')
        .eq('order_date', reportDate);

      // Filter by marketing_staff (name) - use ilike for flexible matching
      if (reportName) {
        // Simple ilike matching - Supabase will handle partial matches
        query = query.ilike('marketing_staff', `%${reportName.trim()}%`);
      }

      // Filter by shift/ca
      const caValue = String(reportCa || '').trim();

      if (caValue === 'Hết ca' || caValue.toLowerCase() === 'hết ca') {
        // Hết ca: tính đơn có shift chứa "Hết ca"
        query = query.ilike('shift', '%Hết ca%');
      } else if (caValue === 'Giữa ca' || caValue.toLowerCase() === 'giữa ca') {
        // Giữa ca: tính đơn có shift chứa "Giữa ca" hoặc "giữa ca"
        query = query.or('shift.ilike.%Giữa ca%,shift.ilike.%giữa ca%');
      } else if (caValue) {
        // Other ca: partial match
        query = query.ilike('shift', `%${caValue}%`);
      }

      // Filter by product - use ilike for flexible matching
      if (reportProduct) {
        // Use ilike for partial matching (case-insensitive)
        query = query.ilike('product', `%${reportProduct.trim()}%`);
      }

      // Filter by market (country)
      if (reportMarket) {
        query = query.ilike('country', `%${reportMarket}%`);
      }

      console.log('🔍 Query parameters:', {
        reportDate,
        reportName,
        reportCa,
        reportProduct,
        reportMarket
      });

      // First, let's check if there are any orders on this date at all
      const { data: ordersByDate, error: dateError } = await supabase
        .from(ordersTableName)
        .select('id, order_date, marketing_staff, product, country, shift')
        .eq('order_date', reportDate)
        .limit(10);

      if (dateError) {
        console.error('❌ Error checking orders by date:', dateError);
      } else {
        console.log(`📅 Found ${ordersByDate?.length || 0} orders on date ${reportDate}:`, ordersByDate?.slice(0, 3).map(o => ({
          marketing_staff: o.marketing_staff,
          product: o.product,
          country: o.country,
          shift: o.shift
        })));
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error('❌ Error calculating real values:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        return {
          so_don_thuc_te: 0,
          doanh_thu_chot_thuc_te: 0,
          doanh_so_hoan_huy_thuc_te: 0,
          so_don_hoan_huy_thuc_te: 0,
          doanh_so_sau_hoan_huy_thuc_te: 0,
          doanh_so_di_thuc_te: 0
        };
      }

      console.log(`📊 Found ${orders?.length || 0} orders matching all criteria:`, {
        reportDate,
        reportName,
        reportCa,
        reportProduct,
        reportMarket
      });

      if (orders && orders.length > 0) {
        console.log('📋 Sample order:', {
          order_date: orders[0].order_date,
          marketing_staff: orders[0].marketing_staff,
          product: orders[0].product,
          country: orders[0].country,
          shift: orders[0].shift,
          total_amount_vnd: orders[0].total_amount_vnd,
          total_vnd: orders[0].total_vnd,
          check_result: orders[0].check_result,
          delivery_status: orders[0].delivery_status
        });
      } else {
        // Debug: Try to find orders step by step
        console.log('🔍 Debugging: Checking each filter step by step...');

        // Check orders by date only
        const { data: ordersDateOnly } = await supabase
          .from(ordersTableName)
          .select('id, marketing_staff, product, country, shift')
          .eq('order_date', reportDate)
          .limit(5);
        console.log(`  📅 Orders on date ${reportDate}: ${ordersDateOnly?.length || 0}`, ordersDateOnly);

        // Check orders by date + name
        if (reportName) {
          const { data: ordersDateName } = await supabase
            .from(ordersTableName)
            .select('id, marketing_staff, product, country, shift')
            .eq('order_date', reportDate)
            .ilike('marketing_staff', `%${reportName.trim()}%`)
            .limit(5);
          console.log(`  👤 Orders with name "${reportName}": ${ordersDateName?.length || 0}`, ordersDateName);
        }

        // Check orders by date + name + product
        if (reportName && reportProduct) {
          const { data: ordersDateNameProduct } = await supabase
            .from(ordersTableName)
            .select('id, marketing_staff, product, country, shift')
            .eq('order_date', reportDate)
            .ilike('marketing_staff', `%${reportName.trim()}%`)
            .eq('product', reportProduct)
            .limit(5);
          console.log(`  📦 Orders with name + product "${reportProduct}": ${ordersDateNameProduct?.length || 0}`, ordersDateNameProduct);
        }
      }

      if (!orders || orders.length === 0) {
        console.log('⚠️ No orders found matching all criteria');
        return {
          so_don_thuc_te: 0,
          doanh_thu_chot_thuc_te: 0,
          doanh_so_hoan_huy_thuc_te: 0,
          so_don_hoan_huy_thuc_te: 0,
          doanh_so_sau_hoan_huy_thuc_te: 0,
          doanh_so_di_thuc_te: 0
        };
      }

      // Calculate values
      const totalOrders = orders.length;

      // Doanh số thực tế: tổng total_amount_vnd của tất cả đơn khớp điều kiện
      const doanhSoThucTe = orders.reduce((sum, o) => {
        const amount = o.total_amount_vnd || o.total_vnd || 0;
        return sum + (Number(amount) || 0);
      }, 0);

      return {
        so_don_thuc_te: totalOrders,
        doanh_so_thuc_te: doanhSoThucTe
      };
    } catch (error) {
      console.error('Error calculating real values:', error);
      return {
        so_don_thuc_te: 0,
        doanh_so_thuc_te: 0
      };
    }
  };

  // Calculate real values when relevant fields change
  const calculateRealValuesForRow = async (rowIndex, rowData) => {
    const rowId = tableRows[rowIndex]?.id;
    if (!rowId) return;

    console.log('🔄 Calculating real values for row:', {
      rowId,
      rowData: {
        Ngày: rowData['Ngày'],
        Tên: rowData['Tên'],
        ca: rowData['ca'],
        Sản_phẩm: rowData['Sản_phẩm'],
        Thị_trường: rowData['Thị_trường']
      }
    });

    setCalculatingRealValues(prev => ({ ...prev, [rowId]: true }));

    try {
      const realValues = await calculateRealValues(rowData, rowId);
      console.log('✅ Calculated real values:', realValues);
      setRealValuesMap(prev => ({ ...prev, [rowId]: realValues }));
    } catch (error) {
      console.error('❌ Error calculating real values for row:', error);
    } finally {
      setCalculatingRealValues(prev => {
        const newState = { ...prev };
        delete newState[rowId];
        return newState;
      });
    }
  };

  const getMktNameLookup = () =>
    appData.mktHnUserEmployees?.length > 0
      ? appData.mktHnUserEmployees
      : appData.sheetLookupEmployees?.length > 0
        ? appData.sheetLookupEmployees
        : appData.employeeDetails || [];

  /** Đồng bộ Email/Team/id_NS khi chọn từ datalist (một số trình duyệt chỉ hoàn tất giá trị lúc blur). */
  const syncTenColumnFromInput = (index, value) => {
    if (!canEditMktReporterName(role)) return;

    const nameLookup = getMktNameLookup();
    setTableRows((prev) => {
      const newRows = [...prev];
      if (!newRows[index]) return prev;
      newRows[index] = { ...newRows[index], data: { ...newRows[index].data } };
      const v = String(value || '').trim();
      const employee = findEmployeeByName(nameLookup, v);
      if (employee) {
        newRows[index].data['id_NS'] = employee.id_ns || '';
        newRows[index].data['Chi nhánh'] = employee.branch || '';
      } else {
        const em = resolveEmailFromPersonName(v, nameLookup, hrEmailLookup, '');
        const byEmail =
          em &&
          nameLookup.find((emp) => emp.email?.toLowerCase() === String(em).toLowerCase());
        if (byEmail) {
          newRows[index].data['id_NS'] = byEmail.id_ns || '';
          newRows[index].data['Chi nhánh'] = byEmail.branch || '';
        }
      }
      const le = String(userEmail || '').trim();
      if (le) newRows[index].data['Email'] = le;
      let stampT = String(loginUserTeam || '').trim();
      if (!stampT) {
        try {
          stampT = String(localStorage.getItem('userTeam') || '').trim();
        } catch {
          /* ignore */
        }
      }
      if (stampT) newRows[index].data['Team'] = stampT;
      return newRows;
    });
  };

  const handleRowChange = async (index, field, value) => {
    const strictManager = ['admin', 'director', 'manager', 'super_admin', 'administrator'].includes(
      (role || '').toLowerCase()
    );
    if (field === 'Email' && !strictManager) return;
    if (field === 'Tên' && !canEditMktReporterName(role)) return;

    let lsTeam = '';
    try {
      lsTeam = String(localStorage.getItem('userTeam') || '').trim();
    } catch {
      /* ignore */
    }
    const stampTeam = String(loginUserTeam || '').trim() || lsTeam;
    const loginEm = String(userEmail || '').trim();
    if (stampTeam && loginEm && field === 'Team') {
      return;
    }

    const newRows = [...tableRows];
    newRows[index].data[field] = value;

    const nameLookup = getMktNameLookup();

    if (field === 'Tên') {
      const employee = findEmployeeByName(nameLookup, value);
      if (employee) {
        newRows[index].data['id_NS'] = employee.id_ns || '';
        newRows[index].data['Chi nhánh'] = employee.branch || '';
      } else {
        const em = resolveEmailFromPersonName(value, nameLookup, hrEmailLookup, '');
        const byEmail =
          em &&
          nameLookup.find((emp) => emp.email?.toLowerCase() === String(em).toLowerCase());
        if (byEmail) {
          newRows[index].data['id_NS'] = byEmail.id_ns || '';
          newRows[index].data['Chi nhánh'] = byEmail.branch || '';
        }
      }
    }

    if (field === 'Email') {
      const employee = nameLookup?.find((emp) => emp.email?.toLowerCase() === value.toLowerCase());
      if (employee) {
        newRows[index].data['Tên'] = employee.name || '';
        newRows[index].data['id_NS'] = employee.id_ns || '';
        newRows[index].data['Chi nhánh'] = employee.branch || '';
      }
    }

    if (loginEm) {
      newRows[index].data['Email'] = loginEm;
    }
    if (stampTeam) {
      newRows[index].data['Team'] = stampTeam;
    }

    setTableRows(newRows);

    // Calculate real values if relevant fields changed
    const fieldsToTriggerCalculation = ['Ngày', 'Tên', 'ca', 'Sản_phẩm', 'Thị_trường'];
    if (fieldsToTriggerCalculation.includes(field)) {
      // Debounce calculation
      setTimeout(() => {
        calculateRealValuesForRow(index, newRows[index].data);
      }, 500);
    }
  };

  const handleDeleteAll = async () => {
    const confirm1 = window.confirm(
      "⚠️ CẢNH BÁO NGHIÊM TRỌNG!\n\n" +
      `Bạn có chắc chắn muốn XÓA TOÀN BỘ dữ liệu trong bảng ${reportTableName}?\n\n` +
      "Hành động này KHÔNG THỂ HOÀN TÁC!\n\n" +
      "Nhấn OK để tiếp tục, hoặc Cancel để hủy."
    );

    if (!confirm1) return;

    const confirm2 = window.confirm(
      "⚠️ XÁC NHẬN LẦN CUỐI!\n\n" +
      "Bạn có THỰC SỰ muốn xóa TOÀN BỘ dữ liệu?\n\n" +
      "Tất cả báo cáo MKT sẽ bị mất vĩnh viễn!\n\n" +
      "Nhập 'XÓA' vào ô bên dưới để xác nhận."
    );

    if (!confirm2) return;

    const userInput = window.prompt(
      "Nhập 'XÓA' (chữ hoa) để xác nhận xóa toàn bộ dữ liệu:"
    );

    if (userInput !== 'XÓA') {
      alert("Xác nhận không đúng. Hủy bỏ thao tác xóa.");
      return;
    }

    try {
      setDeleting(true);
      updateStatus('Đang xóa dữ liệu...');

      const { error } = await supabase
        .from(reportTableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (hack for delete all)

      if (error) {
        const { data: allRecords, error: fetchError } = await supabase
          .from(reportTableName)
          .select('id')
          .limit(10000);

        if (fetchError) throw fetchError;

        if (allRecords && allRecords.length > 0) {
          const ids = allRecords.map(r => r.id);
          const batchSize = 1000;
          for (let i = 0; i < ids.length; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const { error: batchError } = await supabase
              .from(reportTableName)
              .delete()
              .in('id', batch);

            if (batchError) {
              console.error(`Batch ${i / batchSize + 1} error:`, batchError);
              throw batchError;
            }
          }
        }
      }

      alert("✅ Đã xóa toàn bộ dữ liệu thành công!");
      updateStatus('Đã xóa toàn bộ dữ liệu thành công.');
      setResponseMsg({
        text: '✅ Đã xóa toàn bộ dữ liệu thành công!',
        isSuccess: true,
        visible: true,
      });

    } catch (error) {
      console.error("Delete error:", error);
      const errorMsg = error.message || String(error);
      alert("Lỗi khi xóa dữ liệu: " + errorMsg);
      updateStatus('Lỗi khi xóa dữ liệu: ' + errorMsg, true);
      setResponseMsg({
        text: `Lỗi khi xóa dữ liệu: ${errorMsg}`,
        isSuccess: false,
        visible: true,
      });
    } finally {
      setDeleting(false);
    }
  };

  // Sync data from Firebase Báo cáo MKT via backend API (bypasses RLS)
  const handleSyncMKT = async () => {
    if (reportTableName !== 'detail_reports') {
      alert('Đồng bộ Firebase hiện chỉ hỗ trợ bảng detail_reports. Trang HCM ghi trực tiếp lên marketing_report_hcm.');
      return;
    }
    if (!window.confirm("Bạn có chắc chắn muốn đồng bộ dữ liệu từ Firebase Báo cáo MKT về Supabase?\n\nLưu ý: Chỉ thêm dữ liệu MỚI (chưa có), KHÔNG ghi đè dữ liệu đã tồn tại.")) return;

    try {
      setSyncing(true);
      updateStatus('Đang đồng bộ dữ liệu từ Firebase...');

      // Call backend API which uses service role key to bypass RLS
      const response = await fetch('/api/sync-mkt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Lỗi không xác định');
      }

      const message = `Đồng bộ hoàn tất!\nThành công: ${result.successCount} bản ghi\nLỗi: ${result.errorCount} bản ghi`;
      if (result.errorCount > 0 && result.error) {
        alert(message + `\n\nLỗi: ${result.error}`);
        updateStatus(`Đồng bộ hoàn tất: ${result.successCount} thành công, ${result.errorCount} lỗi.`, true);
      } else {
        alert(message);
        updateStatus(`Đồng bộ hoàn tất: ${result.successCount} thành công.`);
      }

      setResponseMsg({
        text: `Đồng bộ hoàn tất: ${result.successCount} thành công, ${result.errorCount} lỗi.`,
        isSuccess: result.errorCount === 0,
        visible: true,
      });

    } catch (error) {
      console.error("Sync error:", error);
      const errorMsg = error.message || String(error);
      updateStatus('Lỗi đồng bộ: ' + errorMsg, true);
      alert("Lỗi khi đồng bộ: " + errorMsg);
      setResponseMsg({
        text: `Lỗi khi đồng bộ: ${errorMsg}`,
        isSuccess: false,
        visible: true,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (tableRows.length === 0) {
      setResponseMsg({ text: 'Không có dữ liệu để gửi.', isSuccess: false, visible: true });
      return;
    }

    setLoading(true);
    updateStatus('Bắt đầu gửi dữ liệu lên Supabase...');

    try {
      const teamByNormalizedTen = new Map();
      const resolveTeamFromUsersByTen = async (ten) => {
        const key = normMktPersonNameForTeamLookup(ten);
        if (!key) return '';
        if (teamByNormalizedTen.has(key)) return teamByNormalizedTen.get(key);
        const t = await fetchUserTeamByNameFromSupabase(ten);
        teamByNormalizedTen.set(key, t);
        return t;
      };

      const submitLogin = String(userEmail || '').trim();
      let prefTeam = String(loginUserTeam || '').trim();
      if (!prefTeam && submitLogin) {
        prefTeam = (await fetchUserTeamByEmailFromSupabase(submitLogin)) || '';
      }
      if (!prefTeam) {
        try {
          prefTeam = String(localStorage.getItem('userTeam') || '').trim();
        } catch {
          /* ignore */
        }
      }

      const rowsData = await Promise.all(
        tableRows.map(async (row) => {
          const rowObject = {
            id: row.id, // Include the ID generated at the row level
          };

          // Map fields
          // Must match Supabase target table columns exactly
          // List of columns that DO NOT exist in schema and should be excluded
          const excludedColumns = ['Chi nhánh', 'chi nhánh', 'Chi_nhánh', 'chi_nhánh', 'branch'];

          Object.keys(row.data).forEach((key) => {
            // Skip excluded columns that don't exist in target table schema
            if (excludedColumns.includes(key)) {
              return;
            }
            // Không gửi cột id từ ô ẩn/nhầm — luôn dùng row.id (client UUID)
            if (key === 'id') {
              return;
            }

            let value = row.data[key];

            // Process numeric fields
            const numberFields = [
              'Số Mess',
              'Phản hồi',
              'Đơn Mess',
              'Doanh số Mess',
              'CPQC',
              'Số_Mess_Cmt',
              'Số đơn',
              'Doanh số',
              'Doanh số đi',
              'Số đơn hoàn hủy',
              'DS chốt',
              'DS sau hoàn hủy',
              'Doanh số sau ship',
              'Doanh số TC',
              'KPIs',
            ];
            if (numberFields.includes(key)) {
              value = parseVietnameseNumberInput(value);
            }
            rowObject[key] = value;
          });

          rowObject.id = row.id;

          // Email theo Tên (user / dòng nhập) → HR → sheet → userEmail
          const nameLookup =
            appData.mktHnUserEmployees?.length > 0
              ? appData.mktHnUserEmployees
              : appData.sheetLookupEmployees?.length > 0
                ? appData.sheetLookupEmployees
                : appData.employeeDetails;

          if (submitLogin) {
            rowObject['Email'] = submitLogin;
          } else if (!String(rowObject['Email'] || '').trim()) {
            rowObject['Email'] = resolveEmailFromPersonName(
              rowObject['Tên'],
              nameLookup,
              hrEmailLookup,
              ''
            );
          }
          if (!rowObject['Tên']) rowObject['Tên'] = employeeNameFromUrl || userEmail;

          if (prefTeam) {
            rowObject['Team'] = prefTeam;
          } else if (!String(rowObject['Team'] || '').trim()) {
            rowObject['Team'] = await resolveTeamFromUsersByTen(rowObject['Tên']);
          }

          // Ensure id_NS
          if (!rowObject['id_NS']) {
            const emp =
              findEmployeeByName(nameLookup, rowObject['Tên']) ||
              nameLookup?.find((e) => e.email?.toLowerCase() === rowObject['Email']?.toLowerCase());
            rowObject['id_NS'] = emp?.id_ns || '';
          }

          // Auto-fields if missing
          if (!rowObject['Ngày']) rowObject['Ngày'] = getToday();
          // Ca trống → Giữa ca (giống nhập đơn / recalc chỉ xử lý Hết ca | Giữa ca)
          if (!String(rowObject['ca'] ?? '').trim()) {
            rowObject['ca'] = 'Giữa ca';
          }

          // Note: Số đơn thực tế và Doanh số thực tế được tính tự động từ orders table sau khi insert
          // Không truyền vào payload khi submit

          return rowObject;
        })
      );

      // --- TESTING MODE CHECK ---
      try {
        const settings = localStorage.getItem('system_settings');
        if (settings) {
          const parsed = JSON.parse(settings);
          if (parsed.dataSource === 'test') {
            console.log("🔶 [TEST MODE] Simulating Submit for MKT Report");

            // Simulate delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            setResponseMsg({
              text: `✅ [TEST MODE] Giả lập gửi thành công ${rowsData.length} dòng! Dữ liệu KHÔNG lưu vào DB.`,
              isSuccess: true,
              visible: true,
            });
            updateStatus('Gửi báo cáo thành công (Giả lập).');
            setTableRows([createRowData({ Tên: employeeNameFromUrl }, appData.employeeDetails, hrEmailLookup)]);
            setLoading(false);
            return; // EXIT EARLY
          }
        }
      } catch (e) {
        console.warn("Error checking test mode:", e);
      }
      // --------------------------

      // Không gộp / không update khi trùng key: báo cáo dòng nào thì ghi đúng dòng đó.
      const toInsert = rowsData;
      const { error: insErr } = await supabase.from(reportTableName).insert(toInsert).select();
      if (insErr) throw insErr;

      let recalcWarning = '';
      // Hai stack độc lập theo route — không trộn bảng HN/HCM dù props lệch nhầm.
      const mktRecalcStack = isHcmReport
        ? { reportsTableName: 'marketing_report_hcm', ordersSupabaseTable: 'order_code_hcm' }
        : { reportsTableName: 'detail_reports', ordersSupabaseTable: 'orders' };
      const recalcOpts = buildMktRecalcOptsFromSubmittedRows(toInsert, mktRecalcStack);
      if (recalcOpts) {
        updateStatus(
          `Đang tính lại Số đơn / Doanh số thực tế (${recalcOpts.reportsTableName} ← ${recalcOpts.ordersSupabaseTable})...`
        );
        try {
          await recalcMktSoDonThucTeFromOrders(recalcOpts);
        } catch (recalcErr) {
          console.error('Recalc MKT sau gửi báo cáo:', recalcErr);
          const msg = recalcErr?.message || String(recalcErr);
          recalcWarning = ` Đã lưu báo cáo nhưng chưa cập nhật số liệu thực tế từ đơn: ${msg}`;
        }
      }

      const insN = toInsert.length;
      setResponseMsg({
        text:
          (insN > 0 ? `Thành công! Đã thêm ${insN} dòng vào hệ thống.` : 'Thành công.') + recalcWarning,
        isSuccess: true,
        visible: true,
      });
      updateStatus(recalcWarning ? 'Gửi báo cáo xong — recalc có lỗi (xem thông báo).' : 'Gửi báo cáo thành công.');

      // Reset form
      setTableRows([createRowData({ Tên: employeeNameFromUrl }, appData.employeeDetails, hrEmailLookup)]);

    } catch (error) {
      console.error('Lỗi khi gửi dữ liệu:', error);
      const errorMsg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      const errorDetail = error.details || '';
      const errorHint = error.hint || '';

      setResponseMsg({
        text: `Lỗi khi gửi dữ liệu: ${errorMsg} ${errorDetail ? `(${errorDetail})` : ''} ${errorHint ? `- Gợi ý: ${errorHint}` : ''}`,
        isSuccess: false,
        visible: true
      });
      updateStatus('Gửi báo cáo thất bại: ' + errorMsg, true);
    } finally {
      setLoading(false);
    }
  };

  const numberFields = ['Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số'];
  const hiddenFields = ['id', 'id phản hồi', 'id số mess', 'id_ns', 'trạng thái', 'chi nhánh', 'doanh số đi', 'số đơn hoàn huỷ', 'số đơn hoàn hủy', 'doanh số hoàn huỷ', 'số đơn thành công', 'doanh số thành công', 'khách mới', 'khách cũ', 'bán chéo', 'bán chéo team', 'ds chốt', 'ds sau hoàn hủy', 'số đơn sau hoàn hủy', 'doanh số sau ship', 'doanh số tc', 'kpis', 'cpqc theo tkqc', 'báo cáo theo page', 'cảnh báo', 'số đơn thực tế', 'doanh số thực tế'];

  const canPickMktReporterName = canEditMktReporterName(role);

  /**
   * Gợi ý cột Tên: users MKT HN + tên MKT trong human_resources (khớp cách viết HR);
   * không có users thì Sheet + toàn bộ HR như cũ.
   */
  const mktTenSelectOptions = useMemo(() => {
    const set = new Set();
    const primary = appData.mktHnUserEmployees || [];
    if (primary.length > 0) {
      primary.forEach((e) => {
        const n = String(e?.name || '').trim();
        if (n) set.add(n);
      });
      (hrMktDisplayNames || []).forEach((n) => {
        const t = String(n || '').trim();
        if (t) set.add(t);
      });
    } else {
      (appData.sheetLookupEmployees || []).forEach((e) => {
        const n = String(e?.name || '').trim();
        if (n) set.add(n);
      });
      (hrAllDisplayNames || []).forEach((n) => {
        const t = String(n || '').trim();
        if (t) set.add(t);
      });
    }
    const session = getDisplayNameFromStoredUser();
    if (session) set.add(session);
    (tableRows || []).forEach((r) => {
      const t = String(r?.data?.Tên || '').trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  }, [appData.mktHnUserEmployees, appData.sheetLookupEmployees, hrAllDisplayNames, hrMktDisplayNames, tableRows]);

  /** Email trong datalist: nhân viên form + mọi email human_resources (khớp khi Tên lấy từ HR). */
  const emailDatalistValues = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (raw) => {
      const em = String(raw || '').trim().toLowerCase();
      if (!em || seen.has(em)) return;
      seen.add(em);
      out.push(String(raw || '').trim());
    };
    (appData.employeeDetails || []).forEach((emp) => push(emp?.email));
    (hrEmailLookup.list || []).forEach((row) => push(row?.email));
    out.sort((a, b) => a.localeCompare(b));
    return out;
  }, [appData.employeeDetails, hrEmailLookup]);

  /** Team: <select> thay datalist — click vẫn mở full list khi ô đã có giá trị. */
  const mktTeamSelectOptions = useMemo(() => {
    const set = new Set();
    const push = (raw) => {
      const t = String(raw || '').trim();
      if (t) set.add(t);
    };
    (appData.mktHnUserEmployees || []).forEach((e) => push(e?.team));
    (appData.sheetLookupEmployees || []).forEach((e) => push(e?.team));
    (appData.employeeDetails || []).forEach((e) => push(e?.team));
    push(loginUserTeam);
    (tableRows || []).forEach((r) => push(r?.data?.Team));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
  }, [appData.mktHnUserEmployees, appData.sheetLookupEmployees, appData.employeeDetails, tableRows, loginUserTeam]);

  const visibleMktHeaders = headerMkt.filter((h) => !hiddenFields.includes(h.toLowerCase()));
  const mktReportGridTemplate = [MKT_REPORT_ACTION_COL, ...visibleMktHeaders.map(mktReportGridColWidth)].join(' ');

  const mktInputCls =
    'box-border w-full max-w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600';

  const renderMktReportCell = (row, rowIndex, header) => {
    if (header === 'Ngày') {
      return (
        <input
          type="date"
          value={row.data[header] || ''}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={mktInputCls}
        />
      );
    }
    if (header === 'ca') {
      const list = appData.shiftList || [];
      const cur = String(row.data[header] || '').trim();
      const head = cur && !list.includes(cur) ? [cur] : [];
      return (
        <select
          value={cur}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={`${mktInputCls} bg-white`}
          title="Chọn ca — luôn mở được toàn bộ danh sách (khác datalist trình duyệt)"
        >
          <option value="">-- Ca --</option>
          {[...head, ...list].map((shift) => (
            <option key={shift} value={shift}>
              {shift}
            </option>
          ))}
        </select>
      );
    }
    if (header === 'Sản_phẩm') {
      const cur = String(row.data[header] || '').trim();
      return (
        <input
          type="text"
          list="mkt-product-datalist"
          autoComplete="off"
          placeholder="Gõ để tìm SP…"
          value={cur}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={`${mktInputCls} bg-white`}
          title="Gõ để lọc gợi ý; chọn từ danh sách hoặc nhập đúng tên sản phẩm"
        />
      );
    }
    if (header === 'Thị_trường') {
      const list = appData.marketList || [];
      const cur = String(row.data[header] || '').trim();
      const head = cur && !list.includes(cur) ? [cur] : [];
      return (
        <select
          value={cur}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={`${mktInputCls} bg-white`}
          title="Chọn thị trường — luôn mở được toàn bộ danh sách"
        >
          <option value="">-- Thị trường --</option>
          {[...head, ...list].map((market) => (
            <option key={market} value={market}>
              {market}
            </option>
          ))}
        </select>
      );
    }
    if (header === 'Email') {
      const loginEm = String(userEmail || '').trim();
      const display = loginEm || String(row.data[header] || '').trim();
      return (
        <input
          type="email"
          list={loginEm ? undefined : 'email-datalist'}
          placeholder={loginEm ? '' : '--'}
          value={display}
          readOnly={!!loginEm}
          onChange={loginEm ? undefined : (e) => handleRowChange(rowIndex, header, e.target.value)}
          className={loginEm ? `${mktInputCls} cursor-default bg-gray-100 text-gray-700` : mktInputCls}
          title={loginEm ? 'Email theo tài khoản đăng nhập' : 'Chọn hoặc nhập email'}
        />
      );
    }
    if (header === 'Tên') {
      if (canPickMktReporterName) {
        return (
          <input
            type="text"
            list="employee-datalist"
            autoComplete="off"
            placeholder="Gõ để tìm tên…"
            value={row.data[header] || ''}
            onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
            onBlur={(e) => syncTenColumnFromInput(rowIndex, e.target.value)}
            className={`${mktInputCls} bg-white`}
            title="Gõ để lọc gợi ý; chọn từ danh sách hoặc nhập đủ họ tên khớp Sheet/HR"
          />
        );
      }
      return (
        <input
          type="text"
          readOnly
          disabled
          value={row.data[header] || ''}
          className="box-border w-full max-w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-gray-100 text-gray-700"
          title="Tên theo tài khoản đăng nhập"
        />
      );
    }
    if (numberFields.includes(header)) {
      return (
        <input
          type="text"
          inputMode="numeric"
          placeholder="Số"
          value={row.data[header] ? formatNumberInput(row.data[header]) : ''}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={`${mktInputCls} text-right tabular-nums`}
        />
      );
    }
    if (header === 'Team') {
      let lsT = '';
      try {
        lsT = String(localStorage.getItem('userTeam') || '').trim();
      } catch {
        /* ignore */
      }
      const stamp = String(loginUserTeam || '').trim() || lsT;
      const loginEm = String(userEmail || '').trim();
      const locked = !!loginEm && !!stamp;
      const cur = locked ? stamp : String(row.data[header] || '').trim();
      if (locked) {
        return (
          <input
            type="text"
            readOnly
            value={cur}
            className={`${mktInputCls} cursor-default bg-gray-100 text-gray-700`}
            title="Team theo tài khoản đăng nhập (bảng users / userTeam)"
          />
        );
      }
      const list = mktTeamSelectOptions || [];
      const head = cur && !list.includes(cur) ? [cur] : [];
      return (
        <select
          value={cur}
          onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
          className={`${mktInputCls} bg-white`}
          title="Chọn Team — khi đã đăng nhập và có team trên hệ thống, Team tự điền và khóa"
        >
          <option value="">-- Team --</option>
          {[...head, ...list].map((team) => (
            <option key={team} value={team}>
              {team}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={row.data[header] || ''}
        onChange={(e) => handleRowChange(rowIndex, header, e.target.value)}
        className={mktInputCls}
      />
    );
  };

  if (!hasPageAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này. Cần một trong: {pageAccessCodes.join(', ')}.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-3">
      <div className="bg-white rounded-lg shadow-lg p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-blue-600">
          <div>
            <h1 className="text-2xl font-bold text-blue-600">{pageTitle}</h1>
            {isHcmReport && (
              <p className="text-xs text-gray-500 mt-1">
                Bảng báo cáo: <span className="font-mono">{reportTableName}</span> · Đối chiếu đơn:{' '}
                <span className="font-mono">{ordersTableName}</span>
              </p>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="mb-3 p-2 rounded bg-gray-100 text-gray-700 text-sm">{status}</div>

        {/* Add Row Button */}
        <button
          type="button"
          onClick={handleAddNewRow}
          className="mb-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold transition"
        >
          ➕ Thêm dòng
        </button>

        {/* Lưới nhập: một CSS Grid — header và ô dùng chung template cột → không lệch như table+sticky */}
        <form onSubmit={handleSubmit}>
          <div className="mb-4 overflow-x-auto rounded-lg border border-gray-300 bg-neutral-300 p-px shadow-sm">
            <div
              className="grid w-max min-w-full gap-px bg-neutral-300 text-xs"
              style={{ gridTemplateColumns: mktReportGridTemplate }}
            >
              <div className="sticky top-0 z-20 flex items-center bg-blue-600 px-2 py-2 text-left text-[11px] font-semibold text-white shadow-sm">
                Hành động
              </div>
              {visibleMktHeaders.map((h) => (
                <div
                  key={`hdr-${h}`}
                  className="sticky top-0 z-20 bg-blue-600 px-2 py-2 text-left text-[11px] font-semibold leading-tight text-white shadow-sm"
                >
                  <span className="whitespace-nowrap">{h}</span>
                </div>
              ))}

              {tableRows.length === 0 ? (
                <div className="col-span-full bg-amber-50 px-4 py-6 text-center text-sm text-gray-600">
                  Chưa có dòng nhập liệu. Nhấn <strong>➕ Thêm dòng</strong> hoặc tải lại trang. Nếu vừa thấy lỗi khởi tạo,
                  mở Console (F12) để xem chi tiết.
                </div>
              ) : (
                tableRows.map((row, rowIndex) => {
                  const rowStripe = rowIndex % 2 === 1;
                  const rowBg = rowStripe ? 'bg-neutral-50' : 'bg-white';
                  return (
                    <div key={row.id} className="contents">
                      <div
                        className={`flex flex-nowrap items-center gap-1 px-2 py-2 ${rowBg} transition-colors hover:bg-neutral-100`}
                      >
                        <button
                          type="button"
                          onClick={() => handleAddRow(rowIndex)}
                          className="shrink-0 rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-green-700"
                          title="Thêm dòng giống dòng này (ngay bên dưới)"
                        >
                          ➕
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(rowIndex)}
                          className="shrink-0 rounded bg-gray-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-gray-700"
                        >
                          ❌
                        </button>
                      </div>
                      {visibleMktHeaders.map((header) => (
                        <div
                          key={`${row.id}-${header}`}
                          className={`min-w-0 px-2 py-2 align-top ${rowBg} transition-colors hover:bg-neutral-100`}
                        >
                          {renderMktReportCell(row, rowIndex, header)}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded text-sm font-semibold transition"
          >
            {loading ? '⏳ Đang gửi...' : '🚀 Gửi báo cáo'}
          </button>
        </form>

        {/* Response Message */}
        {responseMsg.visible && (
          <div
            className={`mt-4 p-2 rounded text-sm text-center ${responseMsg.isSuccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
          >
            {responseMsg.text}
          </div>
        )}

        {/* Employee Datalist */}
        <datalist id="employee-datalist" ref={employeeDatalistRef}>
          {mktTenSelectOptions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        {/* Email Datalist */}
        <datalist id="email-datalist">
          {emailDatalistValues.map((em) => (
            <option key={em} value={em} />
          ))}
        </datalist>

        <datalist id="mkt-product-datalist">
          {(appData.productList || []).map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

      </div>
    </div>
  );
}
