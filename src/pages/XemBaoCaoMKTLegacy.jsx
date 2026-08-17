import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { upsertMktKpiAlerts } from '../services/mktKpiAlertsService';

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

  const pendingSyncRef = useRef([]);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
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
  }, []);

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
      className={`w-full overflow-hidden bg-white ${embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'}`}
    >
      <iframe
        src={iframeSrc}
        className="w-full h-full border-none"
        title={iframeTitle}
      />
    </div>
  );
}
