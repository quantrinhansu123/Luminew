import { useEffect, useMemo, useRef, useState } from 'react';

import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { upsertMktKpiAlerts } from '../services/mktKpiAlertsService';

/** Khớp iframe `viewNsMoiNhanh-HCM.html` — phạm vi nhân sự HCM (tách khỏi HN). */
export const MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY = 'luminew.mktHcmLegacy.scope';

/** postMessage từ host HCM → iframe HCM. */
export const MKT_HCM_PERSONNEL_MSG_TYPE = 'MKT_HCM_PERSONNEL_SCOPE';

/** postMessage từ iframe HCM → host. */
export const MKT_HCM_ALERTS_MSG_TYPE = 'LUMINEW_MKT_ALERTS';
export const MKT_HCM_ALERTS_STORAGE_KEY = 'luminew.mktAlerts.hcm.v1';
export const MKT_HCM_ALERTS_SOURCE = 'luminew-mkt-hcm-iframe';
export const MKT_HCM_PAGE_ID = 'xem-bao-cao-mkt-hcm';

/** Team HCM — Đức Anh (khớp cột `Team` trên marketing_report_hcm). */
export const XEM_BAO_CAO_MKT_HCM_TEAM = 'MKT - Đức Anh';

const HCM_LEGACY_HTML = '/viewNsMoiNhanh-HCM.html';
const HCM_ACCESS_CODES = ['MKT_VIEW_HCM', 'MKT_INPUT_HCM', 'DASHBOARD_QUAN_TRI', 'FINANCE_DASHBOARD'];

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
 * Trang báo cáo MKT chi nhánh HCM — độc lập với `/xem-bao-cao-mkt` (HN).
 * @param {object} [props]
 * @param {boolean} [props.embedded]
 */
export default function XemBaoCaoMKTHcm({ embedded = false } = {}) {
  const { canView, role } = usePermissions();
  const hasAccess = HCM_ACCESS_CODES.some((code) => canView(code));

  const [personnelGate, setPersonnelGate] = useState(false);
  const scopePayloadRef = useRef(null);
  const pendingSyncRef = useRef([]);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== MKT_HCM_ALERTS_MSG_TYPE) return;
      if (msg.source !== MKT_HCM_ALERTS_SOURCE) return;

      const now = Date.now();
      const incomingAlerts = Array.isArray(msg.alerts) ? msg.alerts : [];

      const prev = readJsonSafe(MKT_HCM_ALERTS_STORAGE_KEY, {
        v: 1,
        ts: 0,
        page: MKT_HCM_PAGE_ID,
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
        page: String(msg.page || prev?.page || MKT_HCM_PAGE_ID),
        alerts: capped,
      };
      try {
        localStorage.setItem(MKT_HCM_ALERTS_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.error('[XemBaoCaoMKTHcm] store alerts:', e);
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
              await upsertMktKpiAlerts(batch, { sourcePage: MKT_HCM_PAGE_ID });
            } catch (err) {
              console.error('[XemBaoCaoMKTHcm] sync mkt_kpi_alerts error:', err);
            }
          }, 800);
        }
      } catch (err) {
        console.error('[XemBaoCaoMKTHcm] schedule sync:', err);
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

    const writeHcmScope = async () => {
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
            console.error('[XemBaoCaoMKTHcm] getSelectedPersonnelForLogin:', e);
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
      scopePayloadRef.current = payload;

      const raw = JSON.stringify(payload);
      try {
        sessionStorage.setItem(MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTHcm] sessionStorage scope:', e);
      }
      try {
        localStorage.setItem(MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTHcm] localStorage scope:', e);
      }
      setPersonnelGate(true);
    };

    setPersonnelGate(false);
    writeHcmScope();

    return () => {
      cancelled = true;
    };
  }, [role]);

  const iframeSrc = useMemo(() => {
    const qs = new URLSearchParams();
    qs.append('allowedTeams', XEM_BAO_CAO_MKT_HCM_TEAM);
    return `${HCM_LEGACY_HTML}?${qs.toString()}`;
  }, []);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này (MKT_VIEW_HCM).
      </div>
    );
  }

  if (!personnelGate) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-white text-gray-600 ${
          embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'
        }`}
      >
        Đang tải phạm vi nhân sự HCM…
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
        title="Xem báo cáo MKT HCM (viewNsMoiNhanh-HCM)"
        onLoad={(e) => {
          const send = () => {
            try {
              const w = e.currentTarget.contentWindow;
              const p = scopePayloadRef.current;
              if (!w || !p) return;
              const msg = {
                source: 'luminew-host',
                type: MKT_HCM_PERSONNEL_MSG_TYPE,
                v: 1,
                skipPersonnelFilter: p.skipPersonnelFilter,
                allowedNames: p.allowedNames,
                ts: p.ts,
              };
              const o = window.location.origin;
              w.postMessage(msg, o);
              w.postMessage(msg, '*');
            } catch (err) {
              console.error('[XemBaoCaoMKTHcm] postMessage to HCM iframe:', err);
            }
          };
          send();
          setTimeout(send, 50);
          setTimeout(send, 300);
        }}
      />
    </div>
  );
}
