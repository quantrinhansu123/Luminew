'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, ShoppingCart, Image as ImageIcon, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ORDER_STATUS_LABELS, OrderStatus } from '@/types/order';
import type { SalesEmployee } from '@/lib/types';

type DesignFile = {
  id: number;
  file_name: string;
  google_drive_id: string | null;
  thumbnail_url: string | null;
  file_category: string | null;
};

type OrderRow = {
  id: number;
  order_code: string | null;
  status: string;
  final_amount: number | null;
  total_amount: number | null;
  created_at: string | null;
  order_date: string | null;
  description: string | null;
  customers?: {
    id: number;
    customer_code: string | null;
    full_name: string | null;
    phone: string | null;
  } | null;
  product_groups?: {
    id: number;
    name: string | null;
    code: string | null;
  } | null;
  sales_employees?: {
    id: number;
    full_name: string | null;
    employee_code: string | null;
  } | null;
  design_files?: DesignFile[];
};

interface SalesEmployeeOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: SalesEmployee | null;
}

const PAGE_SIZE = 200;

export function SalesEmployeeOrdersModal({ isOpen, onClose, employee }: SalesEmployeeOrdersModalProps) {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const formatCurrency = (amount?: number | null) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount || 0));

  const formatDateTime = (v?: string | null) => {
    if (!v) return '-';
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return '-';
    return d.toLocaleString('vi-VN');
  };

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) m.set(o.status, (m.get(o.status) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  const totalRevenue = useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.final_amount || 0), 0),
    [orders]
  );

  const fetchPage = async (nextPage: number) => {
    if (!employee?.id) return;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error: err } = await supabase
      .from('orders')
      .select(
        `
        id, order_code, status, final_amount, total_amount, created_at, order_date, description,
        customers:customer_id(id,customer_code,full_name,phone),
        product_groups:product_group_id(id,name,code),
        sales_employees:sales_employee_id(id,full_name,employee_code),
        design_files(id,file_name,google_drive_id,thumbnail_url,file_category)
      `
      )
      .eq('sales_employee_id', employee.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (err) throw err;
    const rows = ((data as any) || []) as OrderRow[];
    setHasMore(rows.length === PAGE_SIZE);
    setOrders((prev) => (nextPage === 0 ? rows : [...prev, ...rows]));
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!employee?.id) return;

    setOrders([]);
    setError(null);
    setPage(0);
    setHasMore(true);

    (async () => {
      try {
        setLoading(true);
        await fetchPage(0);
      } catch (e: any) {
        setError(e?.message || 'Không thể tải lịch sử đơn hàng');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, employee?.id]);

  const handleLoadMore = async () => {
    if (loadingMore || loading) return;
    if (!hasMore) return;
    const next = page + 1;
    try {
      setLoadingMore(true);
      await fetchPage(next);
      setPage(next);
    } catch (e: any) {
      setError(e?.message || 'Không thể tải thêm đơn hàng');
    } finally {
      setLoadingMore(false);
    }
  };

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[1100px] max-w-[95vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShoppingCart className="text-emerald-600" />
            Lịch sử đơn hàng - {employee.full_name} ({employee.employee_code || `#${employee.id}`})
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
            Lỗi: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500 font-semibold">Tổng đơn (đã tải)</div>
            <div className="text-2xl font-bold text-slate-900">{orders.length}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500 font-semibold">Tổng doanh thu (đã tải)</div>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-xs text-slate-500 font-semibold">Theo trạng thái</div>
            <div className="mt-2 space-y-1">
              {statusCounts.length === 0 ? (
                <div className="text-sm text-slate-500">-</div>
              ) : (
                statusCounts.slice(0, 6).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {ORDER_STATUS_LABELS[k as OrderStatus] || k}
                    </span>
                    <span className="font-semibold text-slate-900">{v}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold whitespace-nowrap">
                  <th className="p-3 w-24">Mã đơn</th>
                  <th className="p-3">Khách hàng</th>
                  <th className="p-3">NV phụ trách</th>
                  <th className="p-3">Nhóm SP</th>
                  <th className="p-3">Trạng thái</th>
                  <th className="p-3 text-right">Thành tiền</th>
                  <th className="p-3">Ngày tạo</th>
                  <th className="p-3 w-20">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Đang tải...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500">
                      Chưa có đơn hàng nào cho nhân viên này.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const designFiles = (o.design_files || []) as DesignFile[];
                    const imageFiles = designFiles.filter(f => f.thumbnail_url);
                    const otherFiles = designFiles.filter(f => !f.thumbnail_url && f.google_drive_id);
                    const isExpanded = expandedOrderId === o.id;
                    
                    return (
                      <>
                        <tr key={o.id} className="hover:bg-slate-50">
                          <td className="p-3 font-mono text-slate-700">
                            {o.order_code || `#${o.id}`}
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">
                              {o.customers?.full_name || '-'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {o.customers?.phone || ''}{o.customers?.customer_code ? ` • ${o.customers.customer_code}` : ''}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-medium text-blue-600">
                              {o.sales_employees?.full_name || employee?.full_name || '-'}
                            </div>
                            <div className="text-xs text-slate-500">
                              {o.sales_employees?.employee_code || employee?.employee_code || ''}
                            </div>
                          </td>
                          <td className="p-3 text-slate-700 text-xs">
                            {o.product_groups?.name || '-'}
                          </td>
                          <td className="p-3 text-slate-700 text-xs">
                            {ORDER_STATUS_LABELS[o.status as OrderStatus] || o.status}
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-900">
                            {formatCurrency(o.final_amount ?? o.total_amount)}
                          </td>
                          <td className="p-3 text-slate-600 text-xs">
                            {formatDateTime(o.created_at || o.order_date)}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => setExpandedOrderId(isExpanded ? null : o.id)}
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                            >
                              {isExpanded ? 'Thu gọn' : 'Xem'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && designFiles.length > 0 && (
                          <tr>
                            <td colSpan={8} className="p-4 bg-slate-50 border-t border-slate-200">
                              <div className="space-y-4">
                                {imageFiles.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                      <ImageIcon size={16} className="text-blue-600" />
                                      Link ảnh ({imageFiles.length})
                                    </h4>
                                    <div className="grid grid-cols-4 gap-3">
                                      {imageFiles.map((file) => (
                                        <a
                                          key={file.id}
                                          href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex flex-col items-center p-2 bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all group"
                                        >
                                          {file.thumbnail_url ? (
                                            <img
                                              src={file.thumbnail_url}
                                              alt={file.file_name}
                                              className="w-full h-20 object-cover rounded mb-1"
                                            />
                                          ) : (
                                            <div className="w-full h-20 bg-slate-100 rounded flex items-center justify-center mb-1">
                                              <ImageIcon className="w-8 h-8 text-slate-400" />
                                            </div>
                                          )}
                                          <span className="text-xs text-slate-600 truncate max-w-full text-center group-hover:text-blue-600">
                                            {file.file_name}
                                          </span>
                                          <ExternalLink className="w-3 h-3 text-slate-400 mt-1" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {otherFiles.length > 0 && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                                      <FileText size={16} className="text-green-600" />
                                      Link file ({otherFiles.length})
                                    </h4>
                                    <div className="grid grid-cols-4 gap-3">
                                      {otherFiles.map((file) => (
                                        <a
                                          key={file.id}
                                          href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="flex flex-col items-center p-2 bg-white rounded-lg border border-slate-200 hover:border-green-400 hover:shadow-sm transition-all group"
                                        >
                                          <div className="w-full h-20 bg-slate-100 rounded flex items-center justify-center mb-1">
                                            <FileText className="w-8 h-8 text-slate-400" />
                                          </div>
                                          <span className="text-xs text-slate-600 truncate max-w-full text-center group-hover:text-green-600">
                                            {file.file_name}
                                          </span>
                                          <ExternalLink className="w-3 h-3 text-slate-400 mt-1" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 border-t border-slate-100 flex justify-between items-center">
            <div className="text-xs text-slate-500">
              {hasMore ? `Đang hiển thị ${orders.length} (bấm “Tải thêm” để xem tiếp)` : `Đã hiển thị toàn bộ ${orders.length} đơn`}
            </div>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={!hasMore || loadingMore}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? 'Đang tải...' : 'Tải thêm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

