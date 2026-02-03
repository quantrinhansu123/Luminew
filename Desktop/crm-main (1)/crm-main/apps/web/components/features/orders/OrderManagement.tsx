'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Download,
  ShoppingCart,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  CreditCard,
  X,
  Plus,
  Users,
  Link2,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Order, OrderStatus, ORDER_STATUS_LABELS, STATUS_TRANSITIONS } from '@/types/order';
import { supabase } from '@/lib/supabase';
import { generateOrderCode } from '@/lib/codegen';

interface Customer {
  id: number;
  customer_code: string;
  full_name: string;
  phone: string;
  email?: string;
}

interface SalesEmployee {
  id: number;
  employee_code: string;
  full_name: string;
}

interface ProductGroup {
  id: number;
  name: string;
  code: string;
}

function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const byQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery?.[1]) return byQuery[1];
  const byPath = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath?.[1]) return byPath[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

const OrderManagement: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesEmployees, setSalesEmployees] = useState<SalesEmployee[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [viewOnly, setViewOnly] = useState(false);

  // Form states
  const [editForm, setEditForm] = useState<Partial<Order>>({});
  const [paymentForm, setPaymentForm] = useState({ content: '', amount: 0, method: 'transfer' });
  const [createForm, setCreateForm] = useState({
    customerId: '',
    productGroupId: '',
    salesEmployeeId: '',
    description: '',
    quantity: 1,
    unit: 'cái',
    unitPrice: 0,
    totalAmount: 0,
    finalAmount: 0,
  });
  
  // Design files form states
  const [imageLinkInput, setImageLinkInput] = useState('');
  const [imageFileNameInput, setImageFileNameInput] = useState('');
  const [fileLinkInput, setFileLinkInput] = useState('');
  const [fileFileNameInput, setFileFileNameInput] = useState('');
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isAddingFile, setIsAddingFile] = useState(false);
  
  // Order detail data
  const [orderDesignFiles, setOrderDesignFiles] = useState<any[]>([]);
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  const [isLoadingOrderDetail, setIsLoadingOrderDetail] = useState(false);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Fetch data
  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const { data, error: err } = await supabase
        .from('orders')
        .select(`
          *,
          customers:customer_id (
            id,
            customer_code,
            full_name,
            phone,
            email,
            address,
            company_name,
            account_manager_id,
            sales_employees:account_manager_id (
              id,
              employee_code,
              full_name,
              email,
              phone
            )
          ),
          product_groups:product_group_id (
            id,
            name,
            code
          ),
          sales_employees:sales_employee_id (
            id,
            employee_code,
            full_name,
            email,
            phone
          )
        `)
        .order('order_date', { ascending: false });
      
      if (err) throw err;
      setOrders(data || []);
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      toast.error(error.message || 'Lỗi khi tải đơn hàng');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error: err } = await supabase
        .from('customers')
        .select('id, customer_code, full_name, phone, email')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchSalesEmployees = async () => {
    try {
      const { data, error: err } = await supabase
        .from('sales_employees')
        .select('id, employee_code, full_name')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setSalesEmployees(data || []);
    } catch (error: any) {
      console.error('Error fetching sales employees:', error);
    }
  };

  const fetchProductGroups = async () => {
    try {
      const { data, error: err } = await supabase
        .from('product_groups')
        .select('id, name, code')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setProductGroups(data || []);
    } catch (error: any) {
      console.error('Error fetching product groups:', error);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
    fetchSalesEmployees();
    fetchProductGroups();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.action-menu')) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch =
        order.order_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customers?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customers?.phone?.includes(searchQuery);

      const matchesStatus = filterStatuses.length > 0
        ? filterStatuses.includes(order.status)
        : true;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, filterStatuses]);

  // Metrics
  const metrics = useMemo(() => ({
    customers: new Set(filteredOrders.map(o => o.customer_id)).size,
    orders: filteredOrders.length,
    revenue: filteredOrders.reduce((acc, o) => acc + Number(o.final_amount || 0), 0)
  }), [filteredOrders]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('vi-VN');
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.PENDING: return 'bg-amber-50 text-amber-700 border-amber-200';
      case OrderStatus.DESIGNING: return 'bg-purple-50 text-purple-700 border-purple-200';
      case OrderStatus.APPROVED: return 'bg-blue-50 text-blue-700 border-blue-200';
      case OrderStatus.PRINTING: return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case OrderStatus.COMPLETED: return 'bg-green-50 text-green-700 border-green-200';
      case OrderStatus.DELIVERED: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case OrderStatus.CANCELLED: return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  // Get allowed status options for current order
  const getAllowedStatusOptions = (currentStatus: OrderStatus): OrderStatus[] => {
    const allowed = STATUS_TRANSITIONS[currentStatus] || [];
    return [currentStatus, ...allowed];
  };

  // Handlers
  const handleOpenCreate = () => {
    setCreateForm({
      customerId: '',
      productGroupId: '',
      salesEmployeeId: '',
      description: '',
      quantity: 1,
      unit: 'cái',
      unitPrice: 0,
      totalAmount: 0,
      finalAmount: 0,
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateFormChange = (field: string, value: string | number) => {
    const updated = { ...createForm, [field]: value };

    // Auto-calculate totals
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? Number(value) : createForm.quantity;
      const unitPrice = field === 'unitPrice' ? Number(value) : createForm.unitPrice;
      updated.totalAmount = quantity * unitPrice;
      updated.finalAmount = quantity * unitPrice;
    }

    setCreateForm(updated);
  };

  const handleSubmitCreate = async () => {
    // Validate required fields
    if (!createForm.customerId) {
      toast.error('Vui lòng chọn khách hàng');
      return;
    }
    if (createForm.finalAmount <= 0) {
      toast.error('Vui lòng nhập thành tiền');
      return;
    }
    if (!createForm.description || !createForm.description.trim()) {
      toast.error('Vui lòng nhập mô tả đơn hàng');
      return;
    }
    if (!createForm.productGroupId) {
      toast.error('Vui lòng chọn nhóm sản phẩm');
      return;
    }
    if (!createForm.salesEmployeeId) {
      toast.error('Vui lòng chọn nhân viên sale');
      return;
    }
    if (!createForm.quantity || createForm.quantity <= 0) {
      toast.error('Vui lòng nhập số lượng');
      return;
    }
    if (!createForm.unitPrice || createForm.unitPrice <= 0) {
      toast.error('Vui lòng nhập đơn giá');
      return;
    }

    try {
      // Determine next status - if all required fields are filled, auto-transition from pending to designing
      const nextStatus = 'designing'; // Auto transition to designing when all fields are complete
      
      const { data, error: err } = await supabase
        .from('orders')
        .insert([{
          order_code: generateOrderCode(),
          customer_id: Number(createForm.customerId),
          product_group_id: createForm.productGroupId ? Number(createForm.productGroupId) : null,
          sales_employee_id: createForm.salesEmployeeId ? Number(createForm.salesEmployeeId) : null,
          description: createForm.description,
          quantity: createForm.quantity,
          unit: createForm.unit,
          unit_price: createForm.unitPrice,
          total_amount: createForm.totalAmount,
          final_amount: createForm.finalAmount,
          discount: 0,
          tax_amount: 0,
          status: nextStatus, // Auto set to designing instead of pending
        }])
        .select()
        .single();

      if (err) throw err;
      
      // Reset form
      setCreateForm({
        customerId: '',
        productGroupId: '',
        salesEmployeeId: '',
        description: '',
        quantity: 1,
        unit: 'cái',
        unitPrice: 0,
        totalAmount: 0,
        finalAmount: 0,
      });
      
      // Close modal automatically
      setIsCreateModalOpen(false);
      
      // Refresh orders
      await fetchOrders();
      
      toast.success(`Tạo đơn hàng thành công! Trạng thái: ${ORDER_STATUS_LABELS[nextStatus]}`);
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(error.message || 'Lỗi khi tạo đơn hàng');
    }
  };

  const handleOpenEdit = async (order: Order, isViewOnly: boolean = false) => {
    setSelectedOrder(order);
    setEditForm({ ...order });
    setViewOnly(isViewOnly);
    setIsEditModalOpen(true);
    setActiveDropdown(null);
    // Reset form inputs
    setImageLinkInput('');
    setImageFileNameInput('');
    setFileLinkInput('');
    setFileFileNameInput('');
    
    // Fetch order detail data
    setIsLoadingOrderDetail(true);
    try {
      const [filesRes, paymentsRes] = await Promise.all([
        supabase
          .from('design_files')
          .select('id, file_name, google_drive_id, thumbnail_url, file_category, created_at')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('payments')
          .select('id, content, amount, method, created_at')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false }),
      ]);
      
      if (filesRes.error) throw filesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      
      setOrderDesignFiles(filesRes.data || []);
      setOrderPayments(paymentsRes.data || []);
    } catch (error: any) {
      console.error('Error fetching order detail:', error);
      toast.error('Không thể tải chi tiết đơn hàng');
      setOrderDesignFiles([]);
      setOrderPayments([]);
    } finally {
      setIsLoadingOrderDetail(false);
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedOrder) return;

    try {
      const { error: err } = await supabase
        .from('orders')
        .update({
          description: editForm.description,
          status: editForm.status,
        })
        .eq('id', selectedOrder.id);

      if (err) throw err;
      await fetchOrders();
      setIsEditModalOpen(false);
      toast.success('Cập nhật đơn hàng thành công!');
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error(error.message || 'Lỗi khi cập nhật!');
    }
  };

  const handleOpenPayment = (order: Order) => {
    setSelectedOrder(order);
    setPaymentForm({ content: '', amount: Number(order.final_amount) || 0, method: 'transfer' });
    setIsPaymentModalOpen(true);
    setActiveDropdown(null);
  };

  const handleSubmitPayment = async () => {
    if (!selectedOrder) return;

    try {
      // Generate payment code
      const paymentCode = `TT${Date.now()}`;
      
      const { error: err } = await supabase
        .from('payments')
        .insert([{
          payment_code: paymentCode,
          customer_id: selectedOrder.customer_id,
          order_id: selectedOrder.id,
          amount: paymentForm.amount,
          payment_method: paymentForm.method,
          notes: paymentForm.content,
          status: 'paid',
          paid_at: new Date().toISOString(),
        }]);

      if (err) throw err;
      
      // Refresh order detail if modal is open
      if (selectedOrder.id) {
        const { data: files } = await supabase
          .from('design_files')
          .select('id, file_name, google_drive_id, thumbnail_url, file_category, created_at')
          .eq('order_id', selectedOrder.id)
          .order('created_at', { ascending: false });
        if (files) setOrderDesignFiles(files);
        
        const { data: payments } = await supabase
          .from('payments')
          .select('id, content, amount, method, created_at')
          .eq('order_id', selectedOrder.id)
          .order('created_at', { ascending: false });
        if (payments) setOrderPayments(payments);
      }
      
      await fetchOrders();
      setIsPaymentModalOpen(false);
      setPaymentForm({ content: '', amount: 0, method: 'transfer' });
      toast.success('Xác nhận thanh toán thành công! Giao dịch đã được ghi vào lịch sử.');
    } catch (error: any) {
      console.error('Error adding payment:', error);
      toast.error(error.message || 'Lỗi khi thêm thanh toán!');
    }
  };

  const handleDelete = async (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa đơn hàng',
      message: 'Bạn chắc chắn muốn xóa đơn hàng này?',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { error: err } = await supabase
            .from('orders')
            .delete()
            .eq('id', id);

          if (err) throw err;
          await fetchOrders();
          toast.success('Xóa đơn hàng thành công!');
        } catch (error: any) {
          console.error('Error deleting order:', error);
          toast.error(error.message || 'Lỗi khi xóa!');
        }
        setActiveDropdown(null);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-slate-500">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-100 text-red-600 rounded-lg">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Quản lý Đơn hàng</h2>
            <p className="text-slate-500 text-sm">Theo dõi tiến độ, thanh toán và yêu cầu thiết kế</p>
          </div>
        </div>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 active:bg-red-800 transition-colors shadow-md hover:shadow-lg whitespace-nowrap"
        >
          <Plus size={20} /> Thêm đơn hàng mới
        </button>
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 space-y-4">
        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm (Mã đơn, Tên khách, SĐT...)"
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
            >
              <Plus size={16} /> Thêm mới
            </button>
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              <Download size={16} /> Xuất Excel
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <MultiSelect
            label="Trạng thái"
            options={Object.values(OrderStatus)}
            selectedValues={filterStatuses}
            onChange={setFilterStatuses}
          />
        </div>

        {/* Metrics */}
        <div className="flex gap-6 border-t border-slate-100 pt-4">
          <div className="flex flex-col">
            <span className="text-xs text-slate-500 uppercase font-semibold">Số khách</span>
            <span className="text-xl font-bold text-slate-800">{metrics.customers}</span>
          </div>
          <div className="flex flex-col border-l pl-6 border-slate-100">
            <span className="text-xs text-slate-500 uppercase font-semibold">Số đơn</span>
            <span className="text-xl font-bold text-blue-600">{metrics.orders}</span>
          </div>
          <div className="flex flex-col border-l pl-6 border-slate-100">
            <span className="text-xs text-slate-500 uppercase font-semibold">Doanh số</span>
            <span className="text-xl font-bold text-green-600">{formatCurrency(metrics.revenue)}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col pb-20">
        <div className="overflow-x-auto overflow-y-visible min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold whitespace-nowrap">
                <th className="p-4">Mã đơn hàng</th>
                <th className="p-4 text-center">QR</th>
                <th className="p-4">Khách hàng</th>
                <th className="p-4">Sale</th>
                <th className="p-4">Ngày tạo</th>
                <th className="p-4">Mô tả</th>
                <th className="p-4 text-right">Tổng tiền</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredOrders.length > 0 ? filteredOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-4 font-bold text-slate-700">{order.order_code}</td>
                  <td className="p-4 text-center">
                    <div className="inline-flex items-center justify-center p-1 bg-white border border-slate-200 rounded">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${order.order_code}`}
                        alt="QR"
                        className="w-8 h-8 opacity-80"
                      />
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{order.customers?.full_name || '-'}</div>
                    <div className="text-xs text-slate-500">{order.customers?.phone || '-'}</div>
                  </td>
                  <td className="p-4 text-slate-600">{order.sales_employees?.full_name || '-'}</td>
                  <td className="p-4 text-slate-500">{formatDate(order.created_at)}</td>
                  <td className="p-4 text-slate-600 truncate max-w-[200px]" title={order.description}>
                    {order.description || '-'}
                  </td>
                  <td className="p-4 text-right font-bold text-green-600">
                    {formatCurrency(Number(order.final_amount || 0))}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${getStatusColor(order.status)}`}>
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td className="p-4 text-right relative action-menu">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === String(order.id) ? null : String(order.id));
                      }}
                      className={`p-2 rounded-full transition-colors ${
                        activeDropdown === String(order.id)
                          ? 'bg-slate-200 text-slate-800'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <MoreVertical size={18} />
                    </button>

                    {activeDropdown === String(order.id) && (
                      <div className="absolute right-8 top-8 z-50 w-48 bg-white rounded-lg shadow-xl border border-slate-100 py-1">
                        <button
                          onClick={() => handleOpenEdit(order, true)}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 font-medium"
                        >
                          <Eye size={14} /> Xem chi tiết
                        </button>
                        <button
                          onClick={() => handleOpenEdit(order, false)}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-600 flex items-center gap-2 font-medium"
                        >
                          <Edit size={14} /> Sửa đơn hàng
                        </button>
                        <button
                          onClick={() => handleOpenPayment(order)}
                          className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-green-600 flex items-center gap-2 font-medium"
                        >
                          <CreditCard size={14} /> Thanh toán
                        </button>
                        <div className="h-px bg-slate-100 my-1 mx-2"></div>
                        <button
                          onClick={() => handleDelete(order.id)}
                          className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-600 flex items-center gap-2 font-medium"
                        >
                          <Trash2 size={14} /> Xóa đơn
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    Không tìm thấy đơn hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Order Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[700px] max-w-[95vw] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus className="text-red-600" />
                Tạo đơn hàng mới
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Khách hàng <span className="text-red-500">*</span>
                </label>
                <select
                  value={createForm.customerId}
                  onChange={(e) => handleCreateFormChange('customerId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                >
                  <option value="">-- Chọn khách hàng --</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.full_name} - {customer.phone} ({customer.customer_code})
                    </option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Chưa có khách hàng. Vui lòng tạo khách hàng trước hoặc chuyển đổi từ Lead.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nhóm sản phẩm</label>
                  <select
                    value={createForm.productGroupId}
                    onChange={(e) => handleCreateFormChange('productGroupId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    <option value="">-- Chọn nhóm SP --</option>
                    {productGroups.map((pg) => (
                      <option key={pg.id} value={pg.id}>
                        {pg.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nhân viên Sale</label>
                  <select
                    value={createForm.salesEmployeeId}
                    onChange={(e) => handleCreateFormChange('salesEmployeeId', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  >
                    <option value="">-- Chọn NV Sale --</option>
                    {salesEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.employee_code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả đơn hàng</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => handleCreateFormChange('description', e.target.value)}
                  className="w-full px-3 py-2 h-20 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-red-500 outline-none"
                  placeholder="Mô tả chi tiết sản phẩm, yêu cầu..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Số lượng</label>
                  <input
                    type="number"
                    min="1"
                    value={createForm.quantity}
                    onChange={(e) => handleCreateFormChange('quantity', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị</label>
                  <input
                    type="text"
                    value={createForm.unit}
                    onChange={(e) => handleCreateFormChange('unit', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Đơn giá (VNĐ)</label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.unitPrice}
                    onChange={(e) => handleCreateFormChange('unitPrice', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tổng tiền</label>
                  <div className="text-lg font-bold text-slate-800">{formatCurrency(createForm.totalAmount)}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Thành tiền <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={createForm.finalAmount}
                    onChange={(e) => handleCreateFormChange('finalAmount', Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={handleSubmitCreate}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-sm"
              >
                Tạo đơn hàng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl p-6 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                {viewOnly ? <Eye className="text-blue-600" /> : <Edit className="text-blue-600" />}
                {viewOnly ? 'Xem chi tiết đơn hàng' : 'Cập nhật đơn hàng'}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Thông tin cơ bản - Header */}
              <div className="bg-gradient-to-r from-blue-50 to-slate-50 rounded-lg p-5 border border-slate-200">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-lg font-bold text-slate-900 mb-1">{selectedOrder.order_code}</h4>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedOrder.status)}`}>
                        {ORDER_STATUS_LABELS[selectedOrder.status] || selectedOrder.status}
                      </span>
                      {selectedOrder.created_at && (
                        <span className="text-xs text-slate-500">
                          Tạo: {new Date(selectedOrder.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Thông tin khách hàng chi tiết */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Thông tin khách hàng</label>
                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-slate-500 min-w-[80px]">Tên:</span>
                        <span className="text-sm font-medium text-slate-900">{selectedOrder.customers?.full_name || '-'}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-xs text-slate-500 min-w-[80px]">Mã KH:</span>
                        <span className="text-sm text-slate-700">{selectedOrder.customers?.customer_code || '-'}</span>
                      </div>
                      {selectedOrder.customers?.phone && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[80px]">SĐT:</span>
                          <a href={`tel:${selectedOrder.customers.phone}`} className="text-sm text-blue-600 hover:underline">
                            {selectedOrder.customers.phone}
                          </a>
                        </div>
                      )}
                      {selectedOrder.customers?.email && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[80px]">Email:</span>
                          <a href={`mailto:${selectedOrder.customers.email}`} className="text-sm text-blue-600 hover:underline truncate">
                            {selectedOrder.customers.email}
                          </a>
                        </div>
                      )}
                      {selectedOrder.customers?.company_name && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[80px]">Công ty:</span>
                          <span className="text-sm text-slate-700">{selectedOrder.customers.company_name}</span>
                        </div>
                      )}
                      {selectedOrder.customers?.address && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[80px]">Địa chỉ:</span>
                          <span className="text-sm text-slate-700">{selectedOrder.customers.address}</span>
                        </div>
                      )}
                      {selectedOrder.customers?.sales_employees && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[80px]">Account Manager:</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{selectedOrder.customers.sales_employees.full_name}</span>
                            {selectedOrder.customers.sales_employees.employee_code && (
                              <span className="text-xs text-slate-500">({selectedOrder.customers.sales_employees.employee_code})</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Thông tin đơn hàng</label>
                    <div className="space-y-1.5">
                      {selectedOrder.order_date && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Ngày đặt:</span>
                          <span className="text-sm text-slate-700">{new Date(selectedOrder.order_date).toLocaleDateString('vi-VN')}</span>
                        </div>
                      )}
                      {selectedOrder.expected_delivery && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Giao dự kiến:</span>
                          <span className="text-sm text-slate-700">{new Date(selectedOrder.expected_delivery).toLocaleDateString('vi-VN')}</span>
                        </div>
                      )}
                      {selectedOrder.actual_delivery && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Giao thực tế:</span>
                          <span className="text-sm text-green-700 font-medium">{new Date(selectedOrder.actual_delivery).toLocaleDateString('vi-VN')}</span>
                        </div>
                      )}
                      {selectedOrder.product_groups && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Nhóm sản phẩm:</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{selectedOrder.product_groups.name}</span>
                            {selectedOrder.product_groups.code && (
                              <span className="text-xs text-slate-500">({selectedOrder.product_groups.code})</span>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedOrder.sales_employees && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">NV Sale:</span>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{selectedOrder.sales_employees.full_name}</span>
                            {selectedOrder.sales_employees.employee_code && (
                              <span className="text-xs text-slate-500">({selectedOrder.sales_employees.employee_code})</span>
                            )}
                            {selectedOrder.sales_employees.email && (
                              <a href={`mailto:${selectedOrder.sales_employees.email}`} className="text-xs text-blue-600 hover:underline">
                                {selectedOrder.sales_employees.email}
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedOrder.quantity && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Số lượng:</span>
                          <span className="text-sm text-slate-700">
                            {selectedOrder.quantity} {selectedOrder.unit || 'cái'}
                          </span>
                        </div>
                      )}
                      {selectedOrder.unit_price && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-500 min-w-[100px]">Đơn giá:</span>
                          <span className="text-sm text-slate-700">{formatCurrency(Number(selectedOrder.unit_price))}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mô tả */}
              {selectedOrder.description && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Mô tả đơn hàng</label>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{selectedOrder.description}</p>
                </div>
              )}

              {/* Form chỉnh sửa mô tả */}
              {!viewOnly && (
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Chỉnh sửa mô tả</label>
                  <textarea
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2 h-24 border border-slate-300 rounded resize-none text-sm"
                    placeholder="Nhập mô tả đơn hàng..."
                  />
                </div>
              )}

              {/* Thông tin giá trị đơn hàng */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border border-green-200">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Thông tin giá trị</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Tổng tiền</span>
                    <span className="text-sm font-semibold text-slate-700">{formatCurrency(Number(selectedOrder.total_amount || 0))}</span>
                  </div>
                  {selectedOrder.discount && Number(selectedOrder.discount) > 0 && (
                    <div>
                      <span className="text-xs text-slate-500 block mb-1">Chiết khấu</span>
                      <span className="text-sm font-semibold text-red-600">-{formatCurrency(Number(selectedOrder.discount))}</span>
                    </div>
                  )}
                  {selectedOrder.tax_amount && Number(selectedOrder.tax_amount) > 0 && (
                    <div>
                      <span className="text-xs text-slate-500 block mb-1">Thuế</span>
                      <span className="text-sm font-semibold text-slate-700">+{formatCurrency(Number(selectedOrder.tax_amount))}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-slate-500 block mb-1">Thành tiền</span>
                    <span className="text-base font-bold text-green-700">{formatCurrency(Number(selectedOrder.final_amount || 0))}</span>
                  </div>
                </div>
              </div>

              {/* Chi tiết sản phẩm */}
              {selectedOrder.specifications && (selectedOrder.specifications as any).items && Array.isArray((selectedOrder.specifications as any).items) && (selectedOrder.specifications as any).items.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Chi tiết sản phẩm</label>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">Tên sản phẩm</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Số lượng</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Đơn giá</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(selectedOrder.specifications as any).items.map((item: any, index: number) => {
                          const itemPrice = Number(item.unit_price || item.price || item.unitPrice || 0);
                          const itemQuantity = Number(item.quantity || item.qty || 1);
                          const itemTotal = itemPrice * itemQuantity;
                          return (
                            <tr key={index} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-700">
                                {item.name || item.product_name || item.description || `Sản phẩm ${index + 1}`}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600">
                                {itemQuantity} {item.unit || 'cái'}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600">
                                {formatCurrency(itemPrice)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-800">
                                {formatCurrency(itemTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right font-semibold text-slate-700">
                            Tổng cộng:
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">
                            {formatCurrency(Number(selectedOrder.final_amount || 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Form thêm link ảnh và link file */}
              {!viewOnly && (
                <div className="space-y-4 border-t border-slate-200 pt-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-blue-600" />
                      Thêm link ảnh
                    </label>
                    <div className="space-y-2">
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={imageLinkInput}
                          onChange={(e) => setImageLinkInput(e.target.value)}
                          placeholder="Paste link Google Drive..."
                          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                      </div>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={imageFileNameInput}
                          onChange={(e) => setImageFileNameInput(e.target.value)}
                          placeholder="Nhập tên file (tùy chọn)..."
                          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!imageLinkInput.trim() || !selectedOrder) return;
                          const fileId = extractGoogleDriveFileId(imageLinkInput);
                          if (!fileId) {
                            toast.error('Link không hợp lệ');
                            return;
                          }
                          setIsAddingImage(true);
                          try {
                            const { error } = await supabase.from('design_files').insert([
                              {
                                customer_id: selectedOrder.customer_id,
                                order_id: selectedOrder.id,
                                file_name: imageFileNameInput.trim() || `image-${fileId.slice(0, 8)}`,
                                storage_path: `gdrive://${fileId}`,
                                google_drive_id: fileId,
                                thumbnail_url: `https://drive.google.com/thumbnail?id=${fileId}`,
                                file_category: 'request',
                              },
                            ]);
                            if (error) throw error;
                            toast.success('Đã thêm link ảnh');
                            setImageLinkInput('');
                            setImageFileNameInput('');
                            // Refresh design files
                            const { data: files } = await supabase
                              .from('design_files')
                              .select('id, file_name, google_drive_id, thumbnail_url, file_category, created_at')
                              .eq('order_id', selectedOrder.id)
                              .order('created_at', { ascending: false });
                            if (files) setOrderDesignFiles(files);
                            fetchOrders();
                          } catch (error: any) {
                            toast.error(error.message || 'Lỗi khi thêm link ảnh');
                          } finally {
                            setIsAddingImage(false);
                          }
                        }}
                        disabled={isAddingImage || !imageLinkInput.trim()}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                      >
                        {isAddingImage ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Thêm link ảnh'
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-600" />
                      Thêm link file
                    </label>
                    <div className="space-y-2">
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={fileLinkInput}
                          onChange={(e) => setFileLinkInput(e.target.value)}
                          placeholder="Paste link Google Drive..."
                          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                        />
                      </div>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={fileFileNameInput}
                          onChange={(e) => setFileFileNameInput(e.target.value)}
                          placeholder="Nhập tên file (tùy chọn)..."
                          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-sm"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!fileLinkInput.trim() || !selectedOrder) return;
                          const fileId = extractGoogleDriveFileId(fileLinkInput);
                          if (!fileId) {
                            toast.error('Link không hợp lệ');
                            return;
                          }
                          setIsAddingFile(true);
                          try {
                            const { error } = await supabase.from('design_files').insert([
                              {
                                customer_id: selectedOrder.customer_id,
                                order_id: selectedOrder.id,
                                file_name: fileFileNameInput.trim() || `file-${fileId.slice(0, 8)}`,
                                storage_path: `gdrive://${fileId}`,
                                google_drive_id: fileId,
                                file_category: 'request',
                              },
                            ]);
                            if (error) throw error;
                            toast.success('Đã thêm link file');
                            setFileLinkInput('');
                            setFileFileNameInput('');
                            // Refresh design files
                            const { data: files } = await supabase
                              .from('design_files')
                              .select('id, file_name, google_drive_id, thumbnail_url, file_category, created_at')
                              .eq('order_id', selectedOrder.id)
                              .order('created_at', { ascending: false });
                            if (files) setOrderDesignFiles(files);
                            fetchOrders();
                          } catch (error: any) {
                            toast.error(error.message || 'Lỗi khi thêm link file');
                          } finally {
                            setIsAddingFile(false);
                          }
                        }}
                        disabled={isAddingFile || !fileLinkInput.trim()}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                      >
                        {isAddingFile ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Thêm link file'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Design Files */}
              {isLoadingOrderDetail ? (
                <div className="text-center py-4 text-slate-500">Đang tải...</div>
              ) : (
                <>
                  {orderDesignFiles.length > 0 && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold text-slate-700 mb-3">Tài liệu & Thiết kế</h4>
                      <div className="space-y-3">
                        {orderDesignFiles.filter(f => f.thumbnail_url).length > 0 && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-2">Link ảnh ({orderDesignFiles.filter(f => f.thumbnail_url).length})</label>
                            <div className="grid grid-cols-2 gap-2">
                              {orderDesignFiles.filter(f => f.thumbnail_url).map((file) => (
                                <a
                                  key={file.id}
                                  href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all group"
                                >
                                  {file.thumbnail_url && (
                                    <img
                                      src={file.thumbnail_url}
                                      alt={file.file_name}
                                      className="w-12 h-12 object-cover rounded flex-shrink-0"
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-600 truncate group-hover:text-blue-600 font-medium">
                                      {file.file_name}
                                    </p>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {orderDesignFiles.filter(f => !f.thumbnail_url && f.google_drive_id).length > 0 && (
                          <div>
                            <label className="block text-xs text-slate-500 mb-2">Link file ({orderDesignFiles.filter(f => !f.thumbnail_url && f.google_drive_id).length})</label>
                            <div className="space-y-1">
                              {orderDesignFiles.filter(f => !f.thumbnail_url && f.google_drive_id).map((file) => (
                                <a
                                  key={file.id}
                                  href={file.google_drive_id ? `https://drive.google.com/file/d/${file.google_drive_id}/view` : '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-green-400 hover:shadow-sm transition-all group"
                                >
                                  <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <span className="text-xs text-slate-600 truncate flex-1 group-hover:text-green-600 font-medium">
                                    {file.file_name}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Lịch sử thanh toán */}
                  {orderPayments.length > 0 && (
                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold text-slate-700 mb-3">Lịch sử thanh toán</h4>
                      <div className="space-y-2">
                        {orderPayments.map((payment) => (
                          <div key={payment.id} className="bg-green-50 rounded-lg p-3 border border-green-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-slate-800 text-sm">{payment.notes || payment.content || 'Thanh toán'}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {formatDate(payment.created_at)} • {(payment.payment_method || payment.method) === 'transfer' ? 'Chuyển khoản' : (payment.payment_method || payment.method) === 'cash' ? 'Tiền mặt' : 'Thẻ'}
                                </p>
                              </div>
                              <p className="font-bold text-green-700">{formatCurrency(Number(payment.amount || 0))}</p>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-green-200">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">Tổng đã thanh toán:</span>
                            <span className="font-bold text-green-700">
                              {formatCurrency(orderPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0))}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm text-slate-600">Còn lại:</span>
                            <span className="font-semibold text-slate-800">
                              {formatCurrency(Number(selectedOrder.final_amount || 0) - orderPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Chỉnh sửa trạng thái */}
              {!viewOnly && (
                <div className="border-t border-slate-200 pt-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cập nhật trạng thái</label>
                  <select
                    value={editForm.status || ''}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as OrderStatus })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                    {getAllowedStatusOptions(selectedOrder.status).map(st => (
                      <option key={st} value={st}>{ORDER_STATUS_LABELS[st] || st}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Chỉ có thể chuyển sang các trạng thái được phép
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Đóng
              </button>
              {!viewOnly && (
                <button
                  onClick={handleSubmitEdit}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shadow-sm"
                >
                  Lưu thay đổi
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-w-[90vw] p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="text-green-600" />
                Xác nhận Thanh toán
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nội dung thanh toán</label>
                <input
                  value={paymentForm.content}
                  onChange={(e) => setPaymentForm({ ...paymentForm, content: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded focus:border-blue-500 outline-none"
                  placeholder="Ví dụ: Đặt cọc lần 1, Thanh toán đủ..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  className="w-full p-2 border border-slate-300 rounded focus:border-blue-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phương thức</label>
                <select
                  value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded focus:border-blue-500 outline-none"
                >
                  <option value="transfer">Chuyển khoản</option>
                  <option value="cash">Tiền mặt</option>
                  <option value="card">Thẻ</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSubmitPayment}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Xác nhận thanh toán
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
};

export default OrderManagement;
