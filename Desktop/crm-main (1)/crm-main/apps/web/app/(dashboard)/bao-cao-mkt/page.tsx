'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BarChart3,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  X,
  ChevronDown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface BaoCaoMkt {
  id: number;
  ho_va_ten: string;
  page: string | null;
  cpqc: number | null;
  so_mess: number | null;
  so_don: number | null;
  cps: number | null;
  ti_le_chot: number | null;
  created_at: string;
  updated_at: string;
}

interface LeadSource {
  id: number;
  name: string;
  type: string;
}

export default function BaoCaoMktPage() {
  const [data, setData] = useState<BaoCaoMkt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Lead sources
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [isPageDropdownOpen, setIsPageDropdownOpen] = useState(false);
  const pageDropdownRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<BaoCaoMkt | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    ho_va_ten: '',
    page: '',
    cpqc: '',
    so_mess: '',
    so_don: '',
    cps: '',
    ti_le_chot: '',
  });

  // Fetch lead sources
  useEffect(() => {
    const fetchLeadSources = async () => {
      try {
        const { data: sources, error } = await supabase
          .from('lead_sources')
          .select('id, name, type')
          .order('name', { ascending: true });

        if (error) throw error;
        setLeadSources(sources || []);
      } catch (error: any) {
        toast.error('Lỗi khi tải danh sách nguồn Lead: ' + error.message);
      } finally {
        setLoadingSources(false);
      }
    };

    fetchLeadSources();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(event.target as Node)) {
        setIsPageDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, [debouncedSearch]);

  const fetchData = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('bao_cao_mkt')
        .select('*')
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.or(`ho_va_ten.ilike.%${debouncedSearch}%,page.ilike.%${debouncedSearch}%`);
      }

      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
    } catch (error: any) {
      toast.error(error.message || 'Lỗi khi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
  };

  const openAddModal = () => {
    setFormData({
      ho_va_ten: '',
      page: '',
      cpqc: '',
      so_mess: '',
      so_don: '',
      cps: '',
      ti_le_chot: '',
    });
    setIsPageDropdownOpen(false);
    setIsAddModalOpen(true);
  };

  const handleSelectPage = async (pageName: string) => {
    setFormData({ ...formData, page: pageName });
    setIsPageDropdownOpen(false);
    
    // Tự động lấy số đơn từ orders theo page
    try {
      const selectedSource = leadSources.find(s => s.name === pageName);
      if (!selectedSource) return;

      // Bước 1: Lấy tất cả leads có source_id = selectedSource.id
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('id')
        .eq('source_id', selectedSource.id);

      if (leadsError) throw leadsError;
      const leadIds = (leadsData || []).map(l => l.id);
      if (leadIds.length === 0) {
        setFormData(prev => ({ ...prev, page: pageName, so_don: '0' }));
        return;
      }

      // Bước 2: Lấy tất cả customers có original_lead_id trong danh sách leads
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id')
        .in('original_lead_id', leadIds);

      if (customersError) throw customersError;
      const customerIds = (customersData || []).map(c => c.id);
      if (customerIds.length === 0) {
        setFormData(prev => ({ ...prev, page: pageName, so_don: '0' }));
        return;
      }

      // Bước 3: Đếm số orders có customer_id trong danh sách customers
      const { count, error: ordersError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('customer_id', customerIds);

      if (ordersError) throw ordersError;
      const soDon = count || 0;
      
      // Cập nhật số đơn và tự động tính CPS và tỉ lệ chốt
      const cpqc = formData.cpqc ? Number(formData.cpqc) : 0;
      const soMess = formData.so_mess ? Number(formData.so_mess) : 0;
      
      let cps = '';
      let tiLeChot = '';
      
      if (soDon > 0 && cpqc > 0) {
        cps = (cpqc / soDon).toFixed(2);
      }
      
      if (soMess > 0 && soDon > 0) {
        tiLeChot = ((soDon / soMess) * 100).toFixed(2);
      }
      
      setFormData({
        ...formData,
        page: pageName,
        so_don: soDon.toString(),
        cps: cps,
        ti_le_chot: tiLeChot,
      });
    } catch (error: any) {
      console.error('Error fetching orders:', error);
      toast.error('Lỗi khi lấy số đơn: ' + error.message);
    }
  };

  // Tự động tính CPS khi CPQC hoặc số đơn thay đổi
  useEffect(() => {
    if (formData.page && formData.cpqc && formData.so_don) {
      const cpqc = Number(formData.cpqc);
      const soDon = Number(formData.so_don);
      if (soDon > 0) {
        const cps = (cpqc / soDon).toFixed(2);
        setFormData(prev => ({ ...prev, cps }));
      }
    }
  }, [formData.cpqc, formData.so_don, formData.page]);

  // Tự động tính tỉ lệ chốt khi số đơn hoặc số mess thay đổi
  useEffect(() => {
    if (formData.so_mess && formData.so_don) {
      const soMess = Number(formData.so_mess);
      const soDon = Number(formData.so_don);
      if (soMess > 0) {
        const tiLeChot = ((soDon / soMess) * 100).toFixed(2);
        setFormData(prev => ({ ...prev, ti_le_chot: tiLeChot }));
      }
    }
  }, [formData.so_mess, formData.so_don]);

  const openEditModal = (item: BaoCaoMkt) => {
    setSelectedItem(item);
    setFormData({
      ho_va_ten: item.ho_va_ten,
      page: item.page || '',
      cpqc: item.cpqc?.toString() || '',
      so_mess: item.so_mess?.toString() || '',
      so_don: item.so_don?.toString() || '',
      cps: item.cps?.toString() || '',
      ti_le_chot: item.ti_le_chot?.toString() || '',
    });
    setIsPageDropdownOpen(false);
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (item: BaoCaoMkt) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('bao_cao_mkt').insert({
        ho_va_ten: formData.ho_va_ten,
        page: formData.page || null,
        cpqc: formData.cpqc ? Number(formData.cpqc) : 0,
        so_mess: formData.so_mess ? Number(formData.so_mess) : 0,
        so_don: formData.so_don ? Number(formData.so_don) : 0,
        cps: formData.cps ? Number(formData.cps) : 0,
        ti_le_chot: formData.ti_le_chot ? Number(formData.ti_le_chot) : 0,
      });

      if (error) throw error;
      toast.success('Thêm báo cáo MKT thành công!');
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể thêm báo cáo MKT');
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const { error } = await supabase
        .from('bao_cao_mkt')
        .update({
          ho_va_ten: formData.ho_va_ten,
          page: formData.page || null,
          cpqc: formData.cpqc ? Number(formData.cpqc) : 0,
          so_mess: formData.so_mess ? Number(formData.so_mess) : 0,
          so_don: formData.so_don ? Number(formData.so_don) : 0,
          cps: formData.cps ? Number(formData.cps) : 0,
          ti_le_chot: formData.ti_le_chot ? Number(formData.ti_le_chot) : 0,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('Cập nhật báo cáo MKT thành công!');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể cập nhật báo cáo MKT');
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    try {
      const { error } = await supabase.from('bao_cao_mkt').delete().eq('id', selectedItem.id);
      if (error) throw error;
      toast.success('Xóa báo cáo MKT thành công!');
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa báo cáo MKT');
    }
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (!amount) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <BarChart3 size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Báo cáo MKT</h2>
            <p className="text-slate-500 text-sm">Tổng: {data.length} bản ghi</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          <Plus size={20} /> Thêm mới
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm theo tên, page..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
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
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Không có dữ liệu</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                  <th className="p-4">ID</th>
                  <th className="p-4">Họ và tên</th>
                  <th className="p-4">Page</th>
                  <th className="p-4 text-right">CPQC</th>
                  <th className="p-4 text-center">Số mess</th>
                  <th className="p-4 text-center">Số đơn</th>
                  <th className="p-4 text-right">CPS</th>
                  <th className="p-4 text-center">Tỉ lệ chốt (%)</th>
                  <th className="p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-medium text-slate-800">{item.id}</td>
                    <td className="p-4 font-medium text-slate-800">{item.ho_va_ten}</td>
                    <td className="p-4 text-slate-600">{item.page || '-'}</td>
                    <td className="p-4 text-right text-slate-700">{formatCurrency(item.cpqc)}</td>
                    <td className="p-4 text-center text-slate-700">{item.so_mess || 0}</td>
                    <td className="p-4 text-center text-blue-600 font-semibold">{item.so_don || 0}</td>
                    <td className="p-4 text-right text-slate-700">{formatCurrency(item.cps)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        (item.ti_le_chot || 0) >= 50 
                          ? 'bg-green-100 text-green-700' 
                          : (item.ti_le_chot || 0) >= 30 
                          ? 'bg-yellow-100 text-yellow-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {item.ti_le_chot?.toFixed(1) || '0.0'}%
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => openDeleteModal(item)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Thêm báo cáo MKT</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.ho_va_ten}
                  onChange={(e) => setFormData({ ...formData, ho_va_ten: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Page</label>
                <div className="relative" ref={pageDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPageDropdownOpen(!isPageDropdownOpen)}
                    className={`w-full px-3 py-2 text-left border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none flex items-center justify-between ${
                      formData.page
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <span className={formData.page ? 'font-medium' : 'text-slate-400'}>
                      {formData.page || 'Chọn nguồn Lead...'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform ${isPageDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isPageDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {loadingSources ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Đang tải...</div>
                      ) : leadSources.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Không có nguồn Lead</div>
                      ) : (
                        leadSources.map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => handleSelectPage(source.name)}
                            className={`w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between ${
                              formData.page === source.name ? 'bg-blue-50' : ''
                            }`}
                          >
                            <span className="text-sm">{source.name}</span>
                            {formData.page === source.name && (
                              <Check size={16} className="text-blue-600" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CPQC</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.cpqc}
                    onChange={(e) => setFormData({ ...formData, cpqc: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Số mess</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.so_mess}
                    onChange={(e) => setFormData({ ...formData, so_mess: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Số đơn <span className="text-xs text-slate-500">(Tự động)</span>
                  </label>
                  <input
                    type="number"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.so_don}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    CPS <span className="text-xs text-slate-500">(Tự động = CPQC / Số đơn)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.cps}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tỉ lệ chốt (%) <span className="text-xs text-slate-500">(Tự động = Số đơn / Số mess × 100)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.ti_le_chot}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Thêm
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Sửa báo cáo MKT</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên *</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.ho_va_ten}
                  onChange={(e) => setFormData({ ...formData, ho_va_ten: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Page</label>
                <div className="relative" ref={pageDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsPageDropdownOpen(!isPageDropdownOpen)}
                    className={`w-full px-3 py-2 text-left border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none flex items-center justify-between ${
                      formData.page
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <span className={formData.page ? 'font-medium' : 'text-slate-400'}>
                      {formData.page || 'Chọn nguồn Lead...'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform ${isPageDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isPageDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {loadingSources ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Đang tải...</div>
                      ) : leadSources.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Không có nguồn Lead</div>
                      ) : (
                        leadSources.map((source) => (
                          <button
                            key={source.id}
                            type="button"
                            onClick={() => handleSelectPage(source.name)}
                            className={`w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between ${
                              formData.page === source.name ? 'bg-blue-50' : ''
                            }`}
                          >
                            <span className="text-sm">{source.name}</span>
                            {formData.page === source.name && (
                              <Check size={16} className="text-blue-600" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">CPQC</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.cpqc}
                    onChange={(e) => setFormData({ ...formData, cpqc: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Số mess</label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.so_mess}
                    onChange={(e) => setFormData({ ...formData, so_mess: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Số đơn <span className="text-xs text-slate-500">(Tự động)</span>
                  </label>
                  <input
                    type="number"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.so_don}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    CPS <span className="text-xs text-slate-500">(Tự động = CPQC / Số đơn)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.cps}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tỉ lệ chốt (%) <span className="text-xs text-slate-500">(Tự động = Số đơn / Số mess × 100)</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    readOnly
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                    value={formData.ti_le_chot}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Cập nhật
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa báo cáo MKT</h3>
              <p className="text-slate-600 mb-6">
                Bạn có chắc chắn muốn xóa báo cáo của <strong>{selectedItem?.ho_va_ten}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Xóa
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
