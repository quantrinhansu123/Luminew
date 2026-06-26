import {
  customerDupCheckContext,
  normalizeCustomerTextForDup,
} from './customerDuplicateCanhBao';
import { parseSmartDate } from './dateParsing';

function pickField(row, dbKey, appKey) {
  if (!row) return '';
  const v = row[dbKey] ?? row[appKey];
  return v == null ? '' : String(v).trim();
}

/** Ms để sort — ưu tiên order_date, fallback created_at. */
export function orderDateMsFromRow(row) {
  if (!row) return 0;
  const od = parseSmartDate(row.order_date);
  if (od) return od.getTime();
  const ca = parseSmartDate(row.created_at);
  if (ca) return ca.getTime();
  return 0;
}

/** Hiển thị Ngày lên đơn (dd/mm/yyyy); không có order_date thì ghi chú created_at. */
export function formatCrossDupNgayLenDon(row) {
  if (!row) return '—';
  const od = parseSmartDate(row.order_date);
  if (od) {
    const d = String(od.getDate()).padStart(2, '0');
    const m = String(od.getMonth() + 1).padStart(2, '0');
    const y = od.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const ca = parseSmartDate(row.created_at);
  if (ca) {
    const d = String(ca.getDate()).padStart(2, '0');
    const m = String(ca.getMonth() + 1).padStart(2, '0');
    const y = ca.getFullYear();
    return `${d}/${m}/${y} (tạo)`;
  }
  return '—';
}

function rowDupFields(row) {
  const name = pickField(row, 'customer_name', 'Name*');
  const phone = pickField(row, 'customer_phone', 'Phone*');
  const address = pickField(row, 'customer_address', 'Add');
  const product = pickField(row, 'product', 'Mặt hàng');
  const ctx = customerDupCheckContext(phone, name, address);
  const normProduct = normalizeCustomerTextForDup(product);
  const productOk = normProduct.length >= 1;
  return { name, phone, address, product, normProduct, productOk, ...ctx };
}

/**
 * Khóa so khớp (OR): trùng SĐT + Mặt hàng, hoặc Tên + Mặt hàng, hoặc Địa chỉ + Mặt hàng.
 * Trả về [] nếu không đủ dữ liệu (cần Mặt hàng và ít nhất một tiêu chí khách).
 */
export function buildHcmOrdersCrossDuplicateKeys(row) {
  const f = rowDupFields(row);
  if (!f.productOk) return [];

  const keys = [];
  if (f.phoneOk) {
    keys.push({ key: `p:${f.normPhone}\u001f${f.normProduct}`, reason: 'SĐT + Mặt hàng' });
  }
  if (f.nameOk) {
    keys.push({ key: `n:${f.normName}\u001f${f.normProduct}`, reason: 'Tên + Mặt hàng' });
  }
  if (f.addrOk) {
    keys.push({ key: `a:${f.normAddr}\u001f${f.normProduct}`, reason: 'Địa chỉ + Mặt hàng' });
  }
  return keys;
}

/** @deprecated Dùng buildHcmOrdersCrossDuplicateKeys — giữ để tương thích nếu có import cũ. */
export function buildHcmOrdersCrossDuplicateKey(row) {
  return buildHcmOrdersCrossDuplicateKeys(row)[0]?.key ?? null;
}

function nodeId(source, code) {
  return `${source}:${code}`;
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }

  find(i) {
    if (this.parent[i] !== i) this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }

  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function registerRow(nodeMeta, byKey, row, source) {
  const code = row?.order_code != null ? String(row.order_code).trim() : '';
  if (!code) return;

  const nid = nodeId(source, code);
  const ms = orderDateMsFromRow(row);
  const label = formatCrossDupNgayLenDon(row);
  const prev = nodeMeta.get(nid);
  if (!prev || ms >= prev.orderDateMs) {
    nodeMeta.set(nid, { code, orderDateMs: ms, orderDateLabel: label, source, row });
  }

  for (const { key, reason } of buildHcmOrdersCrossDuplicateKeys(row)) {
    if (!byKey.has(key)) {
      byKey.set(key, { hcm: new Set(), orders: new Set(), reasons: new Set() });
    }
    const bucket = byKey.get(key);
    bucket.reasons.add(reason);
    bucket[source].add(nid);
  }
}

function entriesFromNodes(nodeMeta, nids) {
  const byCode = new Map();
  for (const nid of nids) {
    const meta = nodeMeta.get(nid);
    if (!meta) continue;
    const prev = byCode.get(meta.code);
    if (!prev || meta.orderDateMs >= prev.orderDateMs) {
      byCode.set(meta.code, {
        code: meta.code,
        orderDateMs: meta.orderDateMs,
        orderDateLabel: meta.orderDateLabel,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => b.orderDateMs - a.orderDateMs);
}

function latestMsFromEntries(hcmEntries, ordersEntries) {
  let max = 0;
  for (const e of hcmEntries) if (e.orderDateMs > max) max = e.orderDateMs;
  for (const e of ordersEntries) if (e.orderDateMs > max) max = e.orderDateMs;
  return max;
}

function latestLabelFromMs(ms, hcmEntries, ordersEntries) {
  if (!ms) return '—';
  const hit =
    hcmEntries.find((e) => e.orderDateMs === ms) ||
    ordersEntries.find((e) => e.orderDateMs === ms);
  return hit?.orderDateLabel || '—';
}

/** Chuỗi mã kèm ngày cho cột bảng. */
export function formatCrossDupCodeList(entries) {
  if (!entries?.length) return '—';
  return entries
    .map((e) => (e.orderDateLabel && e.orderDateLabel !== '—' ? `${e.code} (${e.orderDateLabel})` : e.code))
    .join(', ');
}

const MATCH_REASON_ORDER = ['SĐT + Mặt hàng', 'Tên + Mặt hàng', 'Địa chỉ + Mặt hàng'];

function sortMatchReasons(reasons) {
  const set = new Set(reasons || []);
  return MATCH_REASON_ORDER.filter((r) => set.has(r));
}

/**
 * Nhóm trùng nội dung giữa order_code_hcm và orders:
 * trùng SĐT + Mặt hàng, hoặc Tên + Mặt hàng, hoặc Địa chỉ + Mặt hàng (có mã ở cả hai bảng).
 * Sắp xếp: ngày lên đơn gần hôm nay nhất lên đầu.
 */
export function findHcmOrdersCrossTableDuplicateGroups(hcmRows, ordersRows) {
  const byKey = new Map();
  const nodeMeta = new Map();

  for (const row of hcmRows || []) {
    registerRow(nodeMeta, byKey, row, 'hcm');
  }
  for (const row of ordersRows || []) {
    registerRow(nodeMeta, byKey, row, 'orders');
  }

  const nodeList = [...nodeMeta.keys()];
  if (nodeList.length === 0) return [];

  const nodeIndex = new Map(nodeList.map((n, i) => [n, i]));
  const uf = new UnionFind(nodeList.length);
  const rootToReasons = new Map();

  for (const [, { hcm, orders, reasons }] of byKey.entries()) {
    if (hcm.size === 0 || orders.size === 0) continue;
    const hcmArr = [...hcm];
    const ordersArr = [...orders];
    for (const h of hcmArr) {
      for (const o of ordersArr) {
        const hi = nodeIndex.get(h);
        const oi = nodeIndex.get(o);
        uf.union(hi, oi);
        const root = uf.find(hi);
        if (!rootToReasons.has(root)) rootToReasons.set(root, new Set());
        for (const reason of reasons) rootToReasons.get(root).add(reason);
      }
    }
  }

  const rootToNodes = new Map();
  for (const nid of nodeList) {
    const root = uf.find(nodeIndex.get(nid));
    if (!rootToNodes.has(root)) rootToNodes.set(root, []);
    rootToNodes.get(root).push(nid);
  }

  const groups = [];
  for (const [root, nodes] of rootToNodes.entries()) {
    const hcmNodes = nodes.filter((n) => nodeMeta.get(n)?.source === 'hcm');
    const ordersNodes = nodes.filter((n) => nodeMeta.get(n)?.source === 'orders');
    if (hcmNodes.length === 0 || ordersNodes.length === 0) continue;

    const hcmEntries = entriesFromNodes(nodeMeta, hcmNodes);
    const ordersEntries = entriesFromNodes(nodeMeta, ordersNodes);
    const latestOrderDateMs = latestMsFromEntries(hcmEntries, ordersEntries);

    let sample = null;
    let sampleMs = -1;
    for (const nid of nodes) {
      const meta = nodeMeta.get(nid);
      if (!meta?.row || meta.orderDateMs < sampleMs) continue;
      sampleMs = meta.orderDateMs;
      sample = meta.row;
    }

    const matchReasons = sortMatchReasons([...(rootToReasons.get(root) || [])]);
    const key = [...nodes].sort().join('|');

    groups.push({
      key,
      name: pickField(sample, 'customer_name', 'Name*'),
      phone: pickField(sample, 'customer_phone', 'Phone*'),
      address: pickField(sample, 'customer_address', 'Add'),
      product: pickField(sample, 'product', 'Mặt hàng'),
      matchReasons,
      latestOrderDateMs,
      latestOrderDateLabel: latestLabelFromMs(latestOrderDateMs, hcmEntries, ordersEntries),
      hcmEntries,
      ordersEntries,
      /** @deprecated dùng hcmEntries */
      hcmCodes: hcmEntries.map((e) => e.code),
      /** @deprecated dùng ordersEntries */
      ordersCodes: ordersEntries.map((e) => e.code),
    });
  }

  groups.sort((a, b) => {
    const dateDiff = (b.latestOrderDateMs || 0) - (a.latestOrderDateMs || 0);
    if (dateDiff !== 0) return dateDiff;
    const score = (g) => g.hcmEntries.length + g.ordersEntries.length;
    return score(b) - score(a);
  });

  return groups;
}
