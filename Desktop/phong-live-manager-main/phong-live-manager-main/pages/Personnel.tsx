import React, { useState, useEffect, useMemo } from 'react';
import { fetchPersonnel, createPersonnel, updatePersonnel, deletePersonnel, fetchLiveReports, MOCK_VIDEO_METRICS, fetchStores } from '../services/dataService';
import { FilterBar } from '../components/FilterBar';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { formatCurrency, matchNames } from '../utils/formatUtils';
import { Personnel as PersonnelType, LiveReport, ReportType } from '../types';
import { isPartner, getPartnerId, isAdmin, getCurrentUserId, isRegularEmployee, getCurrentUserName } from '../utils/permissionUtils';

// Menu items list (same as in Sidebar)
const MENU_ITEMS = [
  { id: ReportType.DASHBOARD, label: 'Dashboard (仪表板)' },
  { id: ReportType.LIVE_ADS, label: 'Quản lý Live (直播管理)' },
  { id: 'live_report_detail', label: 'Chi tiết Báo Cáo Live (直播报告详情)' },
  { id: ReportType.VIDEO_PARAM, label: 'Quản lý Video & KPI (视频和KPI管理)' },
  { id: ReportType.STORE_MGR, label: 'Quản lý Cửa Hàng (店铺管理)' },
  { id: 'store_overview', label: 'Tổng Quan Cửa Hàng (店铺总览)' },
  { id: ReportType.PERSONNEL, label: 'Nhân sự (人事)' },
  { id: ReportType.CPQC, label: 'CPQC (成本管理)' },
  { id: ReportType.SALARY_REPORT, label: 'Báo Cáo Lương (工资报告)' },
];

export const Personnel: React.FC = () => {
  const [personnelList, setPersonnelList] = useState<PersonnelType[]>([]);
  const [liveReports, setLiveReports] = useState<LiveReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'salary' | 'assignKPI'>('list');
  
  // Filter state
  const [searchText, setSearchText] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(today.toISOString().split('T')[0]);
  
  // Filter state for salary tab
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
  );

  // Modal State
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonnelType | null>(null); // For Details View
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showSalaryKPIModal, setShowSalaryKPIModal] = useState(false);
  const [selectedPersonForSalaryKPI, setSelectedPersonForSalaryKPI] = useState<PersonnelType | null>(null);
  const [salaryKPIFormData, setSalaryKPIFormData] = useState({ salary: 0, kpi: 0 });
  
  // KPI Assignment state
  const [kpiPeriodType, setKpiPeriodType] = useState<'month' | 'week'>('month');
  const currentDateForKPI = new Date();
  const [kpiPeriodValue, setKpiPeriodValue] = useState<string>(`${currentDateForKPI.getFullYear()}-${String(currentDateForKPI.getMonth() + 1).padStart(2, '0')}`);
  const [selectedPersonnelForKPI, setSelectedPersonnelForKPI] = useState<string[]>([]);
  const [kpiTargetValue, setKpiTargetValue] = useState<number>(0);
  const [kpiNotes, setKpiNotes] = useState<string>('');
  const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);
  const [personnelSearchText, setPersonnelSearchText] = useState('');

  // Form State
  const initialFormState = {
    id: '',
    fullName: '',
    department: '',
    position: '',
    phoneNumber: '',
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin' | 'partner',
    baseSalary: 0,
    monthlyKPITarget: 0,
    allowedMenuIds: [] as string[]
  };
  const [formData, setFormData] = useState<PersonnelType>(initialFormState);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let [people, reports, stores] = await Promise.all([
        fetchPersonnel(),
        fetchLiveReports(),
        fetchStores()
      ]);
      
      // Nếu là nhân viên có department "Đối tác", chỉ hiển thị chính bản thân họ
      if (isPartner() && !isAdmin()) {
        const partnerId = getPartnerId();
        if (partnerId) {
          // Chỉ hiển thị chính bản thân đối tác (nhân sự có department "Đối tác")
          people = people.filter(p => p.id === partnerId);
          
          // Filter stores và reports của đối tác
          const allowedStores = stores.filter(s => s.partnerId === partnerId);
          const allowedStoreIds = allowedStores.map(s => s.id);
          reports = reports.filter(r => allowedStoreIds.includes(r.channelId));
        }
      } else if (isRegularEmployee()) {
        // Nhân viên thường chỉ xem được chính mình
        const currentUserId = getCurrentUserId();
        const currentUserName = getCurrentUserName();
        if (currentUserId || currentUserName) {
          people = people.filter(p => p.id === currentUserId || p.fullName === currentUserName);
        }
      }
      
      setPersonnelList(people);
      setLiveReports(reports);
    } catch (e) {
      console.error("Failed to load personnel", e);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setIsEditing(false);
    setShowForm(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Nếu chọn Department = 'Đối tác', tự động set role = 'partner'
      if (name === 'department' && value === 'Đối tác') {
        updated.role = 'partner';
      }
      // Nếu đổi Department khác 'Đối tác' và role hiện tại là 'partner', đổi về 'user'
      if (name === 'department' && value !== 'Đối tác' && prev.role === 'partner') {
        updated.role = 'user';
      }
      return updated;
    });
  };

  const handleEdit = (person: PersonnelType) => {
    setFormData({
      ...person,
      password: person.password || '', // Edit mode might blank out password or keep it, simple approach: show it
      allowedMenuIds: person.allowedMenuIds || [] // Ensure allowedMenuIds is array
    });
    setIsEditing(true);
    setShowForm(true);
  };

  const handleMenuToggle = (menuId: string) => {
    setFormData(prev => {
      const currentMenus = prev.allowedMenuIds || [];
      if (currentMenus.includes(menuId)) {
        return { ...prev, allowedMenuIds: currentMenus.filter(id => id !== menuId) };
      } else {
        return { ...prev, allowedMenuIds: [...currentMenus, menuId] };
      }
    });
  };

  const handleDelete = async (id: string) => {
    await deletePersonnel(id);
    setShowDeleteConfirm(null);
    await loadData();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email) return;

    try {
      if (isEditing && formData.id) {
        await updatePersonnel(formData.id, formData);
      } else {
        // New user
        // Use Email as username logic if needed, but here we just store email
        await createPersonnel(formData);
      }
      resetForm();
      await loadData();
    } catch (error) {
      alert("Có lỗi xảy ra khi lưu thông tin.");
    }
  };

  // Tính toán doanh số và KPI theo tháng
  const salaryKPIData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    
    return personnelList.map(person => {
      // Lấy doanh số thực từ LiveReport dựa trên hostName (tên host) thay vì reporter (người nhập)
      const personReports = liveReports.filter(report => {
        if (!report.hostName) return false;
        // So khớp theo tên host hoặc email (sử dụng matchNames để xử lý khoảng trắng và ký tự đặc biệt)
        return matchNames(report.hostName, person.fullName) || 
               matchNames(report.hostName, person.email);
      });

      // Lọc theo tháng được chọn
      const selectedMonthReports = personReports.filter(report => {
        const reportDate = new Date(report.date);
        return reportDate.getMonth() + 1 === month && 
               reportDate.getFullYear() === year;
      });

      // Tính tổng doanh số thực
      const actualRevenue = selectedMonthReports.reduce((sum, report) => {
        return sum + (Number(report.gmv) || 0);
      }, 0);

      // Lấy KPI và lương cho tháng được chọn (ưu tiên monthlyKPI/monthlySalary, fallback về monthlyKPITarget/baseSalary)
      const kpiTarget = person.monthlyKPI?.[selectedMonth] ?? person.monthlyKPITarget ?? 0;
      const monthlySalary = person.monthlySalary?.[selectedMonth] ?? person.baseSalary ?? 0;
      const progressPercent = kpiTarget > 0 ? (actualRevenue / kpiTarget) * 100 : 0;

      return {
        person,
        actualRevenue,
        kpiTarget,
        monthlySalary,
        progressPercent,
        reportCount: selectedMonthReports.length
      };
    });
  }, [personnelList, liveReports, selectedMonth]);

  // Helper function to get week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  // Filter personnel
  const filteredPersonnel = useMemo(() => {
    let filtered = personnelList;

    // Filter by selected filters
    if (selectedFilters.departments && selectedFilters.departments.length > 0) {
      filtered = filtered.filter(p => selectedFilters.departments!.includes(p.department));
    }
    if (selectedFilters.positions && selectedFilters.positions.length > 0) {
      filtered = filtered.filter(p => selectedFilters.positions!.includes(p.position));
    }
    if (selectedFilters.roles && selectedFilters.roles.length > 0) {
      filtered = filtered.filter(p => p.role && selectedFilters.roles!.includes(p.role));
    }

    // Search filter
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(p => 
        p.fullName.toLowerCase().includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower) ||
        p.department.toLowerCase().includes(searchLower) ||
        p.position.toLowerCase().includes(searchLower) ||
        p.phoneNumber.includes(searchLower)
      );
    }

    return filtered;
  }, [personnelList, selectedFilters, searchText]);

  // --- RENDER ---
  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Quản lý Nhân Sự (人事管理)</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-brand-navy text-white px-4 py-2 rounded shadow hover:bg-brand-darkNavy transition font-bold text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Thêm Nhân Sự (添加人员)
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 bg-white rounded-t-lg">
        <div className="flex">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-6 py-3 font-medium text-sm transition-colors rounded-t-lg ${
              activeTab === 'list'
                ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            Danh sách Nhân sự (人员名单)
          </button>
          <button
            onClick={() => setActiveTab('salary')}
            className={`px-6 py-3 font-medium text-sm transition-colors rounded-t-lg ${
              activeTab === 'salary'
                ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            Lương & KPIs theo tháng (月薪和KPI)
          </button>
          <button
            onClick={() => {
              setActiveTab('assignKPI');
              // Initialize period values
              const currentDate = new Date();
              if (kpiPeriodType === 'month') {
                setKpiPeriodValue(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
              } else {
                const week = getWeekNumber(currentDate);
                setKpiPeriodValue(`${currentDate.getFullYear()}-W${String(week).padStart(2, '0')}`);
              }
            }}
            className={`px-6 py-3 font-medium text-sm transition-colors rounded-t-lg ${
              activeTab === 'assignKPI'
                ? 'border-b-2 border-brand-navy text-brand-navy bg-blue-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            Giao KPIs (分配KPI)
          </button>
        </div>
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-lg font-bold uppercase text-gray-800">{isEditing ? 'Cập nhật thông tin (更新信息)' : 'Thêm nhân sự mới (添加新人员)'}</h3>
              <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Basic Info */}
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Thông tin cơ bản (基本信息)</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Họ và tên (姓名) <span className="text-red-500">*</span></label>
                  <input required name="fullName" value={formData.fullName} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1 focus:ring-brand-navy focus:border-brand-navy" placeholder="Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Số điện thoại (电话号码)</label>
                  <input name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1" placeholder="09xxx..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Phòng ban (部门)</label>
                  <select name="department" value={formData.department} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1 bg-white">
                    <option value="">Chọn phòng ban (选择部门)</option>
                    <option value="Live">Team Live</option>
                    <option value="Media">Team Media/Video</option>
                    <option value="Sale">Team Sale</option>
                    <option value="HR">Hành chính/Nhân sự</option>
                    <option value="Management">Ban Giám Đốc</option>
                    <option value="Đối tác">Đối tác (合作伙伴)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Vị trí chức danh (职位)</label>
                  <input name="position" value={formData.position} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1" placeholder="Ví dụ: Host, Editor... (例如: 主播, 编辑...)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lương cứng (固定工资) (VND)</label>
                  <input 
                    type="number" 
                    name="baseSalary" 
                    value={formData.baseSalary || 0} 
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                      setFormData(prev => ({ ...prev, baseSalary: value }));
                    }} 
                    className="w-full border rounded px-3 py-2 mt-1" 
                    placeholder="0" 
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Mục tiêu KPI tháng (月度KPI目标) (VND)</label>
                  <input 
                    type="number" 
                    name="monthlyKPITarget" 
                    value={formData.monthlyKPITarget || 0} 
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : Number(e.target.value);
                      setFormData(prev => ({ ...prev, monthlyKPITarget: value }));
                    }} 
                    className="w-full border rounded px-3 py-2 mt-1" 
                    placeholder="0" 
                    min="0"
                  />
                </div>

                {/* Account Info */}
                <div className="col-span-2 mt-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tài khoản đăng nhập (登录账户)</label>
                  <div className="bg-blue-50 p-4 rounded border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Email (Tên đăng nhập) (用户名) <span className="text-red-500">*</span></label>
                      <input required type="email" name="email" value={formData.email || ''} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1" placeholder="email@phonglive.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Mật khẩu (密码) <span className="text-red-500">*</span></label>
                      <input required type="text" name="password" value={formData.password || ''} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1 bg-white" placeholder="Nhập mật khẩu (输入密码)" />
                    </div>
                    {/* Ẩn trường role nếu Department = 'Đối tác' (tự động set role = 'partner') */}
                    {formData.department !== 'Đối tác' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phân quyền (权限)</label>
                        <select name="role" value={formData.role || 'user'} onChange={handleInputChange} className="w-full border rounded px-3 py-2 mt-1 bg-white">
                          <option value="user">Nhân viên (员工) (User)</option>
                          <option value="admin">Quản trị viên (管理员) (Admin)</option>
                        </select>
                      </div>
                    )}
                    {/* Hiển thị thông báo nếu là Đối tác */}
                    {formData.department === 'Đối tác' && (
                      <div className="col-span-2">
                        <div className="bg-blue-100 border border-blue-300 rounded px-3 py-2 text-sm text-blue-800">
                          <span className="font-medium">Đối tác (合作伙伴):</span> Phân quyền tự động được set là "Đối tác" khi chọn Department = "Đối tác"
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button type="button" onClick={resetForm} className="px-4 py-2 border rounded text-gray-600 hover:bg-gray-50">Hủy (取消)</button>
                <button type="submit" className="px-6 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy">
                  {isEditing ? 'Cập nhật (更新)' : 'Tạo mới (新建)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
          <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Xác nhận xóa? (确认删除?)</h3>
            <p className="text-sm text-gray-500 mb-6">Bạn có chắc chắn muốn xóa nhân sự này không? Hành động này không thể hoàn tác. (您确定要删除此人员吗? 此操作无法撤销。)</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-800">Hủy (取消)</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Xóa (删除)</button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar - Only show for list tab */}
      {activeTab === 'list' && (
        <FilterBar
          onSearch={setSearchText}
          onExportExcel={() => {
            const exportData = filteredPersonnel.map(person => ({
              'Họ và tên': person.fullName,
              'Email': person.email || '',
              'Phòng ban': person.department,
              'Vị trí': person.position,
              'SĐT': person.phoneNumber,
              'Lương cứng': person.baseSalary || 0,
              'Mục tiêu KPI': person.monthlyKPITarget || 0,
              'Vai trò': person.role || 'user'
            }));
            exportToExcel(exportData, `personnel-${new Date().toISOString().split('T')[0]}.xlsx`);
          }}
          onImportExcel={async (file) => {
            try {
              const data = await importFromExcel(file);
              alert(`Đã import ${data.length} nhân sự từ Excel.`);
            } catch (error) {
              alert('Lỗi khi import Excel: ' + (error as Error).message);
            }
          }}
          onReset={() => {
            setSearchText('');
            setSelectedFilters({});
            const today = new Date();
            const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            setDateFrom(firstDayOfMonth.toISOString().split('T')[0]);
            setDateTo(today.toISOString().split('T')[0]);
          }}
          filterFields={[
            {
              key: 'departments',
              label: 'Phòng ban (部门)',
              type: 'checkbox',
              options: Array.from(new Set(personnelList.map(p => p.department).filter(Boolean))).map(dept => ({ value: dept, label: dept }))
            },
            {
              key: 'positions',
              label: 'Vị trí (职位)',
              type: 'checkbox',
              options: Array.from(new Set(personnelList.map(p => p.position).filter(Boolean))).map(pos => ({ value: pos, label: pos }))
            },
            {
              key: 'roles',
              label: 'Vai trò (角色)',
              type: 'checkbox',
              options: [
                { value: 'admin', label: 'Admin (管理员)' },
                { value: 'user', label: 'Nhân viên (员工) (User)' },
                { value: 'partner', label: 'Đối tác (合作伙伴) (Partner)' }
              ]
            }
          ]}
          selectedFilters={selectedFilters}
          onFilterChange={(field, values) => {
            setSelectedFilters(prev => ({ ...prev, [field]: values }));
          }}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onQuickDateSelect={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      )}

      {/* Main Content */}
      {activeTab === 'list' && (
        <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500">Đang tải danh sách nhân sự... (正在加载人员列表...)</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                  <tr>
                    <th className="px-6 py-3 border-r">Họ và tên (姓名)</th>
                    <th className="px-6 py-3 border-r">Email (登录)</th>
                    <th className="px-6 py-3 border-r">Phòng ban (部门)</th>
                    <th className="px-6 py-3 border-r">Vị trí (职位)</th>
                    <th className="px-6 py-3 border-r">SĐT (电话)</th>
                    <th className="px-6 py-3 border-r">Lương cứng (固定工资)</th>
                    <th className="px-6 py-3 text-center">Thao tác (操作)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonnel.length === 0 ? (
                    <tr><td colSpan={7} className="py-8 text-center text-gray-400">Chưa có nhân sự nào (暂无人员)</td></tr>
                  ) : (
                    filteredPersonnel.map((person) => (
                      <tr key={person.id} className="border-b hover:bg-gray-50 group">
                        <td className="px-6 py-4 font-bold text-gray-800 border-r flex items-center gap-2">
                          {person.fullName}
                          {person.role === 'admin' && <span className="bg-purple-100 text-purple-800 text-xs px-1.5 rounded border border-purple-200">Admin</span>}
                          {person.role === 'partner' && <span className="bg-blue-100 text-blue-800 text-xs px-1.5 rounded border border-blue-200">Đối tác</span>}
                        </td>
                        <td className="px-6 py-4 border-r text-gray-600">{person.email || '-'}</td>
                        <td className="px-6 py-4 border-r">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${person.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                              person.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                            {person.department}
                          </span>
                        </td>
                        <td className="px-6 py-4 border-r">{person.position}</td>
                        <td className="px-6 py-4 border-r font-mono text-gray-600">{person.phoneNumber}</td>
                        <td className="px-6 py-4 border-r font-bold text-green-600">
                          {person.baseSalary ? formatCurrency(person.baseSalary) : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => {
                                // Xem chi tiết nhân sự
                                alert(`Thông tin nhân sự:\nHọ tên: ${person.fullName}\nEmail: ${person.email || '-'}\nPhòng ban: ${person.department || '-'}\nVị trí: ${person.position || '-'}\nSĐT: ${person.phoneNumber || '-'}\nLương cứng: ${person.baseSalary ? formatCurrency(person.baseSalary) : '-'}`);
                              }}
                              className="text-green-600 hover:text-green-800 font-medium text-xs border border-green-200 rounded px-2 py-1 bg-green-50 hover:bg-green-100"
                            >
                              Xem (查看)
                            </button>
                            <button
                              onClick={() => handleEdit(person)}
                              className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 rounded px-2 py-1 bg-blue-50 hover:bg-blue-100"
                            >
                              Sửa (编辑)
                            </button>
                            <button
                              onClick={() => person.id && setShowDeleteConfirm(person.id)}
                              className="text-red-600 hover:text-red-800 font-medium text-xs border border-red-200 rounded px-2 py-1 bg-red-50 hover:bg-red-100"
                            >
                              Xóa (删除)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Salary & KPI Tab */}
      {activeTab === 'salary' && (
        <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
          ) : (
            <div className="overflow-x-auto">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-800">
                    Lương & KPIs theo tháng (月薪和KPI) - {new Date(selectedMonth + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Doanh số được tính từ các báo cáo Live của nhân viên (营收从员工直播报告计算)</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Chọn tháng: (选择月份:)</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-navy bg-white shadow-sm"
                  />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                  <tr>
                    <th className="px-6 py-3 border-r text-left">Họ và tên (姓名)</th>
                    <th className="px-6 py-3 border-r text-left">Phòng ban (部门)</th>
                    <th className="px-6 py-3 border-r text-right">Lương cứng (固定工资)</th>
                    <th className="px-6 py-3 border-r text-right">Mục tiêu KPI (KPI目标)</th>
                    <th className="px-6 py-3 border-r text-right">Doanh số thực (实际营收)</th>
                    <th className="px-6 py-3 border-r text-center">Tiến độ (进度)</th>
                    <th className="px-6 py-3 border-r text-center">Số báo cáo (报告数)</th>
                    <th className="px-6 py-3 text-center">Thao tác (操作)</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryKPIData.length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-gray-400">Chưa có dữ liệu (暂无数据)</td></tr>
                  ) : (
                    salaryKPIData.map((item) => {
                      const { person, actualRevenue, kpiTarget, monthlySalary, progressPercent, reportCount } = item;
                      const progressColor = progressPercent >= 100 
                        ? 'bg-green-100 text-green-800 border-green-300' 
                        : progressPercent >= 50 
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300' 
                        : 'bg-red-100 text-red-800 border-red-300';
                      
                      return (
                        <tr key={person.id} className="border-b hover:bg-gray-50">
                          <td className="px-6 py-4 border-r font-bold text-gray-800">
                            {person.fullName}
                            {person.role === 'admin' && (
                              <span className="ml-2 bg-purple-100 text-purple-800 text-xs px-1.5 rounded border border-purple-200">Admin</span>
                            )}
                            {person.role === 'partner' && (
                              <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-1.5 rounded border border-blue-200">Đối tác</span>
                            )}
                          </td>
                          <td className="px-6 py-4 border-r">
                            <span className={`px-2 py-1 rounded text-xs font-medium border ${
                              person.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                              person.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              {person.department || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 border-r text-right font-bold text-green-600">
                            {item.monthlySalary > 0 ? formatCurrency(item.monthlySalary) : '-'}
                          </td>
                          <td className="px-6 py-4 border-r text-right font-medium text-blue-600">
                            {kpiTarget > 0 ? formatCurrency(kpiTarget) : '-'}
                          </td>
                          <td className="px-6 py-4 border-r text-right font-bold text-purple-600">
                            {formatCurrency(actualRevenue)}
                          </td>
                          <td className="px-6 py-4 border-r">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-3 py-1 rounded text-xs font-bold border ${progressColor}`}>
                                {progressPercent.toFixed(1)}%
                              </span>
                              {kpiTarget > 0 && (
                                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${
                                      progressPercent >= 100 ? 'bg-green-500' :
                                      progressPercent >= 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 border-r text-center font-medium text-gray-600">
                            {reportCount}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedPersonForSalaryKPI(person);
                                const currentSalary = person.monthlySalary?.[selectedMonth] ?? person.baseSalary ?? 0;
                                const currentKPI = person.monthlyKPI?.[selectedMonth] ?? person.monthlyKPITarget ?? 0;
                                setSalaryKPIFormData({ salary: currentSalary, kpi: currentKPI });
                                setShowSalaryKPIModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 rounded px-2 py-1 bg-blue-50 hover:bg-blue-100"
                            >
                              Chỉnh sửa (编辑)
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Assign KPI Tab */}
      {activeTab === 'assignKPI' && (
        <div className="space-y-6">
          {/* Form Giao KPI */}
          <div className="bg-white rounded shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Giao KPIs (分配KPI)</h3>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (selectedPersonnelForKPI.length === 0 || !kpiPeriodValue || kpiTargetValue <= 0) {
                alert('Vui lòng điền đầy đủ thông tin');
                return;
              }

              try {
                // Update KPI for each selected personnel
                for (const personnelId of selectedPersonnelForKPI) {
                  const person = personnelList.find(p => (p.id || p.fullName) === personnelId);
                  if (!person || !person.id) continue;

                  const updatedPerson: PersonnelType = { ...person };
                  
                  if (kpiPeriodType === 'month') {
                    updatedPerson.monthlyKPI = {
                      ...(person.monthlyKPI || {}),
                      [kpiPeriodValue]: kpiTargetValue
                    };
                  } else {
                    updatedPerson.weeklyKPI = {
                      ...(person.weeklyKPI || {}),
                      [kpiPeriodValue]: kpiTargetValue
                    };
                  }

                  await updatePersonnel(person.id, updatedPerson);
                }

                await loadData();
                setSelectedPersonnelForKPI([]);
                setKpiTargetValue(0);
                setKpiNotes('');
                alert(`Đã giao KPI cho ${selectedPersonnelForKPI.length} nhân sự thành công!`);
              } catch (error) {
                alert('Có lỗi xảy ra khi giao KPI.');
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại kỳ (周期类型) *
                  </label>
                  <select
                    value={kpiPeriodType}
                    onChange={(e) => {
                      setKpiPeriodType(e.target.value as 'month' | 'week');
                      const currentDate = new Date();
                      if (e.target.value === 'month') {
                        setKpiPeriodValue(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
                      } else {
                        const week = getWeekNumber(currentDate);
                        setKpiPeriodValue(`${currentDate.getFullYear()}-W${String(week).padStart(2, '0')}`);
                      }
                    }}
                    className="w-full border rounded px-3 py-2 bg-white focus:ring-brand-navy focus:border-brand-navy"
                  >
                    <option value="month">Theo tháng (按月)</option>
                    <option value="week">Theo tuần (按周)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {kpiPeriodType === 'month' ? 'Tháng (月份) *' : 'Tuần (周) *'}
                  </label>
                  {kpiPeriodType === 'month' ? (
                    <input
                      type="month"
                      required
                      value={kpiPeriodValue}
                      onChange={(e) => setKpiPeriodValue(e.target.value)}
                      className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                    />
                  ) : (
                    <input
                      type="text"
                      required
                      value={kpiPeriodValue}
                      onChange={(e) => setKpiPeriodValue(e.target.value)}
                      className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                      placeholder="YYYY-WW (ví dụ: 2025-W01)"
                      pattern="\d{4}-W\d{2}"
                    />
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chọn nhân sự (选择人员) *
                  </label>
                  <div className="relative">
                    {/* Input field để trigger dropdown */}
                    <input
                      type="text"
                      value={personnelSearchText}
                      onChange={(e) => {
                        setPersonnelSearchText(e.target.value);
                        setShowPersonnelDropdown(true);
                      }}
                      onFocus={() => setShowPersonnelDropdown(true)}
                      placeholder={selectedPersonnelForKPI.length > 0 
                        ? `Đã chọn (已选择) ${selectedPersonnelForKPI.length} nhân sự` 
                        : "Tìm kiếm và chọn nhân sự... (搜索并选择人员...)"}
                      className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                    />
                    
                    {/* Dropdown với checkbox */}
                    {showPersonnelDropdown && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowPersonnelDropdown(false)}
                        ></div>
                        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {personnelList.length === 0 ? (
                            <div className="p-3 text-sm text-gray-500">Chưa có nhân sự (暂无人员)</div>
                          ) : (
                            <div className="py-1">
                              {personnelList
                                .filter(person => {
                                  const searchLower = personnelSearchText.toLowerCase();
                                  return (
                                    person.fullName.toLowerCase().includes(searchLower) ||
                                    person.department.toLowerCase().includes(searchLower) ||
                                    person.position.toLowerCase().includes(searchLower) ||
                                    person.email?.toLowerCase().includes(searchLower) ||
                                    person.phoneNumber.includes(searchLower)
                                  );
                                })
                                .map(person => {
                                  const personId = person.id || person.fullName;
                                  const isSelected = selectedPersonnelForKPI.includes(personId);
                                  return (
                                    <label
                                      key={personId}
                                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setSelectedPersonnelForKPI([...selectedPersonnelForKPI, personId]);
                                          } else {
                                            setSelectedPersonnelForKPI(selectedPersonnelForKPI.filter(id => id !== personId));
                                          }
                                        }}
                                        className="rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                                      />
                                      <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-900">{person.fullName}</div>
                                        <div className="text-xs text-gray-500">
                                          {person.department} - {person.position}
                                          {person.email && ` - ${person.email}`}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Hiển thị nhân sự đã chọn */}
                  {selectedPersonnelForKPI.length > 0 && (
                    <div className="mt-2 border rounded p-3 bg-gray-50 max-h-40 overflow-y-auto">
                      <p className="text-xs text-gray-600 mb-2 font-medium">Đã chọn (已选择) ({selectedPersonnelForKPI.length}):</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedPersonnelForKPI.map(personId => {
                          const person = personnelList.find(p => (p.id || p.fullName) === personId);
                          if (!person) return null;
                          return (
                            <div
                              key={personId}
                              className="flex items-center gap-1 bg-white border border-gray-200 rounded px-2 py-1 text-sm"
                            >
                              <span className="text-gray-700">{person.fullName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPersonnelForKPI(selectedPersonnelForKPI.filter(id => id !== personId));
                                }}
                                className="text-red-600 hover:text-red-800 ml-1"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mục tiêu KPI (VND) (KPI目标 (越南盾)) *
                  </label>
                  <input
                    type="number"
                    required
                    value={kpiTargetValue || ''}
                    onChange={(e) => setKpiTargetValue(Number(e.target.value) || 0)}
                    className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                    placeholder="Nhập mục tiêu KPI (输入KPI目标)"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ghi chú (备注)
                  </label>
                  <input
                    type="text"
                    value={kpiNotes}
                    onChange={(e) => setKpiNotes(e.target.value)}
                    className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                    placeholder="Nhập ghi chú (tùy chọn) (输入备注 (可选))"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  type="submit"
                  className="px-8 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy"
                >
                  分配KPI
                </button>
              </div>
            </form>
          </div>

          {/* Bảng theo dõi KPI đã giao */}
          <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-800">Theo dõi KPIs đã giao (已分配KPI跟踪)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Nhân sự (人员)</th>
                    <th className="px-4 py-3 text-left">Phòng ban (部门)</th>
                    <th className="px-4 py-3 text-left">Loại kỳ (周期类型)</th>
                    <th className="px-4 py-3 text-left">Kỳ (周期)</th>
                    <th className="px-4 py-3 text-right">Mục tiêu KPI (KPI目标)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const kpiAssignments: Array<{
                      personnelName: string;
                      department: string;
                      periodType: 'month' | 'week';
                      periodKey: string;
                      kpiTarget: number;
                    }> = [];

                    personnelList.forEach(person => {
                      // Add monthly KPIs
                      if (person.monthlyKPI) {
                        Object.entries(person.monthlyKPI).forEach(([periodKey, kpiTarget]) => {
                          kpiAssignments.push({
                            personnelName: person.fullName,
                            department: person.department || '',
                            periodType: 'month',
                            periodKey,
                          kpiTarget: Number(kpiTarget)
                        });
                      });
                    }
                    
                    // Add weekly KPIs
                    if (person.weeklyKPI) {
                      Object.entries(person.weeklyKPI).forEach(([periodKey, kpiTarget]) => {
                          kpiAssignments.push({
                            personnelName: person.fullName,
                            department: person.department || '',
                            periodType: 'week',
                            periodKey,
                            kpiTarget: Number(kpiTarget)
                          });
                        });
                      }
                    });

                    // Sort by period key (newest first)
                    kpiAssignments.sort((a, b) => b.periodKey.localeCompare(a.periodKey));

                    if (kpiAssignments.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Chưa có KPI nào được giao (暂无已分配的KPI)</td>
                        </tr>
                      );
                    }

                    return kpiAssignments.map((assignment, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{assignment.personnelName}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${
                            assignment.department === 'Live' ? 'bg-red-50 text-red-700 border-red-200' :
                            assignment.department === 'Media' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {assignment.department || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            assignment.periodType === 'month' 
                              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                              : 'bg-purple-100 text-purple-800 border border-purple-200'
                          }`}>
                            {assignment.periodType === 'month' ? 'Tháng (月)' : 'Tuần (周)'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{assignment.periodKey}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">
                          {formatCurrency(assignment.kpiTarget)}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Salary & KPI Edit Modal */}
      {showSalaryKPIModal && selectedPersonForSalaryKPI && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-lg font-bold uppercase text-gray-800">
                Chỉnh sửa Lương & KPI (编辑工资和KPI) - {selectedPersonForSalaryKPI.fullName}
              </h3>
              <button 
                onClick={() => {
                  setShowSalaryKPIModal(false);
                  setSelectedPersonForSalaryKPI(null);
                }} 
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Tháng (月份): <span className="font-bold">{new Date(selectedMonth + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</span>
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!selectedPersonForSalaryKPI.id) return;
              
              try {
                const updatedPerson: PersonnelType = {
                  ...selectedPersonForSalaryKPI,
                  monthlySalary: {
                    ...(selectedPersonForSalaryKPI.monthlySalary || {}),
                    [selectedMonth]: salaryKPIFormData.salary
                  },
                  monthlyKPI: {
                    ...(selectedPersonForSalaryKPI.monthlyKPI || {}),
                    [selectedMonth]: salaryKPIFormData.kpi
                  }
                };
                
                await updatePersonnel(selectedPersonForSalaryKPI.id, updatedPerson);
                await loadData();
                setShowSalaryKPIModal(false);
                setSelectedPersonForSalaryKPI(null);
                alert('Đã cập nhật lương và KPI thành công!');
              } catch (error) {
                alert('Có lỗi xảy ra khi cập nhật.');
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lương cứng (VND) (固定工资 (越南盾))
                  {selectedPersonForSalaryKPI.baseSalary && (
                    <span className="text-xs text-gray-500 ml-2">
                      (Mặc định (默认): {formatCurrency(selectedPersonForSalaryKPI.baseSalary)})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  required
                  value={salaryKPIFormData.salary}
                  onChange={(e) => setSalaryKPIFormData({ ...salaryKPIFormData, salary: Number(e.target.value) || 0 })}
                  className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                  placeholder="Nhập lương cứng (输入固定工资)"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mục tiêu KPI (VND) (KPI目标 (越南盾))
                  {selectedPersonForSalaryKPI.monthlyKPITarget && (
                    <span className="text-xs text-gray-500 ml-2">
                      (Mặc định (默认): {formatCurrency(selectedPersonForSalaryKPI.monthlyKPITarget)})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  required
                  value={salaryKPIFormData.kpi}
                  onChange={(e) => setSalaryKPIFormData({ ...salaryKPIFormData, kpi: Number(e.target.value) || 0 })}
                  className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                  placeholder="Nhập mục tiêu KPI (输入KPI目标)"
                  min="0"
                />
              </div>

              <div className="pt-4 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSalaryKPIModal(false);
                    setSelectedPersonForSalaryKPI(null);
                  }}
                  className="px-6 py-2 border rounded text-gray-600 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-8 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy"
                >
                  Lưu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};