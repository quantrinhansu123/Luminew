import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { TableVirtuoso } from 'react-virtuoso';
import * as XLSX from 'xlsx';

import ColumnSettingsModal from '../components/ColumnSettingsModal';
import MultiSelect from '../components/MultiSelect';
import SyncPopover from '../components/SyncPopover';
import usePermissions from '../hooks/usePermissions';
import * as API from '../services/api';
import * as rbacService from '../services/rbacService';
import '../styles/selection.css';
import { supabase } from '../supabase/config';
import { parseVietnameseMoneyToNumber } from '../utils/parseVietnameseMoney';
import {
  normalizeVanDonNbDeliveryStatusDisplay
} from '../utils/vanDonDeliveryStatusDisplay';
import { isVanDonSemanticEmpty } from '../utils/vanDonSemanticEmpty';
import { matchesVanDonHeaderSearch, normalizeVanDonFilterWhitespace } from '../utils/vanDonFilterNormalize';
import { recalcMktSoDonThucTeFromOrders } from '../services/mktRecalcSoDonThucTeFromOrders';


import {
  BILL_LADING_COLUMNS, COLUMN_MAPPING,
  DEFAULT_BILL_LADING_COLUMNS,
  DROPDOWN_OPTIONS,
  EDITABLE_COLS,
  LONG_TEXT_COLS,
  ORDER_MGMT_COLUMNS,
  PRIMARY_KEY_COLUMN,
  SETTINGS_KEY,
  TEAM_COLUMN_NAME
} from '../types';

/** Thị trường trọng điểm (AdminTools → localStorage). */
function readKeyMarketsFromLocalSettings() {
  try {
    const s = localStorage.getItem(SETTINGS_KEY);
    if (!s) return [];
    const parsed = JSON.parse(s);
    const km = parsed?.keyMarkets;
    if (!Array.isArray(km)) return [];
    return km
      .map((x) => String(x ?? '').trim())
      .filter((x) => x && !isVanDonSemanticEmpty(x));
  } catch {
    return [];
  }
}

/** Giới hạn một response PostgREST/Supabase (thường 1000); dùng cho xuất Excel / lặp trang. */
const VAN_DON_POSTGREST_MAX_ROWS = 1000;

/** Không dùng chung `speegoPendingChanges` với FFM — tránh nạp hàng đợi / OCC sai trang. */
const VAN_DON_PENDING_LS_KEY = 'speegoPendingChanges_van_don';
const VAN_DON_PENDING_SNAPSHOTS_LS_KEY = 'speegoPendingRowSnapshots_van_don';

// Columns to always hide (both in table and column settings)
const HIDDEN_COLUMNS = ["Thuê TK", "Thời gian cutoff", "Tiền Hàng", "Ngày Kế toán đối soát với FFM lần 2"];

/**
 * Cột chỉ đọc trên lưới Vận đơn.
 * "Mã Tracking" bị khóa để tránh sửa trực tiếp/paste nhầm ngay trên bảng.
 */
const VAN_DON_GRID_READ_ONLY_COLS = ['Mã Tracking', 'Mã tracking', 'tracking_code'];

const UPDATE_DELAY = 500;
const BULK_THRESHOLD = 1;
/** Độ rộng cột checkbox (tab Hà Nội) — bù `left` cho cột sticky kế bên */
const VAN_DON_CHECKBOX_COL_PX = 50;
/** Cột orders.canh_bao — luôn hiển thị trên mọi tab vận đơn */
const VAN_DON_CANH_BAO_COLUMN = 'Cảnh báo trùng';
/** Toolbar «Loại ngày» = không lọc theo khoảng Từ–Đến trên một cột ngày (API + client). */
const BOL_TOOLBAR_DATE_TYPE_ALL = 'Tất cả';
/** Chỉ trang /van-don-hcm — map DB `thu_tu_chia` */
const VAN_DON_HCM_THU_TU_CHIA_COLUMN = 'Thứ tự chia';

function rowHasVanDonCanhBao(row) {
  if (!row) return false;
  const v = row[VAN_DON_CANH_BAO_COLUMN] ?? row.canh_bao;
  return !isVanDonSemanticEmpty(v);
}

/** Chuẩn hóa header cột (NFC) — tránh lệch ký tự Unicode so với EDITABLE_COLS. */
function normalizeColHeader(col) {
  if (col == null || col === '') return '';
  return String(col).normalize('NFC').trim();
}

function colInList(col, list) {
  const n = normalizeColHeader(col);
  if (!n) return false;
  for (let i = 0; i < list.length; i++) {
    if (normalizeColHeader(list[i]) === n) return true;
  }
  return false;
}

/**
 * Gộp distinct DB + giá trị trên trang cho trạng thái giao NB — trùng không phân biệt hoa thường, ưu tiên chữ trong preset.
 * Dùng chung logic với bộ lọc MultiSelect (không có mục «Trống» — ô `<select>` dùng '' riêng).
 */
function mergeVanDonNbDeliveryStatusValueList(preset, dbAndPageValues) {
  const pickBetterCase = (a, b) => {
    const aEx = preset.some((p) => p !== '' && String(p) === String(a));
    const bEx = preset.some((p) => p !== '' && String(p) === String(b));
    if (aEx && !bEx) return a;
    if (bEx && !aEx) return b;
    const al = String(a).toLowerCase();
    const bl = String(b).toLowerCase();
    const piA = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === al);
    const piB = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === bl);
    if (piA !== -1 && piB === -1) return preset[piA];
    if (piB !== -1 && piA === -1) return preset[piB];
    if (piA !== -1 && piB !== -1) return preset[Math.min(piA, piB)];
    return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true }) <= 0 ? a : b;
  };

  const byLower = new Map();
  for (const raw of dbAndPageValues) {
    if (isVanDonSemanticEmpty(raw)) continue;
    const s = String(raw).trim();
    const lk = s.toLowerCase();
    if (!byLower.has(lk)) byLower.set(lk, s);
    else byLower.set(lk, pickBetterCase(byLower.get(lk), s));
  }

  let merged = Array.from(byLower.values());
  const mergedLower = new Set(merged.map((v) => String(v).trim().toLowerCase()));
  for (const p of preset) {
    if (p === '') continue;
    const pl = String(p).trim().toLowerCase();
    if (!mergedLower.has(pl)) {
      merged.push(String(p).trim());
      mergedLower.add(pl);
    }
  }

  merged.sort((a, b) =>
    String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true })
  );
  return merged;
}

/** Nhãn UI hoặc khóa DB (snake_case) — khớp DB_TO_APP_MAPPING. */
function isVanDonGridReadOnlyColumnKey(colOrKey) {
  if (colOrKey == null || colOrKey === '') return false;
  if (colInList(colOrKey, VAN_DON_GRID_READ_ONLY_COLS)) return true;
  const appFromDb = API.DB_TO_APP_MAPPING[colOrKey];
  if (appFromDb && colInList(appFromDb, VAN_DON_GRID_READ_ONLY_COLS)) return true;
  return false;
}

/** Không hiển thị chữ "null" / "undefined" / placeholder rỗng nghĩa — để trống; giữ số & boolean. */
function coalesceVanDonDisplayValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return isVanDonSemanticEmpty(v) ? '' : v;
  return v;
}

/** Khớp giá trị với một mục trong `<select>` (trim / hoa-thường) — tránh ô trắng khi DB hơi lệch chuỗi so preset. */
function matchVanDonSelectToOptionList(raw, optionList) {
  if (raw === '' || raw == null) return '';
  const s = String(raw);
  const opts = Array.isArray(optionList) ? optionList : [];
  if (opts.includes(s)) return s;
  const t = s.trim();
  if (opts.includes(t)) return t;
  const lower = t.toLowerCase();
  const hit = opts.find((o) => o !== '' && String(o).trim().toLowerCase() === lower);
  if (hit !== undefined) return hit;
  return s;
}

/** Giá trị ô lưới vận đơn: ưu tiên khóa đã map + fallback so khớp NFC mọi key trên row (tránh lệch Unicode / tên cột). */
function getVanDonGridCellValue(row, colHeader) {
  if (!row) return '';
  const logical = COLUMN_MAPPING[colHeader] || colHeader;
  const isFfmDeliveryStatusColEarly = normalizeColHeader(colHeader) === normalizeColHeader('Trạng thái giao hàng');
  const isNbDeliveryStatusCol =
    !isFfmDeliveryStatusColEarly && (
      normalizeColHeader(colHeader) === normalizeColHeader('Trạng thái giao hàng NB') ||
      normalizeColHeader(logical) === normalizeColHeader('Trạng thái giao hàng NB')
    );
  if (isNbDeliveryStatusCol) {
    // Hiển thị cột NB theo đúng field NB, không fallback qua FFM/cột gộp.
    const raw = row?.['Trạng thái giao hàng NB'] ?? row?.delivery_status_nb ?? '';
    return coalesceVanDonDisplayValue(normalizeVanDonNbDeliveryStatusDisplay(raw));
  }
  if (isFfmDeliveryStatusColEarly) {
    return coalesceVanDonDisplayValue(row.delivery_status || row['Trạng thái giao hàng'] || '');
  }
  const tryKeys = [logical, colHeader, String(logical).replace(/ /g, '_'), String(colHeader).replace(/ /g, '_')];
  for (let i = 0; i < tryKeys.length; i++) {
    const k = tryKeys[i];
    if (k == null || k === '') continue;
    if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
    const v = row[k];
    if (v !== undefined && v !== null) return coalesceVanDonDisplayValue(v);
  }
  const wantLog = normalizeColHeader(logical);
  const wantHdr = normalizeColHeader(colHeader);
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    const nk = normalizeColHeader(keys[i]);
    if (nk === wantLog || nk === wantHdr) return coalesceVanDonDisplayValue(row[keys[i]]);
  }
  return '';
}

/**
 * Copy nhiều ô (TSV) rồi dán Excel: ký tự tab / xuống dòng trong một ô tách thành nhiều cột → nhìn như «tên đổi».
 * Đầu ô là `= + - @` Excel coi là công thức; SĐT `+84…` cũng hay gặp.
 */
function sanitizeExcelTsvCell(raw, opts = {}) {
  const { skipLeadingApostrophe = false } = opts;
  if (raw == null) return '';
  let s = String(raw);
  s = s.replace(/\r\n|\r|\n/g, ' ').replace(/\t/g, ' ');
  if (!skipLeadingApostrophe && /^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  return s;
}

/** Một dòng tiền cho header «Tổng tiền»: ưu tiên ô «Tổng tiền VNĐ»; sau đó cùng logic DB (line → nullif tong → total → …). */
function pickVanDonRowMoneyVnd(row) {
  if (!row) return 0;
  const displayedCandidates = [
    getVanDonGridCellValue(row, 'Tổng tiền VNĐ'),
    row['Tổng tiền VNĐ'],
  ];
  for (let i = 0; i < displayedCandidates.length; i++) {
    const raw = displayedCandidates[i];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const n =
      typeof raw === 'number' && Number.isFinite(raw) ? raw : parseVietnameseMoneyToNumber(raw);
    if (n != null && Number.isFinite(n)) return n;
  }
  return API.resolveVanDonMoneyVndFromDbRow(row);
}

/** Phí ship trên lưới (VNĐ) — ưu tiên cột «Phí ship» / shipping_fee; fallback shipping_cost nếu có. */
function pickVanDonRowShippingVnd(row) {
  if (!row) return 0;
  const raw =
    getVanDonGridCellValue(row, 'Phí ship') ??
    row['Phí ship'] ??
    row.shipping_fee ??
    row.shipping_cost;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n =
    typeof raw === 'number' && Number.isFinite(raw) ? raw : parseVietnameseMoneyToNumber(raw);
  return n != null && Number.isFinite(n) ? n : 0;
}

/** Có bill: ngày up bill / ảnh thanh toán / payment_bill (khớp aggregate phía API). */
function vanDonRowHasBillEvidence(row) {
  if (!row) return false;
  const img = row.payment_image ?? row['Payment Image'] ?? '';
  if (img != null && String(img).trim() !== '') return true;
  const up = row.ngayupbill ?? row['Ngày up bill'] ?? '';
  if (up != null && String(up).trim() !== '') return true;
  const pb = row.payment_bill ?? row['Payment Bill'] ?? '';
  return pb != null && String(pb).trim() !== '';
}

function pickVanDonRowReconciledVnd(row) {
  if (!row) return 0;
  const parse = (raw) => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return parseVietnameseMoneyToNumber(raw);
  };
  const v = parse(
    getVanDonGridCellValue(row, 'Tiền Việt đã đối soát') ??
      row['Tiền Việt đã đối soát'] ??
      row.reconciled_vnd ??
      row['Tiền đã thanh toán']
  );
  if (v != null && v > 0) return v;
  const a = parse(row.reconciled_amount ?? row['Số tiền của đơn hàng đã về TK Cty']);
  if (a != null && a > 0) return a;
  if (v != null && Number.isFinite(v)) return v;
  if (a != null && Number.isFinite(a)) return a;
  return 0;
}

/**
 * Mã đơn chuẩn cho một dòng — luôn string đã trim.
 * PendingChanges dùng Map theo mã đơn: nếu nhiều dòng cùng `undefined`/'' hoặc number vs "123" không khớp,
 * một lần sửa có thể áp nhầm lên cả chục dòng.
 */
function getVanDonRowOrderId(row) {
  if (!row) return '';
  const raw = row[PRIMARY_KEY_COLUMN] ?? row.order_code ?? row.orderCode;
  if (raw == null || raw === '') return '';
  return String(raw).trim();
}

function normalizeVanDonOrderIdKey(id) {
  if (id == null) return '';
  return String(id).trim();
}

function normalizeVanDonBulkOrderCode(code) {
  return String(code ?? '').trim().toLowerCase();
}

/** Cột được sửa trực tiếp trên lưới vận đơn (Mã Tracking chỉ đọc; Cảnh báo trùng không nằm trong EDITABLE_COLS — mọi tab). */
function isVanDonUserEditableColumn(col) {
  if (isVanDonGridReadOnlyColumnKey(col)) return false;
  if (!colInList(col, EDITABLE_COLS)) return false;
  return true;
}

/** Cột tiền/số trên lưới — so sánh theo giá trị số (4.725.000 ≡ 4725000), tránh ghi DB khi chỉ khác format. */
function isVanDonMoneyGridAppKey(colKey) {
  const n = normalizeColHeader(colKey);
  return (
    n === normalizeColHeader('Tổng tiền VNĐ') ||
    n === normalizeColHeader('Tiền Việt đã đối soát') ||
    n === normalizeColHeader('Tiền đã thanh toán') ||
    n === normalizeColHeader('Giá bán') ||
    n === normalizeColHeader('Phí ship') ||
    n === normalizeColHeader('Phí xử lý đơn đóng hàng-Lưu kho(usd)') ||
    n === normalizeColHeader('Số tiền của đơn hàng đã về TK Cty') ||
    n === normalizeColHeader('Số lượng mặt hàng 1') ||
    n === normalizeColHeader('Số lượng mặt hàng 2') ||
    n === normalizeColHeader('Số lượng quà kèm')
  );
}

function vanDonMoneyCellValuesEqual(a, b) {
  const pa = parseVietnameseMoneyToNumber(a === '' || a == null ? null : a);
  const pb = parseVietnameseMoneyToNumber(b === '' || b == null ? null : b);
  if (pa === null && pb === null) return true;
  if (pa === null || pb === null) return false;
  return pa === pb;
}

/** TableVirtuoso chỉ bọc sẵn <tr> — không được trả về <tr> từ itemContent (tránh <tr> lồng <tr>, DOM hỏng). */
function VanDonVirtuosoTable({ style, ...props }) {
  return (
    <table
      {...props}
      className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed"
      style={{ 
        ...style, 
        tableLayout: 'fixed',
      }}
    />
  );
}

const VanDonVirtuosoTableBody = React.forwardRef((props, ref) => <tbody {...props} ref={ref} />);
VanDonVirtuosoTableBody.displayName = 'VanDonVirtuosoTableBody';

/** Cuộn ngang + dọc trên cùng một scroller. Cột ghim dùng translateX(var(--vd-sl)) thay vì position:sticky. */
const VanDonVirtuosoScroller = React.forwardRef(({ style, ...props }, ref) => (
  <div
    {...props}
    ref={ref}
    data-van-don-scroller=""
    style={{
      ...style,
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
      position: 'relative',
    }}
  />
));
VanDonVirtuosoScroller.displayName = 'VanDonVirtuosoScroller';

/**
 * VanDonRow — component hàng được bọc React.memo để tránh re-render không cần thiết.
 * Virtuoso chỉ gọi lại khi row, selection, pending, selectedRows thay đổi thuộc về hàng này.
 * Khi cuộn, các hàng đang visible không thay đổi → React skip hoàn toàn (zero re-render).
 */
const VanDonRow = React.memo(function VanDonRow({
  row,
  rIdx,
  currentColumns,
  effectiveFixedColumns,
  bolActiveTab,
  selectedRows,
  pendingChanges,
  selectionBounds,
  getStickyLeftPx,
  getColumnWidthStyles,
  renderVanDonDataCell,
  toggleRowSelection,
  isLongTextExpanded,
  currentPage,
  effectiveRowsPerPage,
}) {
  const orderId = getVanDonRowOrderId(row);
  const isSelected = Boolean(orderId && selectedRows.has(orderId));
  const hasCanhBao = rowHasVanDonCanhBao(row);

  return (
    <>
      {bolActiveTab === 'hanoi' && (
        <td
          className={`py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap px-2 relative z-[6000] ${hasCanhBao && !isSelected ? 'van-don-canh-bao-blink' : ''}`}
          style={{
            width: VAN_DON_CHECKBOX_COL_PX,
            minWidth: VAN_DON_CHECKBOX_COL_PX,
            transform: 'translateX(var(--vd-sl, 0px))',
            ...(isSelected
              ? { backgroundColor: '#dbeafe' }
              : hasCanhBao
                ? {}
                : { backgroundColor: '#f9fafb' })
          }}
        >
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              checked={isSelected}
              disabled={!orderId}
              onChange={() => orderId && toggleRowSelection(orderId)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>
        </td>
      )}
      {currentColumns.map((col, cIdx) => {
        const cellStickyLeft = getStickyLeftPx(cIdx);
        const isFixed = cIdx < effectiveFixedColumns;
        const colWidthStyles = getColumnWidthStyles(col);
        const cellStyle = isFixed
          ? {
            position: 'relative',
            zIndex: 5000,
            backgroundColor: '#f9fafb',
            ...colWidthStyles,
            overflow: 'visible',
            textOverflow: 'clip',
            boxShadow: cIdx === effectiveFixedColumns - 1 ? '2px 0 6px rgba(0,0,0,0.12)' : '2px 0 4px rgba(0,0,0,0.08)',
            transform: 'translateX(var(--vd-sl, 0px))',
          }
          : { position: 'relative', zIndex: 10, ...colWidthStyles };
        return renderVanDonDataCell(row, rIdx, col, cIdx, cellStyle);
      })}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom equality: chỉ re-render khi các giá trị thực sự ảnh hưởng đến hàng này thay đổi
  if (prevProps.row !== nextProps.row) return false;
  if (prevProps.rIdx !== nextProps.rIdx) return false;
  if (prevProps.isLongTextExpanded !== nextProps.isLongTextExpanded) return false;
  if (prevProps.currentColumns !== nextProps.currentColumns) return false;
  if (prevProps.effectiveFixedColumns !== nextProps.effectiveFixedColumns) return false;
  if (prevProps.bolActiveTab !== nextProps.bolActiveTab) return false;
  if (prevProps.getStickyLeftPx !== nextProps.getStickyLeftPx) return false;
  if (prevProps.getColumnWidthStyles !== nextProps.getColumnWidthStyles) return false;
  if (prevProps.renderVanDonDataCell !== nextProps.renderVanDonDataCell) return false;

  // selectedRows: chỉ so sánh entry cho orderId của hàng này
  const orderId = getVanDonRowOrderId(nextProps.row);
  const prevSelected = orderId ? prevProps.selectedRows.has(orderId) : false;
  const nextSelected = orderId ? nextProps.selectedRows.has(orderId) : false;
  if (prevSelected !== nextSelected) return false;

  // pendingChanges: chỉ so sánh inner Map của hàng này
  const prevPending = orderId ? prevProps.pendingChanges.get(orderId) : undefined;
  const nextPending = orderId ? nextProps.pendingChanges.get(orderId) : undefined;
  if (prevPending !== nextPending) return false;

  // selectionBounds: re-render nếu hàng này vừa vào/ ra khỏi vùng select
  const rowIsInPrev = prevProps.selectionBounds &&
    prevProps.rIdx >= prevProps.selectionBounds.minRow &&
    prevProps.rIdx <= prevProps.selectionBounds.maxRow;
  const rowIsInNext = nextProps.selectionBounds &&
    nextProps.rIdx >= nextProps.selectionBounds.minRow &&
    nextProps.rIdx <= nextProps.selectionBounds.maxRow;
  if (rowIsInPrev !== rowIsInNext) return false;
  if (rowIsInPrev && rowIsInNext) {
    // Trong cả 2: kiểm tra bounds chi tiết ảnh hưởng border
    if (prevProps.selectionBounds?.minRow !== nextProps.selectionBounds?.minRow) return false;
    if (prevProps.selectionBounds?.maxRow !== nextProps.selectionBounds?.maxRow) return false;
    if (prevProps.selectionBounds?.minCol !== nextProps.selectionBounds?.minCol) return false;
    if (prevProps.selectionBounds?.maxCol !== nextProps.selectionBounds?.maxCol) return false;
  }

  return true; // Props không thay đổi → skip re-render hoàn toàn
});

/** Tên hiển thị phiên đăng nhập — khớp với cột NV Vận đơn / delivery_staff (tab Đơn cá nhân). */
function getVanDonSessionDisplayName() {
  try {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const parts = [
      localStorage.getItem('username'),
      user?.['Họ_và_tên'],
      user?.['Họ và tên'],
      user?.['Họ Và Tên'],
      user?.full_name,
      user?.name
    ];
    return parts.map((v) => String(v || '').trim()).find(Boolean) || '';
  } catch {
    return '';
  }
}

function normalizeVanDonNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Các khóa tên coi là bản thân — không đưa vào `allowedStaff` (tab Đơn nhắc hộ). */
function getVanDonSelfNameKeySet() {
  try {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const parts = [
      localStorage.getItem('username'),
      user?.['Họ_và_tên'],
      user?.['Họ và tên'],
      user?.['Họ Và Tên'],
      user?.full_name,
      user?.name,
      user?.username,
    ];
    const set = new Set();
    for (const p of parts) {
      const k = normalizeVanDonNameKey(p);
      if (k) set.add(k);
    }
    return set;
  } catch {
    return new Set();
  }
}

function isVanDonStaffNameSelf(candidate, selfKeys) {
  const c = normalizeVanDonNameKey(candidate);
  if (!c || selfKeys.size === 0) return false;
  return selfKeys.has(c);
}

/** Khớp tab Đơn cá nhân: đồng bộ với API `delivery_staff` ILIKE %tên% (tên phiên ≥ 3 ký tự mới dùng includes). */
function vanDonDeliveryStaffIsSelf(row, sessionNorm) {
  if (!sessionNorm) return false;
  const ds = String(row.delivery_staff || row['NV Vận đơn'] || row['Nhân viên Vận đơn'] || '').trim().toLowerCase();
  if (ds === sessionNorm) return true;
  if (sessionNorm.length >= 3 && ds.includes(sessionNorm)) return true;
  return false;
}

/** Khi ghép đơn chưa lưu vào kết quả API sau đổi bộ lọc — chỉ giữ dòng phù hợp tab (tránh lệch với Đơn Nhật/Hà Nội). */
function rowMatchesBolTabForInject(row, tab, isAdminVanDonTab = false, dataSource = 'default') {
  if (tab === 'hanoi') {
    const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
    const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
    const isCheckOk = checkResult.toLowerCase() === 'ok';
    const isDeliveryUnitEmpty = !deliveryUnit || deliveryUnit === '' || deliveryUnit === 'null';
    if (!isCheckOk || !isDeliveryUnitEmpty) return false;
    const team = String(row['Team'] || row.team || '').trim();
    const wantTeam = dataSource === 'hcm' ? 'HCM' : 'Hà Nội';
    return team === wantTeam;
  }
  if (tab === 'japan') {
    const country = String(row.country || row['Country'] || row['Khu vực'] || '').trim();
    return country === 'Nhật Bản' || country === 'CĐ Nhật Bản' ||
      country.toLowerCase() === 'nhật bản' || country.toLowerCase() === 'cđ nhật bản';
  }
  if (tab === 'ca_nhan') {
    if (isAdminVanDonTab) return true;
    const n = getVanDonSessionDisplayName().trim().toLowerCase();
    return vanDonDeliveryStaffIsSelf(row, n);
  }
  return true;
}

function VanDon({ dataSource = 'default' }) {
  const { canView, role, loading: permissionsLoading } = usePermissions();
  const roleLower = (role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'director', 'manager'].includes(roleLower);

  /** Bảng log đẩy FFM: HCM dùng `ffm_push_logs_hcm`, còn lại `ffm_push_logs`. */
  const ffmPushLogsTable = useMemo(
    () => (dataSource === 'hcm' ? 'ffm_push_logs_hcm' : 'ffm_push_logs'),
    [dataSource]
  );

  // --- Data State ---

  // --- Data State ---
  const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn
  const [useBackendPagination, setUseBackendPagination] = useState(true); // Enable backend pagination
  const [exportingMaDon, setExportingMaDon] = useState(false);
  const [exportingFilteredExcel, setExportingFilteredExcel] = useState(false);
  // Always use BILL_OF_LADING view - ORDER_MANAGEMENT is hidden
  const [viewMode] = useState('BILL_OF_LADING');
  const isLoadingDataRef = useRef(false);

  // --- Action Queue & History Architecture ---
  const [pendingChanges, setPendingChanges] = useState(new Map()); // UI ONLY: yellow highlight
  const pendingChangesRef = useRef(pendingChanges);
  useLayoutEffect(() => {
    pendingChangesRef.current = pendingChanges;
  }, [pendingChanges]);

  const [syncPopoverOpen, setSyncPopoverOpen] = useState(false);

  const changeHistoryRef = useRef([]); // Stack for Ctrl-Z
  const historyIndexRef = useRef(-1);
  const dbQueueRef = useRef([]); // FIFO Queue for Backend
  const isProcessingQueue = useRef(false);
  /** Bản ghi đầy đủ (đã merge pending) cho mỗi mã đơn — dùng khi đổi lọc khiến API không trả lại dòng đó. */
  const pendingRowSnapshotsRef = useRef(new Map());

  const totalPendingCount = useMemo(() => {
    let count = 0;
    pendingChanges.forEach((innerMap) => {
      count += innerMap.size;
    });
    return count;
  }, [pendingChanges]);

  const savePendingToLocalStorage = useCallback((newPending) => {
    // BỎ localStorage - Không lưu pending changes nữa
    // Lý do: localStorage không đồng bộ giữa nhiều người, gây xung đột
    // Người dùng phải lưu ngay, không để qua đêm
    return;
  }, []);

  const [confirmPushData, setConfirmPushData] = useState(null); // { batchId, carrier, count, orderIds, logsTable }
  const [saveConfirmData, setSaveConfirmData] = useState(null); // { summaries, onConfirm, onCancel }
  const [historyModalData, setHistoryModalData] = useState(null); // { orderId, rows }
  const [historyLoadingOrderId, setHistoryLoadingOrderId] = useState('');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  
  // State cho dialog xuất Excel với bộ lọc ngày
  const [showExportDateDialog, setShowExportDateDialog] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportDateType, setExportDateType] = useState('Ngày lên đơn'); // 'Ngày lên đơn' hoặc 'Ngày đẩy đơn'
  const [exportingCustomExcel, setExportingCustomExcel] = useState(false);

  const hasUnsavedDraft = () =>
    pendingChangesRef.current.size > 0 || dbQueueRef.current.length > 0;

  // Tự động đồng bộ queue từ pendingChanges khi có thay đổi
  useEffect(() => {
    if (pendingChanges.size === 0) return;

    // Kiểm tra xem có thay đổi nào trong pendingChanges mà không có trong queue không
    const queueKeys = new Set(
      dbQueueRef.current.map(q => `${q.orderId}::${q.colKey}`)
    );

    let needsSync = false;
    pendingChanges.forEach((innerMap, orderId) => {
      innerMap.forEach((info, colKey) => {
        const key = `${orderId}::${colKey}`;
        if (!queueKeys.has(key)) {
          needsSync = true;
        }
      });
    });

    if (needsSync) {
      console.log('🔄 [VanDon] Tự động đồng bộ queue từ pendingChanges');
      const recovered = [];
      pendingChanges.forEach((innerMap, orderId) => {
        innerMap.forEach((info, colKey) => {
          const key = `${orderId}::${colKey}`;
          if (!queueKeys.has(key)) {
            recovered.push({
              orderId,
              colKey,
              newValue: info.newValue,
              originalValue: info.originalValue,
              ...(info.baseValue !== undefined ? { baseValue: info.baseValue } : {}),
            });
          }
        });
      });

      if (recovered.length > 0) {
        dbQueueRef.current.push(...recovered);
      }
    }
  }, [pendingChanges]);

  // --- Common Filter State ---
  const [filterValues, setFilterValues] = useState({
    market: [],
    product: [],
    nv_sale: [],
    nv_mkt: [],
    nv_van_don: [],
    shipping_unit: [],
    ten_page: [],
    delivery_status: [],
    delivery_status_nb: [],
    payment_status: [],
    tracking_include: '',
    tracking_exclude: '',
    tracking_bulk_codes: '',
    tracking_status: 'Tình trạng mã',
    /** '' | 'co_trung' | 'khong_trung' — cột canh_bao / Cảnh báo trùng */
    canh_bao_filter: '',
  });

  // Draft vs Applied:
  // - filterValues: do người dùng thao tác (gõ/chọn) nhưng CHƯA kích hoạt tìm kiếm.
  // - appliedFilterValues: dùng để build query/filtration (chỉ cập nhật khi bấm Enter).
  const [appliedFilterValues, setAppliedFilterValues] = useState({
    market: [],
    product: [],
    nv_sale: [],
    nv_mkt: [],
    nv_van_don: [],
    shipping_unit: [],
    ten_page: [],
    delivery_status: [],
    delivery_status_nb: [],
    payment_status: [],
    tracking_include: '',
    tracking_exclude: '',
    tracking_bulk_codes: '',
    tracking_status: 'Tình trạng mã',
    canh_bao_filter: '',
  });

  /** Tra nhanh theo nhiều cột quan trọng (SĐT / tên / địa chỉ / mã đơn...). */
  const [customerQuickSearch, setCustomerQuickSearch] = useState('');
  const [appliedCustomerQuickSearch, setAppliedCustomerQuickSearch] = useState('');
  const CUSTOMER_QUICK_SEARCH_DEBOUNCE_MS = 250;

  // Calculate 3 days ago (today, yesterday, day before yesterday)
  const getThreeDaysAgo = () => {
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 2); // 2 days ago (including today = 3 days)
    return threeDaysAgo.toISOString().split('T')[0];
  };

  const getToday = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Admin xem tất cả dữ liệu, User thường chỉ xem 3 ngày gần nhất
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [enableDateFilter, setEnableDateFilter] = useState(false);
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');
  const [appliedEnableDateFilter, setAppliedEnableDateFilter] = useState(false);
  const [quickFilter, setQuickFilter] = useState('');
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column visibility state — cột mới trong DEFAULT: bật mặc định nếu chưa có trong localStorage.
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const billDefaultCols = DEFAULT_BILL_LADING_COLUMNS.filter((c) => !HIDDEN_COLUMNS.includes(c));
    const initial = {};
    const saved = localStorage.getItem('vanDon_visibleColumns');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.assign(initial, parsed);
        billDefaultCols.forEach((col) => {
          if (initial[col] === undefined) initial[col] = true;
        });
        return initial;
      } catch (e) {
        console.error('Error parsing saved columns:', e);
      }
    }
    billDefaultCols.forEach((col) => {
      initial[col] = true;
    });
    return initial;
  });

  // --- Order Mgmt Specific State ---
  const [omActiveTeam, setOmActiveTeam] = useState('all');
  const [omDateType, setOmDateType] = useState('Ngày đóng hàng');
  const [omShowTracking, setOmShowTracking] = useState(false);
  const [omShowDuplicateTracking, setOmShowDuplicateTracking] = useState(false);

  // --- Bill of Lading Specific State ---
  const [bolActiveTab, setBolActiveTab] = useState('all'); // all, ca_nhan, readonly_all, japan, hanoi
  const [bolDateType, setBolDateType] = useState('Ngày lên đơn');
  const [appliedBolDateType, setAppliedBolDateType] = useState('Ngày lên đơn');
  const [isLongTextExpanded, setIsLongTextExpanded] = useState(false);
  const [canViewHaNoi, setCanViewHaNoi] = useState(false); // User có quyền xem tab Đẩy đơn Hà Nội không

  // --- Pagination ---
  /** Tab readonly_all: cho phép tới 1000 dòng/trang; các tab khác tối đa 500. */
  const maxRowsPerPageForTab = bolActiveTab === 'readonly_all' ? 1000 : 500;
  const clampRowsPerPage = (v) => {
    const n = Number(v) || 50;
    return Math.max(50, Math.min(n, maxRowsPerPageForTab));
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(() => {
    const saved = localStorage.getItem('vanDon_rowsPerPage');
    return clampRowsPerPage(saved ? Number(saved) : 50);
  });

  // Save rowsPerPage to localStorage; rút về max tab khi đổi tab (vd: 1000 → 500)
  useEffect(() => {
    const normalized = clampRowsPerPage(rowsPerPage);
    if (normalized !== rowsPerPage) {
      setRowsPerPage(normalized);
      return;
    }
    localStorage.setItem('vanDon_rowsPerPage', String(normalized));
  }, [rowsPerPage, bolActiveTab]);

  const filterToolbarRef = useRef(null);

  // Refs để tránh "stale closure" khi Enter bấm rất nhanh.
  const filterValuesRef = useRef(filterValues);
  const customerQuickSearchRef = useRef(customerQuickSearch);
  const bolDateTypeRef = useRef(bolDateType);
  const dateFromRef = useRef(dateFrom);
  const dateToRef = useRef(dateTo);
  const enableDateFilterRef = useRef(enableDateFilter);

  useEffect(() => {
    filterValuesRef.current = filterValues;
  }, [filterValues]);
  useEffect(() => {
    customerQuickSearchRef.current = customerQuickSearch;
  }, [customerQuickSearch]);
  // Ô tra cứu nhanh: Đã tắt tự động debounce theo yêu cầu — người dùng phải bấm Enter mới thực hiện tìm kiếm.
  useEffect(() => {
    bolDateTypeRef.current = bolDateType;
  }, [bolDateType]);
  useEffect(() => {
    dateFromRef.current = dateFrom;
  }, [dateFrom]);
  useEffect(() => {
    dateToRef.current = dateTo;
  }, [dateTo]);
  useEffect(() => {
    enableDateFilterRef.current = enableDateFilter;
  }, [enableDateFilter]);

  const applyFiltersAndSearch = useCallback(() => {
    setAppliedFilterValues(filterValuesRef.current);
    setAppliedCustomerQuickSearch(customerQuickSearchRef.current);
    setAppliedBolDateType(bolDateTypeRef.current);
    setAppliedDateFrom(dateFromRef.current);
    setAppliedDateTo(dateToRef.current);
    setAppliedEnableDateFilter(enableDateFilterRef.current);
    setCurrentPage(1);
  }, []);

  // Enter để áp dụng tất cả bộ lọc đang ở trạng thái draft.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Enter') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      const active = document.activeElement;
      if (!active) return;
      // Tránh trigger khi người dùng đang nhập/sửa một ô trong bảng (input/textarea của grid).
      if (active.closest?.('[data-van-cell-sync="1"]')) return;
      if (tableRef.current && tableRef.current.contains(active)) return;
      const isCheckbox =
        active.tagName === 'INPUT' &&
        String(active.type || '').toLowerCase() === 'checkbox';

      // Với checkbox/menu, Enter đôi khi chỉ nhằm thao tác UI chứ không nên chặn hành vi mặc định.
      // Tuy nhiên ta vẫn cần áp dụng filter sau đó.
      if (!isCheckbox) {
        e.preventDefault();
        e.stopPropagation();
        applyFiltersAndSearch();
      } else {
        setTimeout(() => applyFiltersAndSearch(), 0);
      }
    };

    // Capture phase để bắt được Enter dù component con có stopPropagation.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [applyFiltersAndSearch]);

  // --- Selection & Clipboard ---
  const [selection, setSelection] = useState({
    startRow: null, startCol: null, endRow: null, endCol: null
  });
  const [copiedData, setCopiedData] = useState(null);
  const [copiedSelection, setCopiedSelection] = useState(null);
  const [stickyOffsets, setStickyOffsets] = useState([]);
  const [horizontalTrackWidth, setHorizontalTrackWidth] = useState(0);
  const isSelecting = useRef(false);
  /** Kéo chọn vùng ô: neo (anchor) + điểm bắt đầu chuột (kể cả khi mousedown trên input/select). */
  const selectionPointerDragRef = useRef(null);
  const tableRef = useRef(null);
  /** Cột textarea (Nhật ký, …): lưu bản nháp theo phím — Virtuoso gỡ hàng khỏi DOM sẽ không mất nội dung khi Lưu. */
  const vanDonLongTextDraftRef = useRef(new Map());
  const vanDonHeaderContainerRef = useRef(null);
  const splitLeftPaneRef = useRef(null);
  const splitRightPaneRef = useRef(null);
  const horizontalScrollHostRef = useRef(null);
  const horizontalScrollbarRef = useRef(null);

  // --- Row Selection for Hanoi Tab ---
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showPhanFFMDropdown, setShowPhanFFMDropdown] = useState(false);
  const phanFFMRef = useRef(null);

  // Khóa thanh trượt ngoài cùng của trang, chỉ giữ scroll trong vùng bảng.
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // --- MGT Noi Bo specific ---
  const [mgtNoiBoOrder, setMgtNoiBoOrder] = useState([]);

  // --- Removed Old Queue Map ---
  // --- Toasts ---
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);
  // --- Sorting ---
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' | 'desc'

  // --- Initialize ---
  useEffect(() => {
    // BỎ localStorage load - Không load pending changes cũ nữa
    // Mỗi phiên làm việc bắt đầu từ đầu, không có dữ liệu cũ
    console.log('🚀 [VanDon] Khởi tạo - Không load localStorage (đã bỏ)');
  }, []);

  // --- Global Keyboard Shortcuts (Ctrl+Enter) for Bill of Lading ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode === 'BILL_OF_LADING' && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        setIsLongTextExpanded(prev => {
          const newState = !prev;
          addToast(newState ? "Đã mở rộng ô văn bản" : "Đã thu gọn ô văn bản", 'info', 1500);
          return newState;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode]);

  // --- Toast Helpers ---
  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++toastIdCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Helper Functions ---
  const extractDateFromDateTime = (dateTimeString) => {
    if (!dateTimeString) return '';
    const str = String(dateTimeString).trim();

    // Case 1: Standard YYYY-MM-DD[...]
    if (str.match(/^\d{4}-\d{2}-\d{2}/)) {
      return str.split('T')[0].split(' ')[0];
    }

    // Case 2: DD/MM/YYYY[...]
    if (str.includes('/')) {
      const parts = str.split(' ')[0].split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        const fullYear = y < 100 ? 2000 + y : y;
        return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    return str;
  };

  const formatDate = (dateString) => {
    if (dateString == null || dateString === '') return '';
    if (typeof dateString === 'string' && isVanDonSemanticEmpty(dateString)) return '';
    try {
      const str = String(dateString).trim();
      let date;

      // Xử lý định dạng yyyy-mm-dd (như "2026-01-25")
      if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = str.split('-').map(Number);
        date = new Date(year, month - 1, day);
      }
      // Xử lý định dạng dd/mm/yyyy
      else if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
          const year = parseInt(parts[2], 10);
          date = new Date(year, month, day);
        } else {
          date = new Date(str);
        }
      }
      // Xử lý ISO string hoặc các định dạng khác
      else {
        date = new Date(str.includes('Z') || str.includes('T') ? str : str);
      }

      if (isNaN(date.getTime())) {
        return dateString; // Trả về nguyên bản nếu không parse được
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const formatDateTime = (dateString) => {
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
  };

  const formatAuditValueForUi = (v) => {
    if (v === null || v === undefined || v === '') return '(rỗng)';
    if (typeof v === 'object') {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  const formatAuditColumnName = (col) => {
    const k = String(col || '').trim();
    if (!k) return '(không rõ)';
    return API.DB_TO_APP_MAPPING[k] || k;
  };

  const getYmdFromAuditTs = (v) => {
    if (!v) return '';
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  /** Ghép các đơn có thay đổi chưa lưu nhưng không còn trong trang API (do đổi bộ lọc / trang). */
  const mergePendingRowsIntoFetchedData = (rows) => {
    const pending = pendingChangesRef.current;
    if (!pending || pending.size === 0) return rows;
    const ids = new Set(rows.map((r) => getVanDonRowOrderId(r)).filter(Boolean));
    const extra = [];
    pending.forEach((_, orderIdRaw) => {
      const orderId = normalizeVanDonOrderIdKey(orderIdRaw);
      if (!orderId || ids.has(orderId)) return;
      const snap = pendingRowSnapshotsRef.current.get(orderId);
      if (!snap) return;
      if (!rowMatchesBolTabForInject(snap, bolActiveTab, isAdmin, dataSource)) return;
      extra.push({ ...snap });
    });
    return extra.length ? [...rows, ...extra] : rows;
  };

  /** Lọc ô header cột + tracking — gửi API để lọc toàn CSDL (không chỉ trang hiện tại). */
  const serverColumnFilters = useMemo(() => {
    if (!useBackendPagination) return {};
    const out = {};
    const DATE_FILTER_KEYS = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'];
    const activeDateType = viewMode === 'ORDER_MANAGEMENT' ? omDateType : appliedBolDateType;
    const toolbarDateOverrideKeys =
      activeDateType === BOL_TOOLBAR_DATE_TYPE_ALL
        ? new Set()
        : activeDateType === 'Ngày đẩy đơn'
          ? new Set(['Ngày đẩy đơn', 'Ngày Kế toán đối soát với FFM lần 2'])
          : new Set([activeDateType]);

    Object.entries(appliedFilterValues).forEach(([key, val]) => {
      if (
        [
          'market',
          'product',
          'nv_sale',
          'nv_mkt',
          'nv_van_don',
          'shipping_unit',
          'ten_page',
          'delivery_status',
          'delivery_status_nb',
          'payment_status',
          'tracking_include',
          'tracking_exclude',
          'tracking_bulk_codes',
          'tracking_status',
          'canh_bao_filter',
        ].includes(key)
      )
        return;
      if (appliedEnableDateFilter && DATE_FILTER_KEYS.includes(key) && toolbarDateOverrideKeys.has(key)) return;
      if (val == null) return;
      if (Array.isArray(val) && val.length === 0) return;
      if (typeof val === 'string' && val.trim() === '') return;
      
      // Chuẩn hóa giá trị cho cột tiền tệ trước khi gửi lên server
      if (isVanDonMoneyGridAppKey(key) && typeof val === 'string') {
        const numVal = parseVietnameseMoneyToNumber(val);
        if (numVal != null && Number.isFinite(numVal)) {
          out[key] = numVal; // Gửi số thuần túy lên server
        }
        return;
      }
      
      out[key] = val;
    });
    return out;
  }, [
    useBackendPagination,
    appliedFilterValues,
    appliedEnableDateFilter,
    viewMode,
    omDateType,
    appliedBolDateType
  ]);

  const serverTrackingFilter = useMemo(() => {
    if (!useBackendPagination) return null;
    if (
      (bolActiveTab === 'hanoi' || bolActiveTab === 'readonly_all') &&
      String(appliedFilterValues.tracking_bulk_codes || '').trim()
    ) {
      return null;
    }
    if (!appliedFilterValues.tracking_status && !appliedFilterValues.tracking_include && !appliedFilterValues.tracking_exclude) return null;
    return {
      status: appliedFilterValues.tracking_status || 'Tình trạng mã',
      include: appliedFilterValues.tracking_include || '',
      exclude: appliedFilterValues.tracking_exclude || ''
    };
  }, [
    useBackendPagination,
    bolActiveTab,
    appliedFilterValues.tracking_bulk_codes,
    appliedFilterValues.tracking_status,
    appliedFilterValues.tracking_include,
    appliedFilterValues.tracking_exclude
  ]);

  // --- Data Loading with React Query ---
  const queryClient = useQueryClient();

  // Create stable filter object for query key
  const activeFilters = useMemo(() => {
    const sessionName = getVanDonSessionDisplayName().trim();
    const filters = {
      team:
        bolActiveTab === 'hanoi'
          ? dataSource === 'hcm'
            ? 'HCM'
            : 'Hà Nội'
          : omActiveTeam !== 'all'
            ? omActiveTeam
            : undefined,
      market: bolActiveTab === 'japan' ? ['Nhật Bản', 'CĐ Nhật Bản'] : appliedFilterValues.market,
      product: appliedFilterValues.product,
      nv_sale: appliedFilterValues.nv_sale,
      nv_mkt: appliedFilterValues.nv_mkt,
      nv_van_don: appliedFilterValues.nv_van_don,
      shipping_unit: appliedFilterValues.shipping_unit,
      page_name: appliedFilterValues.ten_page,
      delivery_status: appliedFilterValues.delivery_status,
      delivery_status_nb: appliedFilterValues.delivery_status_nb,
      payment_status: appliedFilterValues.payment_status,
      dateFrom:
        appliedEnableDateFilter && appliedBolDateType !== BOL_TOOLBAR_DATE_TYPE_ALL
          ? appliedDateFrom
          : undefined,
      dateTo:
        appliedEnableDateFilter && appliedBolDateType !== BOL_TOOLBAR_DATE_TYPE_ALL
          ? appliedDateTo
          : undefined,
      dateType:
        appliedBolDateType === BOL_TOOLBAR_DATE_TYPE_ALL ? undefined : appliedBolDateType,
      tab: bolActiveTab,
      /** Tab Đơn cá nhân: lọc delivery_staff theo tên đăng nhập; admin xem toàn bộ — không gửi filter. */
      deliveryStaffSelfFilter: bolActiveTab === 'ca_nhan' && !isAdmin ? sessionName : undefined,
      page: currentPage,
      limit: rowsPerPage,
      useBackend: useBackendPagination,
      columnFilters: serverColumnFilters,
      trackingFilter: serverTrackingFilter,
      bulkOrderCodes:
        bolActiveTab === 'hanoi' || bolActiveTab === 'readonly_all'
          ? Array.from(
            new Set(
              String(appliedFilterValues.tracking_bulk_codes || '')
                .split(/[,\n\r]+/g)
                .map((s) => String(s || '').trim())
                .filter(Boolean)
            )
          )
          : [],
      customerQuickSearch: useBackendPagination ? appliedCustomerQuickSearch || undefined : undefined,
      canh_bao_filter:
        appliedFilterValues.canh_bao_filter === 'co_trung' || appliedFilterValues.canh_bao_filter === 'khong_trung'
          ? appliedFilterValues.canh_bao_filter
          : undefined
    };
    console.log('🔍 [VanDon] Active Filters:', filters);
    return filters;
  }, [
    bolActiveTab,
    omActiveTeam,
    appliedFilterValues,
    appliedCustomerQuickSearch,
    appliedEnableDateFilter,
    appliedDateFrom,
    appliedDateTo,
    appliedBolDateType,
    currentPage,
    rowsPerPage,
    useBackendPagination,
    serverColumnFilters,
    serverTrackingFilter,
    isAdmin,
    dataSource
  ]);

  /** Bộ lọc gửi kèm SUM tiền — không phụ thuộc trang (tránh refetch tổng tiền mỗi lần đổi trang). */
  const vanDonMoneyFilters = useMemo(() => {
    const { page: _p, limit: _l, ...rest } = activeFilters;
    return rest;
  }, [activeFilters]);

  /** Cùng logic quyền + filter API với useQuery; `page`/`limit` truyền vào (xuất Excel tải nhiều trang). `vanDonFetchMode`: `'rows'`|`'money'`|null — null = đầy đủ (Excel). */
  const runVanDonFetch = useCallback(
    async (page, limit, vanDonFetchMode = null) => {
      const userJson = localStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;
      const userName = [
        localStorage.getItem("username"),
        user?.['Họ_và_tên'],
        user?.['Họ và tên'],
        user?.['Họ Và Tên'],
        user?.full_name,
        user?.name,
      ]
        .map((v) => String(v || "").trim())
        .find(Boolean) || "";
      const isManager = isAdmin || ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());

      let allAllowedNames = [];
      if (!isManager) {
        const picked = (selectedPersonnelNames || []).map((n) => String(n || "").trim()).filter(Boolean);
        const selfKeys = getVanDonSelfNameKeySet();
        const withoutSelf = picked.filter((n) => !isVanDonStaffNameSelf(n, selfKeys));
        if (withoutSelf.length > 0) {
          allAllowedNames = withoutSelf;
        } else if (picked.length > 0) {
          allAllowedNames = picked;
        } else if (userName) {
          allAllowedNames = [userName];
        }
      }

      const selfDeliveryName =
        activeFilters.tab === 'ca_nhan' && !isAdmin
          ? String(activeFilters.deliveryStaffSelfFilter || userName || '').trim()
          : '';

      if (activeFilters.tab === 'ca_nhan' && !isAdmin && !selfDeliveryName) {
        return {
          data: [],
          total: 0,
          totalAmountVndSum: 0,
          totalShippingFeeSum: 0,
          ordersPaidWithBillCount: 0,
          reconciledVndWithBillSum: 0,
          page,
          limit,
          totalPages: 0
        };
      }

      if (
        !isManager &&
        activeFilters.tab !== 'ca_nhan' &&
        activeFilters.tab !== 'japan' &&
        activeFilters.tab !== 'hanoi' &&
        activeFilters.tab !== 'readonly_all' &&
        allAllowedNames.length === 0
      ) {
        return {
          data: [],
          total: 0,
          totalAmountVndSum: 0,
          totalShippingFeeSum: 0,
          ordersPaidWithBillCount: 0,
          reconciledVndWithBillSum: 0,
          page,
          limit,
          totalPages: 0
        };
      }

      const allowedStaffForRequest =
        isManager ||
          activeFilters.tab === 'ca_nhan' ||
          activeFilters.tab === 'japan' ||
          activeFilters.tab === 'hanoi' ||
          activeFilters.tab === 'readonly_all'
          ? undefined
          : allAllowedNames.length > 0
            ? allAllowedNames
            : undefined;

      const result = await API.fetchVanDon({
        sourceView: dataSource === 'hcm' ? null : 'van_don_page',
        sourceTable: dataSource === 'hcm' ? 'order_code_hcm' : 'orders',
        page,
        limit,
        team: activeFilters.team,
        excludeHcmTeam: dataSource !== 'hcm',
        hanoiTabSqlScope:
          activeFilters.tab === 'hanoi' ? 'ffm_queue_admin' : null,
        market: activeFilters.market,
        product: activeFilters.product,
        nv_sale: activeFilters.nv_sale,
        nv_mkt: activeFilters.nv_mkt,
        nv_van_don: activeFilters.nv_van_don,
        shipping_unit: activeFilters.shipping_unit,
        page_name: activeFilters.page_name,
        delivery_status: activeFilters.delivery_status,
        delivery_status_nb: activeFilters.delivery_status_nb,
        payment_status: activeFilters.payment_status,
        dateFrom: activeFilters.dateFrom,
        dateTo: activeFilters.dateTo,
        dateType: activeFilters.dateType,
        allowedStaff: allowedStaffForRequest,
        deliveryStaffSelfFilter: selfDeliveryName || undefined,
        columnFilters: activeFilters.columnFilters || {},
        trackingFilter: activeFilters.trackingFilter || null,
        bulkOrderCodes: activeFilters.bulkOrderCodes || [],
        customerQuickSearch: activeFilters.customerQuickSearch,
        canh_bao_filter: activeFilters.canh_bao_filter,
        vanDonFetchMode
      });

      console.log('✅ [VanDon] fetchVanDon Result:', {
        count: result.data?.length || 0,
        total: result.total,
        isManager,
        tab: activeFilters.tab,
        allowedStaff: isManager ? 'ALL' : allowedStaffForRequest ?? '(none)',
        deliveryStaffSelfFilter: selfDeliveryName || '(none)'
      });

      if (result.error) {
        console.error('❌ [VanDon] API Error:', result.error);
        throw new Error(result.error);
      }

      API.fetchMGTNoiBoOrders().then((mgtOrder) => setMgtNoiBoOrder(mgtOrder));

      return result;
    },
    [activeFilters, dataSource, isAdmin, role, selectedPersonnelNames]
  );

  const personnelScopeKey =
    activeFilters.tab === 'japan' || activeFilters.tab === 'hanoi'
      ? 'no-personnel-scope'
      : selectedPersonnelNames.slice().sort().join('|');

  const {
    data: vanDonRowsResult,
    isLoading: vanDonRowsLoading,
    refetch: refetchVanDonRows
  } = useQuery({
    queryKey: ['vanDon', 'rows', dataSource, activeFilters, personnelScopeKey, isAdmin],
    queryFn: async () => {
      if (!useBackendPagination || permissionsLoading) return null;
      return runVanDonFetch(currentPage, rowsPerPage, 'rows');
    },
    enabled: useBackendPagination && !permissionsLoading,
    placeholderData: keepPreviousData,
  });

  const { data: vanDonMoneyResult, refetch: refetchVanDonMoney } = useQuery({
    queryKey: ['vanDon', 'money', dataSource, vanDonMoneyFilters, personnelScopeKey, isAdmin],
    queryFn: async () => {
      if (!useBackendPagination || permissionsLoading) return null;
      return runVanDonFetch(1, 1, 'money');
    },
    enabled: useBackendPagination && !permissionsLoading,
    staleTime: 30 * 1000,
  });

  const queryResult = useMemo(() => {
    if (!vanDonRowsResult) return null;
    const moneySum = vanDonMoneyResult?.totalAmountVndSum;
    const shipSum = vanDonMoneyResult?.totalShippingFeeSum;
    const billCnt = vanDonMoneyResult?.ordersPaidWithBillCount;
    const billMoney = vanDonMoneyResult?.reconciledVndWithBillSum;
    return {
      ...vanDonRowsResult,
      totalAmountVndSum:
        moneySum !== undefined && moneySum !== null ? moneySum : vanDonRowsResult.totalAmountVndSum,
      totalShippingFeeSum:
        shipSum !== undefined && shipSum !== null ? shipSum : vanDonRowsResult.totalShippingFeeSum,
      ordersPaidWithBillCount:
        billCnt !== undefined && billCnt !== null ? billCnt : vanDonRowsResult.ordersPaidWithBillCount,
      reconciledVndWithBillSum:
        billMoney !== undefined && billMoney !== null
          ? billMoney
          : vanDonRowsResult.reconciledVndWithBillSum,
    };
  }, [vanDonRowsResult, vanDonMoneyResult]);

  const isQueryLoading = vanDonRowsLoading;

  const refetchVanDonData = useCallback(() => {
    refetchVanDonRows();
    refetchVanDonMoney();
  }, [refetchVanDonRows, refetchVanDonMoney]);

  const [enableVanDonDistinctQuery, setEnableVanDonDistinctQuery] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (typeof requestIdleCallback !== 'undefined') {
      const id = requestIdleCallback(
        () => {
          if (!cancelled) setEnableVanDonDistinctQuery(true);
        },
        { timeout: 2000 }
      );
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(() => {
      if (!cancelled) setEnableVanDonDistinctQuery(true);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  const { data: vanDonDistinctFilterOptions = {} } = useQuery({
    queryKey: ['vanDonDistinctFilterOptions', dataSource],
    queryFn: () =>
      API.fetchVanDonDistinctFilterOptions({
        sourceTable: dataSource === 'hcm' ? 'order_code_hcm' : 'orders'
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !permissionsLoading && enableVanDonDistinctQuery
  });

  /** Danh sách sản phẩm master (Quản lý Danh sách Sản phẩm — bảng system_settings). */
  const { data: vanDonAdminCatalogProductNames = [] } = useQuery({
    queryKey: ['vanDonAdminCatalogProductNames'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('name')
        .order('name', { ascending: true });
      if (error) {
        console.warn('[VanDon] system_settings (catalog SP lọc):', error.message);
        return [];
      }
      return (data || [])
        .map((r) => String(r.name ?? '').trim())
        .filter((n) => n && !isVanDonSemanticEmpty(n));
    },
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: !permissionsLoading
  });

  const [keyMarketsCatalog, setKeyMarketsCatalog] = useState(() => readKeyMarketsFromLocalSettings());

  useEffect(() => {
    const syncAdminCatalogs = () => {
      setKeyMarketsCatalog(readKeyMarketsFromLocalSettings());
      queryClient.invalidateQueries({ queryKey: ['vanDonAdminCatalogProductNames'] });
    };
    window.addEventListener('storage', syncAdminCatalogs);
    window.addEventListener('settingsUpdated', syncAdminCatalogs);
    return () => {
      window.removeEventListener('storage', syncAdminCatalogs);
      window.removeEventListener('settingsUpdated', syncAdminCatalogs);
    };
  }, [queryClient]);

  const allData = useMemo(() => {
    let rows = queryResult?.data || [];
    if (bolActiveTab === 'hanoi') {
      rows = rows.filter(row => {
        const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
        const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
        return checkResult.toLowerCase() === 'ok' && isVanDonSemanticEmpty(deliveryUnit);
      });
    }
    const result = mergePendingRowsIntoFetchedData(rows);
    console.log('📊 [VanDon] Final allData length:', result.length);
    return result;
  }, [queryResult?.data, bolActiveTab]);

  const totalRecords = queryResult?.total || 0;
  /** SUM toàn bộ đơn khớp lọc — giữ `undefined` khi chưa có kết quả query (không nhầm với 0 thật). */
  const totalAmountVndSumFromServer = queryResult?.totalAmountVndSum;
  // totalPages is calculated below based on pagination mode

  const computeFilteredData = useCallback((sourceRows) => {
    let data = [...sourceRows];

    // 1. Apply changes (Pending > Original)
    data = data.map(row => {
      const orderId = getVanDonRowOrderId(row);
      let rowCopy = { ...row };

      // Computed columns (giữ giá trị map từ DB nếu không có cột “lần 1”)
      rowCopy["Ngày đẩy đơn"] = extractDateFromDateTime(row["Ngày Kế toán đối soát với FFM lần 2"]);
      rowCopy["Ngày có mã tracking"] = extractDateFromDateTime(
        row["Ngày Kế toán đối soát với FFM lần 1"] ?? row["Ngày có mã tracking"]
      );

      const pending = orderId ? pendingChanges.get(orderId) : undefined;
      if (pending) {
        pending.forEach((info, key) => { rowCopy[key] = info.newValue; });
      }
      return rowCopy;
    });

    /** Giá trị gốc (trước khi sửa) để so khớp lọc — tránh hàng biến mất khi đổi ô chưa lưu. */
    const getPendingOriginal = (orderId, ...keyCandidates) => {
      const pmap = pendingChanges.get(orderId);
      if (!pmap?.size) return undefined;
      for (const k of keyCandidates) {
        if (k && pmap.has(k)) return pmap.get(k).originalValue;
      }
      const lowers = keyCandidates.filter(Boolean).map((k) => String(k).toLowerCase());
      for (const [colKey, info] of pmap.entries()) {
        const lc = String(colKey || '').toLowerCase();
        if (lowers.includes(lc)) return info.originalValue;
      }
      return undefined;
    };
    /** Giá trị đang sửa (newValue) để lọc khớp với dữ liệu hiển thị trên lưới. */
    const getPendingCurrent = (orderId, ...keyCandidates) => {
      const pmap = pendingChanges.get(orderId);
      if (!pmap?.size) return undefined;
      for (const k of keyCandidates) {
        if (k && pmap.has(k)) return pmap.get(k).newValue;
      }
      const lowers = keyCandidates.filter(Boolean).map((k) => String(k).toLowerCase());
      for (const [colKey, info] of pmap.entries()) {
        const lc = String(colKey || '').toLowerCase();
        if (lowers.includes(lc)) return info.newValue;
      }
      return undefined;
    };
    const strNorm = (v) => normalizeVanDonFilterWhitespace(String(v ?? ''));

    if (viewMode === 'ORDER_MANAGEMENT') {
      // --- ORDER MANAGEMENT FILTERING LOGIC ---

      // Filter by Carrier (MGT only)
      data = data.filter(row => {
        const carrier = row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"];
        return carrier?.toString().toUpperCase() === "MGT";
      });

      // Team Filter
      if (omActiveTeam === 'mgt_noi_bo') {
        const orderedIds = new Set(mgtNoiBoOrder);
        data = data.filter(row => orderedIds.has(row[PRIMARY_KEY_COLUMN]));
      } else if (omActiveTeam !== 'all') {
        data = data.filter(row => row[TEAM_COLUMN_NAME] === omActiveTeam);
      }

      // Mode View (Tracking)
      if (omShowDuplicateTracking) {
        const counts = new Map();
        data.forEach(r => {
          const oid = r[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(oid, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(r['Mã Tracking'] || '');
          if (code) counts.set(code, (counts.get(code) || 0) + 1);
        });
        data = data.filter(r => {
          const oid = r[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(oid, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(r['Mã Tracking'] || '');
          return (counts.get(code) || 0) > 1;
        });
        data.sort((a, b) => String(a['Mã Tracking']).localeCompare(String(b['Mã Tracking'])));
      } else {
        data = data.filter(row => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, 'Mã Tracking', 'Mã tracking');
          const code = o !== undefined ? strNorm(o) : strNorm(row['Mã Tracking'] || '');
          return omShowTracking ? code !== '' : !code;
        });
        // Sort by STT
        data.sort((a, b) => (Number(a['rowIndex'] || 0) - Number(b['rowIndex'] || 0)));
      }

    } else {
      // --- BILL OF LADING FILTERING LOGIC ---

      // Filter: đơn phải có ít nhất một tên nhân sự — Admin, Đơn Nhật, Đẩy Hà Nội, Xem tất cả (khóa sửa) không áp (hàng đợi FFM có thể thiếu cột NV / đơn Nhật; tab chỉ xem cần đủ tập để lọc toolbar)
      if (!isAdmin && bolActiveTab !== 'japan' && bolActiveTab !== 'hanoi' && bolActiveTab !== 'readonly_all') {
        const initialDataLength = data.length;
        data = data.filter(row => {
          const saleStaff = String(row.sale_staff || row["Nhân viên Sale"] || '').trim();
          const mktStaff = String(row.marketing_staff || row["Nhân viên MKT"] || '').trim();
          const deliveryStaff = String(row.delivery_staff || row["NV Vận đơn"] || row["Nhân viên Vận đơn"] || '').trim();
          return (
            !isVanDonSemanticEmpty(saleStaff) ||
            !isVanDonSemanticEmpty(mktStaff) ||
            !isVanDonSemanticEmpty(deliveryStaff)
          );
        });
        console.log('🔍 [VanDon Client-side] Filtered out orders with empty personnel names:', initialDataLength - data.length, 'orders removed');
      } else if (isAdmin) {
        console.log('👑 [VanDon Client-side] Admin - Không filter theo nhân sự (hiển thị tất cả)');
      }

      // Tab Logic - use early filtering to reduce dataset size (Admin không bị filter)
      if (!isAdmin) {
        if (bolActiveTab === 'japan') {
          // Tab "Đơn Nhật": full đơn thị trường Nhật (đã lọc country ở API; client khớp thêm cột Khu vực)
          data = data.filter(row => {
            const country = String(row.country || row['Country'] || row['Khu vực'] || '').trim();
            return country === 'Nhật Bản' || country === 'CĐ Nhật Bản' ||
              country.toLowerCase() === 'nhật bản' || country.toLowerCase() === 'cđ nhật bản';
          });
        } else if (bolActiveTab === 'ca_nhan') {
          const n = getVanDonSessionDisplayName().trim().toLowerCase();
          data = n ? data.filter((row) => vanDonDeliveryStaffIsSelf(row, n)) : [];
        } else if (bolActiveTab === 'hanoi') {
          // Tab đẩy FFM: /van-don → Team "Hà Nội"; /van-don-hcm → Team "HCM"
          const wantTeam = dataSource === 'hcm' ? 'HCM' : 'Hà Nội';
          data = data.filter(row => {
            const team = String(row['Team'] || row.team || '').trim();
            const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
            const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();

            const isTeamMatch = team === wantTeam;
            const isCheckOk = checkResult.toLowerCase() === 'ok';
            const isDeliveryUnitEmpty = isVanDonSemanticEmpty(deliveryUnit);

            // Xóa rào cản isTrackingEmpty để giống như Admin: vẫn hiện đơn đã có mã Tracking
            return isTeamMatch && isCheckOk && isDeliveryUnitEmpty;
          });
          console.log(
            `🏛️ [VanDon Fallback] Tab đẩy FFM — Team="${wantTeam}", Check=Ok, empty Tracking & ĐVVC:`,
            data.length,
            'orders'
          );
        }
      } else {
        console.log('👑 [VanDon Client-side] Admin - Không filter theo tab (hiển thị tất cả)');
      }

      // Sort by Date Desc - optimized with cached date parsing
      data.sort((a, b) => {
        const da = new Date(a["Ngày lên đơn"] || a["Thời gian lên đơn"] || 0).getTime();
        const db = new Date(b["Ngày lên đơn"] || b["Thời gian lên đơn"] || 0).getTime();
        return db - da;
      });
    }

    // --- COMMON FILTERS ---
    const activeDateType = viewMode === 'ORDER_MANAGEMENT' ? omDateType : appliedBolDateType;

    const traCuuKhach = normalizeVanDonFilterWhitespace(appliedCustomerQuickSearch);
    if (traCuuKhach && !useBackendPagination) {
      const qLower = traCuuKhach.toLowerCase();
      const removeAccents = (str) => {
        return String(str || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/đ/g, 'd')
          .replace(/Đ/g, 'D');
      };

      /** Cụm từ (giữ thứ tự), bỏ dấu + gom khoảng trắng — khớp trong từng ô, không ghép nhiều cột. */
      const qPhrase = removeAccents(qLower).replace(/\s+/g, ' ').trim();
      const qDigits = traCuuKhach.replace(/\D/g, '');

      data = data.filter((row) => {
        const orderId = row[PRIMARY_KEY_COLUMN];
        
        // 1. Thu thập tất cả các giá trị hiển thị / quan trọng của hàng
        const searchFields = [
          row[PRIMARY_KEY_COLUMN],
          row.order_code,
          row['Name*'],
          row.customer_name,
          row['Phone*'],
          row.customer_phone,
          row['Add'],
          row.customer_address,
          row.page_name,
          row['Page'],
          row.product,
          row['Mặt hàng'],
          row.product_name,
          row.sale_staff,
          row['Nhân viên Sale'],
          row.marketing_staff,
          row['Nhân viên MKT'],
          row.delivery_staff,
          row['NV Vận đơn'],
          row['Nhân viên Vận đơn'],
          row.delivery_status,
          row['Trạng thái giao hàng'],
          row.tracking_code,
          row['Mã Tracking'],
          row['Mã tracking'],
          row.country,
          row['Khu vực'],
          row.note,
          row.vandon_note,
          row['Ghi chú'],
          row.shipping_unit,
          row['Đơn vị vận chuyển'],
          row.payment_status,
          row['Trạng thái thu tiền'],
          row.status_detail,
          row.order_date,
          row['Ngày lên đơn']
        ];

        // 2. Bổ sung giá trị gốc (nếu đang có thay đổi chưa lưu) để tránh hàng bị ẩn khi đang sửa
        if (orderId && pendingChanges.has(orderId)) {
          pendingChanges.get(orderId).forEach((info) => {
            if (info.originalValue) searchFields.push(info.originalValue);
          });
        }

        // 3. Khớp cụm trong ít nhất một ô (không AND từng từ trên toàn bộ hàng đã ghép).
        const cells = searchFields
          .filter((v) => v !== null && v !== undefined && v !== '')
          .map((v) => removeAccents(String(v).toLowerCase()).replace(/\s+/g, ' '));
        if (cells.some((c) => c.includes(qPhrase))) return true;

        // 4. SĐT: chữ số xuất hiện đúng thứ tự (bỏ qua ký tự ngăn cách), giống ILIKE %d%d%... trên API
        if (qDigits.length >= 6) {
          const digitSubsequence = (hay, want) => {
            let j = 0;
            for (let i = 0; i < hay.length && j < want.length; i += 1) {
              if (hay[i] === want[j]) j += 1;
            }
            return j === want.length;
          };
          const phoneRaw = [row['Phone*'], row.customer_phone]
            .filter((v) => v != null && v !== '')
            .map((v) => String(v).replace(/\D/g, ''))
            .join('');
          if (phoneRaw && digitSubsequence(phoneRaw, qDigits)) return true;
        }
        return false;
      });
    }

    // Market & Product / NV / ĐVVC — tab Đơn Nhật & Đẩy FFM: bỏ lọc toolbar trên client (logic tab + API).
    // Phân trang backend: toolbar đã lọc ở API — lọc lại client dễ lệch chuẩn hóa → sót / ẩn nhầm dòng.
    // LOGIC AND: Các bộ lọc toolbar kết hợp — phải thỏa mãn TẤT CẢ điều kiện đang bật
    const queueTabSkipMarketAndNvToolbar = bolActiveTab === 'japan' || bolActiveTab === 'hanoi';
    try {
      if (!useBackendPagination) {
        // Thu thập tất cả các bộ lọc đang active
        const activeFilters = [];

        if (!queueTabSkipMarketAndNvToolbar && appliedFilterValues.market && Array.isArray(appliedFilterValues.market) && appliedFilterValues.market.length > 0) {
          activeFilters.push({
            type: 'market',
            values: new Set(appliedFilterValues.market)
          });
        }

        if (appliedFilterValues.product && Array.isArray(appliedFilterValues.product) && appliedFilterValues.product.length > 0) {
          activeFilters.push({
            type: 'product',
            values: new Set(appliedFilterValues.product)
          });
        }

        if (!queueTabSkipMarketAndNvToolbar && appliedFilterValues.nv_sale && Array.isArray(appliedFilterValues.nv_sale) && appliedFilterValues.nv_sale.length > 0) {
          activeFilters.push({
            type: 'nv_sale',
            values: new Set(appliedFilterValues.nv_sale)
          });
        }

        if (!queueTabSkipMarketAndNvToolbar && appliedFilterValues.nv_mkt && Array.isArray(appliedFilterValues.nv_mkt) && appliedFilterValues.nv_mkt.length > 0) {
          activeFilters.push({
            type: 'nv_mkt',
            values: new Set(appliedFilterValues.nv_mkt)
          });
        }

        if (!queueTabSkipMarketAndNvToolbar && appliedFilterValues.nv_van_don && Array.isArray(appliedFilterValues.nv_van_don) && appliedFilterValues.nv_van_don.length > 0) {
          activeFilters.push({
            type: 'nv_van_don',
            values: new Set(appliedFilterValues.nv_van_don)
          });
        }

        if (appliedFilterValues.shipping_unit && Array.isArray(appliedFilterValues.shipping_unit) && appliedFilterValues.shipping_unit.length > 0) {
          activeFilters.push({
            type: 'shipping_unit',
            values: new Set(appliedFilterValues.shipping_unit)
          });
        }

        if (serverTrackingFilter) {
          activeFilters.push({
            type: 'tracking_filter',
            values: serverTrackingFilter
          });
        }


        if (appliedFilterValues.delivery_status && Array.isArray(appliedFilterValues.delivery_status) && appliedFilterValues.delivery_status.length > 0) {
          activeFilters.push({
            type: 'delivery_status',
            values: new Set(appliedFilterValues.delivery_status)
          });
        }

        if (appliedFilterValues.delivery_status_nb && Array.isArray(appliedFilterValues.delivery_status_nb) && appliedFilterValues.delivery_status_nb.length > 0) {
          activeFilters.push({
            type: 'delivery_status_nb',
            values: new Set(appliedFilterValues.delivery_status_nb)
          });
        }

        if (appliedFilterValues.payment_status && Array.isArray(appliedFilterValues.payment_status) && appliedFilterValues.payment_status.length > 0) {
          activeFilters.push({
            type: 'payment_status',
            values: new Set(appliedFilterValues.payment_status)
          });
        }

        if (appliedFilterValues.ten_page && Array.isArray(appliedFilterValues.ten_page) && appliedFilterValues.ten_page.length > 0) {
          activeFilters.push({
            type: 'ten_page',
            values: new Set(appliedFilterValues.ten_page)
          });
        }

        // Áp dụng logic AND: phải thỏa mãn TẤT CẢ các bộ lọc đang bật
        if (activeFilters.length > 0) {
          data = data.filter(row => {
            const orderId = row[PRIMARY_KEY_COLUMN];

            return activeFilters.every(filter => {
              switch (filter.type) {
                case 'market': {
                  const o = getPendingOriginal(orderId, 'Khu vực', 'khu vực', 'country');
                  const market = o !== undefined ? strNorm(o) : strNorm(row["Khu vực"] || row["khu vực"] || row.country || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(market)) return true;
                  return !isVanDonSemanticEmpty(market) && filter.values.has(market);
                }
                case 'product': {
                  const o = getPendingOriginal(orderId, 'Mặt hàng');
                  const product = o !== undefined ? strNorm(o) : strNorm(row["Mặt hàng"] || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(product)) return true;
                  return !isVanDonSemanticEmpty(product) && filter.values.has(product);
                }
                case 'nv_sale': {
                  const o = getPendingOriginal(orderId, 'Nhân viên Sale', 'sale_staff');
                  const rawValue = o !== undefined ? o : (row.sale_staff || row['Nhân viên Sale'] || '');
                  const v = strNorm(rawValue);
                  
                  // Nếu filter chứa "Trống" và giá trị rỗng -> match
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  
                  // Nếu giá trị rỗng nhưng filter không chứa "Trống" -> không match
                  if (isVanDonSemanticEmpty(v)) return false;
                  
                  // Kiểm tra exact match hoặc partial match (case-insensitive)
                  if (filter.values.has(v)) return true;
                  
                  // Kiểm tra partial match với các giá trị trong filter
                  const vLower = v.toLowerCase();
                  for (const filterVal of filter.values) {
                    if (filterVal === 'Trống' || filterVal === '__EMPTY__') continue;
                    const filterLower = String(filterVal).toLowerCase();
                    if (vLower.includes(filterLower) || filterLower.includes(vLower)) {
                      return true;
                    }
                  }
                  
                  return false;
                }
                case 'nv_mkt': {
                  const o = getPendingOriginal(orderId, 'Nhân viên MKT', 'marketing_staff');
                  const v = o !== undefined ? strNorm(o) : strNorm(row.marketing_staff || row['Nhân viên MKT'] || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  return !isVanDonSemanticEmpty(v) && filter.values.has(v);
                }
                case 'nv_van_don': {
                  const o = getPendingOriginal(orderId, 'NV Vận đơn', 'Nhân viên Vận đơn', 'delivery_staff');
                  const rawValue = o !== undefined ? o : (row.delivery_staff || row['NV Vận đơn'] || row['Nhân viên Vận đơn'] || '');
                  const v = strNorm(rawValue);

                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  if (isVanDonSemanticEmpty(v)) return false;

                  // Ưu tiên khớp chính xác như cũ.
                  if (filter.values.has(v)) return true;

                  // Fallback: cho phép khớp chuỗi con (case-insensitive) để xử lý
                  // tên lưu theo định dạng "A, B" hoặc lệch hoa/thường nhỏ.
                  const vLower = v.toLowerCase();
                  for (const filterVal of filter.values) {
                    if (filterVal === 'Trống' || filterVal === '__EMPTY__') continue;
                    const filterLower = String(filterVal).toLowerCase();
                    if (vLower.includes(filterLower) || filterLower.includes(vLower)) {
                      return true;
                    }
                  }

                  return false;
                }
                case 'shipping_unit': {
                  const o = getPendingOriginal(orderId, 'Đơn vị vận chuyển', 'Đơn vị Vận chuyển', 'Đơn_vị_vận_chuyển');
                  const v = o !== undefined ? strNorm(o) : strNorm(row['Đơn vị vận chuyển'] || row['Đơn_vị_vận_chuyển'] || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  return !isVanDonSemanticEmpty(v) && filter.values.has(v);
                }
                case 'ten_page': {
                  const o = getPendingOriginal(orderId, 'Page', 'page_name');
                  const v = o !== undefined ? strNorm(o) : strNorm(row['Page'] || row.page_name || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  return !isVanDonSemanticEmpty(v) && filter.values.has(v);
                }
                case 'delivery_status': {
                  const cur = getPendingCurrent(orderId, 'delivery_status', 'Trạng thái giao hàng');
                  const v = cur !== undefined ? strNorm(cur) : strNorm(row.delivery_status ?? '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  return !isVanDonSemanticEmpty(v) && filter.values.has(v);
                }
                case 'delivery_status_nb': {
                  const cur = getPendingCurrent(orderId, 'Trạng thái giao hàng NB', 'delivery_status_nb');
                  const v =
                    cur !== undefined
                      ? cur
                      : (row?.['Trạng thái giao hàng NB'] ?? row?.delivery_status_nb ?? '');
                  const normV = strNorm(v);
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(normV)) return true;
                  return !isVanDonSemanticEmpty(normV) && filter.values.has(normV);
                }
                case 'tracking_filter': {
                  const tf = filter.values;
                  const statusTf = String(tf.status || 'Tình trạng mã').trim();
                  const incRaw = String(tf.include || '').trim().toLowerCase();
                  const excRaw = String(tf.exclude || '').trim().toLowerCase();

                  const o = getPendingOriginal(orderId, 'Mã Tracking', 'Mã tracking');
                  const code = o !== undefined ? strNorm(o) : strNorm(row['Mã Tracking'] || row.tracking_code || '');

                  // 1. Check status
                  if (statusTf === 'Tất cả có mã') {
                    if (isVanDonSemanticEmpty(code)) return false;
                  } else if (statusTf === 'Trống') {
                    if (!isVanDonSemanticEmpty(code)) return false;
                  } else if (statusTf === 'Toàn số') {
                    if (isVanDonSemanticEmpty(code) || !/^[0-9]+$/.test(code)) return false;
                  }

                  // 2. Check include/exclude
                  if (incRaw && !code.toLowerCase().includes(incRaw)) return false;
                  if (excRaw && code.toLowerCase().includes(excRaw)) return false;

                  return true;
                }
                case 'payment_status': {
                  const o = getPendingOriginal(orderId, 'Trạng thái thu tiền', 'payment_status');
                  const v = o !== undefined ? strNorm(o) : strNorm(row['Trạng thái thu tiền'] || row.payment_status || '');
                  if ((filter.values.has('Trống') || filter.values.has('__EMPTY__')) && isVanDonSemanticEmpty(v)) return true;
                  return !isVanDonSemanticEmpty(v) && filter.values.has(v);
                }
                default:
                  return false;
              }
            });
          });

          console.log(`🔍 [VanDon AND Filter] Áp dụng ${activeFilters.length} bộ lọc toolbar (AND), còn ${data.length} đơn`);
        }
      }
    } catch (err) {
      console.warn('⚠️ [Filter Error] Lỗi khi xử lý Market/Product filter:', err);
    }

    if (appliedFilterValues.canh_bao_filter === 'co_trung' && !useBackendPagination) {
      data = data.filter((row) => rowHasVanDonCanhBao(row));
    } else if (appliedFilterValues.canh_bao_filter === 'khong_trung' && !useBackendPagination) {
      data = data.filter((row) => !rowHasVanDonCanhBao(row));
    }

    // Date Range (toolbar "Lọc thời gian") — cùng quy tắc chuẩn hóa ngày với lọc cột & API (YYYY-MM-DD)
    // Chế độ vận đơn + «Tất cả» loại ngày: không lọc theo cột ngày toolbar (OM vẫn dùng omDateType).
    if (
      appliedEnableDateFilter &&
      (viewMode === 'ORDER_MANAGEMENT' || appliedBolDateType !== BOL_TOOLBAR_DATE_TYPE_ALL)
    ) {
      if (appliedDateFrom) {
        const fromNorm = String(appliedDateFrom).split('T')[0];
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, activeDateType, COLUMN_MAPPING[activeDateType]);
          const raw = o !== undefined ? o : row[activeDateType];
          if (isVanDonSemanticEmpty(raw)) return false;
          if (!raw) return false;
          const rowDay = extractDateFromDateTime(raw);
          return rowDay && rowDay >= fromNorm;
        });
      }
      if (appliedDateTo) {
        const toNorm = String(appliedDateTo).split('T')[0];
        data = data.filter((row) => {
          const orderId = row[PRIMARY_KEY_COLUMN];
          const o = getPendingOriginal(orderId, activeDateType, COLUMN_MAPPING[activeDateType]);
          const raw = o !== undefined ? o : row[activeDateType];
          if (isVanDonSemanticEmpty(raw)) return false;
          if (!raw) return false;
          const rowDay = extractDateFromDateTime(raw);
          return rowDay && rowDay <= toNorm;
        });
      }
    }

    // Cột ngày trùng với "Loại ngày+ khoảng" trên toolbar → đã lọc ở trên, bỏ lọc 1 ngày ở header cho tránh lệch / chồng hai bộ lọc
    const DATE_FILTER_KEYS = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'];
    const toolbarDateOverrideKeys =
      activeDateType === BOL_TOOLBAR_DATE_TYPE_ALL
        ? new Set()
        : activeDateType === 'Ngày đẩy đơn'
          ? new Set(['Ngày đẩy đơn', 'Ngày Kế toán đối soát với FFM lần 2'])
          : new Set([activeDateType]);

    // Column Filters (Text & Dropdown)
    // Luôn áp dụng ở client để nhiều cột kết hợp ổn định (kể cả khi backend pagination đang bật).
    {
      Object.entries(appliedFilterValues).forEach(([key, val]) => {
        if (
          [
            'market',
            'product',
            'nv_sale',
            'nv_mkt',
            'nv_van_don',
            'shipping_unit',
            'ten_page',
            'tracking_include',
            'tracking_exclude',
            'tracking_bulk_codes',
            'tracking_status',
            'canh_bao_filter',
          ].includes(key)
        )
          return;

        if (
          appliedEnableDateFilter &&
          DATE_FILTER_KEYS.includes(key) &&
          toolbarDateOverrideKeys.has(key)
        ) {
          return;
        }

        if (val === null || val === undefined) return;
        if (Array.isArray(val) && val.length === 0) return;
        if (typeof val === 'string' && val.trim() === '') return;

        const dataKey = COLUMN_MAPPING[key] || key;

        try {
          data = data.filter(row => {
            try {
              const orderId = row[PRIMARY_KEY_COLUMN];
              let cellValue = '';
              if (key === 'Mã đơn hàng') {
                const o = getPendingOriginal(orderId, 'Mã đơn hàng', 'order_code', 'orderCode', PRIMARY_KEY_COLUMN);
                if (o !== undefined) cellValue = strNorm(o);
                else cellValue = strNorm(row['Mã đơn hàng'] ?? row['order_code'] ?? row['orderCode'] ?? row[PRIMARY_KEY_COLUMN] ?? '');
              } else {
                const o = getPendingOriginal(
                  orderId,
                  key,
                  dataKey,
                  key.replace(/ /g, '_'),
                  String(dataKey || '').replace(/ /g, '_')
                );
                if (o !== undefined) cellValue = strNorm(o);
                else cellValue = strNorm(row[dataKey] ?? row[key] ?? row[key.replace(/ /g, '_')] ?? row[dataKey.replace(/ /g, '_')] ?? '');
              }

              if (DROPDOWN_OPTIONS[dataKey] || DROPDOWN_OPTIONS[key] || ["Trạng thái giao hàng", "Kết quả check", "GHI CHÚ"].includes(dataKey)) {
                if (!Array.isArray(val)) return true;
                const selected = val;
                if (selected.length === 0) return true;
                if (isVanDonSemanticEmpty(cellValue) && (selected.includes('Trống') || selected.includes('__EMPTY__'))) return true;
                const normalizedCell = String(cellValue).trim().toLowerCase();
                const normalizedSelected = new Set(
                  selected
                    .map((v) => String(v).trim().toLowerCase())
                    .filter(Boolean)
                );
                return normalizedSelected.has(normalizedCell);
              }

              if (["Ngày lên đơn", "Ngày đóng hàng", "Ngày đẩy đơn", "Ngày có mã tracking", "Ngày Kế toán đối soát với FFM lần 2"].includes(key)) {
                if (isVanDonSemanticEmpty(cellValue)) return false;
                if (!cellValue) return false;
                if (typeof val !== 'string') return true;

                const rowDate = extractDateFromDateTime(cellValue);
                const filterDate = extractDateFromDateTime(val);

                if (!rowDate || !filterDate) return true;
                return rowDate === filterDate;
              }

              if (typeof val !== 'string') return true;
              if (!normalizeVanDonFilterWhitespace(val)) return true;

              /** Hỗ trợ lọc số: loại bỏ dấu chấm/phẩy nếu là cột tiền tệ/số. */
              const isMoney = isVanDonMoneyGridAppKey(key);
              if (isMoney) {
                // Xử lý filter cho cột tiền: so sánh giá trị số
                const filterNum = parseVietnameseMoneyToNumber(val);
                const cellNum = parseVietnameseMoneyToNumber(cellValue);
                
                if (filterNum == null) return true; // Filter không hợp lệ -> hiện tất cả
                if (cellNum == null) return false; // Cell không có giá trị -> ẩn
                
                // So sánh số chính xác
                return cellNum === filterNum;
              }

              const filterVal = val;
              if (!filterVal || !normalizeVanDonFilterWhitespace(filterVal)) return true;

              return matchesVanDonHeaderSearch(cellValue, filterVal);
            } catch (err) {
              console.warn(`⚠️ [Filter Error] Lỗi khi filter column "${key}":`, err);
              return true;
            }
          });
        } catch (err) {
          console.warn(`⚠️ [Filter Error] Lỗi khi xử lý filter cho key "${key}":`, err);
        }
      });
    }

    // Tracking filter cũng chạy ở client để ghép chính xác cùng các cột header khác.
    try {
      const bulkRaw = String(appliedFilterValues.tracking_bulk_codes || '').trim();
      const bulkCodesList = bulkRaw
        ? bulkRaw
            .split(/\r?\n+/g)
            .map((line) => normalizeVanDonBulkOrderCode(line))
            .filter(Boolean)
        : [];
      const bulkCodesSet = bulkCodesList.length > 0 ? new Set(bulkCodesList) : null;
      const hasBulkCodes =
        (bolActiveTab === 'hanoi' || bolActiveTab === 'readonly_all') &&
        !!bulkCodesSet &&
        bulkCodesSet.size > 0;
      const bulkPasteOrderIndex = new Map();
      if (hasBulkCodes) {
        bulkCodesList.forEach((code, i) => {
          if (!bulkPasteOrderIndex.has(code)) bulkPasteOrderIndex.set(code, i);
        });
      }

      if (hasBulkCodes) {
        data = data.filter((row) => {
          const orderId = getVanDonRowOrderId(row);
          return bulkCodesSet.has(normalizeVanDonBulkOrderCode(orderId));
        });
        data.sort((a, b) => {
          const ia = bulkPasteOrderIndex.get(normalizeVanDonBulkOrderCode(getVanDonRowOrderId(a)));
          const ib = bulkPasteOrderIndex.get(normalizeVanDonBulkOrderCode(getVanDonRowOrderId(b)));
          const na = ia === undefined ? Number.MAX_SAFE_INTEGER : ia;
          const nb = ib === undefined ? Number.MAX_SAFE_INTEGER : ib;
          if (na !== nb) return na - nb;
          return 0;
        });
      } else if (
        appliedFilterValues.tracking_status ||
        appliedFilterValues.tracking_include ||
        appliedFilterValues.tracking_exclude
      ) {
        const inc = appliedFilterValues.tracking_include ? String(appliedFilterValues.tracking_include).toLowerCase() : '';
        const exc = appliedFilterValues.tracking_exclude ? String(appliedFilterValues.tracking_exclude).toLowerCase() : '';
        const status = appliedFilterValues.tracking_status || 'Tình trạng mã';

        data = data.filter(row => {
          try {
            const orderId = row[PRIMARY_KEY_COLUMN];
            const o = getPendingOriginal(orderId, 'Mã Tracking', 'Mã tracking');
            const code = o !== undefined ? strNorm(o) : strNorm(row['Mã Tracking'] || row['Mã tracking'] || '');
            const lowerCode = code.toLowerCase();

            if (status === 'Tất cả có mã' && isVanDonSemanticEmpty(code)) return false;
            if (status === 'Trống' && !isVanDonSemanticEmpty(code)) return false;
            if (status === 'Toàn số' && (isVanDonSemanticEmpty(code) || !/^\d+$/.test(code))) return false;

            if (status === 'Tình trạng mã') {
              if (exc && exc.trim() && lowerCode.includes(exc)) return false;
              if (inc && inc.trim()) {
                if (inc.includes('\n')) {
                  const codes = new Set(inc.split('\n').map(t => t.trim()).filter(Boolean).map(t => t.toLowerCase()));
                  if (!codes.has(lowerCode)) return false;
                } else {
                  if (!lowerCode.includes(inc)) return false;
                }
              }
            }
            return true;
          } catch (err) {
            console.warn('⚠️ [Filter Error] Lỗi khi filter tracking:', err);
            return true;
          }
        });
      }
    } catch (err) {
      console.warn('⚠️ [Filter Error] Lỗi khi xử lý tracking filter:', err);
    }

    return data;
  }, [
    pendingChanges,
    viewMode,
    omActiveTeam,
    omDateType,
    omShowTracking,
    omShowDuplicateTracking,
    bolActiveTab,
    appliedBolDateType,
    appliedFilterValues,
    appliedCustomerQuickSearch,
    appliedDateFrom,
    appliedDateTo,
    appliedEnableDateFilter,
    mgtNoiBoOrder,
    isAdmin,
    useBackendPagination,
    dataSource
  ]);

  const getFilteredData = useMemo(() => computeFilteredData(allData), [computeFilteredData, allData]);

  // --- Sorting (client-side) ---
  const sortedData = useMemo(() => {
    const rows = getFilteredData || [];
    if (!sortColumn || rows.length === 0) return rows;
    const col = sortColumn;
    const dir = sortDirection === 'desc' ? -1 : 1;
    const isDateCol = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2', 'Ngày up bill'].includes(col);
    const isMoneyCol = ['Tổng tiền VNĐ', 'Tiền Việt đã đối soát', 'Tiền đã thanh toán'].includes(col);
    const isStt = col === 'STT';
    if (isStt) return rows;

    const toComparable = (row) => {
      try {
        if (isMoneyCol) {
          const v = getVanDonGridCellValue(row, col);
          const n = typeof v === 'number' ? v : parseVietnameseMoneyToNumber(v);
          return Number.isFinite(n) ? n : -Infinity;
        }
        if (isDateCol) {
          const v = getVanDonGridCellValue(row, col);
          const ymd = extractDateFromDateTime(v);
          // Use string YYYY-MM-DD compare; fallback to Date if needed
          return ymd || '';
        }
        const v = getVanDonGridCellValue(row, col);
        if (v == null) return '';
        if (typeof v === 'number') return v;
        const s = String(v).trim();
        // numeric string
        if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
        return s.toLowerCase();
      } catch {
        return '';
      }
    };

    const copy = [...rows];
    copy.sort((a, b) => {
      const va = toComparable(a);
      const vb = toComparable(b);
      if (va == null && vb == null) return 0;
      if (va == null) return -1 * dir;
      if (vb == null) return 1 * dir;
      if (typeof va === 'number' && typeof vb === 'number') {
        return va === vb ? 0 : va < vb ? -1 * dir : 1 * dir;
      }
      // string compare (ymd or text)
      return String(va).localeCompare(String(vb), 'vi', { sensitivity: 'base' }) * dir;
    });
    return copy;
  }, [getFilteredData, sortColumn, sortDirection]);

  /** Sắp xếp một mảng bất kỳ giống `sortedData` (xuất Excel đủ trang / nhiều batch). */
  const sortRowsLikeDataGrid = useCallback(
    (rows) => {
      const base = rows || [];
      if (!sortColumn || base.length === 0) return base;
      const col = sortColumn;
      const dir = sortDirection === 'desc' ? -1 : 1;
      const isDateCol = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2', 'Ngày up bill'].includes(col);
      const isMoneyCol = ['Tổng tiền VNĐ', 'Tiền Việt đã đối soát', 'Tiền đã thanh toán'].includes(col);
      if (col === 'STT') return base;

      const toComparable = (row) => {
        try {
          if (isMoneyCol) {
            const v = getVanDonGridCellValue(row, col);
            const n = typeof v === 'number' ? v : parseVietnameseMoneyToNumber(v);
            return Number.isFinite(n) ? n : -Infinity;
          }
          if (isDateCol) {
            const v = getVanDonGridCellValue(row, col);
            const ymd = extractDateFromDateTime(v);
            return ymd || '';
          }
          const v = getVanDonGridCellValue(row, col);
          if (v == null) return '';
          if (typeof v === 'number') return v;
          const s = String(v).trim();
          if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
          return s.toLowerCase();
        } catch {
          return '';
        }
      };

      const copy = [...base];
      copy.sort((a, b) => {
        const va = toComparable(a);
        const vb = toComparable(b);
        if (va == null && vb == null) return 0;
        if (va == null) return -1 * dir;
        if (vb == null) return 1 * dir;
        if (typeof va === 'number' && typeof vb === 'number') {
          return va === vb ? 0 : va < vb ? -1 * dir : 1 * dir;
        }
        return String(va).localeCompare(String(vb), 'vi', { sensitivity: 'base' }) * dir;
      });
      return copy;
    },
    [sortColumn, sortDirection]
  );

  /** Cùng thứ tự hàng với `TableVirtuoso` (`data={sortedData}`). Chỉ số selection / copy / paste phải dùng mảng này — không dùng `paginatedData` (có thể khác thứ tự khi đang sort). */
  const virtuosoRowData = sortedData;

  const effectiveRowsPerPage = clampRowsPerPage(rowsPerPage);

  /** Giá trị copy Ctrl+C khớp những gì lưới hiển thị (cùng logic đọc ô với `getVanDonGridCellValue` + format ngày/tiền). */
  const getVanDonClipboardCellText = useCallback(
    (rData, rowIdxInView, colName, opts) => {
      let out;
      const isExcel = opts?.isExcel || opts?.exportFullList; // exportFullList is used for Excel export

      if (colName === 'STT') {
        if (opts?.exportFullList) {
          out = String(rowIdxInView + 1);
        } else {
          out = String(
            rData?.rowIndex ?? (currentPage - 1) * effectiveRowsPerPage + rowIdxInView + 1
          );
        }
        return sanitizeExcelTsvCell(out, { skipLeadingApostrophe: true });
      }
      let val = getVanDonGridCellValue(rData, colName);
      if (!val && colName === 'Ngày up bill') {
        val = rData.ngayupbill ?? rData.ngay_up_bill ?? '';
      }
      if (!val && (colName === 'Tiền Việt đã đối soát' || colName === 'Tiền đã thanh toán')) {
        val = rData.reconciled_vnd ?? '';
      }
      val = coalesceVanDonDisplayValue(val);
      if (
        [
          'Ngày lên đơn',
          'Ngày đóng hàng',
          'Ngày đẩy đơn',
          'Ngày có mã tracking',
          'Ngày Kế toán đối soát với FFM lần 2',
          'Ngày up bill',
        ].includes(colName)
      ) {
        out = String(formatDate(val));
      } else if (
        colName === 'Tổng tiền VNĐ' ||
        colName === 'Tiền Việt đã đối soát' ||
        colName === 'Tiền đã thanh toán' ||
        colName === 'Phí ship'
      ) {
        const n = parseVietnameseMoneyToNumber(val === '' || val == null ? null : val);
        if (isExcel) return n != null && Number.isFinite(n) ? n : 0;
        out = n != null && Number.isFinite(n) ? n.toLocaleString('vi-VN') : '';
      } else if (val === undefined || val == null) {
        out = '';
      } else if (typeof val === 'number') {
        if (isExcel) return val;
        out = String(val);
      } else if (typeof val === 'boolean') {
        out = String(val);
      } else {
        out = String(val);
      }
      return sanitizeExcelTsvCell(out);
    },
    [currentPage, effectiveRowsPerPage, formatDate]
  );

  // If using backend pagination, data is already paginated
  const paginatedData = useMemo(() => {
    if (useBackendPagination) {
      // Data is already paginated from backend, just apply client-side filters (tracking, etc.)
      return getFilteredData;
    } else {
      // Old way: paginate client-side
      return getFilteredData.slice((currentPage - 1) * effectiveRowsPerPage, currentPage * effectiveRowsPerPage);
    }
  }, [getFilteredData, currentPage, effectiveRowsPerPage, useBackendPagination]);

  const totalPages = useBackendPagination
    ? Math.ceil(totalRecords / effectiveRowsPerPage)
    : Math.ceil(getFilteredData.length / effectiveRowsPerPage);

  // Rebuild missing snapshots when data arrives
  useEffect(() => {
    if (queryResult?.data) {
      queryResult.data.forEach((row) => {
        const orderId = getVanDonRowOrderId(row);
        if (!orderId) return;
        if (pendingChangesRef.current.has(orderId) && !pendingRowSnapshotsRef.current.has(orderId)) {
          const pmap = pendingChangesRef.current.get(orderId);
          const copy = { ...row };
          pmap.forEach((info, key) => { copy[key] = info.newValue; });
          pendingRowSnapshotsRef.current.set(orderId, copy);
        }
      });
      savePendingToLocalStorage(pendingChangesRef.current);
    }
  }, [queryResult?.data, savePendingToLocalStorage]);

  const loadData = () => refetchVanDonData();
  const openOrderHistoryModal = useCallback(async (orderId) => {
    const oid = normalizeVanDonOrderIdKey(orderId);
    if (!oid) return;
    try {
      setHistoryLoadingOrderId(oid);
      const rows = await API.fetchOrderChangeHistory({
        orderCode: oid,
        sourceTable: dataSource === 'hcm' ? 'order_code_hcm' : 'orders',
      });
      setHistoryDateFrom('');
      setHistoryDateTo('');
      setHistoryModalData({ orderId: oid, rows: Array.isArray(rows) ? rows : [] });
    } catch (e) {
      console.error(e);
      addToast(e?.message || 'Không tải được lịch sử thay đổi', 'error');
    } finally {
      setHistoryLoadingOrderId('');
    }
  }, [addToast, dataSource]);

  const refreshData = async (opts = {}) => {
    const skipUnsavedCheck = opts.skipUnsavedCheck === true;
    const hasUnsaved =
      pendingChanges.size > 0 ||
      dbQueueRef.current.length > 0 ||
      changeHistoryRef.current.length > 0;
    if (!skipUnsavedCheck && hasUnsaved) {
      const ok = window.confirm(
        'Bạn có thay đổi chưa lưu (chưa nhấn Xác nhận lưu). Xóa lọc sẽ bỏ các thay đổi này. Tiếp tục?'
      );
      if (!ok) return;
    }
    dbQueueRef.current = [];
    changeHistoryRef.current = [];
    historyIndexRef.current = -1;
    pendingRowSnapshotsRef.current.clear();
    setPendingChanges(new Map());
    localStorage.removeItem(VAN_DON_PENDING_LS_KEY);
    localStorage.removeItem(VAN_DON_PENDING_SNAPSHOTS_LS_KEY);
    localStorage.removeItem('speegoPendingChanges');
    localStorage.removeItem('speegoPendingRowSnapshots');
    // Reset filters
    const defaultFilters = {
      market: [], product: [], nv_sale: [], nv_mkt: [], nv_van_don: [],
      shipping_unit: [], ten_page: [], delivery_status: [], payment_status: [], tracking_include: '', tracking_exclude: '',
      tracking_bulk_codes: '',
      tracking_status: 'Tình trạng mã',
      canh_bao_filter: '',
    };
    setFilterValues(defaultFilters);
    setAppliedFilterValues(defaultFilters);
    setCustomerQuickSearch('');
    setAppliedCustomerQuickSearch('');
    setDateFrom('');
    setDateTo('');
    setEnableDateFilter(false);
    setAppliedDateFrom('');
    setAppliedDateTo('');
    setAppliedEnableDateFilter(false);
    setAppliedBolDateType(bolDateType);
    setCurrentPage(1);
    await queryClient.invalidateQueries({ queryKey: ['vanDon'] });
    queryClient.invalidateQueries({ queryKey: ['vanDonDistinctFilterOptions'] });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (phanFFMRef.current && !phanFFMRef.current.contains(event.target)) {
        setShowPhanFFMDropdown(false);
      }
    };

    if (showPhanFFMDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPhanFFMDropdown]);

  // Danh sách tên được xem đơn: users.selected_personnel + bảng danh_sach_van_don (chủ + người sửa hộ)
  useEffect(() => {
    const loadSelectedPersonnel = async () => {
      try {
        const userJson = localStorage.getItem("user");
        const user = userJson ? JSON.parse(userJson) : null;
        const userEmail = localStorage.getItem("userEmail") || "";
        const userName = [
          localStorage.getItem("username"),
          user?.['Họ_và_tên'],
          user?.['Họ và tên'],
          user?.['Họ Và Tên'],
          user?.full_name,
          user?.name,
        ]
          .map((v) => String(v || "").trim())
          .find(Boolean) || "";

        if (!userEmail && !userName) {
          setSelectedPersonnelNames([]);
          return;
        }

        const allAllowed = [];

        if (userEmail) {
          const userEmailLower = userEmail.toLowerCase().trim();
          const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
          allAllowed.push(...(personnelMap[userEmailLower] || []));
        }

        const nameCandidates = new Set();
        if (userName) nameCandidates.add(userName);
        if (userEmail) {
          const { data: urow } = await supabase
            .from('users')
            .select('name, username')
            .eq('email', userEmail.trim())
            .maybeSingle();
          const n1 = (urow?.name || '').trim();
          const n2 = (urow?.username || '').trim();
          if (n1) nameCandidates.add(n1);
          if (n2) nameCandidates.add(n2);
        }

        const fromVanDonList = await rbacService.getVanDonVisibleNames({
          userNames: Array.from(nameCandidates),
          userEmail,
        });
        allAllowed.push(...fromVanDonList);

        const validNames = [...new Set(allAllowed.map((n) => String(n || "").trim()))].filter(
          (name) => name.length > 0 && !name.includes('@')
        );

        console.log('📝 [VanDon] Final allowed personnel names:', validNames);
        setSelectedPersonnelNames(validNames);
      } catch (error) {
        console.error('❌ [VanDon] Error loading allowed names:', error);
        setSelectedPersonnelNames([]);
      }
    };

    loadSelectedPersonnel();
  }, []);

  // Kiểm tra quyền xem tab "Đẩy đơn Hà Nội" dựa trên cột can_day_ffm trong users table
  useEffect(() => {
    const loadCanDayFFMPermission = async () => {
      try {
        // Admin luôn có quyền xem tab Hà Nội
        if (isAdmin) {
          console.log('🔐 [VanDon] Admin - luôn có quyền xem Đẩy đơn Hà Nội');
          setCanViewHaNoi(true);
          return;
        }

        const userEmail = localStorage.getItem('userEmail') || '';
        const userId = localStorage.getItem('userId') || '';

        if (!userEmail && !userId) {
          console.log('⚠️ [VanDon] No user email or ID found');
          setCanViewHaNoi(false);
          return;
        }

        // Query user từ bảng users để kiểm tra cột can_day_ffm
        let query = supabase.from('users').select('can_day_ffm');

        if (userId) {
          query = query.eq('id', userId);
        } else if (userEmail) {
          query = query.eq('email', userEmail);
        }

        const { data: userData, error } = await query.single();

        if (error) {
          console.error('❌ [VanDon] Error loading can_day_ffm:', error);
          setCanViewHaNoi(false);
          return;
        }

        const hasPermission = userData?.can_day_ffm === true;
        console.log('🔐 [VanDon] User can_day_ffm:', hasPermission);
        setCanViewHaNoi(hasPermission);
      } catch (error) {
        console.error('❌ [VanDon] Error checking can_day_ffm permission:', error);
        setCanViewHaNoi(false);
      }
    };

    loadCanDayFFMPermission();
  }, [isAdmin]);

  // Tự động chuyển về 'all' nếu user đang ở tab hanoi nhưng không có quyền
  useEffect(() => {
    if (bolActiveTab === 'hanoi' && !canViewHaNoi && !isAdmin) {
      console.log('⚠️ [VanDon] User không có quyền xem Đẩy đơn Hà Nội, chuyển về "all"');
      setBolActiveTab('all');
    }
  }, [canViewHaNoi, bolActiveTab, isAdmin]);

  /** Khởi tạo lọc ngày theo role một lần khi quyền tải xong — tránh reset liên tục và tránh admin “tưởng” chọn ngày nhưng Áp dụng tắt. */
  const roleDateFilterInitRef = useRef(false);
  useEffect(() => {
    if (permissionsLoading || roleDateFilterInitRef.current) return;
    roleDateFilterInitRef.current = true;
    if (isAdmin) {
      setEnableDateFilter(false);
      setDateFrom('');
      setDateTo('');
      setAppliedEnableDateFilter(false);
      setAppliedDateFrom('');
      setAppliedDateTo('');
    } else {
      setEnableDateFilter(false);
      setDateFrom('');
      setDateTo('');
      setAppliedEnableDateFilter(false);
      setAppliedDateFrom('');
      setAppliedDateTo('');
    }
  }, [permissionsLoading, isAdmin]);

  // Reload data when filters or pagination change (if using backend)
  // Don't skip initial mount - let it load on mount
  useEffect(() => {
    if (useBackendPagination && !permissionsLoading) {
      refetchVanDonData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    rowsPerPage,
    bolActiveTab,
    omActiveTeam,
    appliedFilterValues.market,
    appliedFilterValues.product,
    appliedFilterValues.nv_sale,
    appliedFilterValues.nv_mkt,
    appliedFilterValues.nv_van_don,
    appliedFilterValues.shipping_unit,
    appliedBolDateType,
    appliedEnableDateFilter,
    appliedDateFrom,
    appliedDateTo,
    useBackendPagination,
    selectedPersonnelNames.slice().sort().join('|'),
    permissionsLoading,
    serverColumnFilters,
    serverTrackingFilter
  ]);


  // Đóng tab / F5: cảnh báo nếu có dữ liệu chưa lưu (KHÔNG lưu localStorage nữa)
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasUnsavedDraft()) return;
      // Chỉ cảnh báo, KHÔNG lưu localStorage
      e.preventDefault();
      e.returnValue = 'Bạn có thay đổi chưa lưu. Đóng trang sẽ mất dữ liệu!';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Chặn điều hướng SPA trong app cần `createBrowserRouter` (data router). App dùng BrowserRouter
  // nên không dùng useBlocker; nháp vẫn lưu localStorage + cảnh báo khi đóng tab/F5 (beforeunload).

  const deepCloneMapOfMaps = useCallback((sourceMap) => {
    const clone = new Map();
    if (sourceMap) {
      sourceMap.forEach((innerMap, key) => { clone.set(key, new Map(innerMap)); });
    }
    return clone;
  }, []);

  const upsertPendingRowSnapshot = useCallback((orderId, pendingMap, allDataRows) => {
    const pmap = pendingMap.get(orderId);
    if (!pmap || pmap.size === 0) {
      pendingRowSnapshotsRef.current.delete(orderId);
      return;
    }
    const rows = allDataRows || [];
    let base = rows.find((r) => getVanDonRowOrderId(r) === normalizeVanDonOrderIdKey(orderId));
    if (!base) base = pendingRowSnapshotsRef.current.get(normalizeVanDonOrderIdKey(orderId));
    if (!base) return;
    const row = { ...base };
    pmap.forEach((info, key) => {
      row[key] = info.newValue;
    });
    pendingRowSnapshotsRef.current.set(orderId, row);
  }, []);

  // Step 1: Handle Initial Click - Create Log Entries and Show Dialog
  const handlePhanFFM = async (carrierName) => {
    if (selectedRows.size === 0) {
      addToast('⚠️ Vui lòng chọn ít nhất một đơn hàng', 'warning');
      return;
    }

    try {
      const selectedCount = selectedRows.size;
      const orderIds = Array.from(selectedRows);
      const currentUser = localStorage.getItem('username') || 'Unknown User';

      const toastId = addToast(`Đang chuẩn bị đẩy ${selectedCount} đơn...`, 'loading', 0);

      const emptyToNull = (v) => {
        const x = v == null ? '' : String(v).trim();
        return x === '' ? null : x;
      };
      const entries = orderIds.map((orderId) => {
        const r = getFilteredData.find((x) => x[PRIMARY_KEY_COLUMN] === orderId);
        const rawTotal = r?.['Tổng tiền VNĐ'] ?? r?.total_amount_vnd;
        const total_amount_vnd = parseVietnameseMoneyToNumber(rawTotal);
        return {
          orderId,
          product: emptyToNull(r?.['Mặt hàng'] ?? r?.product),
          country: emptyToNull(r?.['Khu vực'] ?? r?.country),
          chi_nhanh: emptyToNull(r?.[TEAM_COLUMN_NAME] ?? r?.['Chi nhánh'] ?? r?.chi_nhanh),
          total_amount_vnd,
        };
      });

      const { batchId } = await API.createFfmPushLogs(entries, carrierName, currentUser, {
        logsTable: ffmPushLogsTable,
      });

      removeToast(toastId);

      // Show the confirmation dialog
      setConfirmPushData({
        batchId,
        carrier: carrierName,
        count: selectedCount,
        orderIds: orderIds,
        logsTable: ffmPushLogsTable,
      });
    } catch (err) {
      console.error('❌ Error initializing FFM push:', err);
      addToast('Lỗi khi chuẩn bị đẩy đơn: ' + err.message, 'error');
    }
  };

  // Step 2: Handle Confirmed Change - Update main table and update log status
  const confirmPushFinal = async () => {
    if (!confirmPushData) return;

    const { batchId, carrier, orderIds, logsTable } = confirmPushData;
    const carrierKey = 'Đơn vị vận chuyển';
    const accountingDateKey = 'Ngày Kế toán đối soát với FFM lần 2';
    const nbStatusKey = 'delivery_status_nb';
    const now = new Date().toISOString();

    const historyChanges = [];
    orderIds.forEach(orderId => {
      const originalRow = allData.find(r => r[PRIMARY_KEY_COLUMN] === orderId);

      // Update Carrier if different
      const originalCarrierValue = originalRow ? String(originalRow[carrierKey] || '') : '';
      historyChanges.push({
        orderId,
        colKey: carrierKey,
        originalValue: originalCarrierValue,
        newValue: carrier
      });

      // Update Push Date
      const originalDateValue = originalRow ? String(originalRow[accountingDateKey] || '') : '';
      historyChanges.push({
        orderId,
        colKey: accountingDateKey,
        originalValue: originalDateValue,
        newValue: now
      });

      // Khi tick đẩy FFM: luôn đưa trạng thái giao hàng NB về "Chưa Giao"
      const originalNbValue = originalRow
        ? String(originalRow['Trạng thái giao hàng NB'] ?? originalRow[nbStatusKey] ?? '').trim()
        : '';
      if (originalNbValue.toLowerCase() !== 'chưa giao') {
        historyChanges.push({
          orderId,
          colKey: nbStatusKey,
          originalValue: originalNbValue,
          newValue: 'Chưa Giao'
        });
      }
    });

    try {
      // 1. Update logs to confirmed
      await API.updateFfmPushLogStatus(batchId, 'confirmed', { logsTable });

      // 2. Apply changes to main UI/Queue
      pushChange(historyChanges);

      // 3. Cleanup
      setConfirmPushData(null);
      setSelectedRows(new Set());
      addToast(`🚀 Đã chuẩn bị đẩy ${orderIds.length} đơn sang ${carrier}. Nhấn "Xác nhận lưu" để hoàn tất.`, 'success', 5000);
    } catch (err) {
      console.error('❌ Error confirming FFM push:', err);
      addToast('Lỗi khi xác nhận đẩy đơn: ' + err.message, 'error');
    }
  };

  // Step 3: Handle Canceled Change - Update log status to cancelled
  const cancelPushFinal = async () => {
    if (!confirmPushData) return;
    const { batchId, logsTable } = confirmPushData;

    try {
      await API.updateFfmPushLogStatus(batchId, 'cancelled', { logsTable });
    } catch (err) {
      console.warn('⚠️ Could not update cancel log status:', err);
    } finally {
      setConfirmPushData(null);
      addToast('Đã hủy đẩy đơn', 'info');
    }
  };

  // Toggle row selection
  const toggleRowSelection = (orderId) => {
    const oid = normalizeVanDonOrderIdKey(orderId);
    if (!oid) return;
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(oid)) {
        newSet.delete(oid);
      } else {
        newSet.add(oid);
      }
      return newSet;
    });
  };

  // Select all rows on current page
  const selectAllRows = () => {
    const allIds = new Set(paginatedData.map((row) => getVanDonRowOrderId(row)).filter(Boolean));
    setSelectedRows(allIds);
  };

  // Deselect all rows
  const deselectAllRows = () => {
    setSelectedRows(new Set());
  };

  const ffmPushPreview = useMemo(() => {
    if (!confirmPushData) return null;
    const targetCarrier = String(confirmPushData.carrier || '').trim();
    const ids = Array.isArray(confirmPushData.orderIds) ? confirmPushData.orderIds : [];
    const emptyCounts = {
      carrierWillChange: 0,
      carrierAlreadyTarget: 0,
      nbWillChange: 0,
      nbAlreadyChuaGiao: 0,
    };
    if (!targetCarrier || ids.length === 0) return emptyCounts;

    return ids.reduce((acc, orderId) => {
      const row = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
      if (!row) return acc;

      const currentCarrier = String(row['Đơn vị vận chuyển'] ?? row.shipping_unit ?? '').trim();
      if (currentCarrier.toLowerCase() === targetCarrier.toLowerCase()) acc.carrierAlreadyTarget += 1;
      else acc.carrierWillChange += 1;

      const currentNb = String(row['Trạng thái giao hàng NB'] ?? row.delivery_status_nb ?? '').trim();
      if (currentNb.toLowerCase() === 'chưa giao') acc.nbAlreadyChuaGiao += 1;
      else acc.nbWillChange += 1;

      return acc;
    }, { ...emptyCounts });
  }, [confirmPushData, allData]);

  const ffmPushPreviewRows = useMemo(() => {
    if (!confirmPushData) return [];
    const targetCarrier = String(confirmPushData.carrier || '').trim();
    const ids = Array.isArray(confirmPushData.orderIds) ? confirmPushData.orderIds : [];
    if (!targetCarrier || ids.length === 0) return [];

    return ids.map((orderId) => {
      const row = allData.find((r) => r[PRIMARY_KEY_COLUMN] === orderId);
      const beforeCarrier = String(row?.['Đơn vị vận chuyển'] ?? row?.shipping_unit ?? '').trim();
      const beforeNb = String(row?.['Trạng thái giao hàng NB'] ?? row?.delivery_status_nb ?? '').trim();
      return {
        orderId,
        beforeCarrier: beforeCarrier || '(trống)',
        afterCarrier: targetCarrier,
        beforeNb: beforeNb || '(trống)',
        afterNb: 'Chưa Giao',
      };
    });
  }, [confirmPushData, allData]);

  const getSelectionBounds = useCallback(() => {
    if (selection.startRow === null || selection.startCol === null) return null;
    return {
      minRow: Math.min(selection.startRow, selection.endRow),
      maxRow: Math.max(selection.startRow, selection.endRow),
      minCol: Math.min(selection.startCol, selection.endCol),
      maxCol: Math.max(selection.startCol, selection.endCol)
    };
  }, [selection]);

  const selectionBounds = useMemo(() => getSelectionBounds(), [getSelectionBounds]);

  const copiedBounds = useMemo(() => {
    if (!copiedSelection) return null;
    return {
      minRow: Math.min(copiedSelection.startRow, copiedSelection.endRow),
      maxRow: Math.max(copiedSelection.startRow, copiedSelection.endRow),
      minCol: Math.min(copiedSelection.startCol, copiedSelection.endCol),
      maxCol: Math.max(copiedSelection.startCol, copiedSelection.endCol)
    };
  }, [copiedSelection]);
  // Cho phép edit ô trên mọi tab (kể cả tab "readonly_all").
  const isReadonlyAllTab = false;
  const isReadonlyEditTab = false;

  // --- Filtering Logic ---
  // Filter out hidden columns from allColumns
  const allColumns = useMemo(() => {
    const base = viewMode === 'ORDER_MANAGEMENT' ? ORDER_MGMT_COLUMNS : BILL_LADING_COLUMNS;
    return base.filter(col => !HIDDEN_COLUMNS.includes(col));
  }, [viewMode]);
  const currentColumns = useMemo(() => {
    const withHcmThuTuChia = (arr) => {
      if (dataSource !== 'hcm' || arr.includes(VAN_DON_HCM_THU_TU_CHIA_COLUMN)) return arr;
      const nvIdx = arr.findIndex(
        (c) => normalizeColHeader(c) === normalizeColHeader('NV Vận đơn')
      );
      if (nvIdx >= 0) {
        return [...arr.slice(0, nvIdx + 1), VAN_DON_HCM_THU_TU_CHIA_COLUMN, ...arr.slice(nvIdx + 1)];
      }
      return [...arr, VAN_DON_HCM_THU_TU_CHIA_COLUMN];
    };

    const filtered = allColumns.filter(col => visibleColumns[col] === true);
    let cols = filtered;

    // Luôn đẩy "Mã đơn hàng" lên đầu (cột cố định khi cuộn ngang)
    const orderCodeCol = 'Mã đơn hàng';
    if (cols.includes(orderCodeCol)) {
      cols = [orderCodeCol, ...cols.filter(c => c !== orderCodeCol)];
    }

    // Trong tab "Hà Nội", đẩy cột "Đơn vị vận chuyển" lên ngay sau "Mã đơn hàng"
    if (bolActiveTab === 'hanoi') {
      const carrierCol = 'Đơn vị vận chuyển';
      const hasCarrier = cols.includes(carrierCol);
      if (hasCarrier) {
        const withoutCarrier = cols.filter(col => col !== carrierCol);
        const orderIdx = withoutCarrier.indexOf(orderCodeCol);
        withoutCarrier.splice(orderIdx + 1, 0, carrierCol);
        cols = withoutCarrier;
      }
    }

    // Muốn "Mã Tracking" nằm gần "Trạng thái giao hàng NB":
    // ép tracking sang ngay sau cột trạng thái giao hàng nội bộ (nếu cả 2 cột đều đang visible).
    const internalDeliveryCol = cols.find(
      (c) => String(c).trim().toLowerCase() === 'trạng thái giao hàng nb'
    );
    const trackingCol = cols.find(
      (c) => String(c).trim().toLowerCase() === 'mã tracking'
    );

    if (!internalDeliveryCol || !trackingCol) return withHcmThuTuChia(cols);

    const internalIdx = cols.indexOf(internalDeliveryCol);
    const trackingIdx = cols.indexOf(trackingCol);
    const desiredIdx = internalIdx + 1;

    if (trackingIdx === desiredIdx) return withHcmThuTuChia(cols);

    const next = [...cols];
    next.splice(trackingIdx, 1);
    const internalIdxAfter = next.indexOf(internalDeliveryCol);
    next.splice(internalIdxAfter + 1, 0, trackingCol);
    return withHcmThuTuChia(next);
  }, [allColumns, visibleColumns, bolActiveTab, dataSource]);

  const handleExportMaDonExcel = useCallback(async () => {
    if (permissionsLoading) {
      addToast('Đang tải quyền, thử lại sau.', 'warning');
      return;
    }
    setExportingMaDon(true);
    const loadingId = addToast('Đang xuất Excel vận đơn…', 'loading', 0);
    try {
      let sourceRows;
      if (!useBackendPagination) {
        sourceRows = allData;
      } else {
        const limit = VAN_DON_POSTGREST_MAX_ROWS;
        let page = 1;
        const accumulated = [];
        let total = 0;
        const maxPages = 50000;
        while (page <= maxPages) {
          const res = await runVanDonFetch(page, limit);
          total = res.total || 0;
          const batch = res.data || [];
          accumulated.push(...batch);
          if (batch.length < limit || accumulated.length >= total) break;
          page += 1;
        }
        sourceRows = accumulated;
      }

      let rows = sourceRows;
      if (bolActiveTab === 'hanoi') {
        rows = rows.filter((row) => {
          const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
          const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
          return checkResult.toLowerCase() === 'ok' && isVanDonSemanticEmpty(deliveryUnit);
        });
      }
      rows = mergePendingRowsIntoFetchedData(rows);
      const filtered = computeFilteredData(rows);

      removeToast(loadingId);
      if (!filtered.length) {
        addToast('Không có dữ liệu phù hợp bộ lọc để xuất Excel.', 'warning');
        return;
      }

      const sorted = sortRowsLikeDataGrid(filtered);
      const exportColumns = currentColumns.includes('Mã đơn hàng')
        ? currentColumns
        : ['Mã đơn hàng', ...currentColumns];
      const headerRow = exportColumns;
      const dataRows = sorted.map((row, rowIdx) =>
        exportColumns.map((col) => getVanDonClipboardCellText(row, rowIdx, col, { exportFullList: true }))
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Van_don');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `VanDon_export_${stamp}.xlsx`);
      addToast(
        `Đã xuất ${sorted.length.toLocaleString('vi-VN')} dòng, ${exportColumns.length} cột (đang hiện trên lưới) ra Excel.`,
        'success'
      );
    } catch (e) {
      removeToast(loadingId);
      console.error(e);
      addToast(e?.message || 'Lỗi xuất Excel', 'error');
    } finally {
      setExportingMaDon(false);
    }
  }, [
    permissionsLoading,
    useBackendPagination,
    allData,
    bolActiveTab,
    mergePendingRowsIntoFetchedData,
    computeFilteredData,
    runVanDonFetch,
    addToast,
    removeToast,
    currentColumns,
    getVanDonClipboardCellText,
    sortRowsLikeDataGrid
  ]);

  const handleExportFilteredExcel = useCallback(async () => {
    if (permissionsLoading) {
      addToast('Đang tải quyền, thử lại sau.', 'warning');
      return;
    }
    setExportingFilteredExcel(true);
    const loadingId = addToast('Đang xuất Excel theo bộ lọc…', 'loading', 0);
    try {
      let sourceRows;
      if (!useBackendPagination) {
        sourceRows = allData;
      } else {
        const limit = VAN_DON_POSTGREST_MAX_ROWS;
        let page = 1;
        const accumulated = [];
        let total = 0;
        const maxPages = 50000;
        while (page <= maxPages) {
          const res = await runVanDonFetch(page, limit);
          total = res.total || 0;
          const batch = res.data || [];
          accumulated.push(...batch);
          if (batch.length < limit || accumulated.length >= total) break;
          page += 1;
        }
        sourceRows = accumulated;
      }

      let rows = sourceRows;
      if (bolActiveTab === 'hanoi') {
        rows = rows.filter((row) => {
          const checkResult = String(row['Kết quả Check'] || row['Kết quả check'] || '').trim();
          const deliveryUnit = String(row['Đơn vị vận chuyển'] || row['Đơn vị Vận chuyển'] || '').trim();
          return checkResult.toLowerCase() === 'ok' && isVanDonSemanticEmpty(deliveryUnit);
        });
      }
      rows = mergePendingRowsIntoFetchedData(rows);
      const filtered = computeFilteredData(rows);

      removeToast(loadingId);
      if (!filtered.length) {
        addToast('Không có dữ liệu phù hợp bộ lọc để xuất Excel.', 'warning');
        return;
      }

      const sorted = sortRowsLikeDataGrid(filtered);
      const exportColumns = currentColumns.includes('Mã đơn hàng')
        ? currentColumns
        : ['Mã đơn hàng', ...currentColumns];

      const headerRow = exportColumns;
      const dataRows = sorted.map((row, rowIdx) =>
        exportColumns.map((col) => getVanDonClipboardCellText(row, rowIdx, col, { exportFullList: true }))
      );

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Van_don_loc');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `VanDon_filtered_${stamp}.xlsx`);
      addToast(
        `Đã xuất ${sorted.length.toLocaleString('vi-VN')} dòng, ${exportColumns.length} cột (đang hiện trên lưới).`,
        'success'
      );
    } catch (e) {
      removeToast(loadingId);
      console.error(e);
      addToast(e?.message || 'Lỗi xuất Excel theo bộ lọc', 'error');
    } finally {
      setExportingFilteredExcel(false);
    }
  }, [
    permissionsLoading,
    useBackendPagination,
    allData,
    bolActiveTab,
    mergePendingRowsIntoFetchedData,
    computeFilteredData,
    runVanDonFetch,
    addToast,
    removeToast,
    currentColumns,
    getVanDonClipboardCellText,
    sortRowsLikeDataGrid
  ]);

  /** Xuất Excel với các cột cố định và bộ lọc ngày lên đơn */
  const handleExportCustomExcel = useCallback(async () => {
    if (!exportDateFrom || !exportDateTo) {
      addToast('Vui lòng chọn khoảng ngày', 'warning');
      return;
    }
    
    if (permissionsLoading) {
      addToast('Đang tải quyền, thử lại sau.', 'warning');
      return;
    }
    
    setExportingCustomExcel(true);
    const loadingId = addToast(`Đang xuất Excel theo ${exportDateType}…`, 'loading', 0);
    
    try {
      // Các cột cần xuất theo yêu cầu
      const exportColumns = [
        'Mã đơn hàng',
        'Mã Tracking',
        'Ngày lên đơn',
        'Name*',
        'Phone*',
        'Add',
        'City',
        'State',
        'Zipcode',
        'Mặt hàng',
        'Tên mặt hàng 1',
        'Số lượng mặt hàng 1',
        'Tên mặt hàng 2',
        'Số lượng mặt hàng 2',
        'Quà tặng',
        'Số lượng quà kèm',
        'Giá bán',
        'Loại tiền thanh toán',
        'Tổng tiền VNĐ',
        'Hình thức thanh toán',
        'Ghi chú',
        'Nhân viên Sale',
        'Nhân viên Marketing',
        'NV Vận đơn',
        'Kết quả Check',
        'Trạng thái giao hàng NB',
        'Lý do',
        'Đơn vị vận chuyển',
        'Trạng thái thu tiền',
        'Ngày hẹn đẩy đơn',
        'Ngày Kế toán đối soát với FFM lần 2',
        'Khu vực',
        'Phí lưu kho',
        'Team',
        'Mã check',
        'Ghi chú của BEE',
        'Đánh dấu',
        'Ngày đóng hàng',
        'Trạng thái giao hàng',
        'Thời gian giao dự kiến',
        'Phí ship nội địa Mỹ (usd)',
        'GHI CHÚ',
        'Ngày đối soát',
        'Time kế toán xác nhận',
        'Ghi chú của VĐ',
        'Đơn vị thanh toán'
      ];
      
      // Tạo bộ lọc tạm thời cho ngày đã chọn
      const tempFilters = {
        ...activeFilters,
        dateFrom: exportDateFrom,
        dateTo: exportDateTo,
        dateType: exportDateType
      };
      
      // Fetch dữ liệu với bộ lọc ngày
      let sourceRows = [];
      const limit = VAN_DON_POSTGREST_MAX_ROWS;
      let page = 1;
      const maxPages = 50000;
      
      while (page <= maxPages) {
        const res = await API.fetchVanDon({
          sourceView: dataSource === 'hcm' ? null : 'van_don_page',
          sourceTable: dataSource === 'hcm' ? 'order_code_hcm' : 'orders',
          page,
          limit,
          team: tempFilters.team,
          excludeHcmTeam: dataSource !== 'hcm',
          hanoiTabSqlScope: tempFilters.tab === 'hanoi' ? 'ffm_queue_admin' : null,
          market: tempFilters.market,
          product: tempFilters.product,
          nv_sale: tempFilters.nv_sale,
          nv_mkt: tempFilters.nv_mkt,
          nv_van_don: tempFilters.nv_van_don,
          shipping_unit: tempFilters.shipping_unit,
          page_name: tempFilters.page_name,
          delivery_status: tempFilters.delivery_status,
          delivery_status_nb: tempFilters.delivery_status_nb,
          payment_status: tempFilters.payment_status,
          dateFrom: exportDateFrom,
          dateTo: exportDateTo,
          dateType: exportDateType,
          allowedStaff: tempFilters.allowedStaff,
          deliveryStaffSelfFilter: tempFilters.deliveryStaffSelfFilter,
          columnFilters: tempFilters.columnFilters || {},
          trackingFilter: tempFilters.trackingFilter || null,
          bulkOrderCodes: tempFilters.bulkOrderCodes || [],
          customerQuickSearch: tempFilters.customerQuickSearch,
          canh_bao_filter: tempFilters.canh_bao_filter,
          vanDonFetchMode: null
        });
        
        const batch = res.data || [];
        sourceRows.push(...batch);
        
        if (batch.length < limit || sourceRows.length >= (res.total || 0)) break;
        page += 1;
      }
      
      removeToast(loadingId);
      
      if (!sourceRows.length) {
        addToast('Không có dữ liệu trong khoảng ngày đã chọn', 'warning');
        setShowExportDateDialog(false);
        return;
      }
      
      // Tạo header và data rows
      const headerRow = exportColumns;
      const dataRows = sourceRows.map((row) =>
        exportColumns.map((col) => {
          const value = getVanDonGridCellValue(row, col);
          return sanitizeExcelTsvCell(value);
        })
      );
      
      // Tạo workbook và export
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Van_don');
      
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const dateTypeShort = exportDateType === 'Ngày lên đơn' ? 'LenDon' : 'DayDon';
      const fileName = `VanDon_${dateTypeShort}_${exportDateFrom}_${exportDateTo}_${stamp}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      addToast(
        `Đã xuất ${sourceRows.length.toLocaleString('vi-VN')} dòng (${exportDateType}: ${formatDate(exportDateFrom)} - ${formatDate(exportDateTo)})`,
        'success',
        4000
      );
      
      setShowExportDateDialog(false);
    } catch (e) {
      removeToast(loadingId);
      console.error(e);
      addToast(e?.message || 'Lỗi xuất Excel', 'error');
    } finally {
      setExportingCustomExcel(false);
    }
  }, [
    exportDateFrom,
    exportDateTo,
    exportDateType,
    permissionsLoading,
    activeFilters,
    dataSource,
    addToast,
    removeToast,
    formatDate
  ]);

  /** Số cột cố định (ghim) - có thể điều chỉnh bởi người dùng */
  const [numFixedColumns, setNumFixedColumns] = useState(() => {
    const saved = localStorage.getItem('vanDon_numFixedColumns');
    return saved ? Math.max(1, Math.min(Number(saved), 5)) : 1;
  });

  // Lưu số cột cố định vào localStorage
  useEffect(() => {
    localStorage.setItem('vanDon_numFixedColumns', String(numFixedColumns));
  }, [numFixedColumns]);

  const effectiveFixedColumns = Math.min(numFixedColumns, currentColumns.length);

  const checkboxStickyPad = bolActiveTab === 'hanoi' ? VAN_DON_CHECKBOX_COL_PX : 0;

  /** Tính toán độ rộng cột Nhân viên MKT dựa trên nội dung dài nhất trong data */
  const mktColumnWidth = useMemo(() => {
    if (!allData || allData.length === 0) return 140;

    let maxLen = 0;
    allData.forEach(row => {
      const name = String(row["Nhân viên MKT"] || row["marketing_staff"] || "").trim();
      if (name.length > maxLen) maxLen = name.length;
    });

    // Ước tính 8px mỗi ký tự + padding (khoảng 140px cho 12-15 ký tự, 200px cho 20 ký tự)
    const estimated = maxLen * 8.5 + 40;
    return Math.max(140, Math.min(estimated, 400)); // Min 140, Max 400
  }, [allData]);

  /** Độ rộng cố định theo từng cột để tính offset sticky chính xác khi cuộn ngang. */
  const getColumnWidthPx = useCallback((col) => {
    const c = String(col || "").trim();
    const cl = c.toLowerCase();

    // Specific Width Cases (Approximate to fit text)
    if (cl === "mã đơn hàng") return 150;
    if (cl === "mã tracking") return 300;
    if (cl === "lý do") return 150;
    if (cl === "trạng thái thu tiền") return 150;
    if (cl === "ghi chú của vđ" || cl === "ghi chú") return 200;
    if (cl === "ngày lên đơn") return 150;
    if (cl === "phone*") return 140;

    if (cl === "trạng thái giao hàng nb") return 240;
    if (cl === "nhân viên sale") return 140;
    if (cl === "nhân viên mkt") return mktColumnWidth;
    if (cl === "nv vận đơn") return 140;
    if (cl === "đơn vị vận chuyển") return 140;
    if (cl === "số tiền của đơn hàng đã về tk cty") return 320;
    if (cl === "kế toán xác nhận thu tiền về") return 260;
    if (cl === "ngày kế toán đối soát với ffm lần 2" || cl.includes("đối soát với ffm lần 2")) return 320;

    const isCheckCol = (cl === "kết quả check");
    const isNameCol = (cl === "name*");
    const isAddCol = (cl === "add");
    const isCityCol = (cl === "city");
    const isProductCol = (cl === "mặt hàng");
    const isProductNameCol = (cl === "tên mặt hàng 1" || cl === "tên mặt hàng 2");
    const isQtyCol = cl === "số lượng mặt hàng 1" || cl === "số lượng mặt hàng 2";

    if (isQtyCol) return 52;
    if (isCheckCol) return 150;
    if (isNameCol) return 220;
    if (isAddCol) return 400;
    if (isCityCol) return 140;
    if (isProductCol) return 160;
    if (isProductNameCol) return 260;
    if (cl === 'cảnh báo trùng') return 240;
    if (cl === 'thứ tự chia') return 96;
    if (cl === 'page') return 200;
    return 120;
  }, [mktColumnWidth]);

  const getColumnWidthStyles = useCallback((col) => {
    const w = getColumnWidthPx(col) + 'px';

    return {
      width: w,
      minWidth: w,
      maxWidth: w,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    };
  }, [getColumnWidthPx]);

  /** Left offset cho cột sticky = checkboxPad + tổng width các cột trước đó. */
  const getStickyLeftPx = useCallback((colIdx) => {
    if (Number.isFinite(stickyOffsets[colIdx])) return stickyOffsets[colIdx];
    let left = checkboxStickyPad;
    for (let i = 0; i < colIdx; i += 1) {
      left += getColumnWidthPx(currentColumns[i]);
    }
    return left;
  }, [stickyOffsets, checkboxStickyPad, currentColumns, getColumnWidthPx]);

  /** Đo width thực tế của header để freeze cột khớp tuyệt đối khi kéo ngang. */
  useLayoutEffect(() => {
    const recalcStickyOffsets = () => {
      const headerEl = vanDonHeaderContainerRef.current;
      if (!headerEl || !currentColumns.length) {
        setStickyOffsets([]);
        return;
      }

      const thList = Array.from(headerEl.querySelectorAll('th[data-col-idx]')).sort(
        (a, b) => Number(a.getAttribute('data-col-idx')) - Number(b.getAttribute('data-col-idx'))
      );
      const widthByIdx = new Map();
      thList.forEach((th) => {
        const idx = Number(th.getAttribute('data-col-idx'));
        if (Number.isFinite(idx)) {
          widthByIdx.set(idx, th.getBoundingClientRect().width || 0);
        }
      });

      const offsets = [];
      let left = checkboxStickyPad;
      for (let i = 0; i < currentColumns.length; i += 1) {
        offsets[i] = left;
        const w = widthByIdx.get(i) || getColumnWidthPx(currentColumns[i]);
        left += w;
      }
      setStickyOffsets(offsets);
    };

    recalcStickyOffsets();
    window.addEventListener('resize', recalcStickyOffsets);
    return () => window.removeEventListener('resize', recalcStickyOffsets);
  }, [currentColumns, checkboxStickyPad, getColumnWidthPx, filterValues, isLongTextExpanded, numFixedColumns]);


  // Virtualization is handled by react-virtuoso, so we no longer need manual height sync
  // or ResizeObservers. We keep only essentials.

  // Thanh cuộn ngang phụ dưới bảng để không phải kéo xuống cuối mới cuộn ngang.
  useLayoutEffect(() => {
    const host = horizontalScrollHostRef.current;
    const bar = horizontalScrollbarRef.current;
    if (!host || !bar) return;

    const updateWidth = () => {
      setHorizontalTrackWidth(host.scrollWidth || 0);
    };
    const syncFromHost = () => {
      if (bar.scrollLeft !== host.scrollLeft) bar.scrollLeft = host.scrollLeft;
    };
    const syncFromBar = () => {
      if (host.scrollLeft !== bar.scrollLeft) host.scrollLeft = bar.scrollLeft;
    };

    updateWidth();
    syncFromHost();

    host.addEventListener('scroll', syncFromHost, { passive: true });
    bar.addEventListener('scroll', syncFromBar, { passive: true });
    window.addEventListener('resize', updateWidth);

    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateWidth());
      ro.observe(host);
    }

    return () => {
      host.removeEventListener('scroll', syncFromHost);
      bar.removeEventListener('scroll', syncFromBar);
      window.removeEventListener('resize', updateWidth);
      ro?.disconnect();
    };
  }, [currentColumns.length, currentPage, rowsPerPage, isLongTextExpanded, isQueryLoading, getFilteredData.length === 0]);

  // Scroll sync not needed with Virtuoso + single table logic
  // Scroll sync for separate header (FFM style)
  const onTableScroll = useCallback((e) => {
    const sl = e.target.scrollLeft;
    e.target.style.setProperty('--vd-sl', sl + 'px');
    if (vanDonHeaderContainerRef.current) {
      vanDonHeaderContainerRef.current.style.setProperty('--vd-sl', sl + 'px');
      vanDonHeaderContainerRef.current.scrollLeft = sl;
    }
  }, []);

  // Lăn chuột luôn cuộn phần nội dung bảng, header vẫn đứng yên (sticky).
  const handleTableWheel = useCallback((e) => {
    const root = tableRef.current;
    if (!root) return;
    const dy = Number(e?.deltaY || 0);
    if (!dy) return;

    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    const next = Math.max(0, Math.min(max, root.scrollTop + dy));
    if (next === root.scrollTop) return;

    e.preventDefault();
    root.scrollTop = next;
    /* Cuộn dọc chỉ trên root (tableRef); pane trái/phải di chuyển theo nội dung, không gán scrollTop riêng. */
  }, []);

  // Save column visibility to localStorage
  useEffect(() => {
    if (Object.keys(visibleColumns).length > 0) {
      localStorage.setItem('vanDon_visibleColumns', JSON.stringify(visibleColumns));
    }
  }, [visibleColumns]);

  // Handle quick filter
  const handleQuickFilter = (value) => {
    setQuickFilter(value);
    if (!value) {
      setDateFrom('');
      setDateTo('');
      setEnableDateFilter(false);
      return;
    }

    const today = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (value) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 1);
        endDate = new Date(startDate);
        break;
      case 'this-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.getFullYear(), today.getMonth(), diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      }
      case 'last-week': {
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek - 6 + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.getFullYear(), today.getMonth(), diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      }
      case 'this-month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'last-month':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'this-year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        return;
    }

    setDateFrom(startDate.toISOString().split('T')[0]);
    setDateTo(endDate.toISOString().split('T')[0]);
    setEnableDateFilter(true);
  };





  // --- UI Helpers ---
  const getUniqueValues = useMemo(() => (key) => {
    const values = new Set();
    const keyMapped = COLUMN_MAPPING[key] || key;
    const dbAliasKeys = [];
    for (const [dbK, appK] of Object.entries(API.DB_TO_APP_MAPPING)) {
      if (appK === key || appK === keyMapped) dbAliasKeys.push(dbK);
    }
    allData.forEach((row) => {
      let raw = row[key] ?? row[keyMapped] ?? row[String(key).replace(/ /g, '_')];
      if (
        (raw === undefined || raw === null || String(raw).trim() === '') &&
        dbAliasKeys.length > 0
      ) {
        for (let i = 0; i < dbAliasKeys.length; i++) {
          const v = row[dbAliasKeys[i]];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            raw = v;
            break;
          }
        }
      }
      const val = String(raw ?? '').trim();
      if (val && !isVanDonSemanticEmpty(val)) values.add(val);
    });
    return Array.from(values).sort();
  }, [allData]);

  /**
   * Bộ lọc MultiSelect: gộp distinct từ Supabase (RPC/view) với giá trị unique trên dữ liệu đang hiển thị
   * (trang hiện tại + pending) — tránh thiếu mục khi RPC/HCM lệch hoặc dòng chỉ có khóa snake_case.
   */
  const getFilterMultiSelectOptions = useCallback(
    (col) => {
      const keyMapped = COLUMN_MAPPING[col] || col;
      const preset = DROPDOWN_OPTIONS[keyMapped] || DROPDOWN_OPTIONS[col] || [];

      /** Gộp bản ghi trùng không phân biệt hoa thường; ưu tiên đúng chuỗi trong DROPDOWN_OPTIONS. */
      const pickBetterCase = (a, b) => {
        const aEx = preset.some((p) => p !== '' && String(p) === String(a));
        const bEx = preset.some((p) => p !== '' && String(p) === String(b));
        if (aEx && !bEx) return a;
        if (bEx && !aEx) return b;
        const al = String(a).toLowerCase();
        const bl = String(b).toLowerCase();
        const piA = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === al);
        const piB = preset.findIndex((p) => p !== '' && String(p).toLowerCase() === bl);
        if (piA !== -1 && piB === -1) return preset[piA];
        if (piB !== -1 && piA === -1) return preset[piB];
        if (piA !== -1 && piB !== -1) return preset[Math.min(piA, piB)];
        return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true }) <= 0 ? a : b;
      };

      const fromDb = vanDonDistinctFilterOptions[col];
      const fromPage = getUniqueValues(col);
      const dbArr = Array.isArray(fromDb) ? fromDb : [];
      const pageArr = Array.isArray(fromPage) ? fromPage : [];
      let adminCatalogArr = [];
      if (col === 'Mặt hàng') {
        adminCatalogArr = vanDonAdminCatalogProductNames;
      } else if (col === 'Khu vực') {
        adminCatalogArr = keyMarketsCatalog;
      }
      const base = [...adminCatalogArr, ...dbArr, ...pageArr];

      const byLower = new Map();
      for (const raw of base) {
        if (isVanDonSemanticEmpty(raw)) continue;
        const s = String(raw).trim();
        const lk = s.toLowerCase();
        if (!byLower.has(lk)) byLower.set(lk, s);
        else byLower.set(lk, pickBetterCase(byLower.get(lk), s));
      }

      let merged = Array.from(byLower.values()).sort((a, b) =>
        String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true })
      );

      // Cột "Trạng thái giao hàng NB": chỉ hiển thị giá trị có trong data, không hiển thị preset không có data
      const isDeliveryStatusNbCol =
        normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng NB') ||
        normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng');

      if (isDeliveryStatusNbCol) {
        // Chỉ lấy giá trị từ data, không thêm preset
        // Một mục "Trống" cho ô trống
        return ['Trống', ...merged];
      }

      // Với các cột có danh sách trạng thái cố định khác, chỉ hiển thị trong dropdown
      // các giá trị có trong preset để tránh lộ giá trị rác (ví dụ mã số, text sai).
      if (preset && preset.length > 0) {
        const presetLower = new Set(
          preset
            .filter((p) => p !== '')
            .map((p) => String(p).trim().toLowerCase())
        );
        merged = merged.filter((v) => {
          const l = String(v).trim().toLowerCase();
          if (l === '') return false;
          return presetLower.has(l);
        });
        // Luôn hiển thị đủ các mục trong preset (vd. "Đang Giao") dù chưa có dòng nào trong dữ liệu hiện tại.
        const mergedLower = new Set(merged.map((v) => String(v).trim().toLowerCase()));
        for (const p of preset) {
          if (p === '') continue;
          const pl = String(p).trim().toLowerCase();
          if (!mergedLower.has(pl)) {
            merged.push(String(p).trim());
            mergedLower.add(pl);
          }
        }
        merged.sort((a, b) =>
          String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true })
        );
      }

      // Một mục "Trống" cho ô trống; không thêm __EMPTY__ (vẫn tương thích khi selected còn __EMPTY__ từ bản cũ)
      return ['Trống', ...merged];
    },
    [getUniqueValues, vanDonDistinctFilterOptions, vanDonAdminCatalogProductNames, keyMarketsCatalog]
  );

  /** Ô chỉnh sửa: cột NB / «Trạng thái giao hàng» gộp preset + distinct toàn DB (giống bộ lọc) + unique trang hiện tại. */
  const getCellEditSelectOptions = (col) => {
    const key = COLUMN_MAPPING[col] || col;
    const preset = DROPDOWN_OPTIONS[key] || DROPDOWN_OPTIONS[col];
    const fromData = getUniqueValues(col);
    const isNbDelivery =
      normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng NB') ||
      normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng') ||
      normalizeColHeader(key) === normalizeColHeader('Trạng thái giao hàng NB');

    if (preset && isNbDelivery) {
      const dbArr =
        (Array.isArray(vanDonDistinctFilterOptions[col]) && vanDonDistinctFilterOptions[col]) ||
        vanDonDistinctFilterOptions['Trạng thái giao hàng NB'];
      const dbArrSafe = Array.isArray(dbArr) ? dbArr : [];
      const list = mergeVanDonNbDeliveryStatusValueList(preset, [...dbArrSafe, ...fromData]);
      return ['', ...list];
    }

    if (preset) {
      const merged = new Set();
      for (const x of [...preset, ...fromData]) {
        if (x === '') merged.add('');
        else if (!isVanDonSemanticEmpty(x)) merged.add(x);
      }
      return Array.from(merged).sort((a, b) => {
        if (a === '') return -1;
        if (b === '') return 1;
        return String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true });
      });
    }
    return fromData;
  };


  // --- Trigger Report Recalculation ---
  const triggerReportRecalculation = useCallback(async (batchChanges) => {
    // Kiểm tra xem có thay đổi cột "Kết quả check" không
    const hasCheckResultChange = batchChanges.some(change => {
      const colKey = normalizeColHeader(change.colKey);
      return colKey === normalizeColHeader('Kết quả Check') ||
        colKey === normalizeColHeader('Kết quả check') ||
        colKey === normalizeColHeader('check_result');
    });

    if (!hasCheckResultChange) return;

    try {
      console.log('🔄 Kích hoạt công thức tính toán báo cáo do thay đổi "Kết quả check"...');

      // Lấy danh sách các đơn hàng bị ảnh hưởng
      const affectedOrderIds = [...new Set(batchChanges.map(c => normalizeVanDonOrderIdKey(c.orderId)).filter(Boolean))];

      // Lấy thông tin từ các đơn bị ảnh hưởng để xác định các key báo cáo cần cập nhật
      const affectedOrders = allData.filter(row =>
        affectedOrderIds.includes(getVanDonRowOrderId(row))
      );

      if (affectedOrders.length === 0) return;

      // Gom nhóm unique (Ngày, Tên MKT, Sản phẩm, Thị trường) để trigger recalc
      const exactKeys = [];
      const seenKeys = new Set();

      affectedOrders.forEach(order => {
        const date = order['Ngày lên đơn'] || order.order_date || '';
        const name = order['Nhân viên MKT'] || order.marketing_staff || '';
        const product = order['Mặt hàng'] || order.product || '';
        const market = order['Khu vực'] || order.country || '';

        if (!date || !name) return;

        const key = `${date}|${name}|${product}|${market}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          exactKeys.push({ date, name, product, market });
        }
      });

      if (exactKeys.length === 0) return;

      console.log(`📊 Tự động cập nhật ${exactKeys.length} nhóm báo cáo MKT...`);

      // Xác định bảng đích dựa trên dataSource
      const reportsTableName = dataSource === 'hcm' ? 'marketing_report_hcm' : 'detail_reports';
      const ordersSupabaseTable = dataSource === 'hcm' ? 'order_code_hcm' : 'orders';

      // Gọi service tính toán thực tế
      const result = await recalcMktSoDonThucTeFromOrders({
        startDate: exactKeys[0].date, // Lấy ngày đầu tiên làm base, exactKeys sẽ lo phần còn lại
        endDate: exactKeys[exactKeys.length - 1].date,
        createMissingRows: true, // Tạo dòng nếu chưa có (theo yêu cầu nghiệp vụ)
        exactKeys: exactKeys,
        reportsTableName,
        ordersSupabaseTable
      });

      console.log('✅ Kết quả cập nhật báo cáo:', result);

      // Invalidate cache báo cáo để UI cập nhật
      queryClient.invalidateQueries({ queryKey: ['baoCaoVanDon'] });
      queryClient.invalidateQueries({ queryKey: ['baoCaoTayMKT'] });
      queryClient.invalidateQueries({ queryKey: ['marketing_report_hcm'] });
      queryClient.invalidateQueries({ queryKey: ['detail_reports'] });

      const nUpd = result.updatedExisting ?? 0;
      const nNew = result.createdMissing ?? 0;
      addToast(`✅ Tự động cập nhật báo cáo MKT: ${nUpd} dòng updated, ${nNew} dòng mới.`, 'success', 4000);

    } catch (error) {
      console.error('❌ Lỗi khi kích hoạt công thức báo cáo:', error);
      addToast('⚠️ Không thể cập nhật báo cáo tự động: ' + (error.message || String(error)), 'warning', 5000);
    }
  }, [allData, queryClient, addToast, dataSource]);


  // --- Change Management (Shared) ---
  const processDbQueue = useCallback(async () => {
    if (isProcessingQueue.current) return;
    if (dbQueueRef.current.length === 0) return;

    isProcessingQueue.current = true;
    try {
      while (dbQueueRef.current.length > 0) {
        // Copy queue để xử lý - KHÔNG xóa ngay (chỉ xóa khi thành công)
        const batchToProcess = dbQueueRef.current
          .map((b) => ({ ...b, orderId: normalizeVanDonOrderIdKey(b.orderId) }))
          .filter((b) => b.orderId);

        if (batchToProcess.length === 0) {
          dbQueueRef.current = [];
          break;
        }

        const rowsObjMap = new Map();
        batchToProcess.forEach(({ orderId, colKey, newValue }) => {
          if (!rowsObjMap.has(orderId)) rowsObjMap.set(orderId, { [PRIMARY_KEY_COLUMN]: orderId });
          rowsObjMap.get(orderId)[colKey] = newValue;
        });

        const rowsToUpdate = Array.from(rowsObjMap.values());
        if (rowsToUpdate.length === 0) {
          dbQueueRef.current = [];
          break;
        }

        const currentUsername = localStorage.getItem('username') || 'Unknown';
        let success = false;

        /** Luôn batch + changeLog: mọi ô sửa đều append vào cột orders.log (jsonb). */
        const toastId =
          rowsToUpdate.length === 1
            ? addToast('Đang cập nhật...', 'loading', 0)
            : addToast(`Đang cập nhật ${rowsToUpdate.length} đơn hàng...`, 'loading', 0);
        try {
          const res = await API.updateBatch(rowsToUpdate, currentUsername, batchToProcess, {
            sourceTable: dataSource === 'hcm' ? 'order_code_hcm' : 'orders',
          });
          if (res.success) success = true;
        } catch (e) {
          addToast(e.message, 'error');
          // Lỗi xung đột hoặc lỗi khác - KHÔNG xóa queue, giữ nguyên để user có thể F5 và thử lại
          break;
        } finally {
          removeToast(toastId);
        }

        if (success) {
          // CHỈ xóa queue khi lưu thành công
          dbQueueRef.current = [];

          // Kích hoạt công thức tính toán báo cáo nếu có thay đổi "Kết quả check"
          await triggerReportRecalculation(batchToProcess);

          const latestData = [...allData];
          rowsToUpdate.forEach(updatedRow => {
            const uid = normalizeVanDonOrderIdKey(updatedRow[PRIMARY_KEY_COLUMN]);
            const idx = latestData.findIndex((r) => getVanDonRowOrderId(r) === uid);
            if (idx > -1) latestData[idx] = { ...latestData[idx], ...updatedRow };
          });

          /** Gộp ngay vào cache React Query — tránh khoảng trễ refetch khiến `<select>` lệch option (ô trắng / «chưa lưu» nhầm). */
          queryClient.setQueriesData({ queryKey: ['vanDon', 'rows'], exact: false }, (old) => {
            if (!old || !Array.isArray(old.data)) return old;
            const nextRows = old.data.map((row) => {
              const oid = getVanDonRowOrderId(row);
              if (!oid) return row;
              const upd = rowsToUpdate.find(
                (u) => normalizeVanDonOrderIdKey(u[PRIMARY_KEY_COLUMN]) === oid
              );
              if (!upd) return row;
              const merged = { ...row, ...upd };
              const nbKey = 'Trạng thái giao hàng NB';
              if (Object.prototype.hasOwnProperty.call(upd, nbKey)) {
                const ffmTrim = String(merged.delivery_status ?? row.delivery_status ?? '').trim();
                merged['Trạng thái giao hàng'] = ffmTrim;
              }
              return merged;
            });
            return { ...old, data: nextRows };
          });

          // Refresh data from server
          queryClient.invalidateQueries({ queryKey: ['vanDon'] });

          setPendingChanges(prev => {
            const next = deepCloneMapOfMaps(prev);
            batchToProcess.forEach(({ orderId, colKey }) => {
              const oid = normalizeVanDonOrderIdKey(orderId);
              if (oid && next.has(oid)) {
                next.get(oid).delete(colKey);
                if (next.get(oid).size === 0) {
                  next.delete(oid);
                  pendingRowSnapshotsRef.current.delete(oid);
                }
              }
            });
            const touchedOrderIds = new Set(batchToProcess.map((b) => normalizeVanDonOrderIdKey(b.orderId)).filter(Boolean));
            touchedOrderIds.forEach((orderId) => {
              if (next.has(orderId)) upsertPendingRowSnapshot(orderId, next, latestData);
            });
            savePendingToLocalStorage(next);
            return next;
          });
        }
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }, [addToast, removeToast, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData, queryClient, savePendingToLocalStorage, dataSource, triggerReportRecalculation]);

  // --- New Stack-Based History ---
  const pushChange = useCallback((changesArray) => {
    if (!changesArray || changesArray.length === 0) return;

    const normalized = changesArray
      .map((c) => ({
        ...c,
        orderId: normalizeVanDonOrderIdKey(c.orderId),
      }))
      .filter((c) => c.orderId);
    if (normalized.length === 0) return;

    // 1. History Stack
    const currentIndex = historyIndexRef.current;
    const currentHist = changeHistoryRef.current;
    const newHistory = currentHist.slice(0, currentIndex + 1);

    newHistory.push({ timestamp: Date.now(), changes: normalized });
    const finalHistory = newHistory.slice(-50);
    changeHistoryRef.current = finalHistory;
    historyIndexRef.current = finalHistory.length - 1;

    // 2. Add to DB Queue & UI state (BỎ logic kiểm tra baseValue)
    // Xóa các queue cũ của cùng orderId + colKey trước khi thêm mới (tránh trùng lặp)
    const newKeys = new Set(normalized.map(c => `${c.orderId}::${c.colKey}`));
    dbQueueRef.current = dbQueueRef.current.filter(q => {
      const key = `${q.orderId}::${q.colKey}`;
      return !newKeys.has(key);
    });

    dbQueueRef.current.push(...normalized);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      normalized.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      normalized.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

  }, [deepCloneMapOfMaps, upsertPendingRowSnapshot, allData, savePendingToLocalStorage]);

  // Undo last change
  const handleUndo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    if (currentIndex < 0) {
      addToast('Không có thay đổi nào để hoàn tác', 'info', 2000);
      return;
    }

    const currentSnapshot = changeHistoryRef.current[currentIndex];

    // Reverse changes
    const undoChanges = currentSnapshot.changes.map(change => ({
      orderId: change.orderId,
      colKey: change.colKey,
      newValue: change.originalValue,
      originalValue: change.newValue
    }));

    // Add to DB queue & Update UI
    dbQueueRef.current.push(...undoChanges);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      undoChanges.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      undoChanges.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = currentIndex - 1;
    addToast('Đã hoàn tác (chưa lưu DB — nhấn Xác nhận lưu để ghi)', 'success', 2500);
  }, [addToast, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData]);

  // Redo last undone change
  const handleRedo = useCallback(() => {
    const currentIndex = historyIndexRef.current;
    const currentHist = changeHistoryRef.current;

    if (currentIndex >= currentHist.length - 1) {
      addToast('Không có thay đổi nào để làm lại', 'info', 2000);
      return;
    }

    const nextIndex = currentIndex + 1;
    const nextSnapshot = currentHist[nextIndex];

    const redoChanges = nextSnapshot.changes.map(change => ({
      orderId: change.orderId,
      colKey: change.colKey,
      newValue: change.newValue,
      originalValue: change.originalValue
    }));

    dbQueueRef.current.push(...redoChanges);

    setPendingChanges(prev => {
      const next = deepCloneMapOfMaps(prev);
      redoChanges.forEach(({ orderId, colKey, newValue, originalValue }) => {
        if (!next.has(orderId)) next.set(orderId, new Map());
        next.get(orderId).set(colKey, { newValue, originalValue });
      });
      redoChanges.forEach(({ orderId }) => {
        upsertPendingRowSnapshot(orderId, next, allData);
      });
      savePendingToLocalStorage(next);
      return next;
    });

    historyIndexRef.current = nextIndex;
    addToast('Đã làm lại (chưa lưu DB — nhấn Xác nhận lưu để ghi)', 'success', 2500);
  }, [addToast, deepCloneMapOfMaps, upsertPendingRowSnapshot, allData]);

  const handleCellChange = useCallback((orderId, colKey, newValue) => {
    if (isReadonlyEditTab) return;
    const oid = normalizeVanDonOrderIdKey(orderId);
    if (!oid) return;
    const keyLc = String(colKey || '').trim().toLowerCase();
    if (keyLc === 'canh_bao' || normalizeColHeader(colKey) === normalizeColHeader(VAN_DON_CANH_BAO_COLUMN)) return;
    if (isVanDonGridReadOnlyColumnKey(colKey)) return;

    const originalRow = allData.find((r) => getVanDonRowOrderId(r) === oid);
    const baseValue = originalRow ? String(originalRow[colKey] ?? '') : '';

    // Lấy giá trị hiện tại (có thể đã sửa trước đó)
    const pendingVal = pendingChanges.get(oid)?.get(colKey);
    const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

    if (isVanDonMoneyGridAppKey(colKey)) {
      if (vanDonMoneyCellValuesEqual(newValue, stepOriginalValue)) return;
    } else if (String(newValue) === String(stepOriginalValue)) return;

    // BỎ baseValue - Không cần kiểm tra xung đột nữa
    const changes = [{
      orderId: oid,
      colKey,
      originalValue: String(stepOriginalValue),
      newValue: String(newValue)
    }];

    // Tự động nhảy trạng thái giao hàng NB khi thay đổi đơn vị vận chuyển
    const isShippingUnitCol = colKey === 'Đơn vị vận chuyển' || colKey === 'shipping_unit';
    if (isShippingUnitCol) {
      const nbKey = 'Trạng thái giao hàng NB';
      const nbDbKey = 'delivery_status_nb';
      
      // Kiểm tra trạng thái hiện tại (ưu tiên pending)
      const pendingNb = pendingChanges.get(oid)?.get(nbKey) || pendingChanges.get(oid)?.get(nbDbKey);
      const currentNbValue = pendingNb 
        ? pendingNb.newValue 
        : String(originalRow?.[nbKey] ?? originalRow?.[nbDbKey] ?? '').trim();

      // Nếu chưa là "Chưa Giao", tự động thêm vào danh sách thay đổi
      if (currentNbValue.toLowerCase() !== 'chưa giao') {
        changes.push({
          orderId: oid,
          colKey: nbDbKey,
          originalValue: currentNbValue,
          newValue: 'Chưa Giao'
        });
      }
    }

    pushChange(changes);
  }, [allData, pendingChanges, pushChange, isReadonlyEditTab]);

  // Hàm đồng bộ queue từ pendingChanges (tự động phục hồi)
  const syncQueueFromPending = useCallback(() => {
    if (pendingChangesRef.current.size === 0) return;

    // Xóa queue cũ để tránh trùng lặp
    const existingKeys = new Set(
      dbQueueRef.current.map(q => `${q.orderId}::${q.colKey}`)
    );

    const recovered = [];
    pendingChangesRef.current.forEach((innerMap, orderId) => {
      innerMap.forEach((info, colKey) => {
        const key = `${orderId}::${colKey}`;
        if (!existingKeys.has(key)) {
          recovered.push({
            orderId,
            colKey,
            newValue: info.newValue,
            originalValue: info.originalValue,
            ...(info.baseValue !== undefined ? { baseValue: info.baseValue } : {}),
          });
        }
      });
    });

    if (recovered.length > 0) {
      console.log('🔄 [VanDon] Đồng bộ', recovered.length, 'thay đổi vào queue');
      dbQueueRef.current.push(...recovered);
    }
  }, []);

  const handleDiscardRowChange = useCallback((orderId, colKey) => {
    setPendingChanges(prev => {
      const next = new Map(prev);
      const inner = next.get(orderId);
      if (inner) {
        const newInner = new Map(inner);
        newInner.delete(colKey);
        if (newInner.size === 0) {
          next.delete(orderId);
          pendingRowSnapshotsRef.current.delete(orderId);
        } else {
          next.set(orderId, newInner);
          // Cập nhật lại snapshot cho hàng này với các thay đổi còn lại
          upsertPendingRowSnapshot(orderId, next, allData);
        }
      }
      
      // Đồng bộ lại queue
      dbQueueRef.current = dbQueueRef.current.filter(q => !(q.orderId === orderId && q.colKey === colKey));
      
      // Nếu không còn thay đổi nào, đóng popover
      if (next.size === 0 && syncPopoverOpen) {
        setSyncPopoverOpen(false);
      }
      
      return next;
    });
  }, [allData, upsertPendingRowSnapshot, syncPopoverOpen]);

  const handleUpdateAll = async () => {
    setSyncPopoverOpen(false);

    /** Nháp textarea (cả hàng đã cuộn khỏi viewport) + ô DOM còn mount — đẩy vào pending trước khi gửi queue. */
    if (!isReadonlyEditTab) {
      const SEP = '\u001e';
      vanDonLongTextDraftRef.current.forEach((val, dk) => {
        const i = dk.indexOf(SEP);
        if (i <= 0) return;
        const orderId = dk.slice(0, i);
        const colKey = dk.slice(i + SEP.length);
        if (orderId && colKey) handleCellChange(orderId, colKey, val);
      });
      vanDonLongTextDraftRef.current.clear();

      const root = tableRef.current;
      if (root) {
        root.querySelectorAll('[data-van-cell-sync="1"]').forEach((el) => {
          if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
          const orderId = normalizeVanDonOrderIdKey(el.getAttribute('data-van-order'));
          const colKey = el.getAttribute('data-van-col');
          if (!orderId || !colKey) return;
          handleCellChange(orderId, colKey, el.value);
        });
      }
      const ae = document.activeElement;
      if (ae && root && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT') && root.contains(ae)) {
        ae.blur();
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    // Đồng bộ queue từ pendingChanges
    syncQueueFromPending();

    if (dbQueueRef.current.length === 0) {
      addToast('Không có thay đổi cần lưu', 'info');
      return;
    }

    // --- Hiện bảng tổng kết trước khi lưu bằng Modal tuỳ chỉnh ---
    const summaries = dbQueueRef.current.map(c => ({
      orderId: c.orderId,
      colKey: c.colKey,
      originalValue: c.originalValue,
      newValue: c.newValue
    }));

    setSaveConfirmData({
      summaries,
      onConfirm: async () => {
        setSaveConfirmData(null);
        await processDbQueue();
      },
      onCancel: () => {
        setSaveConfirmData(null);
      }
    });
  };





  // --- Interaction (Mouse) ---
  const handleMouseDown = (rowIdx, colIdx, e) => {
    if (e.button !== 0) return; // Only left click

    const target = e.target;
    const isInputElement =
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA';

    if (e.ctrlKey || e.metaKey) {
      selectionPointerDragRef.current = null;
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
      isSelecting.current = false;
      return;
    }

    if (e.shiftKey && selection.startRow !== null && selection.startCol !== null) {
      selectionPointerDragRef.current = {
        anchorRow: selection.startRow,
        anchorCol: selection.startCol,
        startX: e.clientX,
        startY: e.clientY,
      };
      setSelection((prev) => ({ ...prev, endRow: rowIdx, endCol: colIdx }));
      isSelecting.current = false;
      return;
    }

    selectionPointerDragRef.current = {
      anchorRow: rowIdx,
      anchorCol: colIdx,
      startX: e.clientX,
      startY: e.clientY,
    };

    // Input/select/textarea: giữ chọn 1 ô; nếu kéo chuột qua ngưỡng → document mousemove mở vùng chọn (ngang + dọc)
    if (isInputElement) {
      setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
      isSelecting.current = false;
      return;
    }

    // Click vào <td> (text chỉ đọc): focus editor nếu có; kéo vùng chờ ngưỡng giống input
    const td = target.closest?.('td');
    if (td) {
      const editor = td.querySelector('input:not([type="checkbox"]), textarea, select');
      if (editor && !editor.disabled && !editor.getAttribute('readonly')) {
        editor.focus();
        if (editor.tagName === 'INPUT' && typeof editor.select === 'function') {
          try {
            editor.select();
          } catch {
            /* ignore */
          }
        }
        setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
        isSelecting.current = false;
        return;
      }
    }

    // Ô chỉ hiển thị text: bắt đầu kéo vùng ngay (mouseenter vẫn hỗ trợ)
    isSelecting.current = true;
    setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
  };

  const handleMouseEnter = (rowIdx, colIdx) => {
    if (isSelecting.current) {
      setSelection(prev => {
        if (prev.startRow === null || prev.startCol === null) {
          return { startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx };
        }
        return { ...prev, endRow: rowIdx, endCol: colIdx };
      });
    }
  };

  useEffect(() => {
    const resolveCellFromPoint = (clientX, clientY) => {
      const root = tableRef.current;
      if (!root) return null;
      const stack = document.elementsFromPoint(clientX, clientY);
      if (!stack?.length) return null;
      for (const el of stack) {
        const td = el.closest?.('td[data-van-r]');
        if (td && root.contains(td)) {
          const r = Number(td.getAttribute('data-van-r'));
          const c = Number(td.getAttribute('data-van-c'));
          if (Number.isFinite(r) && Number.isFinite(c)) return { r, c };
        }
      }
      return null;
    };

    const DRAG_THRESHOLD_PX = 4;

    const handleMouseMove = (e) => {
      const drag = selectionPointerDragRef.current;
      if (!drag || (e.buttons & 1) !== 1) return;

      const dx = Math.abs(e.clientX - drag.startX);
      const dy = Math.abs(e.clientY - drag.startY);
      const pastThreshold = dx >= DRAG_THRESHOLD_PX || dy >= DRAG_THRESHOLD_PX;

      if (pastThreshold && !isSelecting.current) {
        isSelecting.current = true;
        const ae = document.activeElement;
        if (
          ae &&
          tableRef.current?.contains(ae) &&
          (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')
        ) {
          ae.blur();
        }
      }

      if (!isSelecting.current) return;

      e.preventDefault();
      const cell = resolveCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;

      setSelection({
        startRow: drag.anchorRow,
        startCol: drag.anchorCol,
        endRow: cell.r,
        endCol: cell.c,
      });
    };

    const handleMouseUp = () => {
      selectionPointerDragRef.current = null;
      isSelecting.current = false;
    };

    const handleSelectStartCapture = (e) => {
      if (!isSelecting.current || !tableRef.current?.contains(e.target)) return;
      e.preventDefault();
    };

    // Clear selection khi click ra ngoài table (nhưng không clear khi click vào control buttons)
    const handleClickOutside = (e) => {
      if (tableRef.current && !tableRef.current.contains(e.target)) {
        // Chỉ clear nếu không phải đang click vào các control buttons
        const isControlButton = e.target.closest('button') ||
          e.target.closest('.pagination') ||
          e.target.closest('.filter') ||
          e.target.closest('.toolbar') ||
          e.target.closest('[role="dialog"]') ||
          e.target.closest('.modal');
        if (!isControlButton) {
          setSelection({ startRow: null, startCol: null, endRow: null, endCol: null });
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectstart', handleSelectStartCapture, true);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectstart', handleSelectStartCapture, true);
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Removed debounced history save

  // --- Keyboard Navigation ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Copy / Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const bounds = getSelectionBounds();
        if (!bounds) return;

        // If it's a single cell and user has selected only partial text in the input,
        // we might want to let the browser handle it. But to fix the reported issue
        // where Ctrl+C "doesn't work" at all, we'll take over but allow browser copy
        // if there's a specific internal selection that isn't the whole field.
        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
        const isSingleCell = bounds.minRow === bounds.maxRow && bounds.minCol === bounds.maxCol;

        // If user manually selected a PART of the text, let browser handle it naturally
        if (isInput && isSingleCell && activeEl.selectionStart !== activeEl.selectionEnd &&
          (activeEl.selectionEnd - activeEl.selectionStart) < activeEl.value.length) {
          return;
        }

        e.preventDefault();

        // Prepare data for clipboard (row index = Virtuoso / sortedData)
        const rows = [];
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
          const rData = virtuosoRowData[r];
          if (!rData) {
            rows.push('');
            continue;
          }
          const rowData = [];
          for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            const colName = currentColumns[c];
            rowData.push(getVanDonClipboardCellText(rData, r, colName));
          }
          rows.push(rowData.join('\t'));
        }
        const text = rows.join('\n');
        navigator.clipboard.writeText(text);

        setCopiedSelection(selection);
        setCopiedData(text);
        addToast('Đã copy vào clipboard', 'info', 1000);
        return;
      }

      // Arrow keys
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selection.startRow !== null) {
        // Prevent default if not editing
        const activeEl = document.activeElement;
        const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';
        if (isInput) return; // Let input handle arrows

        e.preventDefault();
        let { startRow, startCol, endRow, endCol } = selection;
        // Move the 'active' end, keep start anchor if shift
        let newRow = endRow;
        let newCol = endCol;

        if (e.key === 'ArrowUp') newRow = Math.max(0, endRow - 1);
        if (e.key === 'ArrowDown') newRow = Math.min(virtuosoRowData.length - 1, endRow + 1);
        if (e.key === 'ArrowLeft') newCol = Math.max(0, endCol - 1);
        if (e.key === 'ArrowRight') newCol = Math.min(currentColumns.length - 1, endCol + 1);

        if (e.shiftKey) {
          setSelection(prev => ({ ...prev, endRow: newRow, endCol: newCol }));
        } else {
          setSelection({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
        }
        return;
      }

      // Ctrl+A - Select all visible
      if (e.ctrlKey && e.key === 'a') {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        setSelection({
          startRow: 0,
          startCol: 0,
          endRow: virtuosoRowData.length - 1,
          endCol: currentColumns.length - 1
        });
        return;
      }

      // Ctrl+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) {
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

        e.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selection,
    virtuosoRowData.length,
    currentColumns.length,
    getSelectionBounds,
    virtuosoRowData,
    currentColumns,
    handleUndo,
    handleRedo,
    getVanDonClipboardCellText,
    addToast,
  ]);

  // --- Paste Logic ---
  useEffect(() => {
    const handlePaste = (e) => {


      const active = document.activeElement;
      // Ô lọc trong <th> hoặc input/textarea/select ngoài ô lưới (vd. «Mã đơn» dán hàng loạt): để trình duyệt dán
      if (active && active.closest('th')) return;
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT') &&
        !active.closest('td')
      ) {
        return;
      }

      if (selection.startRow === null) return;

      // Handle paste logic
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      e.preventDefault();
      const rows = text.split(/\r\n?|\n/).filter(r => r.length > 0).map(r => r.split('\t'));
      if (rows.length === 0) return;

      const bounds = getSelectionBounds();
      if (!bounds) return;

      const historyChanges = [];

      // Flood Fill Logic:
      // If clipboard has only 1 cell (1x1), and selection > 1x1, fill the selection with that value.
      const isFloodFill = rows.length === 1 && rows[0].length === 1 &&
        ((bounds.maxRow - bounds.minRow > 0) || (bounds.maxCol - bounds.minCol > 0));

      if (isFloodFill) {
        const val = rows[0][0];
        if (val === '') return;
        for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
          if (r >= virtuosoRowData.length) continue;
          const rowData = virtuosoRowData[r];
          const orderId = getVanDonRowOrderId(rowData);
          if (!orderId) continue;

          for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
            if (c >= currentColumns.length) continue;
            const colName = currentColumns[c];
            if (!isVanDonUserEditableColumn(colName)) continue;

            const dataKey = COLUMN_MAPPING[colName] || colName;
            const baseValue = rowData[dataKey] ?? '';

            const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
            const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

            const moneyChanged =
              isVanDonMoneyGridAppKey(dataKey) && !vanDonMoneyCellValuesEqual(val, stepOriginalValue);
            const textChanged = !isVanDonMoneyGridAppKey(dataKey) && String(val) !== String(stepOriginalValue);
            if (moneyChanged || textChanged) {
              historyChanges.push({ orderId, colKey: dataKey, originalValue: String(stepOriginalValue), newValue: String(val) });
            }
          }
        }
      } else {
        // Normal Paste (Top-Left aligned)
        rows.forEach((rowVals, rIdx) => {
          const targetRowIdx = bounds.minRow + rIdx;
          if (targetRowIdx >= virtuosoRowData.length) return;

          const rowData = virtuosoRowData[targetRowIdx];
          const orderId = getVanDonRowOrderId(rowData);
          if (!orderId) return;

          rowVals.forEach((val, cIdx) => {
            const targetColIdx = bounds.minCol + cIdx;
            if (targetColIdx >= currentColumns.length || val === '') return;

            const colName = currentColumns[targetColIdx];
            if (!isVanDonUserEditableColumn(colName)) return; // Skip read-only

            const dataKey = COLUMN_MAPPING[colName] || colName;
            const baseValue = rowData[dataKey] ?? '';

            const pendingVal = pendingChanges.get(orderId)?.get(dataKey);
            const stepOriginalValue = pendingVal ? pendingVal.newValue : baseValue;

            const moneyChangedP =
              isVanDonMoneyGridAppKey(dataKey) && !vanDonMoneyCellValuesEqual(val, stepOriginalValue);
            const textChangedP = !isVanDonMoneyGridAppKey(dataKey) && String(val) !== String(stepOriginalValue);
            if (moneyChangedP || textChangedP) {
              historyChanges.push({ orderId, colKey: dataKey, originalValue: String(stepOriginalValue), newValue: String(val) });
            }
          });
        });
      }

      if (historyChanges.length > 0) {
        pushChange(historyChanges);
        addToast(`Đã dán ${historyChanges.length} ô. Nhấn "Xác nhận lưu" để ghi xuống CSDL.`, 'info', 2500);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [selection, pendingChanges, virtuosoRowData, currentColumns, getSelectionBounds, pushChange, addToast]);


  // Calculated helpers for render
  const calculatedSummary = useMemo(() => {
    if (!selectionBounds) return null;
    const viewData = virtuosoRowData;
    let count = 0;
    let sum = 0;
    let numericCount = 0;

    for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow && r < viewData.length; r++) {
      for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol && c < currentColumns.length; c++) {
        count++;
        const col = currentColumns[c];
        const key = COLUMN_MAPPING[col] || col;
        const val = viewData[r][key] ?? viewData[r][col] ?? '';
        const numVal = parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (!isNaN(numVal)) {
          sum += numVal;
          numericCount++;
        }
      }
    }
    return { count, sum: numericCount > 0 ? sum : 0, avg: numericCount > 0 ? sum / numericCount : 0 };
  }, [selectionBounds, virtuosoRowData, currentColumns]);

  const totalMoney = useMemo(() => {
    if (!useBackendPagination) {
      return getFilteredData.reduce((sum, row) => sum + pickVanDonRowMoneyVnd(row), 0);
    }
    const raw = totalAmountVndSumFromServer;
    /** SUM PostgREST trên toàn bộ đơn khớp lọc (không `.range`) — luôn dùng kể cả khi = 0. `> 0` cũ khiến fallback sang tổng một trang (sai, ví dụ hiện 179). */
    if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
      return Number(raw);
    }
    return 0;
  }, [useBackendPagination, totalAmountVndSumFromServer, getFilteredData]);

  const vanDonHeaderMoneyExtras = useMemo(() => {
    if (!useBackendPagination) {
      let totalShip = 0;
      let paidBillCount = 0;
      let paidBillSum = 0;
      for (let i = 0; i < getFilteredData.length; i++) {
        const row = getFilteredData[i];
        totalShip += pickVanDonRowShippingVnd(row);
        if (vanDonRowHasBillEvidence(row)) {
          const r = pickVanDonRowReconciledVnd(row);
          if (r > 0) {
            paidBillCount += 1;
            paidBillSum += r;
          }
        }
      }
      return { totalShip, paidBillCount, paidBillSum };
    }
    const totalShip = Number(queryResult?.totalShippingFeeSum) || 0;
    const paidBillCount = Number(queryResult?.ordersPaidWithBillCount) || 0;
    const paidBillSum = Number(queryResult?.reconciledVndWithBillSum) || 0;
    return { totalShip, paidBillCount, paidBillSum };
  }, [useBackendPagination, getFilteredData, queryResult]);
  /**
   * Tổng khớp lọc từ máy chủ (`totalRecords`) có thể nhỏ hơn số dòng trên lưới khi có đơn ghép từ nháp
   * chưa lưu (`mergePendingRowsIntoFetchedData`) — Ctrl+C/copy theo `getFilteredData` nên đếm phải khớp lưới trong trường hợp đó.
   */
  const totalOrdersCount = useMemo(() => {
    if (!useBackendPagination) return getFilteredData.length;
    if (getFilteredData.length > totalRecords) return getFilteredData.length;
    return totalRecords;
  }, [useBackendPagination, getFilteredData.length, totalRecords]);

  const teams = Array.from(new Set(allData.map(r => r[TEAM_COLUMN_NAME]).filter(Boolean))).sort();

  // Simplified cell class
  const getCellClass = (row, col, val, rIdx, cIdx) => {
    const isCheckCol = (col === "Kết quả Check" || col === "Kết quả check");
    const isStatusCol = (col === "Trạng thái giao hàng");
    const isQtyCol = col === "Số lượng mặt hàng 1" || col === "Số lượng mặt hàng 2";
    const isLongTextEditable =
      viewMode === 'BILL_OF_LADING' &&
      colInList(col, LONG_TEXT_COLS) &&
      isVanDonUserEditableColumn(col);

    // Default cell sizing
    // NOTE: For select-based columns, avoid vertical padding so the select can fill the cell height cleanly.
    let classes = `${(isCheckCol || isStatusCol) ? "py-0" : "py-2.5"} border border-gray-200 text-sm ${isLongTextEditable ? (isLongTextExpanded ? "min-h-[140px] h-auto" : "min-h-[56px] h-auto") : "h-[38px]"
      } whitespace-nowrap `;

    // Padding adjustment for specific columns
    if (isCheckCol) {
      classes += "pl-2 pr-3 ";
    } else if (isQtyCol) {
      classes += "px-1 ";
    } else {
      classes += "px-4 ";
    }

    if (isQtyCol) {
      classes += "text-center tabular-nums text-[12px] ";
    }

    // Status
    if (isCheckCol) {
      const v = String(val).toLowerCase();
      if (v === 'ok') classes += "bg-green-100 text-green-800 font-bold ";
      else if (v.includes('huỷ')) classes += "bg-red-100 text-red-800 font-bold ";
    }

    // Long Text
    if (viewMode === 'BILL_OF_LADING' && colInList(col, LONG_TEXT_COLS) && !isLongTextEditable) {
      classes = classes.replace('whitespace-nowrap', isLongTextExpanded ? "whitespace-pre-wrap max-w-xs break-words bg-yellow-50" : "whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] cursor-pointer");
    }
    if (isLongTextEditable) {
      classes = classes.replace(
        'whitespace-nowrap',
        isLongTextExpanded ? "whitespace-pre-wrap max-w-md break-words align-top" : "whitespace-pre-wrap max-w-[240px] align-top"
      );
    }

    // Editable
    const isEditable = isVanDonUserEditableColumn(col);
    if (isEditable) {
      const oid = getVanDonRowOrderId(row);
      if (oid && pendingChanges.get(oid)?.has(COLUMN_MAPPING[col] || col)) {
        classes += "!bg-yellow-300 ";
      } else {
        classes += "bg-[#e8f5e9] ";
      }
    }

    if (cIdx < effectiveFixedColumns) {
      classes += "z-10 ";
    }

    // Selection - Highlight cell nếu nằm trong vùng selection
    const inSelection =
      selectionBounds &&
      rIdx >= selectionBounds.minRow &&
      rIdx <= selectionBounds.maxRow &&
      cIdx >= selectionBounds.minCol &&
      cIdx <= selectionBounds.maxCol;
    if (inSelection) {
      classes += "!bg-[#e3f2fd] ";
      // Thêm border cho các cạnh của vùng selection
      if (rIdx === selectionBounds.minRow) classes += "selection-border-top ";
      if (rIdx === selectionBounds.maxRow) classes += "selection-border-bottom ";
      if (cIdx === selectionBounds.minCol) classes += "selection-border-left ";
      if (cIdx === selectionBounds.maxCol) classes += "selection-border-right ";
    } else if (rowHasVanDonCanhBao(row)) {
      const oid = getVanDonRowOrderId(row);
      const pKey = COLUMN_MAPPING[col] || col;
      if (!oid || !pendingChanges.get(oid)?.has(pKey)) {
        classes += "van-don-canh-bao-blink ";
      }
    }

    // Cursor style - hiển thị cursor cell khi hover (trừ khi đang trong input/select)
    classes += "cursor-cell ";

    return classes;
  };

  const vanDonVirtuosoComponents = useMemo(() => {
    const TableRow = React.forwardRef(({ item, children, ...rest }, ref) => {
      const orderId = getVanDonRowOrderId(item);
      const isSelected = Boolean(orderId && selectedRows.has(orderId));
      const mergedClass = [rest.className, isSelected ? 'bg-blue-50' : ''].filter(Boolean).join(' ').trim();
      return (
        <tr ref={ref} {...rest} className={mergedClass || undefined}>
          {children}
        </tr>
      );
    });
    TableRow.displayName = 'VanDonVirtuosoTableRow';
    return {
      Scroller: VanDonVirtuosoScroller,
      Table: VanDonVirtuosoTable,
      TableBody: VanDonVirtuosoTableBody,
      TableRow
    };
  }, [selectedRows]);

  const renderVanDonFilterTh = (col, idx, positionStyle, showFreezeShadow, isFixedCol) => {
    const key = COLUMN_MAPPING[col] || col;
    // Đồng bộ key với thanh toolbar để lọc song song không bị xung đột logic
    const filterKeyMap = {
      'Khu vực': 'market',
      'Mặt hàng': 'product',
      'Nhân viên Sale': 'nv_sale',
      'Nhân viên MKT': 'nv_mkt',
      'NV Vận đơn': 'nv_van_don',
      'Đơn vị vận chuyển': 'shipping_unit',
      'Page': 'ten_page',
      'Trạng thái giao hàng NB': 'delivery_status_nb',
      'Trạng thái giao hàng': 'delivery_status',
      'Trạng thái thu tiền': 'payment_status',
    };
    const filterKey = filterKeyMap[col] || col;
    const isCheckCol = col === 'Kết quả Check' || col === 'Kết quả check';
    const isNameCol = col === 'Name*';
    const isAddCol = col === 'Add';
    const isCityCol = col === 'City';
    const isProductCol = col === 'Mặt hàng';
    const isQtyCol = col === 'Số lượng mặt hàng 1' || col === 'Số lượng mặt hàng 2';
    const isCanhBaoFilterCol = normalizeColHeader(col) === normalizeColHeader(VAN_DON_CANH_BAO_COLUMN);

    const widthStyles = getColumnWidthStyles(col);
    /** `overflow: hidden` trên chính phần tử sticky làm hỏng sticky ngang trên nhiều trình duyệt. */
    const cellWidthStyles = isFixedCol
      ? { ...widthStyles, overflow: 'visible', textOverflow: 'clip' }
      : widthStyles;

    const headerCellStyle = isFixedCol
      ? {
        ...cellWidthStyles,
        ...positionStyle,
        background: '#f8f9fa',
        backgroundClip: 'padding-box',
        boxShadow: showFreezeShadow ? '2px 0 6px rgba(0,0,0,0.12)' : undefined,
      }
      : {
        ...widthStyles,
        ...positionStyle,
        background: '#f8f9fa',
      };

    const filterInputCls = 'w-full text-[11px] px-1.5 py-0.5 border rounded shadow-sm leading-tight';

    const isSortable = col !== 'STT';
    const isActiveSort = isSortable && sortColumn === col;
    const sortIcon = isActiveSort ? (sortDirection === 'asc' ? '▲' : '▼') : '';
    const onTitleClick = () => {
      if (!isSortable) return;
      if (sortColumn === col) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortColumn(col);
        setSortDirection('asc');
      }
    };

    return (
      <th
        data-col-idx={idx}
        key={`filter-${col}-${idx}`}
        className={`py-1 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] ${isQtyCol ? 'whitespace-normal text-[11px] leading-tight px-1' : 'whitespace-nowrap'} ${isCheckCol ? 'pl-2 pr-3' : isQtyCol ? '' : 'px-2'} ${isCanhBaoFilterCol ? 'max-w-[140px]' : ''}`}
        style={headerCellStyle}
      >
        <div
          className={`font-semibold mb-0.5 text-gray-700 ${isQtyCol ? 'text-[10px] leading-tight whitespace-normal break-words' : 'text-[11px] whitespace-nowrap'} ${isCheckCol ? 'text-left' : ''} ${isSortable ? 'cursor-pointer select-none' : ''} flex items-center gap-1`}
          onClick={onTitleClick}
        >
          <span>{col}</span>
          {isSortable && (
            <span className="text-gray-500 text-[10px]">{sortIcon}</span>
          )}
        </div>
        {col === 'STT' ? (
          <div className="text-[10px] text-gray-400">-</div>
        ) : col === 'Mã Tracking' ? (
          <div className="flex flex-col gap-0.5 relative" style={{ zIndex: 1002 }}>
            <select
              className="w-full text-[11px] px-1.5 py-0.5 border rounded bg-white font-semibold text-gray-700 shadow-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer leading-tight"
              value={filterValues.tracking_status || 'Tình trạng mã'}
              onChange={(e) => setFilterValues((p) => ({ ...p, tracking_status: e.target.value }))}
            >
              <option value="Tình trạng mã">Tình trạng mã</option>
              <option value="Tất cả có mã">Tất cả có mã</option>
              <option value="Trống">Trống</option>
              <option value="Toàn số">Toàn số</option>
            </select>
            {(filterValues.tracking_status === 'Tình trạng mã' || !filterValues.tracking_status) && (
              <div className="grid grid-cols-2 gap-0.5">
                <input
                  className={filterInputCls}
                  style={{ zIndex: 1002 }}
                  placeholder="Gồm…"
                  value={filterValues.tracking_include || ''}
                  onChange={(e) => setFilterValues((p) => ({ ...p, tracking_include: e.target.value }))}
                />
                <input
                  className={filterInputCls}
                  style={{ zIndex: 1002 }}
                  placeholder="Trừ…"
                  value={filterValues.tracking_exclude || ''}
                  onChange={(e) => setFilterValues((p) => ({ ...p, tracking_exclude: e.target.value }))}
                />
              </div>
            )}
          </div>
        ) : isCanhBaoFilterCol ? (
          <select
            className="w-full text-[10px] px-1 py-0.5 border rounded bg-white text-gray-700 shadow-sm focus:ring-1 focus:ring-blue-500 leading-tight"
            style={{ zIndex: 1002 }}
            value={filterValues.canh_bao_filter || ''}
            onChange={(e) => {
              setFilterValues((p) => ({ ...p, canh_bao_filter: e.target.value }));
            }}
          >
            <option value="">Tất cả</option>
            <option value="co_trung">Có trùng</option>
            <option value="khong_trung">Không trùng</option>
          </select>
        ) : DROPDOWN_OPTIONS[col] || DROPDOWN_OPTIONS[key] || [
          'Trạng thái giao hàng', 'Kết quả check', 'GHI CHÚ', 'Đơn vị vận chuyển',
          'Nhân viên Sale', 'Nhân viên MKT', 'Page', 'NV Vận đơn', 'Mặt hàng', 'Khu vực'
        ].includes(col) ? (
          <div className="relative w-full" style={{ zIndex: 1002, marginTop: '-0.125rem' }}>
            <MultiSelect
              compact
              label="Lọc..."
              options={getFilterMultiSelectOptions(col)}
              selected={filterValues[filterKey] || []}
              onChange={(vals) => setFilterValues((p) => ({ ...p, [filterKey]: vals }))}
            />
          </div>
        ) : ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2'].includes(col) ? (
          <input
            type="date"
            className={filterInputCls}
            style={{ zIndex: 1002 }}
            value={filterValues[filterKey] || ''}
            onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
          />
        ) : (
          <input
            type="text"
            className={filterInputCls}
            style={{ zIndex: 1002 }}
            placeholder="Nhập... (Dùng dấu phẩy , để lọc nhiều)"
            value={filterValues[filterKey] || ''}
            onChange={(e) => setFilterValues((p) => ({ ...p, [filterKey]: e.target.value }))}
          />
        )}
      </th>
    );
  };

  const renderVanDonDataCell = useCallback((row, rIdx, col, cIdx, cellStyle) => {
    const orderId = getVanDonRowOrderId(row);
    // Cột FFM phải bám key DB `delivery_status`, không map sang NB.
    const key = col === 'Trạng thái giao hàng' ? 'delivery_status' : (COLUMN_MAPPING[col] || col);
    const pendingDisplayKey = key;
    let val = getVanDonGridCellValue(row, col);
    if (!val && col === 'Ngày up bill') {
      val = row.ngayupbill ?? row.ngay_up_bill ?? '';
    }
    if (!val && (col === 'Tiền Việt đã đối soát' || col === 'Tiền đã thanh toán')) {
      val = row.reconciled_vnd ?? '';
    }
    const pendingInfo = pendingChanges.get(orderId)?.get(pendingDisplayKey);
    if (pendingInfo) {
      val = pendingInfo.newValue;
    }
    val = coalesceVanDonDisplayValue(val);
    const displayVal = ['Ngày lên đơn', 'Ngày đóng hàng', 'Ngày đẩy đơn', 'Ngày có mã tracking', 'Ngày Kế toán đối soát với FFM lần 2', 'Ngày up bill'].includes(col)
      ? formatDate(val)
      : isVanDonMoneyGridAppKey(col)
        ? (() => {
          const n = parseVietnameseMoneyToNumber(val === '' || val == null ? null : val);
          return n != null && Number.isFinite(n) ? n.toLocaleString('vi-VN') : '';
        })()
        : val;

    const usePresetSelectMatch =
      col === 'Kết quả Check' ||
      col === 'Trạng thái giao hàng' ||
      normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng NB');
    let selectControlValue = val === '' || val == null ? '' : String(val);
    if (usePresetSelectMatch) {
      selectControlValue = matchVanDonSelectToOptionList(selectControlValue, getCellEditSelectOptions(col));
    }

    const colLower = String(col || '').trim().toLowerCase();
    const isCarrierCol = colLower === 'đơn vị vận chuyển';
    const isTrackingCol = colLower === 'mã tracking';
    const isCanhBaoCol = normalizeColHeader(col) === normalizeColHeader(VAN_DON_CANH_BAO_COLUMN);
    // Không khóa sửa theo tab "all".
    const isReadonlyOrderDataTab = false;

    const mergedCellStyle = { ...(cellStyle || {}) };
    const isFixedCol = cellStyle?.zIndex >= 5000;
    
    // Ô văn bản dài: bỏ overflow hidden trên <td> (cột không sticky) — tránh cắt textarea / khó click nhập.
    // QUAN TRỌNG: Không ghi đè overflow cho cột sticky vì sẽ làm hỏng sticky positioning
    if (
      !isFixedCol &&
      !isReadonlyEditTab &&
      !isTrackingCol &&
      !isCanhBaoCol &&
      !(isReadonlyOrderDataTab && isCarrierCol) &&
      isVanDonUserEditableColumn(col) &&
      colInList(col, LONG_TEXT_COLS) &&
      normalizeColHeader(col) !== normalizeColHeader(VAN_DON_CANH_BAO_COLUMN)
    ) {
      mergedCellStyle.overflow = 'visible';
      mergedCellStyle.textOverflow = 'clip';
    }

    return (
      <td
        key={`${orderId || `r${rIdx}`}-${col}`}
        data-van-r={rIdx}
        data-van-c={cIdx}
        className={getCellClass(row, col, String(displayVal), rIdx, cIdx)}
        style={mergedCellStyle}
        onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
        onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
      >
        {col === 'STT' ? (
          row.rowIndex || (currentPage - 1) * effectiveRowsPerPage + rIdx + 1
        ) : col === 'Lịch sử thay đổi' ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openOrderHistoryModal(orderId);
            }}
            disabled={!orderId || historyLoadingOrderId === orderId}
            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            title="Xem lịch sử thay đổi của đơn"
          >
            {historyLoadingOrderId === orderId ? 'Đang tải...' : 'Xem'}
          </button>
        ) : isReadonlyEditTab || isTrackingCol || isCanhBaoCol || (isReadonlyOrderDataTab && isCarrierCol) || !orderId ? (
          isCanhBaoCol ? (
            <span className="whitespace-pre-wrap break-words align-top text-left inline-block max-w-full">
              {displayVal}
            </span>
          ) : (
            displayVal
          )
        ) : col === 'Kết quả Check' ||
          col === 'Trạng thái giao hàng' ||
          normalizeColHeader(col) === normalizeColHeader('Trạng thái giao hàng NB') ? (
          /**
           * Trước `DROPDOWN_OPTIONS[col]`: cả «Trạng thái giao hàng» và NB dùng cùng `DELIVERY_STATUS_PRESETS`;
           * «Trạng thái giao hàng» vẫn lưu qua COLUMN_MAPPING → khóa NB. Gộp thêm giá trị distinct trên lưới trong getCellEditSelectOptions.
           */
          <select
            className="w-full h-full bg-transparent border-none outline-none text-sm flex items-center"
            style={{ padding: 0, margin: 0, lineHeight: '38px' }}
            value={selectControlValue === '' || selectControlValue == null ? '' : String(selectControlValue)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {getCellEditSelectOptions(col)
              .filter((o) => o === '' || !isVanDonSemanticEmpty(o))
              .map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
          </select>
        ) : DROPDOWN_OPTIONS[col] ? (
          <select
            className="w-full h-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
            value={val === '' || val == null ? '' : String(val)}
            onChange={(e) => handleCellChange(orderId, key, e.target.value)}
          >
            {DROPDOWN_OPTIONS[col].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : isVanDonUserEditableColumn(col) && colInList(col, LONG_TEXT_COLS) ? (
          <textarea
            key={`${orderId}-${col}-${String(displayVal)}`}
            data-van-cell-sync="1"
            data-van-order={orderId}
            data-van-col={key}
            defaultValue={String(displayVal)}
            rows={isLongTextExpanded ? 6 : 2}
            onChange={(e) => {
              vanDonLongTextDraftRef.current.set(`${orderId}\u001e${key}`, e.target.value);
            }}
            onBlur={(e) => {
              const newValue = e.target.value;
              vanDonLongTextDraftRef.current.delete(`${orderId}\u001e${key}`);
              if (newValue !== String(displayVal)) {
                handleCellChange(orderId, key, newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                vanDonLongTextDraftRef.current.delete(`${orderId}\u001e${key}`);
                e.target.value = String(displayVal);
                e.target.blur();
              } else if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                const newValue = e.target.value;
                vanDonLongTextDraftRef.current.delete(`${orderId}\u001e${key}`);
                if (newValue !== String(displayVal)) {
                  handleCellChange(orderId, key, newValue);
                }
                e.target.blur();
              }
            }}
            onFocus={(e) => {
              setSelection({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
            }}
            className="block w-full min-h-[2.5rem] outline-none bg-transparent border-none p-0 text-sm resize-y leading-snug"
          />
        ) : isVanDonUserEditableColumn(col) ? (
          <input
            key={`${orderId}-${col}-${String(displayVal)}`}
            type="text"
            data-van-cell-sync="1"
            data-van-order={orderId}
            data-van-col={key}
            defaultValue={String(displayVal)}
            onBlur={(e) => {
              const newValue = e.target.value;
              if (isVanDonMoneyGridAppKey(key)) {
                if (!vanDonMoneyCellValuesEqual(newValue, val)) {
                  handleCellChange(orderId, key, newValue);
                }
              } else if (newValue !== String(displayVal)) {
                handleCellChange(orderId, key, newValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const newValue = e.target.value;
                if (isVanDonMoneyGridAppKey(key)) {
                  if (!vanDonMoneyCellValuesEqual(newValue, val)) {
                    handleCellChange(orderId, key, newValue);
                  }
                } else if (newValue !== String(displayVal)) {
                  handleCellChange(orderId, key, newValue);
                }
                e.target.blur();
              } else if (e.key === 'Escape') {
                e.target.value = String(displayVal);
                e.target.blur();
              }
            }}
            onFocus={(e) => {
              e.target.select();
              setSelection({ startRow: rIdx, startCol: cIdx, endRow: rIdx, endCol: cIdx });
            }}
            className="w-full h-full outline-none bg-transparent border-none p-0 text-sm"
          />
        ) : (
          displayVal
        )}
      </td>
    );
  }, [
    pendingChanges, selectionBounds, isReadonlyEditTab, isLongTextExpanded,
    currentPage, effectiveRowsPerPage, viewMode,
    handleCellChange, handleMouseDown, handleMouseEnter, setSelection,
    getCellClass, formatDate, getCellEditSelectOptions, vanDonDistinctFilterOptions,
    vanDonLongTextDraftRef, effectiveFixedColumns, openOrderHistoryModal, historyLoadingOrderId
  ]);

  // Không cho double click chọn/kéo text để "mang data đi" trong bảng (trừ input/select đang chỉnh sửa).
  const blockTableDoubleClickCopy = (e) => {
    const target = e?.target;
    if (!target) return;
    // Cho phép double click trong các input/select/textarea để user vẫn sửa được.
    const editable = target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (editable) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const blockTableDragStart = (e) => {
    // Chặn drag text/drag selection từ bảng.
    e.preventDefault();
    e.stopPropagation();
  };

  const hasVanDonListAccess =
    dataSource === 'hcm' ? canView('ORDERS_LIST_HCM') : canView('ORDERS_LIST');
  if (!hasVanDonListAccess) {
    const permHint = dataSource === 'hcm' ? 'ORDERS_LIST_HCM' : 'ORDERS_LIST';
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này ({permHint}).
      </div>
    );
  }

  /* End Component Logic */
  return (
    <div className="bg-gray-50 flex flex-col h-[calc(100vh-64px)] min-h-0 w-full max-w-none overflow-hidden">
      {/* Hai hàng: (1) tiêu đề + tab + tìm + ngày — (2) bộ lọc MultiSelect + trạng thái + TẢI LẠI */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-50 flex-shrink-0 w-full">
        <div ref={filterToolbarRef} className="w-full max-w-none mx-auto px-2 sm:px-3 py-1.5 min-w-0 flex flex-col gap-1.5">
          {/* Hàng 1 */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full">
            <div className="flex items-center gap-1.5 shrink-0">
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Fbe61f44f.%E1%BA%A2nh.021347.png"
                alt="Logo"
                className="h-6 object-contain"
              />
              <h1 className="text-sm font-bold text-gray-800 leading-none whitespace-nowrap">QUẢN LÝ VẬN ĐƠN</h1>
            </div>
            <div className="shrink-0 w-px h-4 bg-gray-200 self-center" aria-hidden />
            <div className="flex shrink-0 bg-gray-100 p-0.5 rounded-md border border-gray-200">
              {[
                { id: 'all', label: 'Đơn nhắc hộ', icon: '📋' },
                { id: 'ca_nhan', label: 'Đơn cá nhân', icon: '👤' },
                { id: 'readonly_all', label: 'Xem tất cả', icon: '👁️' },
                { id: 'japan', label: 'Đơn Nhật', icon: '🇯🇵' },
                { id: 'hanoi', label: 'Đẩy đơn HN', icon: '🏛️' }
              ]
                .filter((tab) => {
                  if (tab.id === 'hanoi') {
                    return isAdmin || canViewHaNoi;
                  }
                  return true;
                })
                .map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`shrink-0 whitespace-nowrap px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold rounded transition-all flex items-center gap-0.5 ${bolActiveTab === tab.id
                      ? 'bg-white text-[#F37021] shadow-sm'
                      : 'text-gray-600 hover:bg-white/50 hover:text-[#F37021]'
                      }`}
                    onClick={() => {
                      setBolActiveTab(tab.id);
                      setCurrentPage(1);
                      if (tab.id !== 'hanoi') {
                        setSelectedRows(new Set());
                      }
                    }}
                  >
                    <span className="text-[10px] sm:text-xs leading-none">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
            </div>
            <div className="shrink-0 w-px h-4 bg-gray-200 self-center" aria-hidden />
            <div
              className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200 shrink-0"
              title={`Lọc thời gian theo cột ngày. «${BOL_TOOLBAR_DATE_TYPE_ALL}»: không áp dụng khoảng Từ–Đến lên một cột (vẫn có thể lọc ngày qua ô header cột).`}
            >
              <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap" aria-hidden>
                📅
              </span>
              <div className="flex items-center gap-1 flex-nowrap">
                <select
                  className="text-[10px] sm:text-[11px] px-1 py-0.5 border border-gray-300 rounded bg-white font-bold text-blue-800 leading-tight max-w-[118px]"
                  value={bolDateType}
                  onChange={(e) => {
                    setBolDateType(e.target.value);
                  }}
                  aria-label="Loại ngày lọc toolbar"
                >
                  <option value={BOL_TOOLBAR_DATE_TYPE_ALL}>{BOL_TOOLBAR_DATE_TYPE_ALL}</option>
                  <option value="Ngày lên đơn">Lên đơn</option>
                  <option value="Ngày đóng hàng">Đóng hàng</option>
                  <option value="Ngày đẩy đơn">Đẩy đơn</option>
                  <option value="Ngày có mã tracking">Có Tracking</option>
                </select>
                <input
                  type="date"
                  value={dateFrom || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateFrom(v);
                    if (v) setEnableDateFilter(true);
                  }}
                  className="text-[10px] sm:text-[11px] px-1 py-0.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 leading-tight w-[118px] shrink-0"
                />
                <span className="text-[10px] text-gray-500 font-bold shrink-0">→</span>
                <input
                  type="date"
                  value={dateTo || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateTo(v);
                    if (v) setEnableDateFilter(true);
                  }}
                  className="text-[10px] sm:text-[11px] px-1 py-0.5 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 leading-tight w-[118px] shrink-0"
                />
                <label className="flex items-center gap-0.5 text-[10px] text-gray-700 cursor-pointer whitespace-nowrap shrink-0">
                  <input
                    type="checkbox"
                    checked={enableDateFilter}
                    onChange={(e) => {
                      setEnableDateFilter(e.target.checked);
                    }}
                    className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span>Áp dụng (Enter)</span>
                </label>
              </div>
            </div>
          </div>

          {/* Hàng 2 — bộ lọc MultiSelect + trạng thái / Tải lại (mọi tab) */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 w-full justify-between sm:items-center">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-1 bg-purple-50 px-1.5 py-0.5 rounded-md border border-purple-200 shrink-0" title="Thị trường">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">🌍</span>
                <div className="relative" style={{ minWidth: '112px', zIndex: 1002 }}>
                  <MultiSelect
                    compact
                    label="Chọn thị trường..."
                    options={getFilterMultiSelectOptions('Khu vực')}
                    selected={filterValues.market || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, market: vals }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded-md border border-green-200 shrink-0" title="Sản phẩm">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">📦</span>
                <div className="relative" style={{ minWidth: '112px', zIndex: 1002 }}>
                  <MultiSelect
                    compact
                    label="Chọn sản phẩm..."
                    options={getFilterMultiSelectOptions('Mặt hàng')}
                    selected={filterValues.product || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, product: vals }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-200 shrink-0" title="NV Sale">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">👤</span>
                <div className="relative" style={{ minWidth: '118px', zIndex: 1001 }}>
                  <MultiSelect
                    compact
                    label="Chọn NV Sale..."
                    options={getFilterMultiSelectOptions('Nhân viên Sale')}
                    selected={filterValues.nv_sale || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, nv_sale: vals }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-200 shrink-0" title="NV MKT">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">📣</span>
                <div className="relative" style={{ minWidth: '118px', zIndex: 1000 }}>
                  <MultiSelect
                    compact
                    label="Chọn NV MKT..."
                    options={getFilterMultiSelectOptions('Nhân viên MKT')}
                    selected={filterValues.nv_mkt || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, nv_mkt: vals }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200 shrink-0" title="NV Vận đơn">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">🚚</span>
                <div className="relative" style={{ minWidth: '118px', zIndex: 999 }}>
                  <MultiSelect
                    compact
                    label="Chọn NV Vận đơn..."
                    options={getFilterMultiSelectOptions('NV Vận đơn')}
                    selected={filterValues.nv_van_don || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, nv_van_don: vals }));
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 bg-cyan-50 px-1.5 py-0.5 rounded-md border border-cyan-200 shrink-0" title="Đơn vị vận chuyển">
                <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">🚛</span>
                <div className="relative" style={{ minWidth: '124px', zIndex: 998 }}>
                  <MultiSelect
                    compact
                    label="Chọn đơn vị..."
                    options={getFilterMultiSelectOptions('Đơn vị vận chuyển')}
                    selected={filterValues.shipping_unit || []}
                    onChange={(vals) => {
                      setFilterValues((prev) => ({ ...prev, shipping_unit: vals }));
                    }}
                  />
                </div>
              </div>

              <div
                className="flex items-center gap-2 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-200 shrink-0 min-w-0 max-w-full"
                title="Lọc theo tên page (fanpage); ô tìm trong dropdown MultiSelect. Tìm nhanh: cụm từ trong một cột (mã đơn / SĐT / tên / địa chỉ…), không AND từng từ trên cả hàng."
              >
                {(bolActiveTab === 'hanoi' || bolActiveTab === 'readonly_all') && (
                  <>
                    <div className="flex items-start gap-1.5 min-w-[180px]">
                      <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap mt-1">📌 Mã đơn</span>
                      <textarea
                        className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded bg-white leading-tight min-h-[42px] w-[200px] resize-y"
                        placeholder={"Mỗi dòng 1 mã — bảng theo đúng thứ tự dán:\nFit87d8a7454\nFit3f482a4d"}
                        value={filterValues.tracking_bulk_codes || ''}
                        onChange={(e) => setFilterValues((prev) => ({ ...prev, tracking_bulk_codes: e.target.value }))}
                        title="Dán nhiều mã đơn (mỗi dòng 1 mã). Thứ tự hàng trên lưới = thứ tự dòng đã dán."
                      />
                    </div>
                    <div className="h-4 w-px bg-slate-200 shrink-0 self-center" aria-hidden />
                  </>
                )}
                <div className="flex items-center gap-1 shrink-0" title="Page (page_name)">
                  <span className="text-[10px] font-semibold text-gray-700 whitespace-nowrap">📄</span>
                  <div className="relative" style={{ minWidth: '132px', zIndex: 997 }}>
                    <MultiSelect
                      compact
                      label="Page…"
                      options={getFilterMultiSelectOptions('Page')}
                      selected={filterValues.ten_page || []}
                      onChange={(vals) => {
                        setFilterValues((prev) => ({ ...prev, ten_page: vals }));
                      }}
                    />
                  </div>
                </div>
                <div className="h-4 w-px bg-slate-200 shrink-0 self-center" aria-hidden />
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <label
                    htmlFor="van-don-toolbar-quick-search"
                    className="text-[10px] font-semibold text-gray-700 whitespace-nowrap shrink-0"
                  >
                    Tìm
                  </label>
                  <input
                    id="van-don-toolbar-quick-search"
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder="Mã đơn, SĐT, tên, địa chỉ…"
                    title="Tra theo cụm từ (khớp trong một ô). SĐT ≥6 số: cho phép cách ngăn cách giữa các chữ số."
                    value={customerQuickSearch}
                    onChange={(e) => setCustomerQuickSearch(e.target.value)}
                    className="min-w-[100px] w-[min(200px,32vw)] max-w-[260px] shrink text-[10px] px-1.5 py-0.5 border border-gray-300 rounded focus:ring-1 focus:ring-[#F37021] focus:border-[#F37021] bg-white leading-tight"
                  />
                  {customerQuickSearch.trim() ? (
                    <button
                      type="button"
                      onClick={() => setCustomerQuickSearch('')}
                      className="text-[10px] text-gray-500 hover:text-gray-800 px-1 py-0.5 rounded border border-gray-200 hover:bg-gray-100 shrink-0"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 border-t border-gray-200 pt-1.5 mt-0.5 sm:border-t-0 sm:pt-0 sm:mt-0 sm:border-l sm:border-gray-200 sm:pl-1.5 sm:ml-0.5 bg-white w-full sm:w-auto justify-end sm:justify-start">
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-50 rounded border border-gray-100">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${(useBackendPagination ? totalRecords : getFilteredData.length) > 0 ? 'bg-green-500' : 'bg-red-500'
                    }`}
                />
                <span className="text-[9px] uppercase font-bold text-gray-500 whitespace-nowrap">
                  {(useBackendPagination ? totalRecords : getFilteredData.length) > 0
                    ? `${(useBackendPagination ? totalOrdersCount : getFilteredData.length).toLocaleString('vi-VN')} ĐƠN`
                    : 'NO DATA'}
                </span>
              </div>
              <button
                onClick={() => refetchVanDonData()}
                disabled={isQueryLoading}
                className="px-2 py-0.5 bg-[#F37021] hover:bg-[#e55f1a] text-white rounded text-[10px] sm:text-[11px] font-bold transition-all disabled:opacity-50 flex items-center gap-0.5 shadow-sm whitespace-nowrap"
              >
                {isQueryLoading ? (
                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span>🔄</span>
                )}
                {isQueryLoading ? '...' : 'TẢI LẠI'}
              </button>
              <button
                type="button"
                onClick={handleExportMaDonExcel}
                disabled={exportingMaDon || isQueryLoading || permissionsLoading}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] sm:text-[11px] font-bold transition-all disabled:opacity-50 flex items-center gap-0.5 shadow-sm whitespace-nowrap"
                title="Excel: tất cả các cột đang bật trên lưới (cùng định dạng như copy), thứ tự hàng theo cột đang sort — theo bộ lọc; tải đủ trang khi phân trang backend"
              >
                {exportingMaDon ? (
                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span>📥</span>
                )}
                {exportingMaDon ? '…' : 'Excel (cột lưới)'}
              </button>
              <button
                type="button"
                onClick={handleExportFilteredExcel}
                disabled={exportingFilteredExcel || isQueryLoading || permissionsLoading}
                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] sm:text-[11px] font-bold transition-all disabled:opacity-50 flex items-center gap-0.5 shadow-sm whitespace-nowrap"
                title="Excel: các cột đang bật trên lưới, thứ tự hàng theo sort — toàn bộ dòng khớp bộ lọc (kể cả nhiều trang khi phân trang backend)"
              >
                {exportingFilteredExcel ? (
                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span>📤</span>
                )}
                {exportingFilteredExcel ? '…' : 'Excel theo lọc'}
              </button>
              <button
                type="button"
                onClick={() => setShowExportDateDialog(true)}
                disabled={exportingCustomExcel || isQueryLoading || permissionsLoading}
                className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-[10px] sm:text-[11px] font-bold transition-all disabled:opacity-50 flex items-center gap-0.5 shadow-sm whitespace-nowrap"
                title="Xuất Excel với các cột cố định theo khoảng ngày lên đơn"
              >
                {exportingCustomExcel ? (
                  <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <span>📊</span>
                )}
                {exportingCustomExcel ? '…' : 'Excel theo ngày'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main: flex cột — bảng chiếm hết chiều cao còn lại (full viewport trừ header/toolbar/pagination) */}
      <div className="flex-1 min-h-0 flex flex-col gap-0.5 p-0.5 bg-[#f4f7fa] w-full min-w-0 overflow-hidden">

        {/* Thanh thao tác bảng (bộ lọc chính nằm ở header 2 hàng phía trên) */}
        <div className="relative z-[100] shrink-0 bg-white rounded-md shadow-sm border border-gray-200 px-1.5 py-0.5 min-w-0 w-full">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-0">
            {/* Toolbar Actions Group */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={refreshData}
                className="p-0.5 px-1.5 hover:bg-red-50 text-red-600 rounded text-[11px] transition-colors flex items-center gap-0.5 group flex-shrink-0"
                title="Xóa tất cả bộ lọc"
              >
                <span className="group-hover:rotate-90 transition-transform text-[10px]">✕</span>
                <span className="font-bold">XÓA LỌC</span>
              </button>
              <div className="h-3 w-px bg-gray-300 mx-0.5"></div>
              <button
                onClick={() => setSyncPopoverOpen(true)}
                className={`p-0.5 px-1.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 relative border ${
                  totalPendingCount > 0 
                  ? 'bg-orange-50 border-orange-200 text-orange-700 animate-pulse' 
                  : 'bg-blue-50 border-blue-100 text-blue-700'
                }`}
                title="Xem chi tiết các thay đổi chưa lưu"
              >
                🔄 Trạng thái
                {totalPendingCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-orange-600 text-white text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 shadow-md border border-white font-black">
                    {totalPendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleUpdateAll}
                disabled={isReadonlyEditTab}
                className={`p-0.5 px-1.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${totalPendingCount > 0
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse ring-2 ring-red-300 ring-offset-1'
                    : 'bg-[#F37021] hover:bg-[#e55f1a] text-white'
                  }`}
                title={isReadonlyEditTab ? 'Tab chỉ xem: không cho cập nhật/chỉnh sửa' : 'Ghi các thay đổi đang chờ xuống CSDL'}
              >
                ✅ Xác nhận lưu
                {totalPendingCount > 0 && (
                  <span className="bg-white text-red-600 font-black px-1.5 py-0.25 rounded-sm shadow-inner text-[10px]">
                    {totalPendingCount} thay đổi
                  </span>
                )}
              </button>

              <button onClick={() => setShowColumnSettings(true)} className="p-0.5 px-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-[11px] font-bold transition-all flex items-center gap-0.5">
                ⚙️ Cài đặt cột
              </button>

              {/* Điều chỉnh số cột cố định */}
              <div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 border border-gray-300">
                <span className="text-[11px] text-gray-700 font-medium whitespace-nowrap">📌 Ghim:</span>
                <button
                  onClick={() => setNumFixedColumns(Math.max(1, numFixedColumns - 1))}
                  disabled={numFixedColumns <= 1}
                  className="w-5 h-5 flex items-center justify-center bg-white hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 rounded text-xs font-bold border border-gray-300 transition-colors"
                  title="Giảm số cột cố định"
                >
                  −
                </button>
                <span className="text-[11px] font-bold text-gray-800 min-w-[20px] text-center">{numFixedColumns}</span>
                <button
                  onClick={() => setNumFixedColumns(Math.min(5, currentColumns.length, numFixedColumns + 1))}
                  disabled={numFixedColumns >= Math.min(5, currentColumns.length)}
                  className="w-5 h-5 flex items-center justify-center bg-white hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-gray-700 rounded text-xs font-bold border border-gray-300 transition-colors"
                  title="Tăng số cột cố định"
                >
                  +
                </button>
                <span className="text-[10px] text-gray-500 whitespace-nowrap">cột</span>
              </div>

              {/* Phân FFM button - chỉ hiển thị trong tab Hà Nội */}
              {bolActiveTab === 'hanoi' && (
                <div className="relative" ref={phanFFMRef}>
                  <button
                    onClick={() => setShowPhanFFMDropdown(!showPhanFFMDropdown)}
                    disabled={selectedRows.size === 0}
                    className="p-0.5 px-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-[11px] font-bold transition-all flex items-center gap-0.5 shadow-sm"
                  >
                    📦 Phân FFM {selectedRows.size > 0 && `(${selectedRows.size})`}
                  </button>
                  {showPhanFFMDropdown && selectedRows.size > 0 && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-[12000] min-w-[150px]">
                      <button
                        onClick={async () => {
                          await handlePhanFFM('MGT');
                          setShowPhanFFMDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 first:rounded-t-lg"
                      >
                        MGT
                      </button>
                      <button
                        onClick={async () => {
                          await handlePhanFFM('T&T');
                          setShowPhanFFMDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 last:rounded-b-lg"
                      >
                        T&T
                      </button>
                    </div>
                  )}
                </div>
              )}


              {isReadonlyAllTab && (
                <span className="px-2 py-1 rounded bg-gray-100 border border-gray-200 text-[11px] font-semibold text-gray-600">
                  Chế độ chỉ xem - không cho sửa
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-end justify-end gap-x-4 gap-y-1 flex-shrink-0 sm:ml-auto">
              <div className="text-right flex flex-col items-end leading-tight">
                <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Số lượng đơn</span>
                <span className="text-xs font-black text-blue-600 tabular-nums">{totalOrdersCount.toLocaleString('vi-VN')}</span>
              </div>
              <div className="text-right flex flex-col items-end leading-tight">
                <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Tổng tiền</span>
                <span className="text-xs font-black text-emerald-600 tabular-nums">
                  {totalMoney.toLocaleString('vi-VN')} ₫
                </span>
              </div>
              <div className="text-right flex flex-col items-end leading-tight">
                <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Tổng phí ship</span>
                <span className="text-xs font-black text-teal-700 tabular-nums">
                  {vanDonHeaderMoneyExtras.totalShip.toLocaleString('vi-VN')} ₫
                </span>
              </div>
              <div className="text-right flex flex-col items-end leading-tight">
                <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider max-w-[140px]">
                  Số đơn đã thu (có bill)
                </span>
                <span className="text-xs font-black text-indigo-600 tabular-nums">
                  {vanDonHeaderMoneyExtras.paidBillCount.toLocaleString('vi-VN')}
                </span>
              </div>
              <div className="text-right flex flex-col items-end leading-tight">
                <span className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Số tiền đã thu</span>
                <span className="text-xs font-black text-amber-700 tabular-nums">
                  {vanDonHeaderMoneyExtras.paidBillSum.toLocaleString('vi-VN')} ₫
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Vùng bảng + phân trang: chiếm toàn bộ chiều cao còn lại */}
        <div className="flex-1 min-h-0 flex flex-col gap-1 min-w-0 w-full overflow-hidden">
          <div className="relative z-0 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden flex flex-col min-h-0 flex-1 w-full">
            {(isQueryLoading && allData.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center min-h-0 bg-white rounded-lg">
                <div className="relative w-16 h-16 mb-4">
                  <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[#0052cc] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-gray-500 font-medium animate-pulse text-lg">Đang tải dữ liệu vận đơn...</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* 1. FIXED HEADER AREA (FFM Style) */}
                <div
                  ref={vanDonHeaderContainerRef}
                  className="overflow-hidden border-b-2 border-gray-300 bg-[#f8f9fa] shrink-0 shadow-sm"
                  style={{ paddingRight: '15px' }}
                >
                  <table
                    className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed"
                    style={{ tableLayout: 'fixed' }}
                  >
                    <thead className="bg-[#f8f9fa]">
                      <tr className="bg-gray-100 align-top">
                        {bolActiveTab === 'hanoi' && (
                          <th className="py-1 border-b-2 border-r border-gray-300 align-top bg-[#f8f9fa] whitespace-nowrap px-2 relative z-[16000]" style={{ width: VAN_DON_CHECKBOX_COL_PX, minWidth: VAN_DON_CHECKBOX_COL_PX, transform: 'translateX(var(--vd-sl, 0px))' }}>
                            <div className="flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={(() => {
                                  const withId = paginatedData.map((r) => getVanDonRowOrderId(r)).filter(Boolean);
                                  return withId.length > 0 && withId.every((id) => selectedRows.has(id));
                                })()}
                                onChange={(e) => {
                                  if (e.target.checked) selectAllRows();
                                  else deselectAllRows();
                                }}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                              />
                            </div>
                          </th>
                        )}
                        {currentColumns.map((col, idx) => {
                          const isFixed = idx < effectiveFixedColumns;
                          const style = isFixed
                            ? { position: 'relative', zIndex: 15000, background: '#f8f9fa', boxShadow: idx === effectiveFixedColumns - 1 ? '2px 0 6px rgba(0,0,0,0.12)' : '2px 0 4px rgba(0,0,0,0.08)', transform: 'translateX(var(--vd-sl, 0px))' }
                            : { position: 'relative', zIndex: 10200 };
                          return renderVanDonFilterTh(col, idx, style, isFixed && idx === effectiveFixedColumns - 1, isFixed);
                        })}
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* 2. SCROLLABLE BODY (Virtualized) */}
                {getFilteredData.length === 0 ? (
                  <div
                    className="flex-1 overflow-auto overscroll-contain bg-white relative"
                    onScroll={onTableScroll}
                    ref={(el) => {
                      if (el) {
                        tableRef.current = el;
                        horizontalScrollHostRef.current = el;
                        // Duy trì vị trí scroll khi chuyển giữa các state
                        if (vanDonHeaderContainerRef.current) {
                          el.scrollLeft = vanDonHeaderContainerRef.current.scrollLeft;
                        }
                      }
                    }}
                  >
                    <div className="sticky left-0 w-full h-64 flex justify-center items-center text-gray-500 italic z-50 pointer-events-none">
                      Không tìm thấy dữ liệu phù hợp
                    </div>
                    <table
                      className="border-separate border-spacing-0 w-max text-[13px] leading-tight table-fixed font-sans"
                      style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}
                    >
                      <tbody>
                        <tr className="h-0 pointer-events-none">
                          {bolActiveTab === 'hanoi' && (
                            <td style={{ width: VAN_DON_CHECKBOX_COL_PX, minWidth: VAN_DON_CHECKBOX_COL_PX }} className="p-0 border-none" />
                          )}
                          {currentColumns.map((col, idx) => (
                            <td key={idx} style={getColumnWidthStyles(col)} className="p-0 border-none" />
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col">
                    <TableVirtuoso
                      data={sortedData}
                      style={{ height: '100%', minHeight: 0, width: '100%', flex: '1 1 auto' }}
                      scrollerRef={(el) => {
                        if (el) {
                          tableRef.current = el;
                          horizontalScrollHostRef.current = el;
                          el.addEventListener('scroll', onTableScroll);
                          if (vanDonHeaderContainerRef.current) {
                            el.scrollLeft = vanDonHeaderContainerRef.current.scrollLeft;
                          }
                          const sl = el.scrollLeft || 0;
                          el.style.setProperty('--vd-sl', sl + 'px');
                          if (vanDonHeaderContainerRef.current) {
                            vanDonHeaderContainerRef.current.style.setProperty('--vd-sl', sl + 'px');
                          }
                        }
                      }}
                      components={vanDonVirtuosoComponents}
                      overscan={150}
                      itemContent={(rIdx, row) => (
                        <VanDonRow
                          row={row}
                          rIdx={rIdx}
                          currentColumns={currentColumns}
                          effectiveFixedColumns={effectiveFixedColumns}
                          bolActiveTab={bolActiveTab}
                          selectedRows={selectedRows}
                          pendingChanges={pendingChanges}
                          selectionBounds={selectionBounds}
                          getStickyLeftPx={getStickyLeftPx}
                          getColumnWidthStyles={getColumnWidthStyles}
                          renderVanDonDataCell={renderVanDonDataCell}
                          toggleRowSelection={toggleRowSelection}
                          isLongTextExpanded={isLongTextExpanded}
                          currentPage={currentPage}
                          effectiveRowsPerPage={effectiveRowsPerPage}
                        />
                      )}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Improved Pagination Footer (FFM Style) */}
          <div className="shrink-0 bg-white p-3 rounded-lg shadow-sm flex justify-center items-center gap-4 border border-gray-200 w-full">
            <button
              disabled={currentPage <= 1 || isQueryLoading}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="px-4 py-2 bg-[#0052cc] text-white rounded disabled:bg-gray-300 font-bold shadow-sm hover:bg-[#0747a6] transition-colors flex items-center gap-2"
            >
              <span> Trang trước</span>
            </button>

            <div className="flex items-center gap-1.5 min-w-[120px] justify-center">
              <span className="text-sm font-bold text-gray-700 bg-gray-100 px-4 py-2 rounded-full border border-gray-200 shadow-inner">
                Trang {currentPage} / {totalPages || 1}
              </span>
              {totalRecords > 0 && (
                <span className="text-[10px] text-gray-400 font-bold uppercase ml-1">
                  (
                  {useBackendPagination
                    ? `${getFilteredData.length.toLocaleString()} dòng · ${totalRecords.toLocaleString()} tổng`
                    : `${getFilteredData.length.toLocaleString()} kết quả`}
                  )
                </span>
              )}
            </div>

            <button
              disabled={currentPage >= totalPages || isQueryLoading}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="px-4 py-2 bg-[#0052cc] text-white rounded disabled:bg-gray-300 font-bold shadow-sm hover:bg-[#0747a6] transition-colors flex items-center gap-2"
            >
              <span>Trang sau </span>
            </button>

            <div className="flex items-center gap-2 ml-4 bg-blue-50/50 px-3 py-1.5 rounded-lg border border-blue-100">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Số dòng:</label>
              <select
                className="border-none bg-transparent text-sm font-black text-[#0052cc] focus:ring-0 p-0 cursor-pointer"
                value={rowsPerPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRowsPerPage(val);
                  setCurrentPage(1);
                }}
              >
                {(bolActiveTab === 'readonly_all' ? [50, 70, 100, 200, 500, 1000] : [50, 70, 100, 200, 500]).map((v) => (
                  <option key={v} value={v}>{v} dòng</option>
                ))}
              </select>
            </div>
          </div>
        </div>


        {/* Selection Summary Bar */}
        {calculatedSummary && calculatedSummary.count > 1 && (
          <div className="selection-summary-bar">
            <div className="summary-item">
              <span className="summary-label">Số ô</span>
              <span className="summary-value">{calculatedSummary.count}</span>
            </div>
            {calculatedSummary.sum !== 0 && (
              <>
                <div className="divider"></div>
                <div className="summary-item">
                  <span className="summary-label">Tổng</span>
                  <span className="summary-value">{calculatedSummary.sum.toLocaleString('vi-VN')}</span>
                </div>
                <div className="divider"></div>
                <div className="summary-item">
                  <span className="summary-label">TB</span>
                  <span className="summary-value">{calculatedSummary.avg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="divider"></div>
            <div className="text-xs opacity-70">
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Ctrl+C</kbd> Copy
              <span className="mx-2">|</span>
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Ctrl+V</kbd> Paste
              <span className="mx-2">|</span>
              <kbd className="bg-white/20 px-1.5 py-0.5 rounded text-[10px] mr-1">Esc</kbd> Bỏ chọn
            </div>
          </div>
        )}

        {/* Toast Container */}
        <div className="fixed top-5 right-5 z-[50000] flex flex-col gap-2 pointer-events-none">
          {toasts.map(t => (
            <div key={t.id} className={`pointer-events-auto min-w-[300px] p-4 rounded shadow-lg bg-white border-l-4 transform transition-all animate-in slide-in-from-right-10 duration-300 ${t.type === 'success' ? 'border-green-500 bg-green-50' :
              t.type === 'error' ? 'border-red-500 bg-red-50' :
                t.type === 'loading' ? 'border-blue-500 bg-blue-50' : 'border-blue-500 bg-white'
              }`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {t.type === 'loading' && <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>}
                  <span className="text-sm font-medium text-gray-800">{t.message}</span>
                </div>
                <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600 font-bold">&times;</button>
              </div>
            </div>
          ))}
        </div>

        <SyncPopover
          isOpen={syncPopoverOpen}
          onClose={() => setSyncPopoverOpen(false)}
          pendingChanges={pendingChanges}
          legacyChanges={new Map()}
          onApply={handleUpdateAll}
          onDiscardRow={handleDiscardRowChange}
          applyButtonLabel="Xác nhận lưu"
          onDiscard={() => {
            if (!window.confirm('Hủy bỏ tất cả thay đổi chưa lưu?')) return;
            dbQueueRef.current = [];
            changeHistoryRef.current = [];
            historyIndexRef.current = -1;
            pendingRowSnapshotsRef.current.clear();
            setPendingChanges(new Map());
            localStorage.removeItem(VAN_DON_PENDING_LS_KEY);
            localStorage.removeItem(VAN_DON_PENDING_SNAPSHOTS_LS_KEY);
            localStorage.removeItem('speegoPendingChanges');
            localStorage.removeItem('speegoPendingRowSnapshots');
            setSyncPopoverOpen(false);
            void refreshData({ skipUnsavedCheck: true });
          }}
        />

        {/* Quick Add Modal */}


        {/* FFM Push Confirmation Modal */}
        {confirmPushData && (
          <div className="fixed inset-0 z-[20000] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
              onClick={cancelPushFinal}
            ></div>
            <div className="relative bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-8 max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Background Accent */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>

              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center">
                  <ChevronRight className="w-10 h-10 rotate-90" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                    Xác nhận đẩy đơn
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed">
                    Bạn có chắc chắn muốn đẩy <span className="font-bold text-blue-600 dark:text-blue-400">{confirmPushData.count}</span> đơn hàng
                    sang đơn vị vận chuyển <span className="font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-900 dark:text-slate-200">{confirmPushData.carrier}</span>?
                  </p>
                </div>

                {ffmPushPreview && (
                  <div className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                      Kết quả sau khi xác nhận
                    </p>
                    <div className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
                      <p>
                        <span className="font-semibold">Đơn vị giao:</span>{' '}
                        {ffmPushPreview.carrierWillChange} đơn sẽ đổi sang <span className="font-semibold">{confirmPushData.carrier}</span>,
                        {' '}{ffmPushPreview.carrierAlreadyTarget} đơn đã là {confirmPushData.carrier}.
                      </p>
                      <p>
                        <span className="font-semibold">Trạng thái giao hàng NB:</span>{' '}
                        {ffmPushPreview.nbWillChange} đơn sẽ đổi thành <span className="font-semibold">Chưa Giao</span>,
                        {' '}{ffmPushPreview.nbAlreadyChuaGiao} đơn giữ nguyên Chưa Giao.
                      </p>
                    </div>
                  </div>
                )}

                {ffmPushPreviewRows.length > 0 && (
                  <div className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                      Chi tiết từng đơn (trước → sau)
                    </p>
                    <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                          <tr className="text-slate-600 dark:text-slate-300">
                            <th className="px-2 py-1 text-left">Mã đơn</th>
                            <th className="px-2 py-1 text-left">Đơn vị giao</th>
                            <th className="px-2 py-1 text-left">Trạng thái NB</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ffmPushPreviewRows.map((r) => (
                            <tr key={r.orderId} className="border-t border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                              <td className="px-2 py-1 font-semibold">{r.orderId}</td>
                              <td className="px-2 py-1">
                                <span>{r.beforeCarrier}</span>
                                <span className="mx-1 text-slate-400">→</span>
                                <span className="font-semibold">{r.afterCarrier}</span>
                              </td>
                              <td className="px-2 py-1">
                                <span>{r.beforeNb}</span>
                                <span className="mx-1 text-slate-400">→</span>
                                <span className="font-semibold">{r.afterNb}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button
                    onClick={cancelPushFinal}
                    className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 active:scale-[0.98]"
                  >
                    Để sau
                  </button>
                  <button
                    onClick={confirmPushFinal}
                    className="flex-1 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-[0.98]"
                  >
                    Xác nhận đẩy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export Date Range Dialog */}
        {showExportDateDialog && (
          <div className="fixed inset-0 z-[20000] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
              onClick={() => !exportingCustomExcel && setShowExportDateDialog(false)}
            ></div>
            <div className="relative bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 px-8 py-6 max-w-md w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-2xl">📊</span> Xuất Excel theo Ngày
                </h3>
                {!exportingCustomExcel && (
                  <button
                    onClick={() => setShowExportDateDialog(false)}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="text-2xl">×</span>
                  </button>
                )}
              </div>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Loại ngày
                  </label>
                  <select
                    value={exportDateType}
                    onChange={(e) => setExportDateType(e.target.value)}
                    disabled={exportingCustomExcel}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="Ngày lên đơn">Ngày lên đơn</option>
                    <option value="Ngày đẩy đơn">Ngày đẩy đơn</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Từ ngày
                  </label>
                  <input
                    type="date"
                    value={exportDateFrom}
                    onChange={(e) => setExportDateFrom(e.target.value)}
                    disabled={exportingCustomExcel}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Đến ngày
                  </label>
                  <input
                    type="date"
                    value={exportDateTo}
                    onChange={(e) => setExportDateTo(e.target.value)}
                    disabled={exportingCustomExcel}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <span className="font-semibold">Lưu ý:</span> Sẽ xuất tất cả 46 cột cố định theo khoảng {exportDateType.toLowerCase()} đã chọn
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={() => setShowExportDateDialog(false)}
                  disabled={exportingCustomExcel}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Hủy
                </button>
                <button
                  onClick={handleExportCustomExcel}
                  disabled={exportingCustomExcel || !exportDateFrom || !exportDateTo}
                  className="flex-1 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg shadow-purple-600/25 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exportingCustomExcel ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      <span>Đang xuất...</span>
                    </>
                  ) : (
                    <>
                      <span>📊</span>
                      <span>Xuất Excel</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Confirmation Modal */}
        {saveConfirmData && (
          <div className="fixed inset-0 z-[20000] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
              onClick={saveConfirmData.onCancel}
            ></div>
            <div className="relative bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 px-8 py-6 max-w-2xl w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-2xl">📝</span> Xác nhận lưu {saveConfirmData.summaries.length} thay đổi
                </h3>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 max-h-[50vh] overflow-y-auto mb-6">
                <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 sticky border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-3 text-slate-600 dark:text-slate-400 font-semibold w-24">Mã Đơn</th>
                      <th className="py-2 px-3 text-slate-600 dark:text-slate-400 font-semibold">Cột Dữ Liệu</th>
                      <th className="py-2 px-3 text-rose-600 dark:text-rose-400 font-semibold">Giá trị cũ ❌</th>
                      <th className="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">Giá trị mới ✅</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saveConfirmData.summaries.slice(0, 50).map((c, i) => (
                      <tr key={i} className="border-b last:border-b-0 border-slate-100 dark:border-slate-800">
                        <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{c.orderId}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">[{c.colKey}]</td>
                        <td className="py-2 px-3 text-slate-500 line-through truncate max-w-[150px]" title={c.originalValue}>{c.originalValue || '(trống)'}</td>
                        <td className="py-2 px-3 text-emerald-600 font-medium truncate max-w-[150px]" title={c.newValue}>{c.newValue || '(trống)'}</td>
                      </tr>
                    ))}
                    {saveConfirmData.summaries.length > 50 && (
                      <tr>
                        <td colSpan="4" className="py-3 text-center text-slate-500 font-semibold bg-slate-100/50">
                          ... và {saveConfirmData.summaries.length - 50} thay đổi khác.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <button
                  onClick={saveConfirmData.onCancel}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all duration-200 active:scale-[0.98]"
                >
                  Hủy bỏ
                </button>
                <button
                  onClick={saveConfirmData.onConfirm}
                  className="flex-1 px-6 py-2.5 rounded-xl bg-[#F37021] hover:bg-[#e55f1a] text-white font-semibold shadow-lg shadow-[#F37021]/25 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  ✅ Ghi Lịch Sử & Lưu Xuống Máy Chủ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Order Change History Modal */}
        {historyModalData && (
          (() => {
            const filteredHistoryRows = (historyModalData.rows || []).filter((row) => {
              const hasDateRange = Boolean(historyDateFrom || historyDateTo);
              const ymd = getYmdFromAuditTs(row?.changed_at);
              // Chỉ loại dòng khi không parse được ngày **và** user đang lọc theo khoảng ngày.
              // Trước đây: !ymd → luôn loại → cả lịch sử «mất» dù DB có bản ghi (định dạng thời gian lạ / lỗi parse).
              if (hasDateRange) {
                if (!ymd) return false;
                if (historyDateFrom && ymd < historyDateFrom) return false;
                if (historyDateTo && ymd > historyDateTo) return false;
              }
              return true;
            });
            return (
              <div className="fixed inset-0 z-[21000] flex items-center justify-center pointer-events-auto">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                  onClick={() => setHistoryModalData(null)}
                ></div>
                <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 px-6 py-5 max-w-5xl w-full mx-4 max-h-[85vh] overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-slate-900">
                      Lịch sử thay đổi - {historyModalData.orderId}
                    </h3>
                    <button
                      onClick={() => setHistoryModalData(null)}
                      className="text-gray-500 hover:text-gray-900 font-bold text-xl"
                      aria-label="Đóng"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 mb-3">
                    Nguồn: cột Log (jsonb) trên đơn — mỗi lần sửa lưới / Nhập đơn ghi đủ thời gian, người thao tác, giá trị cũ/mới.
                  </div>
                  <div className="flex flex-wrap items-end gap-3 mb-3">
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Từ ngày thao tác</label>
                      <input
                        type="date"
                        value={historyDateFrom}
                        onChange={(e) => setHistoryDateFrom(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-600 mb-1">Đến ngày thao tác</label>
                      <input
                        type="date"
                        value={historyDateTo}
                        onChange={(e) => setHistoryDateTo(e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryDateFrom('');
                        setHistoryDateTo('');
                      }}
                      className="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                    >
                      Xóa lọc ngày
                    </button>
                    <div className="text-xs text-gray-500">
                      Hiển thị {filteredHistoryRows.length}/{historyModalData.rows.length} lần thao tác
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const exportRows = [];
                        filteredHistoryRows.forEach((row) => {
                          const fields = row?.changed_fields && typeof row.changed_fields === 'object' ? row.changed_fields : {};
                          const entries = Object.entries(fields);
                          if (entries.length === 0) {
                            exportRows.push({
                              'Mã đơn hàng': historyModalData.orderId,
                              'Thời gian thao tác': formatDateTime(row?.changed_at),
                              'Người thao tác': String(row?.changed_by || 'hệ thống'),
                              'Cột thay đổi': '',
                              'Giá trị cũ': '',
                              'Giá trị mới': '',
                            });
                            return;
                          }
                          entries.forEach(([colName, diff]) => {
                            exportRows.push({
                              'Mã đơn hàng': historyModalData.orderId,
                              'Thời gian thao tác': formatDateTime(row?.changed_at),
                              'Người thao tác': String(row?.changed_by || 'hệ thống'),
                              'Cột thay đổi': formatAuditColumnName(colName),
                              'Giá trị cũ': formatAuditValueForUi(diff?.old),
                              'Giá trị mới': formatAuditValueForUi(diff?.new),
                            });
                          });
                        });
                        if (exportRows.length === 0) {
                          addToast('Không có dữ liệu lịch sử theo bộ lọc để xuất Excel.', 'warning');
                          return;
                        }
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.json_to_sheet(exportRows);
                        XLSX.utils.book_append_sheet(wb, ws, 'Lich_su_thay_doi');
                        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                        XLSX.writeFile(wb, `LichSuThayDoi_${historyModalData.orderId}_${stamp}.xlsx`);
                        addToast(`Đã xuất ${exportRows.length} dòng lịch sử.`, 'success');
                      }}
                      className="px-3 py-1.5 text-xs rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    >
                      Xuất Excel theo bộ lọc ngày
                    </button>
                  </div>
                  <div className="border rounded-xl overflow-auto max-h-[65vh]">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 bg-slate-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 w-48">Thời gian</th>
                          <th className="text-left px-3 py-2 w-40">Người sửa</th>
                          <th className="text-left px-3 py-2 w-44">Cột</th>
                          <th className="text-left px-3 py-2">Giá trị cũ</th>
                          <th className="text-left px-3 py-2">Giá trị mới</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryRows.length === 0 ? (
                          <tr>
                            <td className="px-3 py-6 text-center text-gray-500" colSpan={5}>
                              Không có lịch sử thay đổi theo bộ lọc ngày thao tác.
                            </td>
                          </tr>
                        ) : (
                          filteredHistoryRows.map((row) => {
                            const fields = row?.changed_fields && typeof row.changed_fields === 'object' ? row.changed_fields : {};
                            const entries = Object.entries(fields);
                            if (entries.length === 0) {
                              return (
                                <tr key={row.id} className="border-b last:border-b-0">
                                  <td className="px-3 py-2 align-top">{formatDateTime(row.changed_at)}</td>
                                  <td className="px-3 py-2 align-top">{String(row.changed_by || 'hệ thống')}</td>
                                  <td className="px-3 py-2 align-top text-gray-400" colSpan={3}>
                                    Không có chi tiết cột đổi
                                  </td>
                                </tr>
                              );
                            }
                            return entries.map(([colName, diff], idx) => (
                              <tr key={`${row.id}-${colName}`} className="border-b last:border-b-0">
                                {idx === 0 ? (
                                  <>
                                    <td className="px-3 py-2 align-top" rowSpan={entries.length}>
                                      {formatDateTime(row.changed_at)}
                                    </td>
                                    <td className="px-3 py-2 align-top" rowSpan={entries.length}>
                                      {String(row.changed_by || 'hệ thống')}
                                    </td>
                                  </>
                                ) : null}
                                <td className="px-3 py-2 align-top font-medium">{formatAuditColumnName(colName)}</td>
                                <td className="px-3 py-2 align-top text-rose-700 whitespace-pre-wrap break-words">
                                  {formatAuditValueForUi(diff?.old)}
                                </td>
                                <td className="px-3 py-2 align-top text-emerald-700 whitespace-pre-wrap break-words">
                                  {formatAuditValueForUi(diff?.new)}
                                </td>
                              </tr>
                            ));
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {/* Column Settings Modal */}
        <ColumnSettingsModal
          isOpen={showColumnSettings}
          onClose={() => setShowColumnSettings(false)}
          allColumns={allColumns}
          visibleColumns={visibleColumns}
          onToggleColumn={(col) => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
          onSelectAll={() => {
            const all = {};
            allColumns.forEach(col => { all[col] = true; });
            setVisibleColumns(all);
          }}
          onDeselectAll={() => {
            const none = {};
            allColumns.forEach(col => { none[col] = false; });
            setVisibleColumns(none);
          }}
          onResetDefault={() => {
            const defaultCols = {};
            const defaults = viewMode === 'ORDER_MANAGEMENT' ? allColumns : DEFAULT_BILL_LADING_COLUMNS.filter(col => !HIDDEN_COLUMNS.includes(col));
            defaults.forEach(col => { defaultCols[col] = true; });
            setVisibleColumns(defaultCols);
          }}
          defaultColumns={viewMode === 'ORDER_MANAGEMENT' ? allColumns : DEFAULT_BILL_LADING_COLUMNS.filter(col => !HIDDEN_COLUMNS.includes(col))}
        />
      </div>
    </div>
  );
}

export default VanDon;
