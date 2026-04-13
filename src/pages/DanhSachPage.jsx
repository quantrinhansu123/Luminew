import { ChevronLeft, Download, Eye, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
import { fetchMktEmployees } from '../services/mkt-service';
import * as rbacService from '../services/rbacService';
import { supabase } from '../supabase/config';

export default function DanhSachPage() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView, role } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_PAGES' : 'MKT_PAGES';

    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const fileInputRef = useRef(null);
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Danh sách tên nhân sự đã chọn

    // Filters
    const [filterMarket, setFilterMarket] = useState('');
    const [filterStaff, setFilterStaff] = useState('');
    const [filterProduct, setFilterProduct] = useState('');

    // Add Page Modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [newPage, setNewPage] = useState({
        id: '',
        page_name: '',
        mkt_staff: '',
        product: '',
        market: '',
        pancake_id: '',
        page_link: ''
    });
    const [addingPage, setAddingPage] = useState(false);
    const [renamingManhCuongMkt, setRenamingManhCuongMkt] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);
    /** Tên nhân sự bộ phận MKT (users.department) — gợi ý ô Tên MKT khi thêm/sửa page */
    const [mktDepartmentNames, setMktDepartmentNames] = useState([]);

    // Edit Page Modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingPage, setEditingPage] = useState(null);
    const [updatingPage, setUpdatingPage] = useState(false);

    // View Page Modal
    const [showViewModal, setShowViewModal] = useState(false);
    const [viewingPage, setViewingPage] = useState(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);

    const loadData = async () => {
        setLoading(true);
        try {
            console.log('🔄 [DanhSachPage] Loading data from marketing_pages...');
            const { data: pages, error } = await supabase
                .from('marketing_pages')
                .select('*')
                .order('id', { ascending: true });

            if (error) {
                console.error('❌ [DanhSachPage] Error loading pages:', error);
                throw error;
            }

            console.log('✅ [DanhSachPage] Loaded pages:', pages?.length || 0, 'items');
            console.log('📊 [DanhSachPage] Sample data:', pages?.slice(0, 2));
            
            // Chỉ set data, để useEffect filter tự động cập nhật filteredData
            setData(pages || []);
        } catch (error) {
            console.error('❌ [DanhSachPage] Error loading pages:', error);
            // Don't alert on 404/empty table initially if user hasn't created it yet
            if (error.code !== 'PGRST116') {
                toast.error('Lỗi tải dữ liệu page: ' + error.message);
            }
            // Đảm bảo set data rỗng nếu có lỗi
            setData([]);
        } finally {
            setLoading(false);
        }
    };

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
                
                console.log('📝 [DanhSachPage] Valid personnel names:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [DanhSachPage] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const emps = await fetchMktEmployees();
                if (cancelled) return;
                const names = [
                    ...new Set(
                        (emps || [])
                            .map((e) => String(e?.name ?? '').trim())
                            .filter(Boolean)
                    ),
                ].sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base', numeric: true }));
                setMktDepartmentNames(names);
            } catch (err) {
                console.error('[DanhSachPage] fetchMktEmployees:', err);
                if (!cancelled) setMktDepartmentNames([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    /** Select «Tên MKT» khi sửa: nhân sự MKT (HR) + giữ đúng chuỗi đang lưu nếu không khớp danh sách. */
    const editMktStaffSelectOptions = useMemo(() => {
        if (!editingPage) return mktDepartmentNames;
        const cur = String(editingPage.mkt_staff ?? '');
        const trimmed = cur.trim();
        const names = [...mktDepartmentNames];
        const inList = names.some((n) => n === cur || (trimmed && String(n).trim() === trimmed));
        if (trimmed && !inList) {
            return [cur, ...names];
        }
        return names;
    }, [editingPage, mktDepartmentNames]);

    useEffect(() => {
        console.log('🚀 [DanhSachPage] Component mounted, loading data...');
        loadData();
    }, []);

    // Filter Data
    useEffect(() => {
        console.log('🔄 [DanhSachPage] Filter effect triggered');
        console.log('📊 [DanhSachPage] Current data length:', data?.length || 0);
        console.log('👤 [DanhSachPage] Role:', role);
        console.log('👥 [DanhSachPage] Selected personnel names:', selectedPersonnelNames);
        
        // Đảm bảo data là array hợp lệ
        if (!Array.isArray(data)) {
            console.log('⚠️ [DanhSachPage] Data is not an array, setting empty');
            setFilteredData([]);
            return;
        }

        if (data.length === 0) {
            console.log('⚠️ [DanhSachPage] Data is empty, setting empty filteredData');
            setFilteredData([]);
            return;
        }

        let result = [...data];
        console.log('🔄 [DanhSachPage] Starting with', result.length, 'items');

        // Tạm thời tắt filter personnel để đảm bảo data hiển thị
        // TODO: Bật lại filter personnel sau khi xác nhận data hiển thị được
        /*
        // Filter by selected personnel names (if not manager/admin/finance)
        const roleLower = (role || '').toLowerCase();
        const isManager = ['admin', 'director', 'manager', 'super_admin', 'finance'].includes(roleLower);
        const userName = localStorage.getItem("username") || "";
        
        console.log('👤 [DanhSachPage] Is Manager:', isManager);
        console.log('👤 [DanhSachPage] Username:', userName);
        
        // Helper function to normalize name for matching
        const normalizeNameForMatch = (str) => {
            if (!str) return '';
            return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
        };

        if (!isManager) {
            if (selectedPersonnelNames.length > 0) {
                // Filter theo selectedPersonnelNames + userName
                const allNames = [...new Set([...selectedPersonnelNames, userName].filter(Boolean))];
                console.log('🔍 [DanhSachPage] Filtering by selected personnel names:', allNames);
                
                const beforeFilter = result.length;
                result = result.filter(item => {
                    const mktStaff = normalizeNameForMatch(item.mkt_staff || '');
                    return allNames.some(name => {
                        const nameNormalized = normalizeNameForMatch(name);
                        return mktStaff.includes(nameNormalized) || 
                               nameNormalized.includes(mktStaff) ||
                               mktStaff === nameNormalized;
                    });
                });
                console.log(`🔍 [DanhSachPage] After personnel filter: ${beforeFilter} -> ${result.length}`);
            } else if (userName) {
                // Nếu không có selectedPersonnelNames, filter theo user hiện tại
                const userNameNormalized = normalizeNameForMatch(userName);
                const beforeFilter = result.length;
                result = result.filter(item => {
                    const mktStaff = normalizeNameForMatch(item.mkt_staff || '');
                    return mktStaff.includes(userNameNormalized) || 
                           userNameNormalized.includes(mktStaff) ||
                           mktStaff === userNameNormalized;
                });
                console.log(`🔍 [DanhSachPage] After username filter: ${beforeFilter} -> ${result.length}`);
            }
        } else {
            console.log('✅ [DanhSachPage] Manager user, showing all data');
        }
        */

        // Search (gồm Tên MKT / mkt_staff)
        if (searchText) {
            const lower = searchText.toLowerCase();
            const beforeFilter = result.length;
            result = result.filter(
                (item) =>
                    (item.page_name || '').toLowerCase().includes(lower) ||
                    (item.id || '').toLowerCase().includes(lower) ||
                    String(item.pancake_id || '').toLowerCase().includes(lower) ||
                    (item.mkt_staff || '').toLowerCase().includes(lower)
            );
            console.log(`🔍 [DanhSachPage] After search filter: ${beforeFilter} -> ${result.length}`);
        }

        // Market Filter
        if (filterMarket) {
            const beforeFilter = result.length;
            result = result.filter(item => item.market === filterMarket);
            console.log(`🔍 [DanhSachPage] After market filter: ${beforeFilter} -> ${result.length}`);
        }

        // Staff Filter
        if (filterStaff) {
            const beforeFilter = result.length;
            result = result.filter(item => item.mkt_staff === filterStaff);
            console.log(`🔍 [DanhSachPage] After staff filter: ${beforeFilter} -> ${result.length}`);
        }

        // Product Filter
        if (filterProduct) {
            const beforeFilter = result.length;
            result = result.filter(item => item.product === filterProduct);
            console.log(`🔍 [DanhSachPage] After product filter: ${beforeFilter} -> ${result.length}`);
        }

        console.log('✅ [DanhSachPage] Final filtered data length:', result.length);
        setFilteredData(result);
    }, [data, searchText, filterMarket, filterStaff, filterProduct, selectedPersonnelNames, role]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const XLSX = await import('xlsx');
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                if (jsonData.length === 0) {
                    alert("File Excel không có dữ liệu!");
                    return;
                }

                // Map data
                const upsertData = [];
                for (const row of jsonData) {
                    // Helper to find value case-insensitively or by exact match
                    const getValue = (keys) => {
                        for (const k of keys) {
                            if (row[k] !== undefined) return row[k];
                        }
                        return null;
                    };

                    const id = getValue(['id', 'ID', 'Id']);
                    if (!id) continue; // ID is required

                    upsertData.push({
                        id: String(id),
                        page_name: getValue(['Tên Page', 'Ten Page', 'page_name']) || '',
                        mkt_staff: getValue(['Tên MKT', 'Ten MKT', 'mkt_staff']) || '',
                        product: getValue(['Sản phẩm', 'San pham', 'product']) || '',
                        market: getValue(['Thị trường', 'Thi truong', 'market']) || '',
                        pancake_id: String(getValue(['ID PANCAKE', 'ID Pancake', 'pancake_id']) || ''),
                        page_link: getValue(['Link Page', 'Link page', 'page_link']) || ''
                    });
                }

                if (upsertData.length > 0) {
                    const { error } = await supabase
                        .from('marketing_pages')
                        .upsert(upsertData, { onConflict: 'id' });

                    if (error) throw error;
                    alert(`Đã nhập thành công ${upsertData.length} dòng dữ liệu!`);
                    loadData();
                } else {
                    alert("Không tìm thấy cột 'id' hoặc dữ liệu hợp lệ trong file Excel.");
                }

            } catch (error) {
                console.error("Import Error:", error);
                alert("Lỗi khi nhập file: " + error.message);
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExportFilteredExcel = async () => {
        if (exportingExcel) return;
        try {
            setExportingExcel(true);
            const rows = Array.isArray(filteredData) ? filteredData : [];
            if (rows.length === 0) {
                toast.warning('Không có dữ liệu theo bộ lọc để xuất Excel.');
                return;
            }
            const XLSX = await import('xlsx');
            const header = ['ID', 'Tên Page', 'Tên MKT', 'Sản phẩm', 'Thị trường', 'ID Pancake', 'Link Page'];
            const body = rows.map((r) => ([
                String(r?.id ?? '').trim(),
                String(r?.page_name ?? '').trim(),
                String(r?.mkt_staff ?? '').trim(),
                String(r?.product ?? '').trim(),
                String(r?.market ?? '').trim(),
                String(r?.pancake_id ?? '').trim(),
                String(r?.page_link ?? '').trim(),
            ]));
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
            XLSX.utils.book_append_sheet(wb, ws, 'Danh_sach_page');
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            XLSX.writeFile(wb, `DanhSachPage_filtered_${stamp}.xlsx`);
            toast.success(`Đã xuất ${rows.length} dòng theo bộ lọc.`);
        } catch (error) {
            console.error('Export Excel error:', error);
            toast.error(`Lỗi xuất Excel: ${error?.message || 'Unknown error'}`);
        } finally {
            setExportingExcel(false);
        }
    };

    const handleAddPage = async () => {
        // ID đã được tự động tạo, không cần validation
        setAddingPage(true);
        try {
            const pageData = {
                id: newPage.id, // ID đã được tự động tạo
                page_name: newPage.page_name.trim() || null,
                mkt_staff: newPage.mkt_staff.trim() || null,
                product: newPage.product.trim() || null,
                market: newPage.market.trim() || null,
                pancake_id: newPage.pancake_id.trim() || null,
                page_link: newPage.page_link.trim() || null
            };

            const { error } = await supabase
                .from('marketing_pages')
                .insert([pageData]);

            if (error) {
                if (error.code === '23505') { // Unique violation
                    toast.error('ID đã tồn tại! Vui lòng sử dụng ID khác.');
                } else {
                    throw error;
                }
                return;
            }

            toast.success('Đã thêm page thành công!');
            setShowAddModal(false);
            setNewPage({
                id: '',
                page_name: '',
                mkt_staff: '',
                product: '',
                market: '',
                pancake_id: '',
                page_link: ''
            });
            loadData();
        } catch (error) {
            console.error('Error adding page:', error);
            toast.error('Lỗi khi thêm page: ' + error.message);
        } finally {
            setAddingPage(false);
        }
    };

    const handleEditPage = async () => {
        if (!editingPage) return;
        setUpdatingPage(true);
        try {
            const pageData = {
                page_name: editingPage.page_name?.trim() || null,
                mkt_staff: editingPage.mkt_staff?.trim() || null,
                product: editingPage.product?.trim() || null,
                market: editingPage.market?.trim() || null,
                pancake_id: editingPage.pancake_id?.trim() || null,
                page_link: editingPage.page_link?.trim() || null
            };

            const { error } = await supabase
                .from('marketing_pages')
                .update(pageData)
                .eq('id', editingPage.id);

            if (error) throw error;

            toast.success('Đã cập nhật page thành công!');
            setShowEditModal(false);
            setEditingPage(null);
            loadData();
        } catch (error) {
            console.error('Error updating page:', error);
            toast.error('Lỗi khi cập nhật page: ' + error.message);
        } finally {
            setUpdatingPage(false);
        }
    };

    const handleDeletePage = async (id) => {
        if (!window.confirm('Bạn có chắc chắn muốn xóa page này không?')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('marketing_pages')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Đã xóa page thành công!');
            loadData();
        } catch (error) {
            console.error('Error deleting page:', error);
            toast.error('Lỗi khi xóa page: ' + error.message);
        }
    };

    const handleViewPage = (item) => {
        setViewingPage(item);
        setShowViewModal(true);
    };

    /** Chuẩn hóa «Mạnh Cường» (mọi biến thể) → «Đỗ Mạnh Cường»; không sửa chỗ đã là «Đỗ Mạnh Cường». */
    const toDoManhCuongMkt = (s) => {
        const str = String(s ?? '');
        return str.replace(/(?<!Đỗ\s)(?<!đỗ\s)mạnh\s+cường/giu, 'Đỗ Mạnh Cường');
    };

    const handleNormalizeManhCuongMkt = async () => {
        if (renamingManhCuongMkt) return;
        const ok = window.confirm(
            'Đổi mọi biến thể "Mạnh Cường" thành "Đỗ Mạnh Cường" trong cột Tên MKT (mkt_staff) của toàn bộ page đang tải?'
        );
        if (!ok) return;

        setRenamingManhCuongMkt(true);
        try {
            const candidates = (data || []).filter((row) => {
                const current = String(row?.mkt_staff || '');
                return toDoManhCuongMkt(current) !== current;
            });

            if (candidates.length === 0) {
                toast.info('Không có dòng nào cần chuẩn hóa tên.');
                return;
            }

            for (const row of candidates) {
                const nextName = toDoManhCuongMkt(row.mkt_staff);
                const { error } = await supabase
                    .from('marketing_pages')
                    .update({ mkt_staff: nextName })
                    .eq('id', row.id);
                if (error) throw error;
            }

            toast.success(`Đã cập nhật ${candidates.length} dòng.`);
            await loadData();
        } catch (error) {
            console.error('Error normalizing Đỗ Mạnh Cường:', error);
            toast.error('Lỗi khi đổi tên: ' + (error?.message || String(error)));
        } finally {
            setRenamingManhCuongMkt(false);
        }
    };

    const handleOpenEditModal = (item) => {
        setEditingPage({ ...item });
        setShowEditModal(true);
    };

    // Unique options for filters
    const marketOptions = useMemo(() => {
        if (!Array.isArray(data)) return [];
        return [...new Set(data.map(i => i.market).filter(Boolean))].sort();
    }, [data]);
    
    const staffOptions = useMemo(() => {
        const fromData = Array.isArray(data) ? data.map((i) => i.mkt_staff).filter(Boolean) : [];
        const fromUsers = Array.isArray(mktDepartmentNames) ? mktDepartmentNames : [];
        return [...new Set([...fromUsers, ...fromData])].sort((a, b) =>
            String(a).localeCompare(String(b), 'vi', { sensitivity: 'base', numeric: true })
        );
    }, [data, mktDepartmentNames]);
    
    const productOptions = useMemo(() => {
        if (!Array.isArray(data)) return [];
        return [...new Set(data.map(i => i.product).filter(Boolean))].sort();
    }, [data]);

    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    const paginatedData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    // Reset về trang 1 khi filter thay đổi
    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, filterMarket, filterStaff, filterProduct]);

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    // Debug info
    console.log('🎯 [DanhSachPage] Render - Data:', data.length, 'Filtered:', filteredData.length, 'Loading:', loading);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="w-full p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                            <ChevronLeft className="w-6 h-6" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Danh Sách Page Marketing</h1>
                            <p className="text-sm text-gray-500">Quản lý toàn bộ danh sách Page, ID Pancake và Link</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-white px-3 py-1.5 rounded border border-gray-200 text-sm font-medium text-gray-600">
                            {filteredData.length} / {data.length} Page
                        </div>

                        <button
                            onClick={() => {
                                // Tự động tạo ID khi mở modal
                                setNewPage({
                                    id: crypto.randomUUID(),
                                    page_name: '',
                                    mkt_staff: '',
                                    product: '',
                                    market: '',
                                    pancake_id: '',
                                    page_link: ''
                                });
                                setShowAddModal(true);
                            }}
                            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center gap-2 text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm Page
                        </button>

                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center gap-2 text-sm font-medium"
                        >
                            <Upload className="w-4 h-4" />
                            Import Excel
                        </button>
                        <button
                            onClick={handleExportFilteredExcel}
                            disabled={exportingExcel || loading}
                            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2 text-sm font-medium"
                            title="Tải Excel theo bộ lọc hiện tại"
                        >
                            {exportingExcel ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            {exportingExcel ? 'Đang xuất...' : 'Tải Excel theo lọc'}
                        </button>

                        <button
                            onClick={loadData}
                            className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Làm mới
                        </button>

                        <button
                            type="button"
                            onClick={handleNormalizeManhCuongMkt}
                            disabled={renamingManhCuongMkt || loading}
                            className="px-3 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2 text-sm font-medium"
                            title='Đổi mọi biến thể "Mạnh Cường" thành "Đỗ Mạnh Cường" trong Tên MKT'
                        >
                            {renamingManhCuongMkt ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Đang đổi...
                                </>
                            ) : (
                                <span className="whitespace-nowrap">ĐỔI MẠNH CƯỜNG</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 space-y-4 md:space-y-0 md:flex md:items-end md:gap-4 flex-wrap">
                    <div className="flex-1 relative min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo Tên Page, Tên MKT, ID, Pancake ID..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="flex flex-col gap-1 min-w-[180px]">
                        <label htmlFor="filter-mkt-staff" className="text-xs font-medium text-gray-600">
                            Tên MKT
                        </label>
                        <select
                            id="filter-mkt-staff"
                            value={filterStaff}
                            onChange={(e) => setFilterStaff(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Tất cả</option>
                            {staffOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 min-w-[150px]">
                        <label htmlFor="filter-market" className="text-xs font-medium text-gray-600">
                            Thị trường
                        </label>
                        <select
                            id="filter-market"
                            value={filterMarket}
                            onChange={(e) => setFilterMarket(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Tất cả</option>
                            {marketOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1 min-w-[150px]">
                        <label htmlFor="filter-product" className="text-xs font-medium text-gray-600">
                            Sản phẩm
                        </label>
                        <select
                            id="filter-product"
                            value={filterProduct}
                            onChange={(e) => setFilterProduct(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Tất cả</option>
                            {productOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap min-w-[300px]">Tên Page</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Tên MKT</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Sản phẩm</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Thị trường</th>
                                    <th className="px-4 py-3 whitespace-nowrap">ID PANCAKE</th>
                                    <th className="px-4 py-3 whitespace-nowrap text-center">Link Page</th>
                                    <th className="px-4 py-3 whitespace-nowrap text-center">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                            <div className="flex items-center justify-center gap-2">
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                Đang tải dữ liệu...
                                            </div>
                                        </td>
                                    </tr>
                                ) : !loading && data.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                            Không có dữ liệu. Vui lòng thêm page mới hoặc kiểm tra kết nối database.
                                        </td>
                                    </tr>
                                ) : filteredData.length > 0 ? (
                                    paginatedData.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-gray-700">{item.page_name}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.mkt_staff}</td>
                                            <td className="px-4 py-3 text-gray-600">{item.product}</td>
                                            <td className="px-4 py-3 text-gray-600">
                                                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                                    {item.market}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-gray-600 text-xs">{item.pancake_id}</td>
                                            <td className="px-4 py-3 text-center">
                                                {item.page_link && (
                                                    <a
                                                        href={item.page_link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-indigo-600 hover:text-indigo-800 hover:underline text-xs font-medium"
                                                    >
                                                        {item.page_link}
                                                    </a>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleViewPage(item)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                                                        title="Xem chi tiết"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        Xem
                                                    </button>
                                                    <button
                                                        onClick={() => handleOpenEditModal(item)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-200 rounded transition-colors"
                                                        title="Sửa"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                        Sửa
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePage(item.id)}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                                                        title="Xóa"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        Xóa
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                            Không tìm thấy dữ liệu nào phù hợp.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                {filteredData.length > 0 && (
                    <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mt-4">
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-gray-600">Số dòng/trang:</label>
                                <select
                                    className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={rowsPerPage}
                                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                >
                                    {[25, 50, 100, 200].map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                                <span className="text-sm text-gray-500">
                                    {(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filteredData.length)} / {filteredData.length}
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                    className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    «
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    ‹
                                </button>
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let start = Math.max(1, currentPage - 2);
                                    const end = Math.min(totalPages, start + 4);
                                    start = Math.max(1, end - 4);
                                    return start + i;
                                }).filter(p => p <= totalPages).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setCurrentPage(p)}
                                        className={`px-3 py-1.5 text-sm border rounded ${
                                            p === currentPage
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'border-gray-300 hover:bg-gray-100'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    ›
                                </button>
                                <button
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                    className="px-2 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    »
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Page Modal */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-800">Thêm Page Mới</h2>
                                <button
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setNewPage({
                                            id: '',
                                            page_name: '',
                                            mkt_staff: '',
                                            product: '',
                                            market: '',
                                            pancake_id: '',
                                            page_link: ''
                                        });
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        ID <span className="text-gray-500 text-xs">(Tự động tạo)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={newPage.id}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                                        placeholder="ID sẽ được tự động tạo"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">ID được tự động tạo và không thể chỉnh sửa</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tên Page
                                    </label>
                                    <input
                                        type="text"
                                        value={newPage.page_name}
                                        onChange={(e) => setNewPage({ ...newPage, page_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên page"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tên MKT
                                    </label>
                                    <input
                                        type="text"
                                        list="danh-sach-page-mkt-add"
                                        autoComplete="off"
                                        value={newPage.mkt_staff}
                                        onChange={(e) => setNewPage({ ...newPage, mkt_staff: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Gõ để tìm hoặc chọn từ danh sách nhân sự MKT"
                                    />
                                    <datalist id="danh-sach-page-mkt-add">
                                        {mktDepartmentNames.map((n) => (
                                            <option key={n} value={n} />
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Danh sách từ bảng users (department MKT/Marketing). Có thể gõ tên khác nếu cần.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Sản phẩm
                                    </label>
                                    <input
                                        type="text"
                                        value={newPage.product}
                                        onChange={(e) => setNewPage({ ...newPage, product: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên sản phẩm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Thị trường
                                    </label>
                                    <input
                                        type="text"
                                        value={newPage.market}
                                        onChange={(e) => setNewPage({ ...newPage, market: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập thị trường"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        ID Pancake
                                    </label>
                                    <input
                                        type="text"
                                        value={newPage.pancake_id}
                                        onChange={(e) => setNewPage({ ...newPage, pancake_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập ID Pancake"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Link Page
                                    </label>
                                    <input
                                        type="url"
                                        value={newPage.page_link}
                                        onChange={(e) => setNewPage({ ...newPage, page_link: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setNewPage({
                                            id: '',
                                            page_name: '',
                                            mkt_staff: '',
                                            product: '',
                                            market: '',
                                            pancake_id: '',
                                            page_link: ''
                                        });
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    disabled={addingPage}
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleAddPage}
                                    disabled={addingPage}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {addingPage ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Đang thêm...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Thêm Page
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* View Page Modal */}
                {showViewModal && viewingPage && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-800">Chi tiết Page</h2>
                                <button
                                    onClick={() => {
                                        setShowViewModal(false);
                                        setViewingPage(null);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-mono">
                                        {viewingPage.id}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên Page</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                                        {viewingPage.page_name || '-'}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên MKT</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                                        {viewingPage.mkt_staff || '-'}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sản phẩm</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                                        {viewingPage.product || '-'}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Thị trường</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                                        {viewingPage.market || '-'}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ID Pancake</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-mono">
                                        {viewingPage.pancake_id || '-'}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Link Page</label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                                        {viewingPage.page_link ? (
                                            <a
                                                href={viewingPage.page_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-600 hover:text-indigo-800 hover:underline break-all"
                                            >
                                                {viewingPage.page_link}
                                            </a>
                                        ) : (
                                            <span className="text-gray-500">-</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end">
                                <button
                                    onClick={() => {
                                        setShowViewModal(false);
                                        setViewingPage(null);
                                    }}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                                >
                                    Đóng
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Page Modal */}
                {showEditModal && editingPage && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-800">Sửa Page</h2>
                                <button
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingPage(null);
                                    }}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        ID <span className="text-gray-500 text-xs">(Không thể thay đổi)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPage.id}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tên Page
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPage.page_name || ''}
                                        onChange={(e) => setEditingPage({ ...editingPage, page_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên page"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Tên MKT
                                    </label>
                                    <input
                                        type="text"
                                        list="danh-sach-page-mkt-edit"
                                        autoComplete="off"
                                        value={editingPage.mkt_staff ?? ''}
                                        onChange={(e) =>
                                            setEditingPage({ ...editingPage, mkt_staff: e.target.value })
                                        }
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Gõ để tìm hoặc chọn từ danh sách nhân sự MKT"
                                    />
                                    <datalist id="danh-sach-page-mkt-edit">
                                        {editMktStaffSelectOptions.map((n) => (
                                            <option key={`mkt-${n}`} value={n} />
                                        ))}
                                    </datalist>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Danh sách tên từ bảng users (department MKT/Marketing). Có thể gõ tay tên khác nếu cần.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Sản phẩm
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPage.product || ''}
                                        onChange={(e) => setEditingPage({ ...editingPage, product: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên sản phẩm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Thị trường
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPage.market || ''}
                                        onChange={(e) => setEditingPage({ ...editingPage, market: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập thị trường"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        ID Pancake
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPage.pancake_id || ''}
                                        onChange={(e) => setEditingPage({ ...editingPage, pancake_id: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập ID Pancake"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Link Page
                                    </label>
                                    <input
                                        type="url"
                                        value={editingPage.page_link || ''}
                                        onChange={(e) => setEditingPage({ ...editingPage, page_link: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditingPage(null);
                                    }}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    disabled={updatingPage}
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleEditPage}
                                    disabled={updatingPage}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {updatingPage ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                            Đang cập nhật...
                                        </>
                                    ) : (
                                        <>
                                            <Pencil className="w-4 h-4" />
                                            Cập nhật
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
