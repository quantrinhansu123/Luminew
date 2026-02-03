'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  X,
  Building2,
  Phone,
  Mail,
  MapPin,
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Image as ImageIcon,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useCustomers, useSalesEmployees } from '@/lib/api-hooks';
import { Customer } from '@/lib/types';

export default function CustomersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { customers, loading, count, addCustomer, updateCustomer, deleteCustomer, refetch } = useCustomers({ search: debouncedSearch });
  const { salesEmployees } = useSalesEmployees();

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // View modal data
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [orderStats, setOrderStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalCost: 0,
  });

  interface DesignFile {
    id: number;
    file_name: string;
    google_drive_id?: string | null;
    thumbnail_url?: string | null;
    file_category?: string | null;
  }

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    address: '',
    tax_code: '',
    company_name: '',
    account_manager_id: '',
  });

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const openAddModal = () => {
    setFormData({
      full_name: '',
      phone: '',
      email: '',
      address: '',
      tax_code: '',
      company_name: '',
      account_manager_id: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      tax_code: customer.tax_code || '',
      company_name: customer.company_name || '',
      account_manager_id: customer.account_manager_id?.toString() || '',
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDeleteModalOpen(true);
  };

  const openViewModal = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewModalOpen(true);
    setIsLoadingOrders(true);
    
    try {
      // Fetch orders for this customer with design files
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_code,
          description,
          quantity,
          unit,
          unit_price,
          total_amount,
          final_amount,
          status,
          order_date,
          created_at,
          product_groups:product_group_id (
            id,
            name,
            code
          ),
          sales_employees:sales_employee_id (
            id,
            full_name,
            employee_code
          ),
          design_files (
            id,
            file_name,
            google_drive_id,
            thumbnail_url,
            file_category
          )
        `)
        .eq('customer_id', customer.id)
        .order('order_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setCustomerOrders(orders || []);

      // Calculate stats
      const stats = {
        totalOrders: orders?.length || 0,
        totalRevenue: orders?.reduce((sum, o) => sum + Number(o.final_amount || 0), 0) || 0,
        totalCost: 0, // Chi phí có thể tính từ payments hoặc các trường khác nếu có
      };

      // Fetch payments to calculate total cost
      if (orders && orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .in('order_id', orderIds);
        
        if (payments) {
          stats.totalCost = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        }
      }

      setOrderStats(stats);
    } catch (error: any) {
      console.error('Error fetching customer orders:', error);
      toast.error('Không thể tải thông tin đơn hàng');
      setCustomerOrders([]);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addCustomer({
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email || undefined,
        address: formData.address || undefined,
        tax_code: formData.tax_code || undefined,
        company_name: formData.company_name || undefined,
        account_manager_id: formData.account_manager_id ? Number(formData.account_manager_id) : undefined,
      });
      toast.success('Thêm khách hàng thành công!');
      setIsAddModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Không thể thêm khách hàng');
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await updateCustomer(selectedCustomer.id, {
        full_name: formData.full_name,
        phone: formData.phone,
        email: formData.email || undefined,
        address: formData.address || undefined,
        tax_code: formData.tax_code || undefined,
        company_name: formData.company_name || undefined,
        account_manager_id: formData.account_manager_id ? Number(formData.account_manager_id) : undefined,
      });
      toast.success('Cập nhật khách hàng thành công!');
      setIsEditModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Không thể cập nhật khách hàng');
    }
  };

  const handleDelete = async () => {
    if (!selectedCustomer) return;
    try {
      await deleteCustomer(selectedCustomer.id);
      toast.success('Xóa khách hàng thành công!');
      setIsDeleteModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa khách hàng');
    }
  };

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Quản lý Khách hàng</h2>
            <p className="text-slate-500 text-sm">Tổng: {count} khách hàng</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
        >
          <Plus size={20} /> Thêm khách hàng mới
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm theo tên, SĐT, mã KH, email..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleResetFilters}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Đang tải...</div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Không có khách hàng nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                  <th className="p-4">Mã KH</th>
                  <th className="p-4">Thông tin</th>
                  <th className="p-4">Công ty</th>
                  <th className="p-4">NV Quản lý</th>
                  <th className="p-4 text-center">Tổng đơn</th>
                  <th className="p-4 text-right">Doanh số</th>
                  <th className="p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                        {customer.customer_code || `#${customer.id}`}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-800">{customer.full_name}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone size={12} />
                          {customer.phone}
                        </span>
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail size={12} />
                            {customer.email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      {customer.company_name ? (
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400" />
                          <span className="text-slate-700">{customer.company_name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {customer.sales_employees ? (
                        <span className="text-slate-700">{customer.sales_employees.full_name}</span>
                      ) : (
                        <span className="text-slate-400">Chưa phân bổ</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className="font-bold text-blue-600">{customer.total_orders || 0}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-medium text-green-600">
                        {formatCurrency(customer.total_revenue)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openViewModal(customer)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openEditModal(customer)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteModal(customer)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-800">
                {isAddModalOpen ? 'Thêm khách hàng' : 'Sửa khách hàng'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setIsEditModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={isAddModalOpen ? handleSubmitAdd : handleSubmitEdit}>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Họ tên <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Số điện thoại <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Địa chỉ</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tên công ty</label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mã số thuế</label>
                    <input
                      type="text"
                      value={formData.tax_code}
                      onChange={(e) => setFormData({ ...formData, tax_code: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nhân viên quản lý</label>
                  <select
                    value={formData.account_manager_id}
                    onChange={(e) => setFormData({ ...formData, account_manager_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  >
                    <option value="">-- Chọn nhân viên --</option>
                    {salesEmployees
                      .filter((e) => e.is_active)
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.employee_code})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsEditModalOpen(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  {isAddModalOpen ? 'Thêm' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Customer Details Modal */}
      {isViewModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="text-emerald-600" />
                  Chi tiết khách hàng: {selectedCustomer.full_name}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Mã KH: {selectedCustomer.customer_code || `#${selectedCustomer.id}`}
                </p>
              </div>
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {/* Customer Info */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-slate-700 mb-3">Thông tin khách hàng</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Số điện thoại:</span>
                    <p className="font-medium text-slate-800">{selectedCustomer.phone}</p>
                  </div>
                  {selectedCustomer.email && (
                    <div>
                      <span className="text-slate-500">Email:</span>
                      <p className="font-medium text-slate-800">{selectedCustomer.email}</p>
                    </div>
                  )}
                  {selectedCustomer.company_name && (
                    <div>
                      <span className="text-slate-500">Công ty:</span>
                      <p className="font-medium text-slate-800">{selectedCustomer.company_name}</p>
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div>
                      <span className="text-slate-500">Địa chỉ:</span>
                      <p className="font-medium text-slate-800">{selectedCustomer.address}</p>
                    </div>
                  )}
                  {selectedCustomer.sales_employees && (
                    <div>
                      <span className="text-slate-500">NV quản lý:</span>
                      <p className="font-medium text-slate-800">{selectedCustomer.sales_employees.full_name}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ShoppingCart className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-blue-600 font-semibold uppercase">Tổng đơn hàng</p>
                      <p className="text-2xl font-bold text-blue-800">{orderStats.totalOrders}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-green-600 font-semibold uppercase">Doanh số</p>
                      <p className="text-2xl font-bold text-green-800">{formatCurrency(orderStats.totalRevenue)}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <DollarSign className="text-orange-600" size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-orange-600 font-semibold uppercase">Chi phí</p>
                      <p className="text-2xl font-bold text-orange-800">{formatCurrency(orderStats.totalCost)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Orders List */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-3">Danh sách đơn hàng</h4>
                {isLoadingOrders ? (
                  <div className="text-center py-8 text-slate-500">Đang tải...</div>
                ) : customerOrders.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">Chưa có đơn hàng nào</div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Mã đơn</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Mô tả</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Nhóm SP</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">NV Sale</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Số lượng</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Thành tiền</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Trạng thái</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Ngày đặt</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {customerOrders.map((order) => {
                            // Xử lý design_files có thể là array hoặc object
                            let designFiles: DesignFile[] = [];
                            if (Array.isArray(order.design_files)) {
                              designFiles = order.design_files;
                            } else if (order.design_files && typeof order.design_files === 'object') {
                              designFiles = [order.design_files as DesignFile];
                            }
                            
                            const imageFiles = designFiles.filter(f => f.thumbnail_url && f.thumbnail_url.trim() !== '');
                            const otherFiles = designFiles.filter(f => !f.thumbnail_url && f.google_drive_id);
                            const isExpanded = expandedOrderId === order.id;
                            // Lấy ảnh đầu tiên có thumbnail_url để hiển thị ở góc trái
                            const firstThumbnail = imageFiles.length > 0 ? imageFiles[0].thumbnail_url : null;
                            
                            return (
                              <>
                                <tr key={order.id} className="hover:bg-slate-50">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                      {firstThumbnail ? (
                                        <img
                                          src={String(firstThumbnail)}
                                          alt={order.order_code}
                                          className="w-12 h-12 object-cover rounded border border-slate-200 flex-shrink-0"
                                          onError={(e) => {
                                            // Nếu ảnh lỗi, ẩn và hiển thị icon thay thế
                                            e.currentTarget.style.display = 'none';
                                            const parent = e.currentTarget.parentElement;
                                            if (parent) {
                                              const fallback = parent.querySelector('.thumbnail-fallback') as HTMLElement;
                                              if (fallback) fallback.style.display = 'flex';
                                            }
                                          }}
                                        />
                                      ) : null}
                                      <div 
                                        className={`w-12 h-12 bg-slate-100 rounded border border-slate-200 flex items-center justify-center flex-shrink-0 thumbnail-fallback ${firstThumbnail ? 'hidden' : ''}`}
                                      >
                                        <ShoppingCart className="w-5 h-5 text-slate-400" />
                                      </div>
                                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                                        {order.order_code}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate" title={order.description}>
                                    {order.description || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {order.product_groups?.name || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {order.sales_employees?.full_name || '-'}
                                  </td>
                                  <td className="px-4 py-3 text-center text-slate-600">
                                    {order.quantity} {order.unit || 'cái'}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-green-600">
                                    {formatCurrency(Number(order.final_amount || 0))}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                      order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                      order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                      'bg-blue-100 text-blue-700'
                                    }`}>
                                      {order.status === 'completed' ? 'Hoàn thành' :
                                       order.status === 'pending' ? 'Chờ xử lý' :
                                       order.status === 'cancelled' ? 'Đã hủy' :
                                       order.status || 'Khác'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    {order.order_date ? new Date(order.order_date).toLocaleDateString('vi-VN') : 
                                     order.created_at ? new Date(order.created_at).toLocaleDateString('vi-VN') : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                                      className="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 hover:bg-blue-50 rounded"
                                      disabled={designFiles.length === 0}
                                    >
                                      {isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && designFiles.length > 0 && (
                                  <tr>
                                    <td colSpan={9} className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                                      <div className="space-y-4">
                                        {imageFiles.length > 0 && (
                                          <div>
                                            <h5 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                              <ImageIcon size={16} className="text-blue-600" />
                                              Link ảnh ({imageFiles.length})
                                            </h5>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                              {imageFiles.map((file) => (
                                                <a
                                                  key={file.id}
                                                  href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all group"
                                                >
                                                  {file.thumbnail_url ? (
                                                    <img
                                                      src={file.thumbnail_url}
                                                      alt={file.file_name}
                                                      className="w-16 h-16 object-cover rounded flex-shrink-0"
                                                    />
                                                  ) : (
                                                    <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                                                      <ImageIcon className="w-6 h-6 text-slate-400" />
                                                    </div>
                                                  )}
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-slate-600 truncate group-hover:text-blue-600 font-medium">
                                                      {file.file_name}
                                                    </p>
                                                    <ExternalLink className="w-3 h-3 text-slate-400 mt-1" />
                                                  </div>
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {otherFiles.length > 0 && (
                                          <div>
                                            <h5 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                                              <FileText size={16} className="text-green-600" />
                                              Link file ({otherFiles.length})
                                            </h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                              {otherFiles.map((file) => (
                                                <a
                                                  key={file.id}
                                                  href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-green-400 hover:shadow-sm transition-all group"
                                                >
                                                  <FileText className="w-5 h-5 text-green-600 flex-shrink-0" />
                                                  <span className="text-xs text-slate-600 truncate flex-1 group-hover:text-green-600 font-medium">
                                                    {file.file_name}
                                                  </span>
                                                  <ExternalLink className="w-3 h-3 text-slate-400" />
                                                </a>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {imageFiles.length === 0 && otherFiles.length === 0 && (
                                          <p className="text-sm text-slate-500 text-center py-4">Không có file nào</p>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
              <p className="text-slate-600">
                Bạn có chắc muốn xóa khách hàng <strong>{selectedCustomer.full_name}</strong> (
                {selectedCustomer.customer_code})?
              </p>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-slate-200">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
