import { ChevronLeft, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import usePermissions from '../hooks/usePermissions';
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

    const loadData = async () => {
        setLoading(true);
        try {
            const { data: pages, error } = await supabase
                .from('marketing_pages')
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;

            setData(pages || []);
            setFilteredData(pages || []);
        } catch (error) {
            console.error('Error loading pages:', error);
            // Don't alert on 404/empty table initially if user hasn't created it yet
            if (error.code !== 'PGRST116') {
                // alert('Lỗi tải dữ liệu page: ' + error.message);
            }
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
        loadData();
    }, []);

    // Filter Data
    useEffect(() => {
        let result = [...data];

        // Filter by selected personnel names (if not manager/admin)
        const isManager = ['admin', 'director', 'manager', 'super_admin'].includes((role || '').toLowerCase());
        const userName = localStorage.getItem("username") || "";
        
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
                
                result = result.filter(item => {
                    const mktStaff = normalizeNameForMatch(item.mkt_staff || '');
                    return allNames.some(name => {
                        const nameNormalized = normalizeNameForMatch(name);
                        return mktStaff.includes(nameNormalized) || 
                               nameNormalized.includes(mktStaff) ||
                               mktStaff === nameNormalized;
                    });
                });
            } else if (userName) {
                // Nếu không có selectedPersonnelNames, filter theo user hiện tại
                const userNameNormalized = normalizeNameForMatch(userName);
                result = result.filter(item => {
                    const mktStaff = normalizeNameForMatch(item.mkt_staff || '');
                    return mktStaff.includes(userNameNormalized) || 
                           userNameNormalized.includes(mktStaff) ||
                           mktStaff === userNameNormalized;
                });
            }
        }

        // Search
        if (searchText) {
            const lower = searchText.toLowerCase();
            result = result.filter(item =>
                (item.page_name || '').toLowerCase().includes(lower) ||
                (item.id || '').toLowerCase().includes(lower) ||
                (item.pancake_id || '').includes(lower)
            );
        }

        // Market Filter
        if (filterMarket) {
            result = result.filter(item => item.market === filterMarket);
        }

        // Staff Filter
        if (filterStaff) {
            result = result.filter(item => item.mkt_staff === filterStaff);
        }

        // Product Filter
        if (filterProduct) {
            result = result.filter(item => item.product === filterProduct);
        }

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

    // Unique options for filters
    const marketOptions = [...new Set(data.map(i => i.market).filter(Boolean))].sort();
    const staffOptions = [...new Set(data.map(i => i.mkt_staff).filter(Boolean))].sort();
    const productOptions = [...new Set(data.map(i => i.product).filter(Boolean))].sort();

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

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
                            onClick={loadData}
                            className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition flex items-center gap-2 text-sm font-medium"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            Làm mới
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 space-y-4 md:space-y-0 md:flex md:items-center md:gap-4 flex-wrap">
                    <div className="flex-1 relative min-w-[300px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo Tên Page, ID, Pancake ID..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <select
                        value={filterStaff}
                        onChange={(e) => setFilterStaff(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Tất cả Nhân sự</option>
                        {staffOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>

                    <select
                        value={filterMarket}
                        onChange={(e) => setFilterMarket(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Tất cả Thị trường</option>
                        {marketOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>

                    <select
                        value={filterProduct}
                        onChange={(e) => setFilterProduct(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[150px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="">Tất cả Sản phẩm</option>
                        {productOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>

                {/* Table */}
                <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">id</th>
                                    <th className="px-4 py-3 whitespace-nowrap min-w-[300px]">Tên Page</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Tên MKT</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Sản phẩm</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Thị trường</th>
                                    <th className="px-4 py-3 whitespace-nowrap">ID PANCAKE</th>
                                    <th className="px-4 py-3 whitespace-nowrap text-center">Link Page</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.length > 0 ? (
                                    filteredData.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-gray-900">{item.id}</td>
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
                                        value={newPage.mkt_staff}
                                        onChange={(e) => setNewPage({ ...newPage, mkt_staff: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Nhập tên nhân viên MKT"
                                    />
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
            </div>
        </div>
    );
}
