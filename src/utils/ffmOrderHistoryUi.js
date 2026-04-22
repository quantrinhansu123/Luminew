import * as API from '../services/api';

export function formatFfmOrderHistoryDateTime(dateString) {
  if (!dateString) return '';
  const d = new Date(String(dateString));
  if (Number.isNaN(d.getTime())) return String(dateString);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}

export function formatFfmOrderHistoryAuditValueForUi(v) {
  if (v === null || v === undefined || v === '') return '(rỗng)';
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function formatFfmOrderHistoryAuditColumnName(col) {
  const k = String(col || '').trim();
  if (!k) return '(không rõ)';
  return API.DB_TO_APP_MAPPING[k] || k;
}

export function getFfmOrderHistoryYmdFromTs(v) {
  if (!v) return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
