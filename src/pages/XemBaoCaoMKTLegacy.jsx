import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';

import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { upsertMktKpiAlerts } from '../services/mktKpiAlertsService';
import { recalcMktSoDonThucTeFromOrders } from '../services/mktRecalcSoDonThucTeFromOrders';

/** Re-export HCM constants — dùng ở DanhSachBaoCaoTayMKT / App (tránh import nhầm host HN). */
export {
  MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY,
  MKT_HCM_PERSONNEL_MSG_TYPE,
  XEM_BAO_CAO_MKT_HCM_TEAM,
} from './XemBaoCaoMKTHcm';

/** Phạm vi nhân sự trang HN — tách khỏi HCM (`luminew.mktHcmLegacy.scope`). */
export const MKT_HN_LEGACY_PERSONNEL_SCOPE_KEY = 'luminew.mktLegacy.scope';

/** postMessage từ iframe HN → host. */
export const MKT_ALERTS_MSG_TYPE = 'LUMINEW_MKT_ALERTS';
export const MKT_ALERTS_STORAGE_KEY = 'luminew.mktAlerts.v1';
export const MKT_ALERTS_SOURCE = 'luminew-mkt-iframe';
export const MKT_HN_PAGE_ID = 'xem-bao-cao-mkt';

/** postMessage iframe → host: yêu cầu tính Số đơn TT đúng 1 ngày. */
export const MKT_RECALC_TT_MSG_TYPE = 'LUMINEW_MKT_RECALC_TT';

/** YYYY-MM-DD theo lịch local (input type="date"). */
function formatDateYmdLocal(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayYmdLocal() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return formatDateYmdLocal(d);
}

function parseDdMmYyyyToMs(label) {
  const m = String(label || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function readJsonSafe(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Báo cáo MKT Hà Nội (`/xem-bao-cao-mkt`) — iframe `viewNsMoiNhanh.html`.
 * @param {object} props
 * @param {boolean} [props.embedded]
 * @param {string} [props.accessPermissionCode] — override quyền (vd. RND_VIEW)
 * @param {string} [props.iframeTitle]
 */
export default function XemBaoCaoMKTLegacy({
  embedded = false,
  accessPermissionCode,
  iframeTitle = 'Xem báo cáo MKT (viewNsMoiNhanh.html)',
} = {}) {
  const location = useLocation();
  const { canView, role } = usePermissions();

  const requiredPermissionCode = accessPermissionCode || 'MKT_VIEW';
  const fallbackPermissionCodes = accessPermissionCode
    ? [accessPermissionCode]
    : ['MKT_VIEW', 'MKT_INPUT', 'DASHBOARD_QUAN_TRI', 'FINANCE_DASHBOARD'];
  const hasAccess = fallbackPermissionCodes.some((code) => canView(code));

  const roleFromHookLower = String(role || '').toLowerCase();
  const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
  let roleFromUserObj = '';
  try {
    const userJson = localStorage.getItem('user');
    const userObj = userJson ? JSON.parse(userJson) : null;
    roleFromUserObj = String(userObj?.role || '').toLowerCase();
  } catch {
    roleFromUserObj = '';
  }
  const isAdminOnly =
    roleFromHookLower === 'admin' ||
    roleFromHookLower === 'super_admin' ||
    roleFromStorage === 'admin' ||
    roleFromStorage === 'super_admin' ||
    roleFromUserObj === 'admin' ||
    roleFromUserObj === 'super_admin';

  const [recalcDate, setRecalcDate] = useState(() => yesterdayYmdLocal());
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [iframeReloadKey, setIframeReloadKey] = useState(0);
  const recalcLoadingRef = useRef(false);

  const pendingSyncRef = useRef([]);
  const syncTimerRef = useRef(null);

  const runRecalcForOneDay = useCallback(
    async (ymdRaw) => {
      if (recalcLoadingRef.current) return;
      if (!isAdminOnly) {
        alert('Chỉ Admin mới được kích hoạt tính Số đơn TT.');
        return;
      }

      const ymd = String(ymdRaw || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        alert('Vui lòng chọn đúng 1 ngày để kích hoạt tính toán.');
        return;
      }

      const ok = window.confirm(
        `Tính lại Số đơn TT / Doanh số TT cho Báo cáo MKT đúng 1 ngày: ${ymd}.\n\n` +
          'Nguồn đơn: bảng orders. Cập nhật dòng hiện có; thiếu dòng theo SP/thị trường/ca sẽ tạo mới.\n\n' +
          'Bạn có chắc muốn chạy không?'
      );
      if (!ok) return;

      try {
        recalcLoadingRef.current = true;
        setRecalcLoading(true);
        toast.info(`Đang tính Số đơn TT cho ngày ${ymd}…`, { autoClose: false });

        const result = await recalcMktSoDonThucTeFromOrders({
          startDate: ymd,
          endDate: ymd,
          createMissingRows: true,
          reportsTableName: 'detail_reports',
          ordersSupabaseTable: null,
          ordersApiPath: null,
        });

        toast.dismiss();
        const nUpd = result.updatedExisting ?? 0;
        const nNew = result.createdMissing ?? 0;
        toast.success(
          `Ngày ${ymd}: cập nhật ${nUpd} dòng, tạo mới ${nNew} dòng (tổng ${result.upserted || 0}).`
        );
        setIframeReloadKey((k) => k + 1);
      } catch (error) {
        console.error('[XemBaoCaoMKTLegacy] recalc TT:', error);
        toast.dismiss();
        const msg = error?.message || String(error);
        toast.error('Lỗi tính Số đơn TT: ' + msg, { autoClose: 12000 });
      } finally {
        recalcLoadingRef.current = false;
        setRecalcLoading(false);
      }
    },
    [isAdminOnly]
  );

  useEffect(() => {
    const onMessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === MKT_RECALC_TT_MSG_TYPE) {
        const ymd = String(msg.date || msg.ymd || '').trim();
        void runRecalcForOneDay(ymd);
        return;
      }

      if (msg.type !== MKT_ALERTS_MSG_TYPE) return;
      if (msg.source !== MKT_ALERTS_SOURCE) return;

      const now = Date.now();
      const incomingAlerts = Array.isArray(msg.alerts) ? msg.alerts : [];

      const prev = readJsonSafe(MKT_ALERTS_STORAGE_KEY, {
        v: 1,
        ts: 0,
        page: MKT_HN_PAGE_ID,
        alerts: [],
      });
      const prevAlerts = Array.isArray(prev?.alerts) ? prev.alerts : [];

      const byId = new Map();
      prevAlerts.forEach((a) => {
        const id = String(a?.id || '').trim();
        if (!id) return;
        byId.set(id, a);
      });

      incomingAlerts.forEach((a) => {
        const id = String(a?.id || '').trim();
        if (!id) return;
        const dateLabel = String(a?.dateLabel || '').trim();
        const reportDateMs = parseDdMmYyyyToMs(dateLabel);
        byId.set(id, {
          ...a,
          id,
          dateLabel,
          reportDateMs: Number(a?.reportDateMs) || reportDateMs || null,
          receivedAt: now,
        });
      });

      const monthAgo = now - 31 * 24 * 60 * 60 * 1000;
      const merged = Array.from(byId.values()).filter((a) => {
        const reportMs = Number(a?.reportDateMs) || null;
        const ts = Number(a?.ts) || 0;
        const receivedAt = Number(a?.receivedAt) || 0;
        if (reportMs != null) return reportMs >= monthAgo;
        if (ts) return ts >= monthAgo;
        return receivedAt >= monthAgo;
      });

      merged.sort(
        (a, b) =>
          (Number(b?.receivedAt) || Number(b?.ts) || 0) -
          (Number(a?.receivedAt) || Number(a?.ts) || 0)
      );
      const capped = merged.slice(0, 2500);

      const payload = {
        v: 1,
        ts: Number(msg.ts) || now,
        page: String(msg.page || prev?.page || MKT_HN_PAGE_ID),
        alerts: capped,
      };
      try {
        localStorage.setItem(MKT_ALERTS_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] store alerts:', e);
      }

      try {
        if (incomingAlerts.length > 0) {
          pendingSyncRef.current = [...pendingSyncRef.current, ...incomingAlerts];
          if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
          syncTimerRef.current = setTimeout(async () => {
            const batch = pendingSyncRef.current;
            pendingSyncRef.current = [];
            syncTimerRef.current = null;
            try {
              await upsertMktKpiAlerts(batch, { sourcePage: payload.page });
            } catch (err) {
              console.error('[XemBaoCaoMKTLegacy] sync mkt_kpi_alerts error:', err);
            }
          }, 800);
        }
      } catch (err) {
        console.error('[XemBaoCaoMKTLegacy] schedule sync:', err);
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [runRecalcForOneDay]);

  useEffect(() => {
    let cancelled = false;

    const writeHnScope = async () => {
      const roleFromHook = (role || '').toUpperCase();
      const roleFromStorage = (localStorage.getItem('userRole') || '').toLowerCase();
      let userObj = null;
      try {
        const userJson = localStorage.getItem('user');
        userObj = userJson ? JSON.parse(userJson) : null;
      } catch {
        userObj = null;
      }
      const roleFromUserObj = (userObj?.role || '').toLowerCase();
      const roleFromHookLower = (roleFromHook || '').toLowerCase();

      const isAdmin =
        roleFromHookLower === 'admin' ||
        roleFromHookLower === 'super_admin' ||
        roleFromHookLower === 'finance' ||
        roleFromStorage === 'admin' ||
        roleFromStorage === 'super_admin' ||
        roleFromStorage === 'finance' ||
        roleFromUserObj === 'admin' ||
        roleFromUserObj === 'super_admin' ||
        roleFromUserObj === 'finance';

      let skipPersonnelFilter = isAdmin;
      let allowedNames = [];

      if (!skipPersonnelFilter) {
        const userEmail = (localStorage.getItem('userEmail') || '').trim();
        const loginUsername = (localStorage.getItem('username') || '').trim();
        if (userEmail || loginUsername) {
          try {
            const list = await rbacService.getSelectedPersonnelForLogin({
              email: userEmail,
              username: loginUsername,
            });
            allowedNames = list
              .map((n) => rbacService.normalizeMktPersonWhitespace(n))
              .filter((nameStr) => nameStr.length > 0 && !nameStr.includes('@'));
          } catch (e) {
            console.error('[XemBaoCaoMKTLegacy] getSelectedPersonnelForLogin:', e);
            allowedNames = [];
          }
        }
      }

      if (cancelled) return;

      const payload = {
        v: 1,
        skipPersonnelFilter,
        allowedNames,
        ts: Date.now(),
      };

      const raw = JSON.stringify(payload);
      try {
        sessionStorage.setItem(MKT_HN_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] sessionStorage scope:', e);
      }
      try {
        localStorage.setItem(MKT_HN_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] localStorage scope:', e);
      }
    };

    writeHnScope();

    return () => {
      cancelled = true;
    };
  }, [role]);

  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.set('ui', 'bao-cao-ok-mess-cpqc');
    return `/viewNsMoiNhanh.html?${params.toString()}`;
  }, [location.search]);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({requiredPermissionCode}).
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden bg-white flex flex-col ${embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'}`}
    >
      {isAdminOnly && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-2 border-b border-slate-200 bg-slate-50 text-sm">
          <span className="font-semibold text-slate-700">Tính Số đơn TT</span>
          <label className="flex items-center gap-2 text-slate-600">
            <span>Chọn ngày:</span>
            <input
              type="date"
              value={recalcDate}
              onChange={(e) => setRecalcDate(e.target.value)}
              disabled={recalcLoading}
              required
              className="border border-slate-300 rounded px-2 py-1 bg-white"
              title="Bắt buộc chọn đúng 1 ngày"
            />
          </label>
          <button
            type="button"
            disabled={recalcLoading || !recalcDate}
            onClick={() => void runRecalcForOneDay(recalcDate)}
            className="px-3 py-1.5 rounded font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            title="Tính lại Số đơn TT / Doanh số TT từ orders vào detail_reports — chỉ đúng 1 ngày"
          >
            {recalcLoading ? 'Đang tính…' : 'Kích hoạt tính toán'}
          </button>
          <span className="text-xs text-slate-500">
            Chỉ tính đúng 1 ngày đã chọn (tạo dòng thiếu nếu cần).
          </span>
        </div>
      )}
      <iframe
        key={iframeReloadKey}
        src={iframeSrc}
        className="w-full flex-1 min-h-0 border-none"
        title={iframeTitle}
      />
    </div>
  );
}
