import { ChevronLeft, RefreshCw, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import { supabase } from '../supabase/config';

export default function DanhSachPage() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_PAGES' : 'MKT_PAGES';



    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const fileInputRef = useRef(null);

    // Filters
    const [filterMarket, setFilterMarket] = useState('');
    const [filterStaff, setFilterStaff] = useState('');
    const [filterProduct, setFilterProduct] = useState('');

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

    useEffect(() => {
        loadData();
    }, []);

    // Filter Data
    useEffect(() => {
        let result = [...data];

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
    }, [data, searchText, filterMarket, filterStaff, filterProduct]);

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

    // Unique options for filters
    const marketOptions = [...new Set(data.map(i => i.market).filter(Boolean))].sort();
    const staffOptions = [...new Set(data.map(i => i.mkt_staff).filter(Boolean))].sort();
    const productOptions = [...new Set(data.map(i => i.product).filter(Boolean))].sort();

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
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
            </div>
        </div>
    );
}
