// Columns to always hide
const HIDDEN_COLUMNS = ["Thuê TK", "Thời gian cutoff", "Tiền Hàng", "Người đẩy FFM"];
import { Calendar, Edit, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';

const VAN_DON_LIST_FULL_ACCESS_ROLES = ['admin', 'super_admin', 'director', 'manager', 'administrator'];

export default function DanhSachVanDon() {
    const { role } = usePermissions();
    const isAdminVanDonList = useMemo(() => {
        const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('userRole') : '') || '';
        const rl = (role || '').toLowerCase();
        const sl = stored.toLowerCase();
        return (
            VAN_DON_LIST_FULL_ACCESS_ROLES.includes(rl) || VAN_DON_LIST_FULL_ACCESS_ROLES.includes(sl)
        );
    }, [role]);
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    // Date filter
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7); // Default: last 7 days
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    // Staff lists for dropdowns
    const [vanDonStaff, setVanDonStaff] = useState([]);

    // Selected personnel names (từ cột selected_personnel trong users table)
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]);

    // Edit/Add Mode
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({
        ho_va_ten: '',
        trang_thai_chia: '',
        chi_nhanh: '',
        nguoi_sua_ho: [], // Array for multiple selection
        nguoi_day_ffm: [], // Array for multiple selection - Người đẩy FFM
        so_don: 0
    });
    const [isAdding, setIsAdding] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Search state for dropdowns
    const [hoVaTenSearch, setHoVaTenSearch] = useState('');
    const [nguoiSuaHoSearch, setNguoiSuaHoSearch] = useState('');
    const [nguoiDayFFMSearch, setNguoiDayFFMSearch] = useState('');
    const [showHoVaTenDropdown, setShowHoVaTenDropdown] = useState(false);
    const [showNguoiSuaHoDropdown, setShowNguoiSuaHoDropdown] = useState(false);
    const [showNguoiDayFFMDropdown, setShowNguoiDayFFMDropdown] = useState(false);

    // Load staff from users with department = "Vận Đơn"
    const loadVanDonStaff = async () => {
        try {
            console.log('Loading van don staff from users table...');
            // Lấy nhân sự có department = "Vận Đơn" (chữ Đ viết hoa)
            const { data: staff, error } = await supabase
                .from('users')
                .select('name, department')
                .eq('department', 'Vận Đơn')
                .order('name', { ascending: true });

            if (error) {
                console.error('Supabase error:', error);
                throw error;
            }

            console.log('Raw staff data:', staff);
            const staffNames = staff?.map(s => s.name).filter(Boolean) || [];
            console.log('Filtered staff names:', staffNames);

            if (staffNames.length === 0) {
                console.warn('No staff found with department = "Vận Đơn"');
                toast.warning('Không tìm thấy nhân sự nào có department = "Vận Đơn"');
            }

            setVanDonStaff(staffNames);
            return staffNames;
        } catch (error) {
            console.error('Error loading van don staff:', error);
            toast.error('Lỗi khi tải danh sách nhân sự vận đơn: ' + error.message);
            return [];
        }
    };

    // Count orders for a staff member within date range
    const countOrdersForStaff = async (staffName) => {
        if (!staffName || !startDate || !endDate) return 0;

        try {
            const { count, error } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('delivery_staff', staffName)
                .gte('order_date', startDate)
                .lte('order_date', endDate);

            if (error) throw error;
            return count || 0;
        } catch (error) {
            console.error('Error counting orders:', error);
            return 0;
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: records, error } = await supabase
                .from('danh_sach_van_don')
                .select('*')
                .order('ho_va_ten', { ascending: true });

            if (error) throw error;

            // Filter by selected_personnel khi có — admin / director / manager xem toàn bộ (không lọc).
            let filteredRecords = records || [];
            if (!isAdminVanDonList && selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                console.log('🔐 [DanhSachVanDon] Filtering by selected_personnel:', selectedPersonnelNames);
                filteredRecords = (records || []).filter(record => {
                    const hoVaTen = (record.ho_va_ten || '').toLowerCase().trim();
                    return selectedPersonnelNames.some(name => {
                        const nameLower = String(name).toLowerCase().trim();
                        return hoVaTen === nameLower || hoVaTen.includes(nameLower);
                    });
                });
                console.log('✅ [DanhSachVanDon] Filtered records:', filteredRecords.length, 'out of', records?.length || 0);
            } else if (isAdminVanDonList) {
                console.log('👑 [DanhSachVanDon] Admin — hiển thị đủ danh sách (bỏ lọc selected_personnel)');
            } else {
                console.log('✅ [DanhSachVanDon] No selected_personnel, showing all records');
            }

            // Auto-count orders for each staff member and parse nguoi_sua_ho, nguoi_day_ffm
            // Đồng thời load can_day_ffm từ bảng users
            const recordsWithCount = await Promise.all(
                filteredRecords.map(async (record) => {
                    if (record.ho_va_ten) {
                        const count = await countOrdersForStaff(record.ho_va_ten);
                        // Parse nguoi_sua_ho từ JSON string về array để hiển thị
                        let nguoiSuaHo = [];
                        if (record.nguoi_sua_ho) {
                            if (Array.isArray(record.nguoi_sua_ho)) {
                                nguoiSuaHo = record.nguoi_sua_ho;
                            } else if (typeof record.nguoi_sua_ho === 'string') {
                                try {
                                    const parsed = JSON.parse(record.nguoi_sua_ho);
                                    nguoiSuaHo = Array.isArray(parsed) ? parsed : [record.nguoi_sua_ho];
                                } catch {
                                    nguoiSuaHo = record.nguoi_sua_ho.trim() ? [record.nguoi_sua_ho] : [];
                                }
                            }
                        }
                        // Parse nguoi_day_ffm từ JSON string về array để hiển thị
                        let nguoiDayFFM = [];
                        if (record.nguoi_day_ffm) {
                            if (Array.isArray(record.nguoi_day_ffm)) {
                                nguoiDayFFM = record.nguoi_day_ffm;
                            } else if (typeof record.nguoi_day_ffm === 'string') {
                                try {
                                    const parsed = JSON.parse(record.nguoi_day_ffm);
                                    nguoiDayFFM = Array.isArray(parsed) ? parsed : [record.nguoi_day_ffm];
                                } catch {
                                    nguoiDayFFM = record.nguoi_day_ffm.trim() ? [record.nguoi_day_ffm] : [];
                                }
                            }
                        }
                        
                        // Load can_day_ffm từ bảng users dựa trên ho_va_ten
                        let canDayFFM = false;
                        try {
                            const { data: userData } = await supabase
                                .from('users')
                                .select('can_day_ffm')
                                .eq('name', record.ho_va_ten)
                                .maybeSingle();
                            canDayFFM = userData?.can_day_ffm === true;
                        } catch (err) {
                            console.warn('Could not load can_day_ffm for', record.ho_va_ten, err);
                        }
                        
                        return { 
                            ...record, 
                            so_don: count, 
                            nguoi_sua_ho_parsed: nguoiSuaHo, 
                            nguoi_day_ffm_parsed: nguoiDayFFM,
                            can_day_ffm: canDayFFM
                        };
                    }
                    return record;
                })
            );

            setData(recordsWithCount);
            setFilteredData(recordsWithCount);
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Lỗi khi tải dữ liệu: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVanDonStaff();
    }, []);

    // Debug: Log vanDonStaff whenever it changes
    useEffect(() => {
        console.log('vanDonStaff updated:', vanDonStaff);
    }, [vanDonStaff]);

    // Load selected personnel names for current user
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                const userEmail = localStorage.getItem("userEmail") || "";

                if (!userEmail) {
                    setSelectedPersonnelNames([]);
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
                const personnelNames = personnelMap[userEmailLower] || [];

                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });

                console.log('📝 [DanhSachVanDon] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [DanhSachVanDon] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, []);

    useEffect(() => {
        loadData();
    }, [startDate, endDate, selectedPersonnelNames, isAdminVanDonList]);

    // Tính toán danh sách nhân sự có sẵn cho "Họ và tên" (loại trừ những người đã có trong danh sách khi thêm mới)
    const availableHoVaTenOptions = useMemo(() => {
        if (!isAdding) return vanDonStaff;
        // Lấy danh sách ho_va_ten đã có trong data
        const existingNames = new Set(data.map(item => item.ho_va_ten).filter(Boolean));
        // Loại trừ những người đã có
        return vanDonStaff.filter(name => !existingNames.has(name));
    }, [vanDonStaff, data, isAdding]);

    // Tính toán danh sách nhân sự cho "Người sửa hộ" (loại trừ người đang được chọn trong ho_va_ten)
    const availableNguoiSuaHoOptions = useMemo(() => {
        // Loại trừ người đang được chọn trong ho_va_ten
        return vanDonStaff.filter(name => name !== editForm.ho_va_ten);
    }, [vanDonStaff, editForm.ho_va_ten]);

    // Filter Data
    useEffect(() => {
        if (!searchText.trim()) {
            setFilteredData(data);
            return;
        }

        const searchLower = searchText.toLowerCase();
        const filtered = data.filter(item =>
            item.ho_va_ten?.toLowerCase().includes(searchLower) ||
            item.trang_thai_chia?.toLowerCase().includes(searchLower) ||
            item.chi_nhanh?.toLowerCase().includes(searchLower) ||
            item.nguoi_sua_ho?.toLowerCase().includes(searchLower) ||
            (item.nguoi_day_ffm_parsed && item.nguoi_day_ffm_parsed.some(name => name.toLowerCase().includes(searchLower))) ||
            String(item.so_don || '').includes(searchText)
        );
        setFilteredData(filtered);
    }, [searchText, data]);

    const handleAdd = async () => {
        // Đảm bảo danh sách nhân sự đã được load
        if (vanDonStaff.length === 0) {
            await loadVanDonStaff();
        }

        setIsAdding(true);
        setEditingId(null);
        setHoVaTenSearch('');
        setNguoiSuaHoSearch('');
        setNguoiDayFFMSearch('');
        setShowHoVaTenDropdown(false);
        setShowNguoiSuaHoDropdown(false);
        setShowNguoiDayFFMDropdown(false);
        setEditForm({
            ho_va_ten: '',
            trang_thai_chia: '',
            chi_nhanh: '',
            nguoi_sua_ho: [],
            nguoi_day_ffm: [],
            so_don: 0
        });
        setShowModal(true);
    };

    const handleEdit = (item) => {
        setIsAdding(false);
        setEditingId(item.id);
        // Parse nguoi_sua_ho: có thể là string, array, hoặc JSON string
        let nguoiSuaHo = [];
        if (item.nguoi_sua_ho) {
            if (Array.isArray(item.nguoi_sua_ho)) {
                nguoiSuaHo = item.nguoi_sua_ho;
            } else if (typeof item.nguoi_sua_ho === 'string') {
                try {
                    const parsed = JSON.parse(item.nguoi_sua_ho);
                    nguoiSuaHo = Array.isArray(parsed) ? parsed : [item.nguoi_sua_ho];
                } catch {
                    // Nếu không phải JSON, có thể là string đơn giản
                    nguoiSuaHo = item.nguoi_sua_ho.trim() ? [item.nguoi_sua_ho] : [];
                }
            }
        }

        // Parse nguoi_day_ffm: có thể là string, array, hoặc JSON string
        let nguoiDayFFM = [];
        if (item.nguoi_day_ffm) {
            if (Array.isArray(item.nguoi_day_ffm)) {
                nguoiDayFFM = item.nguoi_day_ffm;
            } else if (typeof item.nguoi_day_ffm === 'string') {
                try {
                    const parsed = JSON.parse(item.nguoi_day_ffm);
                    nguoiDayFFM = Array.isArray(parsed) ? parsed : [item.nguoi_day_ffm];
                } catch {
                    nguoiDayFFM = item.nguoi_day_ffm.trim() ? [item.nguoi_day_ffm] : [];
                }
            }
        }

        setEditForm({
            ho_va_ten: item.ho_va_ten || '',
            trang_thai_chia: item.trang_thai_chia || '',
            chi_nhanh: item.chi_nhanh || '',
            nguoi_sua_ho: nguoiSuaHo,
            nguoi_day_ffm: nguoiDayFFM,
            so_don: item.so_don || 0
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bạn có chắc muốn xóa bản ghi này?')) return;

        try {
            const { error } = await supabase
                .from('danh_sach_van_don')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Đã xóa thành công!');
            loadData();
        } catch (error) {
            console.error('Error deleting:', error);
            toast.error('Lỗi khi xóa: ' + error.message);
        }
    };

    const handleSave = async () => {
        if (!editForm.ho_va_ten?.trim()) {
            toast.error('Vui lòng chọn Họ và tên');
            return;
        }

        try {
            // Auto-count orders when saving
            const orderCount = await countOrdersForStaff(editForm.ho_va_ten);
            // Lưu nguoi_sua_ho và nguoi_day_ffm dưới dạng JSON array string
            const formData = {
                ho_va_ten: editForm.ho_va_ten.trim(),
                trang_thai_chia: editForm.trang_thai_chia || null,
                chi_nhanh: editForm.chi_nhanh || null,
                so_don: orderCount,
                nguoi_sua_ho: JSON.stringify(editForm.nguoi_sua_ho || []),
                nguoi_day_ffm: JSON.stringify(editForm.nguoi_day_ffm || [])
            };

            console.log('💾 [DanhSachVanDon] Saving data:', {
                isAdding,
                editingId,
                formData
            });

            if (isAdding) {
                // Add new
                const { data, error } = await supabase
                    .from('danh_sach_van_don')
                    .insert([formData])
                    .select();

                if (error) {
                    console.error('❌ [DanhSachVanDon] Insert error:', error);
                    throw error;
                }
                console.log('✅ [DanhSachVanDon] Insert success:', data);
                toast.success('Đã thêm thành công!');
            } else {
                // Update
                const { data, error } = await supabase
                    .from('danh_sach_van_don')
                    .update(formData)
                    .eq('id', editingId)
                    .select();

                if (error) {
                    console.error('❌ [DanhSachVanDon] Update error:', error);
                    console.error('❌ [DanhSachVanDon] Error details:', {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    });
                    throw error;
                }
                console.log('✅ [DanhSachVanDon] Update success:', data);
                toast.success('Đã cập nhật thành công!');
            }

            setShowModal(false);
            loadData();
        } catch (error) {
            console.error('❌ [DanhSachVanDon] Error saving:', error);
            console.error('❌ [DanhSachVanDon] Full error object:', JSON.stringify(error, null, 2));
            const errorMessage = error.message || error.details || 'Không xác định được lỗi';
            
            // Kiểm tra nếu lỗi liên quan đến cột không tồn tại
            if (error.message && error.message.includes('nguoi_day_ffm')) {
                toast.error('Lỗi: Cột "nguoi_day_ffm" chưa được tạo trong database. Vui lòng chạy script SQL: supabase_scripts/add_nguoi_day_ffm_column.sql', {
                    autoClose: 8000
                });
            } else {
                toast.error(`Lỗi khi lưu: ${errorMessage}`, {
                    autoClose: 5000
                });
            }
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto min-h-screen bg-gray-50">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Danh sách vận đơn</h1>
                <p className="text-gray-600">Quản lý danh sách vận đơn</p>
            </div>

            {/* Date Filter */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        <label className="text-sm font-medium text-gray-700">Bộ lọc ngày:</label>
                    </div>
                    <div>
                        <label className="text-xs text-gray-600 block mb-1">Từ ngày</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-600 block mb-1">Đến ngày</label>
                        <input
                            type="date"
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                    <div className="text-xs text-gray-500 mt-6">
                        Số đơn sẽ tự động đếm theo khoảng ngày này
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Search */}
                    <div className="flex-1 min-w-[250px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Làm mới
                        </button>
                        <button
                            onClick={handleAdd}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm mới
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">
                        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Đang tải...
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        Không có dữ liệu
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    {/* Only render columns not in HIDDEN_COLUMNS */}
                                    {!HIDDEN_COLUMNS.includes("ID") && <th className="px-4 py-3 whitespace-nowrap">ID</th>}
                                    {!HIDDEN_COLUMNS.includes("Họ và tên") && <th className="px-4 py-3 whitespace-nowrap min-w-[200px]">Họ và tên</th>}
                                    {!HIDDEN_COLUMNS.includes("Trạng thái chia") && <th className="px-4 py-3 whitespace-nowrap">Trạng thái chia</th>}
                                    {!HIDDEN_COLUMNS.includes("Chi nhánh") && <th className="px-4 py-3 whitespace-nowrap">Chi nhánh</th>}
                                    {!HIDDEN_COLUMNS.includes("Người sửa hộ") && <th className="px-4 py-3 whitespace-nowrap">Người sửa hộ</th>}
                                    {!HIDDEN_COLUMNS.includes("Người đẩy FFM") && <th className="px-4 py-3 whitespace-nowrap">Người đẩy FFM</th>}
                                    <th className="px-4 py-3 whitespace-nowrap text-center">Đẩy FFM</th>
                                    {!HIDDEN_COLUMNS.includes("Số đơn") && <th className="px-4 py-3 whitespace-nowrap text-right">Số đơn</th>}
                                    <th className="px-4 py-3 whitespace-nowrap text-center">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        {/* Only render columns not in HIDDEN_COLUMNS */}
                                        {!HIDDEN_COLUMNS.includes("ID") && (
                                            <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                                                {item.id.substring(0, 8)}...
                                            </td>
                                        )}
                                        {!HIDDEN_COLUMNS.includes("Họ và tên") && (
                                            <td className="px-4 py-3 font-medium">{item.ho_va_ten || '-'}</td>
                                        )}
                                        {!HIDDEN_COLUMNS.includes("Trạng thái chia") && (
                                            <td className="px-4 py-3">{item.trang_thai_chia || '-'}</td>
                                        )}
                                        {!HIDDEN_COLUMNS.includes("Chi nhánh") && (
                                            <td className="px-4 py-3">{item.chi_nhanh || '-'}</td>
                                        )}
                                        {!HIDDEN_COLUMNS.includes("Người sửa hộ") && (
                                            <td className="px-4 py-3">
                                                {item.nguoi_sua_ho_parsed && item.nguoi_sua_ho_parsed.length > 0
                                                    ? item.nguoi_sua_ho_parsed.join(', ')
                                                    : '-'}
                                            </td>
                                        )}
                                        {!HIDDEN_COLUMNS.includes("Người đẩy FFM") && (
                                            <td className="px-4 py-3">
                                                {item.nguoi_day_ffm_parsed && item.nguoi_day_ffm_parsed.length > 0
                                                    ? item.nguoi_day_ffm_parsed.join(', ')
                                                    : '-'}
                                            </td>
                                        )}
                                        <td className="px-4 py-3">
                                            <label className="flex items-center justify-center cursor-pointer group">
                                                <div className="relative">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.can_day_ffm === true}
                                                        onChange={async (e) => {
                                                            const newValue = e.target.checked;
                                                            if (!item.ho_va_ten) {
                                                                toast.error('Không tìm thấy tên nhân viên');
                                                                return;
                                                            }
                                                            try {
                                                                const { error } = await supabase
                                                                    .from('users')
                                                                    .update({ can_day_ffm: newValue })
                                                                    .eq('name', item.ho_va_ten);
                                                                
                                                                if (error) {
                                                                    toast.error('Lỗi cập nhật quyền đẩy FFM: ' + error.message);
                                                                } else {
                                                                    toast.success(newValue ? 'Đã cấp quyền đẩy FFM' : 'Đã thu hồi quyền đẩy FFM');
                                                                    loadData(); // Reload để cập nhật UI
                                                                }
                                                            } catch (err) {
                                                                toast.error('Lỗi: ' + err.message);
                                                            }
                                                        }}
                                                        className="sr-only"
                                                    />
                                                    <div className={`
                                                        w-11 h-6 rounded-full transition-all duration-200 ease-in-out
                                                        ${item.can_day_ffm 
                                                            ? 'bg-green-500' 
                                                            : 'bg-gray-300'
                                                        }
                                                        group-hover:opacity-80
                                                    `}>
                                                        <div className={`
                                                            w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out
                                                            ${item.can_day_ffm 
                                                                ? 'translate-x-5' 
                                                                : 'translate-x-0.5'
                                                            }
                                                            mt-0.5
                                                        `}></div>
                                                    </div>
                                                </div>
                                                <span className={`ml-2 text-xs font-medium ${
                                                    item.can_day_ffm ? 'text-green-700' : 'text-gray-500'
                                                }`}>
                                                    {item.can_day_ffm ? 'Có' : 'Không'}
                                                </span>
                                            </label>
                                        </td>
                                        {!HIDDEN_COLUMNS.includes("Số đơn") && (
                                            <td className="px-4 py-3 text-right font-medium">{item.so_don || 0}</td>
                                        )}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleEdit(item)}
                                                    className="text-blue-600 hover:text-blue-800 p-1 rounded transition-colors"
                                                    title="Sửa"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-600 hover:text-red-800 p-1 rounded transition-colors"
                                                    title="Xóa"
                                                >
                                                    <Trash2 className="w-4 h-4" />
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

            {/* Modal Add/Edit */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-800">
                                    {isAdding ? 'Thêm mới' : 'Sửa'}
                                </h2>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Họ và tên <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Gõ tên để tìm kiếm..."
                                            value={isAdding ? hoVaTenSearch : editForm.ho_va_ten}
                                            onChange={(e) => {
                                                const searchValue = e.target.value;
                                                if (isAdding) {
                                                    setHoVaTenSearch(searchValue);
                                                    setShowHoVaTenDropdown(true);
                                                    // Auto-select nếu tìm thấy exact match
                                                    const exactMatch = availableHoVaTenOptions.find(name =>
                                                        name.toLowerCase() === searchValue.toLowerCase()
                                                    );
                                                    if (exactMatch) {
                                                        setEditForm({ ...editForm, ho_va_ten: exactMatch });
                                                        setHoVaTenSearch(exactMatch);
                                                        setShowHoVaTenDropdown(false);
                                                    } else {
                                                        setEditForm({ ...editForm, ho_va_ten: searchValue });
                                                    }
                                                } else {
                                                    setEditForm({ ...editForm, ho_va_ten: searchValue });
                                                }
                                            }}
                                            onFocus={() => {
                                                if (isAdding) setShowHoVaTenDropdown(true);
                                            }}
                                            onBlur={() => setTimeout(() => setShowHoVaTenDropdown(false), 200)}
                                            required
                                        />
                                        {isAdding && showHoVaTenDropdown && availableHoVaTenOptions.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                                {availableHoVaTenOptions
                                                    .filter(name =>
                                                        !hoVaTenSearch || name.toLowerCase().includes(hoVaTenSearch.toLowerCase())
                                                    )
                                                    .map((name) => (
                                                        <div
                                                            key={name}
                                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                                                            onClick={() => {
                                                                setEditForm({ ...editForm, ho_va_ten: name });
                                                                setHoVaTenSearch(name);
                                                                setShowHoVaTenDropdown(false);
                                                            }}
                                                        >
                                                            {name}
                                                        </div>
                                                    ))}
                                                {availableHoVaTenOptions.filter(name =>
                                                    !hoVaTenSearch || name.toLowerCase().includes(hoVaTenSearch.toLowerCase())
                                                ).length === 0 && (
                                                        <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                                            Không tìm thấy kết quả
                                                        </div>
                                                    )}
                                            </div>
                                        )}
                                    </div>
                                    {isAdding && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            {availableHoVaTenOptions.length} nhân sự có sẵn (đã loại trừ những người đã có trong danh sách)
                                        </p>
                                    )}
                                    {vanDonStaff.length === 0 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Không có nhân sự nào có department = "Vận đơn". Vui lòng kiểm tra lại.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Trạng thái chia
                                    </label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={editForm.trang_thai_chia}
                                        onChange={(e) => setEditForm({ ...editForm, trang_thai_chia: e.target.value })}
                                    >
                                        <option value="">-- Chọn trạng thái --</option>
                                        <option value="U1">U1</option>
                                        <option value="Nghỉ">Nghỉ</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Chi nhánh
                                    </label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={editForm.chi_nhanh}
                                        onChange={(e) => setEditForm({ ...editForm, chi_nhanh: e.target.value })}
                                    >
                                        <option value="">-- Chọn chi nhánh --</option>
                                        <option value="Hà Nội">Hà Nội</option>
                                        <option value="HCM">HCM</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Người sửa hộ (có thể chọn nhiều)
                                    </label>
                                    <div className="mb-2">
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Gõ tên để tìm kiếm..."
                                            value={nguoiSuaHoSearch}
                                            onChange={(e) => setNguoiSuaHoSearch(e.target.value)}
                                            onFocus={() => setShowNguoiSuaHoDropdown(true)}
                                        />
                                    </div>
                                    <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                                        {vanDonStaff.length === 0 ? (
                                            <p className="text-sm text-gray-500">Đang tải danh sách...</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {availableNguoiSuaHoOptions
                                                    .filter(name =>
                                                        !nguoiSuaHoSearch || name.toLowerCase().includes(nguoiSuaHoSearch.toLowerCase())
                                                    )
                                                    .map((name) => (
                                                        <label
                                                            key={name}
                                                            className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                checked={editForm.nguoi_sua_ho?.includes(name) || false}
                                                                onChange={(e) => {
                                                                    const current = editForm.nguoi_sua_ho || [];
                                                                    if (e.target.checked) {
                                                                        setEditForm({ ...editForm, nguoi_sua_ho: [...current, name] });
                                                                    } else {
                                                                        setEditForm({ ...editForm, nguoi_sua_ho: current.filter(n => n !== name) });
                                                                    }
                                                                }}
                                                            />
                                                            <span className="ml-2 text-sm text-gray-700">{name}</span>
                                                        </label>
                                                    ))}
                                                {availableNguoiSuaHoOptions.filter(name =>
                                                    !nguoiSuaHoSearch || name.toLowerCase().includes(nguoiSuaHoSearch.toLowerCase())
                                                ).length === 0 && (
                                                        <p className="text-sm text-gray-500 text-center py-2">Không tìm thấy kết quả</p>
                                                    )}
                                            </div>
                                        )}
                                    </div>
                                    {editForm.nguoi_sua_ho && editForm.nguoi_sua_ho.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Đã chọn: {editForm.nguoi_sua_ho.join(', ')}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Người đẩy FFM (có thể chọn nhiều)
                                    </label>
                                    <div className="mb-2">
                                        <input
                                            type="text"
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            placeholder="Gõ tên để tìm kiếm..."
                                            value={nguoiDayFFMSearch}
                                            onChange={(e) => setNguoiDayFFMSearch(e.target.value)}
                                            onFocus={() => setShowNguoiDayFFMDropdown(true)}
                                        />
                                    </div>
                                    <div className="border border-gray-300 rounded-lg p-3 max-h-48 overflow-y-auto bg-white">
                                        {vanDonStaff.length === 0 ? (
                                            <p className="text-sm text-gray-500">Đang tải danh sách...</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {vanDonStaff
                                                    .filter(name =>
                                                        !nguoiDayFFMSearch || name.toLowerCase().includes(nguoiDayFFMSearch.toLowerCase())
                                                    )
                                                    .map((name) => (
                                                        <label
                                                            key={name}
                                                            className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                                                checked={editForm.nguoi_day_ffm?.includes(name) || false}
                                                                onChange={(e) => {
                                                                    const current = editForm.nguoi_day_ffm || [];
                                                                    if (e.target.checked) {
                                                                        setEditForm({ ...editForm, nguoi_day_ffm: [...current, name] });
                                                                    } else {
                                                                        setEditForm({ ...editForm, nguoi_day_ffm: current.filter(n => n !== name) });
                                                                    }
                                                                }}
                                                            />
                                                            <span className="ml-2 text-sm text-gray-700">{name}</span>
                                                        </label>
                                                    ))}
                                                {vanDonStaff.filter(name =>
                                                    !nguoiDayFFMSearch || name.toLowerCase().includes(nguoiDayFFMSearch.toLowerCase())
                                                ).length === 0 && (
                                                        <p className="text-sm text-gray-500 text-center py-2">Không tìm thấy kết quả</p>
                                                    )}
                                            </div>
                                        )}
                                    </div>
                                    {editForm.nguoi_day_ffm && editForm.nguoi_day_ffm.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Đã chọn: {editForm.nguoi_day_ffm.join(', ')}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Số đơn
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100"
                                        value={editForm.so_don}
                                        readOnly
                                        title="Số đơn tự động đếm theo bộ lọc ngày"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Tự động đếm theo bộ lọc ngày (từ {startDate} đến {endDate})
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleSave}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                                >
                                    Lưu
                                </button>
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg transition-colors"
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
