'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Loader2,
  Eye,
  Download,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface Transaction {
  id: number;
  payment_code: string;
  amount: number;
  payment_method?: string;
  notes?: string;
  status: string;
  paid_at?: string;
  created_at?: string;
  customer_id: number;
  order_id?: number;
  customers?: {
    id: number;
    customer_code: string;
    full_name: string;
    phone?: string;
  };
  orders?: {
    id: number;
    order_code: string;
    final_amount: number;
  };
}

const paymentMethodLabels: Record<string, string> = {
  transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
  card: 'Thẻ',
};

const statusLabels: Record<string, string> = {
  paid: 'Đã thanh toán',
  unpaid: 'Chưa thanh toán',
  partial: 'Thanh toán một phần',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TransactionHistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Fetch transactions
  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          customers:customer_id (
            id,
            customer_code,
            full_name,
            phone
          ),
          orders:order_id (
            id,
            order_code,
            final_amount
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions((data as any) || []);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      toast.error('Không thể tải lịch sử giao dịch');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.payment_code.toLowerCase().includes(query) ||
          t.customers?.full_name.toLowerCase().includes(query) ||
          t.customers?.customer_code.toLowerCase().includes(query) ||
          t.orders?.order_code.toLowerCase().includes(query) ||
          t.notes?.toLowerCase().includes(query)
      );
    }

    // Payment method filter
    if (filterMethod !== 'all') {
      filtered = filtered.filter((t) => t.payment_method === filterMethod);
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((t) => t.status === filterStatus);
    }

    // Date filter
    if (dateFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter((t) => {
        if (!t.created_at) return false;
        const tDate = new Date(t.created_at);
        tDate.setHours(0, 0, 0, 0);
        return tDate.getTime() === today.getTime();
      });
    } else if (dateFilter === 'custom' && selectedDate) {
      const selected = new Date(selectedDate);
      selected.setHours(0, 0, 0, 0);
      filtered = filtered.filter((t) => {
        if (!t.created_at) return false;
        const tDate = new Date(t.created_at);
        tDate.setHours(0, 0, 0, 0);
        return tDate.getTime() === selected.getTime();
      });
    }

    return filtered;
  }, [transactions, searchQuery, filterMethod, filterStatus, dateFilter, selectedDate]);

  // Calculate totals
  const totals = useMemo(() => {
    const totalAmount = filteredTransactions.reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0
    );
    const paidAmount = filteredTransactions
      .filter((t) => t.status === 'paid')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return { totalAmount, paidAmount };
  }, [filteredTransactions]);

  // Export to CSV
  const handleExport = () => {
    const headers = [
      'Mã GD',
      'Mã đơn',
      'Khách hàng',
      'Số tiền',
      'Phương thức',
      'Trạng thái',
      'Nội dung',
      'Ngày tạo',
    ];
    const rows = filteredTransactions.map((t) => [
      t.payment_code,
      t.orders?.order_code || '-',
      t.customers?.full_name || '-',
      t.amount.toString(),
      paymentMethodLabels[t.payment_method || ''] || t.payment_method || '-',
      statusLabels[t.status] || t.status,
      t.notes || '-',
      formatDate(t.created_at),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lich-su-giao-dich-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('Đã xuất file CSV');
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Lịch sử giao dịch</h1>
        <p className="text-slate-600">
          Theo dõi toàn bộ các giao dịch thu/chi theo đơn hàng
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Tổng số giao dịch</p>
              <p className="text-2xl font-bold text-slate-900">{filteredTransactions.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Tổng giá trị</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(totals.totalAmount)}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">Đã thanh toán</p>
              <p className="text-2xl font-bold text-green-700">{formatCurrency(totals.paidAmount)}</p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-lg">
              <TrendingDown className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">Tìm kiếm</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Mã GD, mã đơn, khách hàng..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Phương thức</label>
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="transfer">Chuyển khoản</option>
              <option value="cash">Tiền mặt</option>
              <option value="card">Thẻ</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Trạng thái</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="paid">Đã thanh toán</option>
              <option value="unpaid">Chưa thanh toán</option>
              <option value="partial">Thanh toán một phần</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ngày</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm mb-2"
            >
              <option value="all">Tất cả</option>
              <option value="today">Hôm nay</option>
              <option value="custom">Chọn ngày</option>
            </select>
            {dateFilter === 'custom' && (
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            )}
          </div>
        </div>

        {/* Export Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <p className="text-slate-500">Không tìm thấy giao dịch nào</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Mã GD
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Mã đơn
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Khách hàng
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Số tiền
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Phương thức
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Nội dung
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Ngày tạo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      {transaction.payment_code}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {transaction.orders?.order_code || (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div>
                        <p className="font-medium">{transaction.customers?.full_name || '-'}</p>
                        {transaction.customers?.phone && (
                          <p className="text-xs text-slate-500">{transaction.customers.phone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-green-700">
                      {formatCurrency(Number(transaction.amount || 0))}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {paymentMethodLabels[transaction.payment_method || ''] || transaction.payment_method || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          transaction.status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : transaction.status === 'unpaid'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {statusLabels[transaction.status] || transaction.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs truncate">
                      {transaction.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDate(transaction.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
