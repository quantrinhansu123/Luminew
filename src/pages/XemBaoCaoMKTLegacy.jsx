import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';

/** Khớp iframe `viewNsMoiNhanh-HCM.html` — phạm vi nhân sự (email/username → users.selected_personnel qua getSelectedPersonnelForLogin). */
export const MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY = 'luminew.mktHcmLegacy.scope';

/** postMessage từ host → iframe HCM (sessionStorage iframe thường không chia sẻ với parent). */
export const MKT_HCM_PERSONNEL_MSG_TYPE = 'MKT_HCM_PERSONNEL_SCOPE';

/** postMessage từ iframe → host: cảnh báo KPI theo nhân sự (để header hiển thị chuông). */
export const MKT_ALERTS_MSG_TYPE = 'LUMINEW_MKT_ALERTS';
export const MKT_ALERTS_STORAGE_KEY = 'luminew.mktAlerts.v1';

/** Team HCM — Đức Anh (khớp cột `Team` trên detail_reports). */
export const XEM_BAO_CAO_MKT_HCM_TEAM = 'MKT - Đức Anh';

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
 * @param {object} props
 * @param {boolean} [props.embedded]
 * @param {string} [props.legacyHtmlPath] — đường dẫn file legacy trong public (vd. `/viewNsMoiNhanh-HCM.html`)
 * @param {string[] | null} [props.iframeAllowedTeams] — nếu có: iframe kèm ?allowedTeams=... (không ghép location.search)
 * @param {string} [props.iframeTitle]
 */
export default function XemBaoCaoMKTLegacy({
  embedded = false,
  legacyHtmlPath = '/viewNsMoiNhanh.html',
  iframeAllowedTeams = null,
  iframeTitle = 'Xem báo cáo MKT (viewNsMoiNhanh.html)',
} = {}) {
  const location = useLocation();
  const { canView, role } = usePermissions();

  const usesIframeTeamFilter =
    iframeAllowedTeams != null && Array.isArray(iframeAllowedTeams) && iframeAllowedTeams.length > 0;

  const hasAccess = usesIframeTeamFilter ? canView('MKT_VIEW_HCM') : canView('MKT_VIEW');

  const [hcmPersonnelGate, setHcmPersonnelGate] = useState(() => !usesIframeTeamFilter);
  const hcmScopePayloadRef = useRef(null);

  // Nhận cảnh báo từ iframe, lưu localStorage để Header đọc.
  useEffect(() => {
    const onMessage = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== MKT_ALERTS_MSG_TYPE) return;
      if (msg.source !== 'luminew-mkt-iframe') return;

      const now = Date.now();
      const incomingAlerts = Array.isArray(msg.alerts) ? msg.alerts : [];

      // Mở rộng: lưu lịch sử ~1 tháng, không ghi đè khi user đổi filter.
      const prev = readJsonSafe(MKT_ALERTS_STORAGE_KEY, { v: 1, ts: 0, page: 'xem-bao-cao-mkt', alerts: [] });
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
        // Bổ sung reportDateMs nếu có dateLabel dạng dd/mm/yyyy
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
        // Giữ nếu reportDate còn trong 31 ngày; fallback theo ts/receivedAt.
        if (reportMs != null) return reportMs >= monthAgo;
        if (ts) return ts >= monthAgo;
        return receivedAt >= monthAgo;
      });

      // Giới hạn để localStorage không phình (ưu tiên mới nhất theo receivedAt/ts)
      merged.sort((a, b) => (Number(b?.receivedAt) || Number(b?.ts) || 0) - (Number(a?.receivedAt) || Number(a?.ts) || 0));
      const capped = merged.slice(0, 2500);

      const payload = {
        v: 1,
        ts: Number(msg.ts) || now,
        page: String(msg.page || prev?.page || 'xem-bao-cao-mkt'),
        alerts: capped,
      };
      try {
        localStorage.setItem(MKT_ALERTS_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] store alerts:', e);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!usesIframeTeamFilter) {
      setHcmPersonnelGate(true);
      return undefined;
    }

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
      hcmScopePayloadRef.current = payload;

      const raw = JSON.stringify(payload);
      try {
        sessionStorage.setItem(MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] sessionStorage scope:', e);
      }
      try {
        localStorage.setItem(MKT_HCM_LEGACY_PERSONNEL_SCOPE_KEY, raw);
      } catch (e) {
        console.error('[XemBaoCaoMKTLegacy] localStorage scope:', e);
      }
      setHcmPersonnelGate(true);
    };

    setHcmPersonnelGate(false);
    writeHcmScope();

    return () => {
      cancelled = true;
    };
  }, [usesIframeTeamFilter, role]);

  const iframeSrc = useMemo(() => {
    const base = legacyHtmlPath;
    if (usesIframeTeamFilter) {
      const qs = new URLSearchParams();
      iframeAllowedTeams.forEach((t) => qs.append('allowedTeams', t));
      return `${base}?${qs.toString()}`;
    }
    return `${base}${location.search || ''}`;
  }, [iframeAllowedTeams, legacyHtmlPath, location.search, usesIframeTeamFilter]);

  if (!hasAccess) {
    const codes = usesIframeTeamFilter ? 'MKT_VIEW_HCM' : 'MKT_VIEW';
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({codes}).
      </div>
    );
  }

  if (usesIframeTeamFilter && !hcmPersonnelGate) {
    return (
      <div
        className={`w-full flex items-center justify-center bg-white text-gray-600 ${
          embedded ? 'h-screen' : 'h-[calc(100vh-64px)]'
        }`}
      >
        Đang tải phạm vi nhân sự…
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
        onLoad={(e) => {
          if (!usesIframeTeamFilter) return;
          const send = () => {
            try {
              const w = e.currentTarget.contentWindow;
              const p = hcmScopePayloadRef.current;
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
              console.error('[XemBaoCaoMKTLegacy] postMessage to HCM iframe:', err);
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
