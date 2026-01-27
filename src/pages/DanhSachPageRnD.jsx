import { Download, Eye, FileSpreadsheet, Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase/config';

import usePermissions from '../hooks/usePermissions';

export default function DanhSachPageRnD() {
    const { role } = usePermissions(); // Get role
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const SETTINGS_KEY = 'system_settings';

    // System Settings for Dropdowns
    const [settingProducts, setSettingProducts] = useState([]);
    const [settingMarkets, setSettingMarkets] = useState([]);

    // Filters
    const [selectedMarket, setSelectedMarket] = useState('ALL');
    const [selectedStaff, setSelectedStaff] = useState('ALL');
    const [selectedProduct, setSelectedProduct] = useState('ALL');

    const [markets, setMarkets] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [products, setProducts] = useState([]);

    // Edit/Add Mode
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [isAdding, setIsAdding] = useState(false);

    // Column Visibility
    const [visibleColumns, setVisibleColumns] = useState({
        id: true, page_name: true, rd_staff: true, product: true,
        market: true, pancake_id: true, page_link: true, actions: true
    });
    const [showColumnModal, setShowColumnModal] = useState(false);

    useEffect(() => {
        if (role) { // Wait for role to be loaded
            fetchPages();
        }
        // Load System Settings
        try {
            const savedSettings = localStorage.getItem(SETTINGS_KEY); // Note: SETTINGS_KEY was implicitly used but not defined in snippet? I should check if it was defined. The snippet showed it as KEY. I will assume it works or is defined outside.
            // Wait, looking at the previous file content, SETTINGS_KEY wasn't defined in the visible snippet lines 1-452. It might be a global constant or I missed it.
            // Ah line 40: localStorage.getItem(SETTINGS_KEY). 
            // If SETTINGS_KEY is missing in the file, it's an error in the original file, but I shouldn't break it. 
            // I'll leave the try-catch block as is mostly, just ensuring fetchPages uses the role.
            if (savedSettings) {
                const parsed = JSON.parse(savedSettings);
                setSettingProducts(parsed.rndProducts || []);
                setSettingMarkets(parsed.keyMarkets || []);
            }
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }, [role]);

    const fetchPages = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('rd_pages')
                .select('*')
                .order('created_at', { ascending: false });

            // Frontend Isolation Logic
            const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'MANAGER'].includes(role);
            if (!isAdmin && role) {
                const uName = localStorage.getItem('username') || localStorage.getItem('userName'); // Try both keys just in case
                if (uName) {
                    query = query.ilike('rd_staff', uName);
                }
            }

            const { data, error } = await query;

            if (error) throw error;
            setPages(data || []);

            // Extract unique values for filters
            const uniqueMarkets = [...new Set(data.map(p => p.market).filter(Boolean))].sort();
            const uniqueStaff = [...new Set(data.map(p => p.rd_staff).filter(Boolean))].sort();
            const uniqueProducts = [...new Set(data.map(p => p.product).filter(Boolean))].sort();

            setMarkets(uniqueMarkets);
            setStaffList(uniqueStaff);
            setProducts(uniqueProducts);
        } catch (error) {
            console.error('Error fetching RD pages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsName = wb.SheetNames[0];
                const ws = wb.Sheets[wsName];
                const jsonData = XLSX.utils.sheet_to_json(ws);

                if (jsonData.length === 0) {
                    alert('File Excel rỗng!');
                    return;
                }

                // Helper to find value case-insensitively
                const getValue = (row, keys) => {
                    for (let k of keys) {
                        if (row[k] !== undefined) return row[k];
                    }
                    // Try case insensitive
                    const rowKeys = Object.keys(row);
                    for (let k of keys) {
                        const foundKey = rowKeys.find(rk => rk.toLowerCase() === k.toLowerCase());
                        if (foundKey) return row[foundKey];
                    }
                    return null;
                };

                const upsertData = [];
                jsonData.forEach(row => {
                    // Flexible mapping
                    const id = String(getValue(row, ['id', 'ID', 'Id']) || crypto.randomUUID());
                    const pageName = getValue(row, ['Tên Page', 'Ten Page', 'Page Name', 'page_name']) || '';

                    if (!pageName) return; // Skip if no name

                    upsertData.push({
                        id: id,
                        page_name: pageName,
                        rd_staff: getValue(row, ['Tên RD', 'Ten RD', 'Tên MKT', 'Ten MKT', 'Staff', 'rd_staff', 'mkt_staff']) || '',
                        product: getValue(row, ['Sản phẩm', 'San pham', 'Product', 'product']) || '',
                        market: getValue(row, ['Thị trường', 'Thi truong', 'Market', 'market']) || '',
                        pancake_id: String(getValue(row, ['ID Pancake', 'id_pancake', 'pancake_id']) || ''),
                        page_link: getValue(row, ['Link', 'Link Page', 'page_link']) || ''
                    });
                });

                const { error } = await supabase
                    .from('rd_pages')
                    .upsert(upsertData, { onConflict: 'id' });

                if (error) throw error;

                alert(`Đã nhập thành công ${upsertData.length} page!`);
                fetchPages();

            } catch (error) {
                console.error('Excel Import Error:', error);
                alert('Lỗi khi nhập file Excel: ' + error.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExport = () => {
        const exportData = filteredPages.map(p => ({
            'ID': p.id,
            'Tên Page': p.page_name,
            'Tên RD': p.rd_staff,
            'Sản phẩm': p.product,
            'Thị trường': p.market,
            'ID Pancake': p.pancake_id,
            'Link Page': p.page_link
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "DanhSachPageRD");
        XLSX.writeFile(wb, "DanhSachPageRD.xlsx");
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Bạn có chắc muốn xóa Page này?')) return;
        try {
            const { error } = await supabase.from('rd_pages').delete().eq('id', id);
            if (error) throw error;
            setPages(pages.filter(p => p.id !== id));
        } catch (e) {
            alert('Lỗi xóa: ' + e.message);
        }
    };

    const startEdit = (page) => {
        setEditingId(page.id);
        setEditForm(page);
        setIsAdding(false);
    };

    const startAdd = () => {
        setEditingId('NEW');
        const currentUser = localStorage.getItem('username') || '';
        setEditForm({
            id: crypto.randomUUID(),
            page_name: '',
            rd_staff: currentUser, // Auto-populate
            product: '',
            market: '',
            pancake_id: '',
            page_link: ''
        });
        setIsAdding(true);
    };

    const saveEdit = async () => {
        try {
            const { error } = await supabase
                .from('rd_pages')
                .upsert(editForm);

            if (error) throw error;

            await fetchPages(); // Refresh to get sort correct
            setEditingId(null);
            setIsAdding(false);
        } catch (e) {
            alert('Lỗi lưu: ' + e.message);
        }
    };

    const filteredPages = pages.filter(p => {
        const matchSearch =
            p.page_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.rd_staff?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.pancake_id?.includes(searchTerm);

        const matchMarket = selectedMarket === 'ALL' || p.market === selectedMarket;
        const matchStaff = selectedStaff === 'ALL' || p.rd_staff === selectedStaff;
        const matchProduct = selectedProduct === 'ALL' || p.product === selectedProduct;

        return matchSearch && matchMarket && matchStaff && matchProduct;
    });

    return (
        <div className="p-4 bg-pink-50 min-h-screen">
            <div className="max-w-[1400px] mx-auto bg-white rounded-lg shadow-lg p-6">
                <h1 className="text-2xl font-bold text-pink-700 mb-6 flex items-center gap-2">
                    <FileSpreadsheet /> Quản Lý Page R&D
                </h1>

                {/* Toolbar */}
                <div className="flex flex-wrap gap-4 mb-6 justify-between items-end">
                    <div className="flex flex-wrap gap-3 flex-1">
                        <input
                            type="text"
                            placeholder="Tìm kiếm tên page, nhân viên, ID..."
                            className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-pink-500 min-w-[200px]"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />

                        <select
                            className="px-3 py-2 border rounded-md focus:ring-pink-500"
                            value={selectedMarket}
                            onChange={e => setSelectedMarket(e.target.value)}
                        >
                            <option value="ALL">Thị trường: Tất cả</option>
                            {markets.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>

                        <select
                            className="px-3 py-2 border rounded-md focus:ring-pink-500"
                            value={selectedStaff}
                            onChange={e => setSelectedStaff(e.target.value)}
                        >
                            <option value="ALL">Nhân viên: Tất cả</option>
                            {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <select
                            className="px-3 py-2 border rounded-md focus:ring-pink-500"
                            value={selectedProduct}
                            onChange={e => setSelectedProduct(e.target.value)}
                        >
                            <option value="ALL">Sản phẩm: Tất cả</option>
                            {products.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded cursor-pointer hover:bg-green-700">
                            <Upload size={18} /> Nhập Excel
                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <Download size={18} /> Xuất Excel
                        </button>
                        <button onClick={startAdd} className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded hover:bg-pink-700">
                            <Pencil size={18} /> Thêm Mới
                        </button>
                        <button onClick={() => setShowColumnModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                            <Eye size={18} /> Cột
                        </button>
                    </div>
                </div>

                {/* Column Config Modal */}
                {showColumnModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-96 shadow-xl">
                            <h3 className="font-bold mb-4">Tùy chỉnh cột hiển thị</h3>
                            <div className="space-y-2">
                                {Object.keys(visibleColumns).map(key => (
                                    <label key={key} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns[key]}
                                            onChange={() => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))}
                                            className="w-4 h-4 text-pink-600 rounded"
                                        />
                                        <span className="capitalize">{key.replace('_', ' ')}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-end">
                                <button onClick={() => setShowColumnModal(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Đóng</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full bg-white text-sm text-left">
                        <thead className="bg-pink-600 text-white uppercase font-semibold">
                            <tr>
                                {visibleColumns.id && <th className="px-4 py-3">ID</th>}
                                {visibleColumns.page_name && <th className="px-4 py-3">Tên Page</th>}
                                {visibleColumns.rd_staff && <th className="px-4 py-3">Nhân viên R&D</th>}
                                {visibleColumns.product && <th className="px-4 py-3">Sản phẩm</th>}
                                {visibleColumns.market && <th className="px-4 py-3">Thị trường</th>}
                                {visibleColumns.pancake_id && <th className="px-4 py-3">ID Pancake</th>}
                                {visibleColumns.page_link && <th className="px-4 py-3">Link</th>}
                                {visibleColumns.actions && <th className="px-4 py-3 text-center">Thao tác</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isAdding && (
                                <tr className="bg-pink-50">
                                    {visibleColumns.id && <td className="px-4 py-2 italic text-gray-500">Auto-generated</td>}
                                    {visibleColumns.page_name && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.page_name} onChange={e => setEditForm({ ...editForm, page_name: e.target.value })} autoFocus /></td>}

                                    {/* Auto-populated Staff */}
                                    {visibleColumns.rd_staff && <td className="px-4 py-2">
                                        <input
                                            className="w-full p-1 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
                                            value={editForm.rd_staff}
                                            readOnly
                                        />
                                    </td>}

                                    {/* Product Dropdown */}
                                    {visibleColumns.product && <td className="px-4 py-2">
                                        <select
                                            className="w-full p-1 border rounded"
                                            value={editForm.product}
                                            onChange={e => setEditForm({ ...editForm, product: e.target.value })}
                                        >
                                            <option value="">-- Chọn SP --</option>
                                            {settingProducts.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </td>}

                                    {/* Market Dropdown */}
                                    {visibleColumns.market && <td className="px-4 py-2">
                                        <select
                                            className="w-full p-1 border rounded"
                                            value={editForm.market}
                                            onChange={e => setEditForm({ ...editForm, market: e.target.value })}
                                        >
                                            <option value="">-- Chọn TT --</option>
                                            {settingMarkets.map(m => (
                                                <option key={m.name || m} value={m.name || m}>{m.name || m}</option>
                                            ))}
                                        </select>
                                    </td>}

                                    {visibleColumns.pancake_id && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.pancake_id} onChange={e => setEditForm({ ...editForm, pancake_id: e.target.value })} /></td>}
                                    {visibleColumns.page_link && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.page_link} onChange={e => setEditForm({ ...editForm, page_link: e.target.value })} /></td>}
                                    {visibleColumns.actions && <td className="px-4 py-2 flex justify-center gap-2">
                                        <button onClick={saveEdit} className="text-green-600 hover:text-green-800"><Save size={18} /></button>
                                        <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-red-600 hover:text-red-800"><X size={18} /></button>
                                    </td>}
                                </tr>
                            )}
                            {filteredPages.map(page => (
                                <tr key={page.id} className="hover:bg-gray-50">
                                    {editingId === page.id ? (
                                        // Edit Mode Row
                                        <>
                                            {visibleColumns.id && <td className="px-4 py-2 text-gray-500">{editingId === 'NEW' ? 'Auto' : page.id}</td>}
                                            {visibleColumns.page_name && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.page_name} onChange={e => setEditForm({ ...editForm, page_name: e.target.value })} autoFocus /></td>}

                                            {/* Auto-populated Staff */}
                                            {visibleColumns.rd_staff && <td className="px-4 py-2">
                                                <input
                                                    className="w-full p-1 border rounded bg-gray-100 text-gray-600 cursor-not-allowed"
                                                    value={editForm.rd_staff}
                                                    readOnly
                                                    title="Tự động lấy theo tài khoản đăng nhập"
                                                />
                                            </td>}

                                            {/* Product Dropdown */}
                                            {visibleColumns.product && <td className="px-4 py-2">
                                                <select
                                                    className="w-full p-1 border rounded"
                                                    value={editForm.product}
                                                    onChange={e => setEditForm({ ...editForm, product: e.target.value })}
                                                >
                                                    <option value="">-- Chọn SP --</option>
                                                    {settingProducts.map(p => <option key={p} value={p}>{p}</option>)}
                                                </select>
                                            </td>}

                                            {/* Market Dropdown */}
                                            {visibleColumns.market && <td className="px-4 py-2">
                                                <select
                                                    className="w-full p-1 border rounded"
                                                    value={editForm.market}
                                                    onChange={e => setEditForm({ ...editForm, market: e.target.value })}
                                                >
                                                    <option value="">-- Chọn TT --</option>
                                                    {settingMarkets.map(m => (
                                                        <option key={m.name || m} value={m.name || m}>{m.name || m}</option>
                                                    ))}
                                                </select>
                                            </td>}

                                            {visibleColumns.pancake_id && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.pancake_id} onChange={e => setEditForm({ ...editForm, pancake_id: e.target.value })} /></td>}
                                            {visibleColumns.page_link && <td className="px-4 py-2"><input className="w-full p-1 border rounded" value={editForm.page_link} onChange={e => setEditForm({ ...editForm, page_link: e.target.value })} /></td>}
                                            {visibleColumns.actions && <td className="px-4 py-2 flex justify-center gap-2">
                                                <button onClick={saveEdit} className="text-green-600 hover:text-green-800"><Save size={18} /></button>
                                                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-red-600 hover:text-red-800"><X size={18} /></button>
                                            </td>}
                                        </>
                                    ) : (
                                        // View Mode Row
                                        <>
                                            {visibleColumns.id && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{page.id.substring(0, 8)}...</td>}
                                            {visibleColumns.page_name && <td className="px-4 py-3 font-medium">{page.page_name}</td>}
                                            {visibleColumns.rd_staff && <td className="px-4 py-3">{page.rd_staff}</td>}
                                            {visibleColumns.product && <td className="px-4 py-3">{page.product}</td>}
                                            {visibleColumns.market && <td className="px-4 py-3">{page.market}</td>}
                                            {visibleColumns.pancake_id && <td className="px-4 py-3 font-mono text-xs">{page.pancake_id}</td>}
                                            {visibleColumns.page_link && <td className="px-4 py-3"><a href={page.page_link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate block max-w-[200px]">{page.page_link}</a></td>}
                                            {visibleColumns.actions && <td className="px-4 py-3 flex justify-center gap-3">
                                                <button onClick={() => startEdit(page)} className="text-blue-600 hover:text-blue-800" title="Sửa"><Pencil size={18} /></button>
                                                <button onClick={() => handleDelete(page.id)} className="text-red-600 hover:text-red-800" title="Xóa"><Trash2 size={18} /></button>
                                            </td>}
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filteredPages.length === 0 && <div className="p-8 text-center text-gray-500">Không tìm thấy dữ liệu nào.</div>}
                </div>
            </div>
        </div>
    );
}
