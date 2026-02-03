'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Target,
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

interface Kpis {
  id: number;
  ho_ten: string;
  bo_phan: string | null;
  kpi_thang: number | null;
  kpi_tuan: number | null;
  kpi_ngay: number | null;
  created_at: string;
  updated_at: string;
}

interface SalesEmployee {
  id: number;
  full_name: string;
  employee_code: string | null;
}

export default function KpisPage() {
  const [data, setData] = useState<Kpis[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Sales employees and departments
  const [salesEmployees, setSalesEmployees] = useState<SalesEmployee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);

  // Dropdown states
  const [isNameDropdownOpen, setIsNameDropdownOpen] = useState(false);
  const [isDepartmentDropdownOpen, setIsDepartmentDropdownOpen] = useState(false);
  const [departmentSearchQuery, setDepartmentSearchQuery] = useState('');
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const departmentDropdownRef = useRef<HTMLDivElement>(null);
  const departmentInputRef = useRef<HTMLInputElement>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Kpis | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    ho_ten: '',
    bo_phan: '',
    kpi_thang: '',
    kpi_tuan: '',
    kpi_ngay: '',
  });

  // Suggested values for KPI tuần and ngày
  const [suggestedKpiTuan, setSuggestedKpiTuan] = useState<string>('');
  const [suggestedKpiNgay, setSuggestedKpiNgay] = useState<string>('');

  // Fetch sales employees
  useEffect(() => {
    const fetchSalesEmployees = async () => {
      try {
        const { data: employees, error } = await supabase
          .from('sales_employees')
          .select('id, full_name, employee_code')
          .eq('is_active', true)
          .order('full_name', { ascending: true });

        if (error) throw error;
        setSalesEmployees(employees || []);
      } catch (error: any) {
        toast.error('Lỗi khi tải danh sách nhân viên: ' + error.message);
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchSalesEmployees();
  }, []);

  // Fetch departments from existing KPIs
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const { data: kpisData, error } = await supabase
          .from('kpis')
          .select('bo_phan')
          .not('bo_phan', 'is', null);

        if (error) throw error;
        const uniqueDepartments = Array.from(
          new Set(
            (kpisData || [])
              .map((k) => k.bo_phan)
              .filter((d): d is string => d !== null && d !== undefined)
          )
        ).sort();
        setDepartments(uniqueDepartments);
      } catch (error: any) {
        console.error('Error fetching departments:', error);
      }
    };

    fetchDepartments();
  }, [data]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (nameDropdownRef.current && !nameDropdownRef.current.contains(event.target as Node)) {
        setIsNameDropdownOpen(false);
      }
      if (departmentDropdownRef.current && !departmentDropdownRef.current.contains(event.target as Node)) {
        setIsDepartmentDropdownOpen(false);
        setDepartmentSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus department input when dropdown opens
  useEffect(() => {
    if (isDepartmentDropdownOpen) {
      setTimeout(() => departmentInputRef.current?.focus(), 100);
    }
  }, [isDepartmentDropdownOpen]);

  // Tự động tính và điền KPI tuần và ngày từ KPI tháng
  useEffect(() => {
    if (formData.kpi_thang) {
      const kpiThang = Number(formData.kpi_thang);
      if (kpiThang > 0) {
        // KPI tuần = KPI tháng / 4 (1 tháng = 4 tuần)
        const kpiTuan = (kpiThang / 4).toFixed(2);
        // KPI ngày = KPI tháng / 30 (1 tháng = 30 ngày)
        const kpiNgay = (kpiThang / 30).toFixed(2);
        
        setSuggestedKpiTuan(kpiTuan);
        setSuggestedKpiNgay(kpiNgay);
        
        // Tự động điền luôn giá trị gợi ý
        setFormData(prev => ({
          ...prev,
          kpi_tuan: kpiTuan,
          kpi_ngay: kpiNgay,
        }));
      } else {
        setSuggestedKpiTuan('');
        setSuggestedKpiNgay('');
        setFormData(prev => ({
          ...prev,
          kpi_tuan: '',
          kpi_ngay: '',
        }));
      }
    } else {
      setSuggestedKpiTuan('');
      setSuggestedKpiNgay('');
      setFormData(prev => ({
        ...prev,
        kpi_tuan: '',
        kpi_ngay: '',
      }));
    }
  }, [formData.kpi_thang]);

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

  // Filter departments based on search
  const filteredDepartments = useMemo(() => {
    if (!departmentSearchQuery) return departments;
    const query = departmentSearchQuery.toLowerCase();
    return departments.filter((dept) => dept.toLowerCase().includes(query));
  }, [departments, departmentSearchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('kpis')
        .select('*')
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        query = query.or(`ho_ten.ilike.%${debouncedSearch}%,bo_phan.ilike.%${debouncedSearch}%`);
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
      ho_ten: '',
      bo_phan: '',
      kpi_thang: '',
      kpi_tuan: '',
      kpi_ngay: '',
    });
    setSuggestedKpiTuan('');
    setSuggestedKpiNgay('');
    setIsNameDropdownOpen(false);
    setIsDepartmentDropdownOpen(false);
    setDepartmentSearchQuery('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: Kpis) => {
    setSelectedItem(item);
    const kpiThang = item.kpi_thang?.toString() || '';
    setFormData({
      ho_ten: item.ho_ten,
      bo_phan: item.bo_phan || '',
      kpi_thang: kpiThang,
      kpi_tuan: item.kpi_tuan?.toString() || '',
      kpi_ngay: item.kpi_ngay?.toString() || '',
    });
    
    // Tính giá trị gợi ý
    if (kpiThang) {
      const kpiThangNum = Number(kpiThang);
      if (kpiThangNum > 0) {
        setSuggestedKpiTuan((kpiThangNum / 4).toFixed(2));
        setSuggestedKpiNgay((kpiThangNum / 30).toFixed(2));
      }
    } else {
      setSuggestedKpiTuan('');
      setSuggestedKpiNgay('');
    }
    
    setIsNameDropdownOpen(false);
    setIsDepartmentDropdownOpen(false);
    setDepartmentSearchQuery('');
    setIsEditModalOpen(true);
  };

  const handleSelectEmployee = (employeeName: string) => {
    setFormData({ ...formData, ho_ten: employeeName });
    setIsNameDropdownOpen(false);
  };

  const handleSelectDepartment = (dept: string) => {
    setFormData({ ...formData, bo_phan: dept });
    setIsDepartmentDropdownOpen(false);
    setDepartmentSearchQuery('');
  };

  const handleAddNewDepartment = () => {
    if (departmentSearchQuery.trim() && !departments.includes(departmentSearchQuery.trim())) {
      const newDept = departmentSearchQuery.trim();
      setFormData({ ...formData, bo_phan: newDept });
      setDepartments([...departments, newDept].sort());
      setIsDepartmentDropdownOpen(false);
      setDepartmentSearchQuery('');
    }
  };

  const openDeleteModal = (item: Kpis) => {
    setSelectedItem(item);
    setIsDeleteModalOpen(true);
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('kpis').insert({
        ho_ten: formData.ho_ten,
        bo_phan: formData.bo_phan || null,
        kpi_thang: formData.kpi_thang ? Number(formData.kpi_thang) : 0,
        kpi_tuan: formData.kpi_tuan ? Number(formData.kpi_tuan) : 0,
        kpi_ngay: formData.kpi_ngay ? Number(formData.kpi_ngay) : 0,
      });

      if (error) throw error;
      toast.success('Thêm KPIs thành công!');
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể thêm KPIs');
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const { error } = await supabase
        .from('kpis')
        .update({
          ho_ten: formData.ho_ten,
          bo_phan: formData.bo_phan || null,
          kpi_thang: formData.kpi_thang ? Number(formData.kpi_thang) : 0,
          kpi_tuan: formData.kpi_tuan ? Number(formData.kpi_tuan) : 0,
          kpi_ngay: formData.kpi_ngay ? Number(formData.kpi_ngay) : 0,
        })
        .eq('id', selectedItem.id);

      if (error) throw error;
      toast.success('Cập nhật KPIs thành công!');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể cập nhật KPIs');
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    try {
      const { error } = await supabase.from('kpis').delete().eq('id', selectedItem.id);
      if (error) throw error;
      toast.success('Xóa KPIs thành công!');
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa KPIs');
    }
  };

  const formatNumber = (num: number | null | undefined) => {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('vi-VN').format(num);
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
            <Target size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Quản lý KPIs</h2>
            <p className="text-slate-500 text-sm">Tổng: {data.length} bản ghi</p>
          </div>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shadow-md"
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
              placeholder="Tìm theo tên, bộ phận..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
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
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                  <th className="p-4">ID</th>
                  <th className="p-4">Họ tên</th>
                  <th className="p-4">Bộ phận</th>
                  <th className="p-4 text-right">KPI tháng</th>
                  <th className="p-4 text-right">KPI tuần</th>
                  <th className="p-4 text-right">KPI ngày</th>
                  <th className="p-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-medium text-slate-800">{item.id}</td>
                    <td className="p-4 font-medium text-slate-800">{item.ho_ten}</td>
                    <td className="p-4 text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 rounded-md text-xs">
                        {item.bo_phan || '-'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-semibold text-purple-600">{formatNumber(item.kpi_thang)}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-semibold text-blue-600">{formatNumber(item.kpi_tuan)}</span>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-semibold text-green-600">{formatNumber(item.kpi_ngay)}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
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
              <h3 className="text-xl font-bold text-slate-800">Thêm KPIs</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên *</label>
                <div className="relative" ref={nameDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsNameDropdownOpen(!isNameDropdownOpen)}
                    className={`w-full px-3 py-2 text-left border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none flex items-center justify-between ${
                      formData.ho_ten
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <span className={formData.ho_ten ? 'font-medium' : 'text-slate-400'}>
                      {formData.ho_ten || 'Chọn nhân viên...'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform ${isNameDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isNameDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {loadingEmployees ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Đang tải...</div>
                      ) : salesEmployees.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Không có nhân viên</div>
                      ) : (
                        salesEmployees.map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleSelectEmployee(emp.full_name)}
                            className={`w-full px-3 py-2 text-left hover:bg-purple-50 flex items-center justify-between ${
                              formData.ho_ten === emp.full_name ? 'bg-purple-50' : ''
                            }`}
                          >
                            <span className="text-sm">{emp.full_name}</span>
                            {formData.ho_ten === emp.full_name && (
                              <Check size={16} className="text-purple-600" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                <div className="relative" ref={departmentDropdownRef}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      ref={departmentInputRef}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                      value={formData.bo_phan}
                      onChange={(e) => setFormData({ ...formData, bo_phan: e.target.value })}
                      onFocus={() => setIsDepartmentDropdownOpen(true)}
                      placeholder="Nhập hoặc chọn bộ phận..."
                    />
                    <button
                      type="button"
                      onClick={() => setIsDepartmentDropdownOpen(!isDepartmentDropdownOpen)}
                      className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform ${isDepartmentDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {isDepartmentDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      <div className="p-2 border-b border-slate-200">
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                          placeholder="Tìm kiếm bộ phận..."
                          value={departmentSearchQuery}
                          onChange={(e) => setDepartmentSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="max-h-48 overflow-auto">
                        {filteredDepartments.length === 0 && !departmentSearchQuery ? (
                          <div className="p-3 text-sm text-slate-500 text-center">Không có bộ phận</div>
                        ) : (
                          <>
                            {filteredDepartments.map((dept) => (
                              <button
                                key={dept}
                                type="button"
                                onClick={() => handleSelectDepartment(dept)}
                                className={`w-full px-3 py-2 text-left hover:bg-purple-50 flex items-center justify-between ${
                                  formData.bo_phan === dept ? 'bg-purple-50' : ''
                                }`}
                              >
                                <span className="text-sm">{dept}</span>
                                {formData.bo_phan === dept && (
                                  <Check size={16} className="text-purple-600" />
                                )}
                              </button>
                            ))}
                            {departmentSearchQuery.trim() &&
                              !departments.includes(departmentSearchQuery.trim()) && (
                                <button
                                  type="button"
                                  onClick={handleAddNewDepartment}
                                  className="w-full px-3 py-2 text-left hover:bg-green-50 text-green-600 border-t border-slate-200"
                                >
                                  <span className="text-sm">+ Thêm "{departmentSearchQuery.trim()}"</span>
                                </button>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">KPI tháng</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_thang}
                    onChange={(e) => setFormData({ ...formData, kpi_thang: e.target.value })}
                    placeholder="Nhập KPI tháng..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    KPI tuần
                    {suggestedKpiTuan && (
                      <span className="text-xs text-blue-600 font-normal ml-2">
                        (Gợi ý: {new Intl.NumberFormat('vi-VN').format(Number(suggestedKpiTuan))})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_tuan}
                    onChange={(e) => setFormData({ ...formData, kpi_tuan: e.target.value })}
                    placeholder={suggestedKpiTuan || "Nhập KPI tuần..."}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    KPI ngày
                    {suggestedKpiNgay && (
                      <span className="text-xs text-green-600 font-normal ml-2">
                        (Gợi ý: {new Intl.NumberFormat('vi-VN').format(Number(suggestedKpiNgay))})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_ngay}
                    onChange={(e) => setFormData({ ...formData, kpi_ngay: e.target.value })}
                    placeholder={suggestedKpiNgay || "Nhập KPI ngày..."}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
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
              <h3 className="text-xl font-bold text-slate-800">Sửa KPIs</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmitEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Họ tên *</label>
                <div className="relative" ref={nameDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsNameDropdownOpen(!isNameDropdownOpen)}
                    className={`w-full px-3 py-2 text-left border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none flex items-center justify-between ${
                      formData.ho_ten
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <span className={formData.ho_ten ? 'font-medium' : 'text-slate-400'}>
                      {formData.ho_ten || 'Chọn nhân viên...'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform ${isNameDropdownOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isNameDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {loadingEmployees ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Đang tải...</div>
                      ) : salesEmployees.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500 text-center">Không có nhân viên</div>
                      ) : (
                        salesEmployees.map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleSelectEmployee(emp.full_name)}
                            className={`w-full px-3 py-2 text-left hover:bg-purple-50 flex items-center justify-between ${
                              formData.ho_ten === emp.full_name ? 'bg-purple-50' : ''
                            }`}
                          >
                            <span className="text-sm">{emp.full_name}</span>
                            {formData.ho_ten === emp.full_name && (
                              <Check size={16} className="text-purple-600" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bộ phận</label>
                <div className="relative" ref={departmentDropdownRef}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      ref={departmentInputRef}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                      value={formData.bo_phan}
                      onChange={(e) => setFormData({ ...formData, bo_phan: e.target.value })}
                      onFocus={() => setIsDepartmentDropdownOpen(true)}
                      placeholder="Nhập hoặc chọn bộ phận..."
                    />
                    <button
                      type="button"
                      onClick={() => setIsDepartmentDropdownOpen(!isDepartmentDropdownOpen)}
                      className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
                    >
                      <ChevronDown
                        size={16}
                        className={`text-slate-400 transition-transform ${isDepartmentDropdownOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </div>
                  {isDepartmentDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      <div className="p-2 border-b border-slate-200">
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                          placeholder="Tìm kiếm bộ phận..."
                          value={departmentSearchQuery}
                          onChange={(e) => setDepartmentSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="max-h-48 overflow-auto">
                        {filteredDepartments.length === 0 && !departmentSearchQuery ? (
                          <div className="p-3 text-sm text-slate-500 text-center">Không có bộ phận</div>
                        ) : (
                          <>
                            {filteredDepartments.map((dept) => (
                              <button
                                key={dept}
                                type="button"
                                onClick={() => handleSelectDepartment(dept)}
                                className={`w-full px-3 py-2 text-left hover:bg-purple-50 flex items-center justify-between ${
                                  formData.bo_phan === dept ? 'bg-purple-50' : ''
                                }`}
                              >
                                <span className="text-sm">{dept}</span>
                                {formData.bo_phan === dept && (
                                  <Check size={16} className="text-purple-600" />
                                )}
                              </button>
                            ))}
                            {departmentSearchQuery.trim() &&
                              !departments.includes(departmentSearchQuery.trim()) && (
                                <button
                                  type="button"
                                  onClick={handleAddNewDepartment}
                                  className="w-full px-3 py-2 text-left hover:bg-green-50 text-green-600 border-t border-slate-200"
                                >
                                  <span className="text-sm">+ Thêm "{departmentSearchQuery.trim()}"</span>
                                </button>
                              )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">KPI tháng</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_thang}
                    onChange={(e) => setFormData({ ...formData, kpi_thang: e.target.value })}
                    placeholder="Nhập KPI tháng..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    KPI tuần
                    {suggestedKpiTuan && (
                      <span className="text-xs text-blue-600 font-normal ml-2">
                        (Gợi ý: {new Intl.NumberFormat('vi-VN').format(Number(suggestedKpiTuan))})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_tuan}
                    onChange={(e) => setFormData({ ...formData, kpi_tuan: e.target.value })}
                    placeholder={suggestedKpiTuan || "Nhập KPI tuần..."}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    KPI ngày
                    {suggestedKpiNgay && (
                      <span className="text-xs text-green-600 font-normal ml-2">
                        (Gợi ý: {new Intl.NumberFormat('vi-VN').format(Number(suggestedKpiNgay))})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={formData.kpi_ngay}
                    onChange={(e) => setFormData({ ...formData, kpi_ngay: e.target.value })}
                    placeholder={suggestedKpiNgay || "Nhập KPI ngày..."}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
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
              <h3 className="text-xl font-bold text-slate-800 mb-2">Xóa KPIs</h3>
              <p className="text-slate-600 mb-6">
                Bạn có chắc chắn muốn xóa KPIs của <strong>{selectedItem?.ho_ten}</strong>?
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
