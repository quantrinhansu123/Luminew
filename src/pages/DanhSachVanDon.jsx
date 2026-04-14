// Columns to always hide
const HIDDEN_COLUMNS = ["Thuê TK", "Thời gian cutoff", "Tiền Hàng", "Người đẩy FFM"];
import { Calendar, Edit, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';

const VAN_DON_LIST_FULL_ACCESS_ROLES = ['admin', 'super_admin', 'director', 'manager', 'administrator'];
const normalizeBranch = (value) =>
    String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[.\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
const isHcmBranch = (value) => {
    const branch = normalizeBranch(value);
    return (
        branch === 'hcm' ||
        branch === 'tp hcm' ||
        branch === 'tphcm' ||
        branch === 'ho chi minh' ||
        branch.includes('hcm') ||
        branch.includes('ho chi minh')
    );
};
const isHanoiBranch = (value) => {
    const branch = normalizeBranch(value);
    return branch === 'ha noi' || branch === 'hanoi' || branch === 'hn' || branch.includes('ha noi') || branch.includes('hanoi');
};
const isBranchMatched = (staffBranch, selectedBranch) => {
    if (!selectedBranch) return true;
    if (isHcmBranch(selectedBranch)) return isHcmBranch(staffBranch);
    if (isHanoiBranch(selectedBranch)) return isHanoiBranch(staffBranch);
    return normalizeBranch(staffBranch) === normalizeBranch(selectedBranch);
};

// Khớp bộ phận Vận đơn trên `users.department` hoặc `human_resources."Bộ phận"`.
const isBoPhanVanDon = (dept) => {
    const raw = (dept ?? '').toString().trim();
    if (!raw) return false;
    const compact = raw.toLowerCase().replace(/\s+/g, ' ');
    if (compact.includes('vận đơn') || compact.includes('van đơn')) return true;
    const ascii = raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');
    if (ascii.includes('van don')) return true;
    if (ascii === 'logistics' || ascii.startsWith('logistics ')) return true;
    return false;
};

export default function DanhSachVanDon({ dataSource = 'default' }) {
    const isHcmView = dataSource === 'hcm';
    const ordersTableName = isHcmView ? 'order_code_hcm' : 'orders';
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
    // Bộ lọc chi nhánh (dựa vào cột `chi_nhanh`)
    const [branchFilter, setBranchFilter] = useState(() => (isHcmView ? 'HCM' : ''));

    // Date filter
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7); // Default: last 7 days
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    // Staff lists for dropdowns
    const [vanDonStaff, setVanDonStaff] = useState([]);
    const [vanDonStaffBranchMap, setVanDonStaffBranchMap] = useState({});

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
    const [showHoVaTenDropdown, setShowHoVaTenDropdown] = useState(false);
    const [showNguoiSuaHoDropdown, setShowNguoiSuaHoDropdown] = useState(false);
    const missingVanDonTableNotifiedRef = useRef(false);
    const missingNguoiDayFfmColumnRef = useRef(false);

    // Load "Nhân sự vận đơn" (human_resources + users) để phục vụ dropdown "Họ và tên *".
    const loadVanDonStaff = async () => {
        try {
            console.log('Loading van don staff from human_resources/users...');

            const staffNamesSet = new Set();
            const staffBranchMap = {};

            // 1) Nguồn chính: human_resources
            const { data: hrRows, error: hrError } = await supabase
                .from('human_resources')
                .select('"Họ Và Tên", "Bộ phận", "chi nhánh"');

            if (hrError) {
                console.warn('human_resources fetch error:', hrError);
            } else {
                (hrRows || []).forEach((row) => {
                    if (!isBoPhanVanDon(row?.['Bộ phận'])) return;
                    const name = String(row?.['Họ Và Tên'] || '').trim();
                    if (!name) return;
                    staffNamesSet.add(name);

                    const chiNhanh = String(row?.['chi nhánh'] || '').trim();
                    if (chiNhanh) staffBranchMap[name] = chiNhanh;
                });
            }

            // 2) Bổ sung/fallback: users (department)
            let usersRows = [];
            try {
                const { data: uData, error: uError } = await supabase
                    .from('users')
                    .select('name, department, branch, chi_nhanh')
                    .not('name', 'is', null)
                    .order('name', { ascending: true });

                if (uError) throw uError;
                usersRows = uData || [];
            } catch (e) {
                // Một số DB cũ có thể không có branch/chi_nhanh.
                const message = String(e?.message || '').toLowerCase();
                const missingChiNhanhColumn = message.includes('chi_nhanh') && message.includes('does not exist');
                const missingBranchColumn = message.includes('branch') && message.includes('does not exist');

                try {
                    if (!missingBranchColumn) {
                        const { data: uData, error: uError } = await supabase
                            .from('users')
                            .select('name, department, branch')
                            .not('name', 'is', null)
                            .order('name', { ascending: true });
                        if (uError) throw uError;
                        usersRows = uData || [];
                    } else if (!missingChiNhanhColumn) {
                        const { data: uData, error: uError } = await supabase
                            .from('users')
                            .select('name, department, chi_nhanh')
                            .not('name', 'is', null)
                            .order('name', { ascending: true });
                        if (uError) throw uError;
                        usersRows = uData || [];
                    } else {
                        const { data: uData, error: uError } = await supabase
                            .from('users')
                            .select('name, department')
                            .not('name', 'is', null)
                            .order('name', { ascending: true });
                        if (uError) throw uError;
                        usersRows = uData || [];
                    }
                } catch (e2) {
                    console.warn('users fallback fetch error:', e2);
                    usersRows = [];
                }
            }

            (usersRows || []).forEach((member) => {
                if (!isBoPhanVanDon(member?.department)) return;

                const name = String(member?.name || '').trim();
                if (!name) return;

                staffNamesSet.add(name);

                const branch = String(member?.branch || member?.chi_nhanh || '').trim();
                if (branch && !staffBranchMap[name]) staffBranchMap[name] = branch;
            });

            const staffNames = [...staffNamesSet].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));

            if (staffNames.length === 0) {
                console.warn('No van don staff found from human_resources/users.');
                toast.warning('Không tìm thấy Nhân sự vận đơn để điền “Họ và tên”. Vui lòng kiểm tra dữ liệu `human_resources`/`users`.');
            }

            setVanDonStaff(staffNames);
            setVanDonStaffBranchMap(staffBranchMap);
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
                .from(ordersTableName)
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

            // View HCM: chỉ hiển thị chi nhánh HCM.
            if (isHcmView) {
                filteredRecords = filteredRecords.filter((record) => isHcmBranch(record?.chi_nhanh));
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
            const message = String(error?.message || '');
            const isMissingTable =
                error?.code === 'PGRST205' ||
                message.includes("Could not find table 'public.danh_sach_van_don'");

            if (isMissingTable) {
                setData([]);
                setFilteredData([]);
                if (!missingVanDonTableNotifiedRef.current) {
                    toast.error('Thiếu bảng danh_sach_van_don trên Supabase. Vui lòng chạy migration.');
                    missingVanDonTableNotifiedRef.current = true;
                }
            } else {
                toast.error('Lỗi khi tải dữ liệu: ' + message);
            }
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
        let options = vanDonStaff;

        // Thêm mới: lọc theo chi nhánh đã chọn
        if (isAdding && editForm.chi_nhanh) {
            options = options.filter((name) => {
                const staffBranch = vanDonStaffBranchMap[name];
                // Nếu không biết chi nhánh thì vẫn cho hiển thị (tránh case list bị rỗng do thiếu dữ liệu branch/chi_nhanh).
                if (!staffBranch) return true;
                return isBranchMatched(staffBranch, editForm.chi_nhanh);
            });
        }

        if (!isAdding) return options;
        // Lấy danh sách ho_va_ten đã có trong data
        const existingNames = new Set(data.map(item => item.ho_va_ten).filter(Boolean));
        // Loại trừ những người đã có
        return options.filter(name => !existingNames.has(name));
    }, [vanDonStaff, vanDonStaffBranchMap, data, isAdding, editForm.chi_nhanh]);

    // Tính toán danh sách nhân sự cho "Người sửa hộ" (loại trừ người đang được chọn trong ho_va_ten)
    const availableNguoiSuaHoOptions = useMemo(() => {
        // Loại trừ người đang được chọn trong ho_va_ten
        return vanDonStaff.filter(name => name !== editForm.ho_va_ten);
    }, [vanDonStaff, editForm.ho_va_ten]);

    // Filter Data
    useEffect(() => {
        let base = data || [];

        if (branchFilter) {
            base = base.filter((item) => isBranchMatched(item?.chi_nhanh, branchFilter));
        }

        if (!searchText.trim()) {
            setFilteredData(base);
            return;
        }

        const searchLower = searchText.toLowerCase();
        const filtered = base.filter((item) => {
            const nguoiSuaHoText = Array.isArray(item.nguoi_sua_ho)
                ? item.nguoi_sua_ho.join(' ')
                : String(item.nguoi_sua_ho || '');

            return (
            item.ho_va_ten?.toLowerCase().includes(searchLower) ||
            item.trang_thai_chia?.toLowerCase().includes(searchLower) ||
            item.chi_nhanh?.toLowerCase().includes(searchLower) ||
            nguoiSuaHoText.toLowerCase().includes(searchLower) ||
            (item.nguoi_day_ffm_parsed &&
                item.nguoi_day_ffm_parsed.some((name) => name.toLowerCase().includes(searchLower))) ||
            String(item.so_don || '').includes(searchText)
            );
        });
        setFilteredData(filtered);
    }, [searchText, data, branchFilter]);

    const handleAdd = async () => {
        // Đảm bảo danh sách nhân sự đã được load
        if (vanDonStaff.length === 0) {
            await loadVanDonStaff();
        }

        setIsAdding(true);
        setEditingId(null);
        setHoVaTenSearch('');
        setNguoiSuaHoSearch('');
        setShowHoVaTenDropdown(false);
        setShowNguoiSuaHoDropdown(false);
        setEditForm({
            ho_va_ten: '',
            trang_thai_chia: '',
            chi_nhanh: isHcmView ? 'HCM' : '',
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
            chi_nhanh: isHcmView ? 'HCM' : item.chi_nhanh || '',
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

        // Mode "Thêm mới": bắt buộc chọn đúng từ danh sách Nhân sự vận đơn.
        if (isAdding) {
            const chosen = editForm.ho_va_ten.trim();
            const ok = vanDonStaff.some((name) => String(name).trim().toLowerCase() === chosen.toLowerCase());
            if (!ok) {
                toast.error('Vui lòng chọn Họ và tên từ danh sách Nhân sự vận đơn');
                return;
            }
        }

        try {
            // Auto-count orders when saving
            const orderCount = await countOrdersForStaff(editForm.ho_va_ten);
            // Lưu đúng kiểu JSON array cho cột jsonb
            const formData = {
                ho_va_ten: editForm.ho_va_ten.trim(),
                trang_thai_chia: editForm.trang_thai_chia || null,
                chi_nhanh: isHcmView ? 'HCM' : editForm.chi_nhanh || null,
                so_don: orderCount,
                nguoi_sua_ho: Array.isArray(editForm.nguoi_sua_ho) ? editForm.nguoi_sua_ho : [],
                nguoi_day_ffm: Array.isArray(editForm.nguoi_day_ffm) ? editForm.nguoi_day_ffm : []
            };

            console.log('💾 [DanhSachVanDon] Saving data:', {
                isAdding,
                editingId,
                formData
            });

            const saveWithPayload = async (payload) => {
                if (isAdding) {
                    return await supabase
                        .from('danh_sach_van_don')
                        .insert([payload])
                        .select();
                }
                return await supabase
                    .from('danh_sach_van_don')
                    .update(payload)
                    .eq('id', editingId)
                    .select();
            };

            let { data, error } = await saveWithPayload(formData);

            if (error && String(error.message || '').includes('nguoi_day_ffm')) {
                const fallbackPayload = { ...formData };
                delete fallbackPayload.nguoi_day_ffm;
                ({ data, error } = await saveWithPayload(fallbackPayload));
                if (!error && !missingNguoiDayFfmColumnRef.current) {
                    toast.warning('DB chưa có cột nguoi_day_ffm, đã tự lưu ở chế độ tương thích.');
                    missingNguoiDayFfmColumnRef.current = true;
                }
            }

            if (error && String(error.message || '').includes('danh_sach_van_don_nguoi_sua_ho_is_array')) {
                const fallbackPayload = {
                    ho_va_ten: formData.ho_va_ten,
                    trang_thai_chia: formData.trang_thai_chia,
                    chi_nhanh: formData.chi_nhanh,
                    so_don: formData.so_don,
                };
                ({ data, error } = await saveWithPayload(fallbackPayload));
                if (!error) {
                    toast.warning('DB hiện tại chưa tương thích cột nguoi_sua_ho/nguoi_day_ffm, đã lưu bản ghi cơ bản.');
                }
            }

            if (error) {
                if (isAdding) {
                    console.error('❌ [DanhSachVanDon] Insert error:', error);
                } else {
                    console.error('❌ [DanhSachVanDon] Update error:', error);
                    console.error('❌ [DanhSachVanDon] Error details:', {
                        message: error.message,
                        code: error.code,
                        details: error.details,
                        hint: error.hint
                    });
                }
                throw error;
            }

            console.log(`✅ [DanhSachVanDon] ${isAdding ? 'Insert' : 'Update'} success:`, data);
            toast.success(isAdding ? 'Đã thêm thành công!' : 'Đã cập nhật thành công!');

            setShowModal(false);
            loadData();
        } catch (error) {
            console.error('❌ [DanhSachVanDon] Error saving:', error);
            console.error('❌ [DanhSachVanDon] Full error object:', JSON.stringify(error, null, 2));
            const errorMessage = error.message || error.details || 'Không xác định được lỗi';
            
            toast.error(`Lỗi khi lưu: ${errorMessage}`, {
                autoClose: 5000
            });
        }
    };

    return (
        <div className="flex flex-col w-full max-w-none min-h-[calc(100dvh-3.5rem)] bg-gray-50 px-3 sm:px-4 py-3 gap-4 box-border">
            <div className="shrink-0">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">Danh sách vận đơn</h1>
                <p className="text-gray-600 text-sm sm:text-base">Quản lý danh sách vận đơn</p>
            </div>

            {/* Date Filter */}
            <div className="shrink-0 bg-white rounded-lg shadow-md border border-gray-200 p-4">
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
                <div>
                    <label className="text-xs text-gray-600 block mb-1">Chi nhánh</label>
                    <select
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        disabled={isHcmView}
                        title={isHcmView ? 'Trang HCM tự khóa chi nhánh = HCM' : 'Chọn chi nhánh'}
                    >
                        <option value="">Tất cả</option>
                        <option value="Hà Nội">Hà Nội</option>
                        <option value="HCM">HCM</option>
                    </select>
                </div>
                    <div className="text-xs text-gray-500 mt-6">
                        Số đơn sẽ tự động đếm theo khoảng ngày này
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="shrink-0 bg-white rounded-lg shadow-md border border-gray-200 p-4">
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

            {/* Table — flex-1 để chiếm trọn chiều cao còn lại (full màn hình dưới header) */}
            <div className="flex flex-1 min-h-0 flex-col bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex flex-1 min-h-[12rem] items-center justify-center p-8 text-center text-gray-500">
                        <div>
                            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                            Đang tải...
                        </div>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="flex flex-1 min-h-[12rem] items-center justify-center p-8 text-center text-gray-500">
                        Không có dữ liệu
                    </div>
                ) : (
                    <div className="overflow-auto flex-1 min-h-0 min-w-0">
                        <table className="w-full text-sm text-left min-w-[640px]">
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
                                                {String(item.id ?? '').slice(0, 8)}...
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
                                                        // Mode "Thêm mới": không cho lưu tên tự do.
                                                        setEditForm({ ...editForm, ho_va_ten: '' });
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
                                            Không tìm thấy Nhân sự vận đơn để điền “Họ và tên”. Vui lòng kiểm tra dữ liệu `human_resources`/`users`.
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
                                        onChange={(e) => {
                                            const nextBranch = e.target.value;
                                            setEditForm((prev) => {
                                                const nextForm = { ...prev, chi_nhanh: nextBranch };
                                                const staffBranch = nextForm.ho_va_ten ? vanDonStaffBranchMap[nextForm.ho_va_ten] : undefined;
                                                if (
                                                    isAdding &&
                                                    prev.ho_va_ten &&
                                                    staffBranch &&
                                                    !isBranchMatched(staffBranch, nextBranch)
                                                ) {
                                                    nextForm.ho_va_ten = '';
                                                    setHoVaTenSearch('');
                                                }
                                                return nextForm;
                                            });
                                        }}
                                        disabled={isHcmView}
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
