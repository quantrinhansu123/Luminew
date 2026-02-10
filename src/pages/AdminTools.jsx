import JSZip from 'jszip';
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, CheckCircle, Clock, Database, Download, FileJson, GitCompare, Globe, Key, Package, RefreshCw, Save, Search, Settings, Shield, Table, Tag, Trash2, Upload, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import PermissionManager from '../components/admin/PermissionManager';
import usePermissions from '../hooks/usePermissions';
import { performEndOfShiftSnapshot } from '../services/snapshotService';
import { supabase } from '../supabase/config';

// Constants for LocalStorage Keys
export const SETTINGS_KEY = 'system_settings';

const DEFAULT_SETTINGS = {
    thresholds: {
        inventoryLow: 10,
        shippingDelay: 3
    },
    normalProducts: ["Bakuchiol Retinol", "Nám DR Hancy"], // List of manually added 'Normal' products
    rndProducts: ["Glutathione Collagen NEW", "Dragon Blood Cream", "Gel XK Thái", "Gel XK Phi"],
    keyProducts: ["Glutathione Collagen", "Kem Body", "DG", "Kẹo Táo"],
    keyMarkets: ["US", "Nhật Bản", "Hàn Quốc"],
    dataSource: 'prod' // 'prod' | 'test'
};

// Helper to get settings
export const getSystemSettings = () => {

    try {
        const s = localStorage.getItem(SETTINGS_KEY);
        return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
};

const GLOBAL_SETTINGS_ID = 'global_config';

const AdminTools = () => {
    const { canView } = usePermissions();


    // --- TABS STATE ---
    const [activeTab, setActiveTab] = useState('maintenance'); // 'maintenance' | 'settings' | 'verification'

    // --- MAINTENANCE STATE ---
    const [loading, setLoading] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState(null);
    const [lastSnapshot, setLastSnapshot] = useState(null);
    const userEmail = localStorage.getItem('userEmail') || 'unknown';

    // --- SETTINGS STATE ---
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [productSuggestions, setProductSuggestions] = useState([]); // Suggested from DB history (loại bỏ các SP đã có trong DB)
    const [availableMarkets, setAvailableMarkets] = useState([]); // Managed + Suggested markets for autocomplete
    const [loadingData, setLoadingData] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingSettings, setLoadingSettings] = useState(false);

    // State để lưu danh sách sản phẩm từ database (bảng system_settings với 2 cột)
    const [dbProducts, setDbProducts] = useState([]); // [{id, name, type}, ...]

    // --- AUTO ASSIGN STATE ---
    const [autoAssignLoading, setAutoAssignLoading] = useState(false);
    const [autoAssignResult, setAutoAssignResult] = useState(null);
    const [notDividedOrders, setNotDividedOrders] = useState([]); // Danh sách đơn không được chia
    const [selectedTeam, setSelectedTeam] = useState('Hà Nội');

    // --- ORDER SEARCH STATE ---
    const [orderSearchCode, setOrderSearchCode] = useState('');
    const [orderSearchResult, setOrderSearchResult] = useState(null);
    const [orderSearchLoading, setOrderSearchLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [cskhStaff, setCskhStaff] = useState([]);
    const [syncTeamLoading, setSyncTeamLoading] = useState(false);

    // --- ACCOUNT MANAGEMENT STATE ---
    const [authAccounts, setAuthAccounts] = useState([]);
    const [accountLoading, setAccountLoading] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [accountForm, setAccountForm] = useState({
        email: '',
        username: '',
        name: '',
        password: '',
        user_id: '',
        role: 'user',
        team: '',
        department: '',
        status: 'active',
        must_change_password: false
    });
    const [loginHistory, setLoginHistory] = useState([]);
    const [showLoginHistory, setShowLoginHistory] = useState(false);
    const [showPasswords, setShowPasswords] = useState({}); // Track which passwords are visible
    const [passwordInputs, setPasswordInputs] = useState({}); // Store password inputs for quick edit

    // --- AUTO FILL TEAM STATE ---
    const [isFillingTeam, setIsFillingTeam] = useState(false);
    const [fillTeamProgress, setFillTeamProgress] = useState({
        current: 0,
        total: 0,
        success: 0,
        failed: 0,
        currentUser: ''
    });

    // --- SEARCH HELPERS ---
    const matchesSearch = (text) => {
        return text && text.toLowerCase().includes(searchQuery.toLowerCase());
    };

    const isSectionVisible = (title, keywords = []) => {
        if (!searchQuery) return true;
        if (matchesSearch(title)) return true;
        if (keywords.some(k => matchesSearch(k))) return true;
        return false;
    };

    // Tab Definitions with Keywords
    const TABS = [
        { id: 'maintenance', label: 'Bảo trì & Chốt ca', icon: Database, keywords: ['bảo trì', 'chốt ca', 'đồng bộ', 'snapshot', 'kiểm tra hệ thống', 'check'] },
        { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings, keywords: ['cài đặt', 'cấu hình', 'setting', 'sản phẩm', 'product', 'thị trường', 'market', 'ngưỡng', 'threshold', 'chỉ số'] },
        { id: 'verification', label: 'Đối soát dữ liệu', icon: GitCompare, keywords: ['đối soát', 'kiểm tra', 'so sánh', 'verify', 'sheet', 'supabase', 'lệch'] },
        { id: 'upload_download', label: 'Upload và Tải về', icon: Download, keywords: ['upload', 'download', 'excel', 'tải về', 'nhập', 'xuất'] },
        { id: 'permissions', label: 'Phân quyền (RBAC)', icon: Shield, keywords: ['phân quyền', 'rbac', 'nhân viên', 'user', 'role', 'nhóm quyền', 'matrix'] },
        { id: 'auto_assign', label: 'Chia đơn tự động', icon: Users, keywords: ['chia đơn', 'tự động', 'phân bổ', 'cskh', 'auto assign', 'hạch toán'] },
        { id: 'account_management', label: 'Quản lý tài khoản mật khẩu', icon: Key, keywords: ['tài khoản', 'mật khẩu', 'password', 'account', 'đăng nhập', 'login', 'auth', 'authentication'] },
    ];

    const visibleTabs = TABS.filter(tab => isSectionVisible(tab.label, tab.keywords));

    // Auto-switch tab if active one is hidden
    useEffect(() => {
        if (searchQuery && visibleTabs.length > 0) {
            const isCurrentVisible = visibleTabs.find(t => t.id === activeTab);
            if (!isCurrentVisible) {
                setActiveTab(visibleTabs[0].id);
            }
        }
    }, [searchQuery, visibleTabs, activeTab]);

    // --- VERIFICATION STATE ---
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifying, setVerifying] = useState(false);

    const [downloadMode, setDownloadMode] = useState(false);
    const [uploadMode, setUploadMode] = useState(false);
    // Initialize date filters: Default to current month or reasonable range
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    useEffect(() => {
        // Load settings on mount
        fetchSettingsFromSupabase();
    }, []);

    // Reload reference data khi dbProducts thay đổi (để loại bỏ các SP đã có khỏi gợi ý)
    useEffect(() => {
        if (dbProducts.length >= 0) {
            fetchReferenceData();
        }
    }, [dbProducts]);

    const AVAILABLE_TABLES = [
        // SALES
        // { id: 'sale_orders', name: 'Danh sách đơn (Sale)', desc: 'Danh sách đơn hàng của bộ phận Sale' },
        { id: 'sale_reports', name: 'Xem báo cáo (Sale)', desc: 'Dữ liệu báo cáo doanh số Sale' },

        // LOGISTICS (Vận đơn)
        { id: 'delivery_orders', name: 'Quản lý vận đơn', desc: 'Danh sách vận đơn (Delivery)' },
        // { id: 'delivery_reports', name: 'Báo cáo vận đơn', desc: 'Dữ liệu báo cáo vận đơn' },

        // MARKETING
        // { id: 'mkt_orders', name: 'Danh sách đơn (MKT)', desc: 'Danh sách đơn hàng Marketing' },
        { id: 'mkt_reports', name: 'Xem báo cáo (MKT)', desc: 'Báo cáo chi tiết Marketing (detail_reports)' },

        // CSKH (Customer Service)
        // { id: 'cskh_all', name: 'Danh sách đơn (CSKH)', desc: 'Toàn bộ đơn hàng (Dùng cho CSKH)' },
        // { id: 'cskh_money', name: 'Đơn đã thu tiền/cần CS (CSKH)', desc: 'Đơn hàng có trạng thái thu tiền/cần xử lý' },
        { id: 'cskh_report', name: 'Xem báo cáo CSKH', desc: 'Dữ liệu nguồn cho báo cáo CSKH' },

        // SYSTEM
        { id: 'users', name: 'Quản lý nhân sự (Users)', desc: 'Danh sách tài khoản và nhân sự hệ thống' },
    ];

    const handleDownloadTable = async (tableId) => {
        const tableName = getRealTableName(tableId);

        let confirmMsg = `Bạn có muốn tải dữ liệu [${tableId}] về không?`;
        if (dateFrom || dateTo) {
            confirmMsg += `\n(Bộ lọc: ${dateFrom || '...'} đến ${dateTo || '...'})`;
        }
        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info(`Đang tải dữ liệu [${tableId}]...`);

            // Custom logic for filtered downloads can go here
            let query = supabase.from(tableName).select('*');

            // --- DATE FILTER LOGIC ---
            if (dateFrom || dateTo) {
                // Determine date column based on table
                let dateCol = 'created_at';
                if (tableName === 'orders') {
                    // EXCLUDE R&D DATA for Admin Tools/General Reporting
                    query = query.neq('team', 'RD');

                    if (dateFrom) query = query.gte('order_date', dateFrom);
                    if (dateTo) query = query.lte('order_date', dateTo);
                } else if (tableName === 'sales_reports') {
                    if (dateFrom) query = query.gte('date', dateFrom);
                    if (dateTo) query = query.lte('date', dateTo);
                } else if (tableName === 'detail_reports') {
                    if (dateFrom) query = query.gte('Ngày', dateFrom);
                    if (dateTo) query = query.lte('Ngày', dateTo);
                } else {
                    if (dateFrom) query = query.gte('created_at', dateFrom);
                    if (dateTo) query = query.lte('created_at', dateTo);
                }
            } else {
                // Default limit if no filter
                query = query.limit(10000);
            }

            const { data, error } = await query;
            if (error) throw error;

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const tableInfo = AVAILABLE_TABLES.find(t => t.id === tableId);
            const fileName = tableInfo ? tableInfo.name.replace(/\//g, '-') : tableId;
            link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            toast.success(`Đã tải xong [${tableName}]!`);
        } catch (err) {
            console.error(err);
            toast.error(`Lỗi tải bảng ${tableName}: ${err.message}`);
        }
    };

    const handleDownloadAll = async () => {
        let confirmMsg = "Bạn có muốn tải toàn bộ dữ liệu (Backup) không?";
        if (dateFrom || dateTo) {
            confirmMsg += `\n(Bộ lọc ngày: ${dateFrom || '...'} đến ${dateTo || '...'})`;
        }
        confirmMsg += "\n\nHệ thống sẽ tạo 1 file ZIP chứa các file riêng biệt với tên Tiếng Việt tương ứng (Ví dụ: Danh sách đơn (Sale).json...).";

        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info("Đang tổng hợp và nén dữ liệu...");

            const zip = new JSZip();

            // Loop through ALL defined cards in AVAILABLE_TABLES to simulate distinct downloads
            for (const card of AVAILABLE_TABLES) {
                const tableId = card.id;
                const tableName = getRealTableName(tableId);

                let query = supabase.from(tableName).select('*');

                // Reuse query logic from handleDownloadTable
                if (tableName === 'orders') {
                    query = query.neq('team', 'RD');
                    if (dateFrom) query = query.gte('order_date', dateFrom);
                    if (dateTo) query = query.lte('order_date', dateTo);
                } else {
                    let dateCol = 'created_at';
                    if (tableName === 'sales_reports') dateCol = 'date';
                    if (tableName === 'detail_reports') dateCol = 'Ngày';

                    if (dateFrom) query = query.gte(dateCol, dateFrom);
                    if (dateTo) query = query.lte(dateCol, dateTo);
                }

                const { data, error } = await query;
                if (error) {
                    console.error(`Error fetching ${tableId}`, error);
                    continue; // Skip failed table but continue others
                }

                // Save file using Vietnamese Name (sanitized)
                const safeName = card.name.replace(/\//g, '-');
                zip.file(`${safeName}.json`, JSON.stringify(data, null, 2));
            }

            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = `SYSTEM_BACKUP_${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success("✅ Đã tải backup toàn bộ (ZIP) thành công!");
        } catch (err) {
            console.error("Download All Error:", err);
            toast.error(`❌ Lỗi backup: ${err.message}`);
        }
    };

    // --- UPLOAD LOGIC ---
    const [selectedUploadTableId, setSelectedUploadTableId] = useState(null);

    const getRealTableName = (tableId) => {
        if (['cskh_all', 'cskh_money', 'cskh_report', 'sale_orders', 'delivery_orders', 'delivery_reports', 'mkt_orders'].includes(tableId)) {
            return 'orders';
        } else if (tableId === 'sale_reports') {
            return 'sales_reports';
        } else if (tableId === 'mkt_reports') {
            return 'detail_reports';
        }
        return tableId;
    };

    const handleUploadCardClick = (tableId) => {
        setSelectedUploadTableId(tableId);
        // Trigger hidden input
        document.getElementById('json-upload-input').click();
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const tableId = selectedUploadTableId;
        const tableName = getRealTableName(tableId);

        if (!window.confirm(`Bạn có chắc muốn UPLOAD dữ liệu vào bảng [${tableName}] (ID: ${tableId})?\nHành động này sẽ ghi đè/thêm mới dữ liệu.`)) {
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (!Array.isArray(json)) {
                    toast.error("File JSON phải là một danh sách (Array) các đối tượng.");
                    return;
                }

                toast.info(`Đang upload ${json.length} dòng vào [${tableName}]...`);

                // Chunking upsert to avoid payload limits
                const CHUNK_SIZE = 100;
                let successCount = 0;
                let errorCount = 0;

                for (let i = 0; i < json.length; i += CHUNK_SIZE) {
                    const chunk = json.slice(i, i + CHUNK_SIZE);
                    // Sanitizing data: Remove implicit fields if necessary, or let Supabase handle it.
                    // Ideally we should strip 'id' if we want auto-increment, but usually we keep it for sync.


                    // Determine Conflict Key
                    let conflictKey = 'id';
                    if (tableName === 'orders' && chunk[0]?.order_code) {
                        conflictKey = 'order_code';
                    }

                    let error = null;
                    try {
                        const res = await supabase.from(tableName).upsert(chunk, { onConflict: conflictKey, ignoreDuplicates: false });
                        error = res.error;
                        if (error && conflictKey !== 'id') {
                            // Fallback to ID if custom key fails (e.g. no constraint)
                            console.warn(`Upsert with ${conflictKey} failed, retrying with id...`);
                            const res2 = await supabase.from(tableName).upsert(chunk, { onConflict: 'id', ignoreDuplicates: false });
                            error = res2.error;
                        }
                    } catch (e) { error = e; }

                    if (error) {
                        console.error(`Chunk ${i} error:`, error);
                        errorCount += chunk.length;
                    } else {
                        successCount += chunk.length;
                    }
                }

                if (errorCount > 0) {
                    toast.warn(`Upload hoàn tất: ${successCount} thành công, ${errorCount} thất bại.`);
                } else {
                    toast.success(`Upload thành công toàn bộ ${successCount} dòng!`);
                }

            } catch (err) {
                console.error("Parse error:", err);
                toast.error("Lỗi đọc file JSON: " + err.message);
            } finally {
                // Reset input
                event.target.value = null;
                setSelectedUploadTableId(null);
            }
        };
        reader.readAsText(file);
    };

    // Load danh sách sản phẩm từ database (bảng mới với 2 cột)
    const fetchProductsFromDatabase = async () => {
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('id, name, type, updated_at, updated_by')
                .order('name', { ascending: true });

            if (error) {
                // Nếu bảng chưa có hoặc lỗi, bỏ qua
                console.log("Error loading products from database:", error);
                setDbProducts([]);
                return;
            }

            if (data && data.length > 0) {
                setDbProducts(data);
                console.log(`✅ Loaded ${data.length} products from database`);
            } else {
                setDbProducts([]);
            }
        } catch (err) {
            console.error("Error fetching products from database:", err);
            setDbProducts([]);
        }
    };

    const fetchSettingsFromSupabase = async () => {
        setLoadingSettings(true);
        try {
            // Load products từ bảng mới (2 cột: name, type)
            await fetchProductsFromDatabase();

            // Schema mới không còn dùng id='global_config' với settings JSONB
            // Thay vào đó, sản phẩm được lưu trực tiếp với name và type
            // Nên không cần query theo id nữa

            // Fallback to local settings
            setSettings(getSystemSettings());
        } catch (err) {
            console.error("Error loading settings:", err);
            // Fallback to local
            setSettings(getSystemSettings());
        } finally {
            setLoadingSettings(false);
        }
    };

    const fetchReferenceData = async () => {
        setLoadingData(true);
        try {
            // Fetch unique Products and Markets from orders for suggestions
            const { data, error } = await supabase
                .from('orders')
                .select('product_name_1, product_main, country, city')
                .limit(1000); // Sample data

            if (error) throw error;

            if (data) {
                const products = new Set();
                const markets = new Set();
                data.forEach(r => {
                    if (r.product_main) products.add(r.product_main);
                    if (r.product_name_1) products.add(r.product_name_1);
                    if (r.country) markets.add(r.country);
                });

                // Merge with defaults to ensure basic list exists
                ["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"].forEach(p => products.add(p));
                ["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"].forEach(m => markets.add(m));

                // Loại bỏ các sản phẩm đã có trong database khỏi gợi ý
                const existingProductNames = new Set(dbProducts.map(p => p.name.toLowerCase().trim()));
                const filteredProducts = Array.from(products).filter(p => {
                    const normalizedName = p.toLowerCase().trim();
                    return !existingProductNames.has(normalizedName);
                });

                setProductSuggestions(filteredProducts.sort());
                setAvailableMarkets(Array.from(markets).sort());
            }
        } catch (err) {
            console.error("Error fetching ref data", err);
            // Fallback
            const existingProductNames = new Set(dbProducts.map(p => p.name.toLowerCase().trim()));
            const defaultProducts = ["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"];
            const filteredProducts = defaultProducts.filter(p => !existingProductNames.has(p.toLowerCase().trim()));
            setProductSuggestions(filteredProducts);
            setAvailableMarkets(["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"]);
        } finally {
            setLoadingData(false);
        }
    };

    // Lưu sản phẩm vào database (bảng mới với 2 cột)
    const saveProductToDatabase = async (productName, productType) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    name: productName.trim(),
                    type: productType,
                    updated_at: new Date().toISOString(),
                    updated_by: userEmail
                }, {
                    onConflict: 'name'
                });

            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error saving product to database:", err);
            throw err;
        }
    };

    // Xóa sản phẩm khỏi database
    const deleteProductFromDatabase = async (productName) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .delete()
                .eq('name', productName.trim());

            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error deleting product from database:", err);
            throw err;
        }
    };

    // Cập nhật loại sản phẩm trong database
    const updateProductTypeInDatabase = async (productName, newType) => {
        try {
            const { error } = await supabase
                .from('system_settings')
                .update({
                    type: newType,
                    updated_at: new Date().toISOString(),
                    updated_by: userEmail
                })
                .eq('name', productName.trim());

            if (error) throw error;
            return true;
        } catch (err) {
            console.error("Error updating product type in database:", err);
            throw err;
        }
    };

    const handleSaveSettings = async () => {
        setLoadingSettings(true);
        try {
            // Save to LocalStorage as backup/cache
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

            // Lưu tất cả sản phẩm từ dbProducts vào database
            if (dbProducts.length > 0) {
                const savePromises = dbProducts.map(product =>
                    saveProductToDatabase(product.name, product.type)
                );
                await Promise.all(savePromises);
            }

            toast.success("✅ Đã lưu danh sách sản phẩm lên Server thành công!");
            window.dispatchEvent(new Event('storage'));

            // Reload để cập nhật lại danh sách
            await fetchProductsFromDatabase();
        } catch (err) {
            console.error("Save error:", err);
            if (err.message && err.message.includes('relation "system_settings" does not exist')) {
                toast.error("❌ Bảng system_settings chưa được tạo trên Supabase.");
            } else {
                toast.error(`❌ Lỗi lưu cấu hình: ${err.message}`);
            }
            toast.warn("Đã lưu tạm vào máy cá nhân (Local).");
        } finally {
            setLoadingSettings(false);
        }
    };

    const toggleItem = (category, item) => {
        setSettings(prev => {
            const currentList = prev[category];
            if (currentList.includes(item)) {
                return { ...prev, [category]: currentList.filter(i => i !== item) };
            } else {
                return { ...prev, [category]: [...currentList, item] };
            }
        });
    };

    // --- SNAPSHOT ACTIONS ---
    const handleSnapshot = async () => {
        if (!window.confirm('Bạn có chắc chắn muốn chốt ca? \nViệc này sẽ cập nhật dữ liệu báo cáo từ dữ liệu hiện tại.')) {
            return;
        }

        setLoading(true);
        try {
            await performEndOfShiftSnapshot(userEmail);
            toast.success('Đã chốt ca thành công! Dữ liệu báo cáo đã được cập nhật.');
            setLastSnapshot(new Date());
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi chốt ca: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const checkSystem = async () => {
        setCheckLoading(true);
        setDbStatus(null);
        try {
            const results = {};

            // 1. Check Supabase (Connection & Tables)
            const tables = [
                // Core Data
                'orders', 'detail_reports', 'blacklist',
                // RBAC
                'app_roles', 'app_user_roles', 'app_permissions',
                // System & Logs
                'change_logs', 'system_settings', 'f3_data_snapshot'
            ];
            const startSupabase = performance.now();

            for (const table of tables) {
                const { error, count } = await supabase
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (error) {
                    // Ignore 404 for system_settings if it's new
                    if (table === 'system_settings' && error.code === '42P01') {
                        results[table] = { status: 'WARNING', message: 'Table not created yet', code: 'MISSING' };
                    } else if (error.code === '42P01') { // Undefined Table
                        results[table] = { status: 'ERROR', message: `MISSING TABLE: ${table}`, code: error.code };
                    } else {
                        results[table] = { status: 'ERROR', message: error.message, code: error.code };
                    }
                } else {
                    results[table] = { status: 'OK', count: count };
                }
            }
            const endSupabase = performance.now();
            results['Supabase Latency'] = { status: 'INFO', message: `${(endSupabase - startSupabase).toFixed(0)} ms`, type: 'latency' };

            // 2. Check Firebase (API Connection)
            const hrUrl = import.meta.env.VITE_HR_URL;
            if (hrUrl) {
                const startFirebase = performance.now();
                try {
                    const res = await fetch(hrUrl);
                    if (res.ok) {
                        const endFirebase = performance.now();
                        results['Firebase API (HR)'] = { status: 'OK', message: 'Connected' };
                        results['Firebase Latency'] = { status: 'INFO', message: `${(endFirebase - startFirebase).toFixed(0)} ms`, type: 'latency' };
                    } else {
                        results['Firebase API (HR)'] = { status: 'ERROR', message: `Status: ${res.status}` };
                    }
                } catch (e) {
                    results['Firebase API (HR)'] = { status: 'ERROR', message: e.message };
                }
            }

            // 3. Network Check (Ping Google)
            const startNet = performance.now();
            try {
                // Using a no-cors request just to check network reachability
                await fetch('https://www.google.com/favicon.ico', { mode: 'no-cors', cache: 'no-cache' });
                const endNet = performance.now();
                results['Server Network'] = { status: 'OK', message: 'Online' };
                results['Internet Latency'] = { status: 'INFO', message: `${(endNet - startNet).toFixed(0)} ms`, type: 'latency' };
            } catch (e) {
                results['Server Network'] = { status: 'ERROR', message: 'Offline / Blocked' };
            }

            setDbStatus(results);
            toast.success("Đã hoàn tất quét toàn bộ hệ thống API & Mạng");
        } catch (err) {
            console.error(err);
            toast.error("Lỗi khi kiểm tra: " + err.message);
        } finally {
            setCheckLoading(false);
        }
    };

    // --- VERIFICATION ACTIONS ---
    const compareTables = async () => {
        setVerifying(true);
        setVerifyResult(null);
        try {
            console.log("Starting comparison...");
            const { data: supabaseOrders, error: errOrders } = await supabase.from('orders').select('order_code, created_at');
            if (errOrders) throw errOrders;

            const sheetData = await ApiService.fetchGoogleSheetData();

            const supabaseCodes = new Set(supabaseOrders.map(o => o.order_code));
            const sheetCodes = new Set(sheetData.map(r => r["Mã đơn hàng"]));

            const missingInSupabase = sheetData.filter(r => !supabaseCodes.has(r["Mã đơn hàng"]));
            const missingInSheet = supabaseOrders.filter(o => !sheetCodes.has(o.order_code));

            setVerifyResult({
                orders: supabaseOrders.length,
                reports: sheetData.length,
                diff: supabaseOrders.length - sheetData.length,
                details: {
                    missingInSupabase: missingInSupabase.length,
                    missingInSheet: missingInSheet.length,
                    sampleMissing: missingInSupabase.slice(0, 5).map(r => r["Mã đơn hàng"]),
                    missingData: missingInSupabase // Store full data for sync
                }
            });
            toast.success("Đối soát hoàn tất!");
        } catch (e) {
            console.error(e);
            toast.error("Lỗi đối soát: " + e.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleSync = async () => {
        if (!verifyResult || !verifyResult.details.missingData || verifyResult.details.missingData.length === 0) {
            toast.info("Không có dữ liệu thiếu để đồng bộ.");
            return;
        }

        if (!window.confirm(`Bạn có chắc muốn đồng bộ ${verifyResult.details.missingInSupabase} đơn hàng từ Sheet vào Web không?`)) return;

        setVerifying(true);
        try {
            const dataToSync = verifyResult.details.missingData;
            const CHUNK_SIZE = 50;
            let processed = 0;

            for (let i = 0; i < dataToSync.length; i += CHUNK_SIZE) {
                const chunk = dataToSync.slice(i, i + CHUNK_SIZE);
                await ApiService.updateBatch(chunk, user?.email || 'admin_sync_tool');
                processed += chunk.length;
                console.log(`Synced ${processed}/${dataToSync.length}`);
            }

            toast.success(`Đồng bộ thành công ${processed} đơn hàng!`);
            await compareTables(); // Re-verify
        } catch (e) {
            console.error(e);
            toast.error("Lỗi đồng bộ: " + e.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleSwitchToProd = () => {
        if (!window.confirm("Bạn có chắc muốn chuyển hệ thống sang chế độ PRODUCTION (Dữ liệu thật)?")) return;
        setSettings(prev => ({ ...prev, dataSource: 'prod' }));
        // Also save immediately
        const newSettings = { ...settings, dataSource: 'prod' };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
        toast.success("Đã chuyển sang chế độ PRODUCTION!");
        // We should probably save to DB too? But this is System Settings managed in localStorage (and synced to DB via another effect maybe).
        // For now localstorage update. 'handleSaveSettings' does DB save.
        handleSaveSettings(newSettings);
    };

    // --- AUTO ASSIGN FUNCTIONS ---
    const loadCSKHStaff = async () => {
        try {
            // Lấy danh sách nhân sự CSKH từ bảng users
            // Filter theo department = 'CSKH'
            const { data, error } = await supabase
                .from('users')
                .select('name, email, department, position')
                .eq('department', 'CSKH')
                .order('name', { ascending: true });

            if (error) throw error;

            const staffNames = data?.map(u => u.name).filter(Boolean) || [];
            setCskhStaff(staffNames);
            return staffNames;
        } catch (error) {
            console.error('Error loading CSKH staff:', error);
            toast.error('Lỗi khi tải danh sách nhân sự CSKH');
            return [];
        }
    };

    const handlePhanBoDonHang = async () => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);

        try {
            const staffList = await loadCSKHStaff();
            if (staffList.length === 0) {
                throw new Error('Không tìm thấy nhân sự CSKH');
            }

            // Parse selectedMonth để filter đơn hàng
            const [year, month] = selectedMonth.split('-').map(Number);
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);

            // Lấy tất cả đơn hàng thỏa điều kiện (filter theo tháng được chọn)
            // Lưu ý: Bỏ điều kiện accountant_confirm để có thể chia đơn ngay cả khi chưa có xác nhận
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('team', selectedTeam)
                // .eq('accountant_confirm', 'Đã thu tiền') // Đã bỏ để có thể chia đơn ngay
                .gte('order_date', startDate.toISOString().split('T')[0])
                .lte('order_date', endDate.toISOString().split('T')[0]);

            if (ordersError) throw ordersError;

            // --- Bước bổ sung: Điền chi nhánh (team) cho đơn hàng trống ---
            const ordersWithoutTeam = orders?.filter(o => !o.team || o.team.toString().trim() === '') || [];

            if (ordersWithoutTeam.length > 0) {
                console.log(`🔍 [Chia đơn CSKH] Có ${ordersWithoutTeam.length} đơn chưa có chi nhánh (team), đang điền lại...`);

                // Lấy danh sách users để tra cứu branch theo tên
                const { data: allUsers, error: usersError } = await supabase
                    .from('users')
                    .select('name, branch');

                if (usersError) {
                    console.warn('⚠️ [Chia đơn CSKH] Lỗi query users để lấy branch:', usersError);
                } else {
                    const nameToBranch = {};
                    (allUsers || []).forEach(u => {
                        if (u.name && u.branch) {
                            nameToBranch[u.name.trim()] = u.branch.trim();
                        }
                    });

                    const branchUpdates = [];
                    ordersWithoutTeam.forEach(order => {
                        const saleName = order.sale_staff?.toString().trim();
                        if (saleName && nameToBranch[saleName]) {
                            branchUpdates.push({
                                order_code: order.order_code,
                                team: nameToBranch[saleName]
                            });
                            // Cập nhật luôn trong array orders để logic phía sau dùng đúng
                            order.team = nameToBranch[saleName];
                        }
                    });

                    if (branchUpdates.length > 0) {
                        console.log(`📝 [Chia đơn CSKH] Đang cập nhật chi nhánh cho ${branchUpdates.length} đơn...`);
                        const CHUNK_SIZE = 50;
                        for (let i = 0; i < branchUpdates.length; i += CHUNK_SIZE) {
                            const chunk = branchUpdates.slice(i, i + CHUNK_SIZE);
                            const updatePromises = chunk.map(u =>
                                supabase
                                    .from('orders')
                                    .update({ team: u.team })
                                    .eq('order_code', u.order_code)
                            );
                            await Promise.all(updatePromises);
                        }
                        console.log(`✅ [Chia đơn CSKH] Đã điền chi nhánh cho ${branchUpdates.length} đơn`);
                        toast.info(`Đã điền chi nhánh cho ${branchUpdates.length} đơn trước khi chia`);
                    } else {
                        console.log(`⚠️ [Chia đơn CSKH] Không tìm được branch cho ${ordersWithoutTeam.length} đơn (sale_staff không có trong bảng users)`);
                    }
                }
            }

            // Filter: Chỉ chia các đơn có cột CSKH trống
            const eligibleOrders = orders?.filter(order => {
                const hasCSKH = order.cskh && order.cskh.toString().trim() !== '';
                return !hasCSKH; // Chỉ kiểm tra CSKH trống, không quan tâm cutoff
            }) || [];

            // Helper function: Lấy tháng từ order_date (format: YYYY-MM)
            const getMonthKey = (orderDate) => {
                if (!orderDate) return null;
                const date = new Date(orderDate);
                if (isNaN(date.getTime())) return null;
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                return `${year}-${month}`;
            };

            // Đếm số đơn hiện tại của mỗi nhân viên THEO TỪNG THÁNG
            // counter[staffName][monthKey] = số đơn
            const counter = {};
            staffList.forEach(name => {
                counter[name] = {};
            });

            // Đếm đơn đã có CSKH (không phải Sale tự chăm) - theo tháng
            orders?.forEach(order => {
                const cskh = order.cskh?.toString().trim();
                const sale = order.sale_staff?.toString().trim();
                const monthKey = getMonthKey(order.order_date);

                if (cskh && staffList.includes(cskh) && cskh !== sale && monthKey) {
                    counter[cskh][monthKey] = (counter[cskh][monthKey] || 0) + 1;
                }
            });

            // Xử lý đơn Sale tự chăm
            const waitingRows = [];
            const updates = [];

            eligibleOrders.forEach(order => {
                const sale = order.sale_staff?.toString().trim();

                // Nếu Sale là CSKH -> tự chăm
                if (sale && staffList.includes(sale)) {
                    updates.push({
                        order_code: order.order_code,
                        cskh: sale
                    });
                } else {
                    waitingRows.push(order);
                }
            });

            // Chia đều các đơn còn lại - THEO THÁNG của Ngày lên đơn
            waitingRows.forEach(order => {
                const monthKey = getMonthKey(order.order_date);
                if (!monthKey) {
                    console.warn(`Đơn ${order.order_code} không có order_date hợp lệ`);
                    return;
                }

                let selectedName = null;
                let minVal = Infinity;

                staffList.forEach(name => {
                    // Đếm số đơn của nhân viên này trong tháng này
                    const val = counter[name][monthKey] || 0;
                    if (val < minVal) {
                        minVal = val;
                        selectedName = name;
                    }
                });

                if (selectedName) {
                    updates.push({
                        order_code: order.order_code,
                        cskh: selectedName
                    });
                    // Tăng counter cho tháng này
                    counter[selectedName][monthKey] = (counter[selectedName][monthKey] || 0) + 1;
                }
            });

            // Cập nhật database
            if (updates.length > 0) {
                const CHUNK_SIZE = 50;
                for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                    const chunk = updates.slice(i, i + CHUNK_SIZE);
                    const updatePromises = chunk.map(update =>
                        supabase
                            .from('orders')
                            .update({ cskh: update.cskh })
                            .eq('order_code', update.order_code)
                    );
                    await Promise.all(updatePromises);
                }
            }

            const message = `✅ Phân bổ đơn hàng thành công!\n\n` +
                `- Tổng đơn đã xử lý: ${updates.length}\n` +
                `- Đơn Sale tự chăm: ${updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
                `- Đơn được chia mới: ${updates.length - updates.filter(u => orders?.find(o => o.order_code === u.order_code)?.sale_staff === u.cskh).length}\n` +
                `- Nhân sự CSKH: ${staffList.length} người`;

            setAutoAssignResult({ success: true, message });
            toast.success(`Đã phân bổ ${updates.length} đơn hàng!`);
        } catch (error) {
            console.error('Error in handlePhanBoDonHang:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi phân bổ đơn hàng: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    const handleHachToanBaoCao = async () => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);

        try {
            const staffList = await loadCSKHStaff();
            if (staffList.length === 0) {
                throw new Error('Không tìm thấy nhân sự CSKH');
            }

            // Lấy tất cả đơn hàng thỏa điều kiện (không filter theo tháng)
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('team', selectedTeam)
                .eq('accountant_confirm', 'Đã thu tiền');

            if (ordersError) throw ordersError;

            const stats = {};
            staffList.forEach(name => {
                stats[name] = { sale: 0, done: 0, waiting: 0, assigned: 0 };
            });

            orders?.forEach(order => {
                const sale = order.sale_staff?.toString().trim();
                const cskh = order.cskh?.toString().trim();
                const hasCutoff = order.cutoff_time && order.cutoff_time.toString().trim() !== '';

                if (sale && stats[sale]) {
                    stats[sale].sale++;
                }

                if (cskh && stats[cskh]) {
                    if (hasCutoff) {
                        stats[cskh].done++;
                    } else {
                        stats[cskh].waiting++;
                    }
                    if (cskh !== sale) {
                        stats[cskh].assigned++;
                    }
                }
            });

            // Tạo báo cáo
            let report = '📊 Hạch toán báo cáo:\n\n';
            report += 'Tên nhân sự | Số đơn cá nhân | Đơn đã xử lý | Số đơn mới được chia | Đơn chia sau\n';
            report += '-'.repeat(80) + '\n';

            staffList.forEach(name => {
                const s = stats[name];
                report += `${name.padEnd(20)} | ${String(s.sale).padStart(15)} | ${String(s.done).padStart(15)} | ${String(s.waiting).padStart(25)} | ${String(s.assigned).padStart(15)}\n`;
            });

            setAutoAssignResult({ success: true, message: report });
            toast.success('Hạch toán báo cáo thành công!');
        } catch (error) {
            console.error('Error in handleHachToanBaoCao:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi hạch toán báo cáo: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    const handleRunAll = async () => {
        if (!window.confirm('Bạn có chắc muốn chạy toàn bộ quy trình (Phân bổ + Hạch toán)?')) return;

        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);

        try {
            // 1. Phân bổ đơn hàng
            await handlePhanBoDonHang();

            // Đợi một chút
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 2. Hạch toán báo cáo
            await handleHachToanBaoCao();

            toast.success('Đã hoàn tất toàn bộ quy trình!');
        } catch (error) {
            console.error('Error in handleRunAll:', error);
            toast.error('Lỗi: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    // --- TÌM KIẾM ĐƠN HÀNG ---
    const handleSearchOrder = async () => {
        if (!orderSearchCode.trim()) {
            setOrderSearchResult({ error: 'Vui lòng nhập mã đơn hàng' });
            return;
        }

        setOrderSearchLoading(true);
        setOrderSearchResult(null);

        try {
            const orderCode = orderSearchCode.trim();
            console.log('🔍 [Tìm kiếm đơn hàng] Mã đơn:', orderCode);

            const { data, error } = await supabase
                .from('orders')
                .select('order_code, order_date, team, country, delivery_staff, sale_staff, marketing_staff')
                .eq('order_code', orderCode)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // Không tìm thấy đơn hàng
                    setOrderSearchResult({
                        error: 'Không tìm thấy đơn hàng',
                        details: `Không có đơn hàng nào với mã "${orderCode}" trong hệ thống. Vui lòng kiểm tra lại mã đơn hàng.`
                    });
                } else {
                    setOrderSearchResult({
                        error: 'Lỗi khi tìm kiếm đơn hàng',
                        details: error.message || 'Có lỗi xảy ra khi truy vấn database. Vui lòng thử lại sau.'
                    });
                }
                console.error('❌ [Tìm kiếm đơn hàng] Lỗi:', error);
                return;
            }

            if (!data) {
                setOrderSearchResult({
                    error: 'Không tìm thấy đơn hàng',
                    details: `Không có dữ liệu cho mã đơn hàng "${orderCode}".`
                });
                return;
            }

            // Chuẩn hóa dữ liệu
            const normalizedData = {
                order_code: data.order_code || 'N/A',
                order_date: data.order_date ? new Date(data.order_date).toLocaleDateString('vi-VN') : 'N/A',
                team: data.team || 'N/A',
                country: data.country || 'N/A',
                delivery_staff: data.delivery_staff || null,
                sale_staff: data.sale_staff || 'N/A',
                marketing_staff: data.marketing_staff || 'N/A'
            };

            console.log('✅ [Tìm kiếm đơn hàng] Tìm thấy:', normalizedData);
            setOrderSearchResult(normalizedData);

        } catch (error) {
            console.error('❌ [Tìm kiếm đơn hàng] Exception:', error);
            setOrderSearchResult({
                error: 'Lỗi không xác định',
                details: error.message || 'Có lỗi xảy ra khi tìm kiếm đơn hàng. Vui lòng thử lại sau.'
            });
        } finally {
            setOrderSearchLoading(false);
        }
    };

    // --- CHIA ĐƠN VẬN ĐƠN ---
    const handleChiaDonVanDon = async () => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);
        setOrderSearchResult(null);

        try {
            // Bước 1: Lấy danh sách nhân sự từ users có department = "Vận Đơn"
            const { data: usersList, error: usersError } = await supabase
                .from('users')
                .select('name, branch')
                .eq('department', 'Vận Đơn');

            if (usersError) throw usersError;

            if (!usersList || usersList.length === 0) {
                throw new Error('Không có nhân sự nào có department = "Vận đơn"');
            }

            // Bước 2: Lấy danh sách nhân viên có trạng thái = "U1" từ danh_sach_van_don
            const { data: vanDonList, error: vanDonError } = await supabase
                .from('danh_sach_van_don')
                .select('ho_va_ten, chi_nhanh, trang_thai_chia');

            if (vanDonError) {
                // Nếu bảng không tồn tại hoặc lỗi, log và tiếp tục với usersList
                console.warn('⚠️ [Chia đơn vận đơn] Lỗi query danh_sach_van_don:', vanDonError);
                console.warn('⚠️ [Chia đơn vận đơn] Sẽ sử dụng dữ liệu từ bảng users thay thế');
                // Không throw error, tiếp tục với logic fallback
            }

            // Tạo map để tra cứu trạng thái và chi nhánh từ danh_sach_van_don
            const vanDonMap = {};
            (vanDonList || []).forEach(item => {
                if (item.ho_va_ten) {
                    vanDonMap[item.ho_va_ten] = {
                        trang_thai_chia: item.trang_thai_chia,
                        chi_nhanh: item.chi_nhanh
                    };
                }
            });

            // Lọc nhân viên có trạng thái "U1" (nếu có danh_sach_van_don)
            // Nếu không có danh_sach_van_don, sử dụng tất cả users từ department "Vận Đơn"
            let nhanVienU1Names = [];
            if (vanDonList && vanDonList.length > 0) {
                // Lọc users có trạng thái U1 trong danh_sach_van_don
                const filteredUsers = usersList.filter(user => {
                    const name = user.name;
                    const vanDonInfo = vanDonMap[name];
                    return vanDonInfo && vanDonInfo.trang_thai_chia === 'U1';
                });
                nhanVienU1Names = filteredUsers.map(user => user.name);
            } else {
                // Fallback: Sử dụng tất cả users từ department "Vận Đơn" nếu không có danh_sach_van_don
                console.warn('⚠️ [Chia đơn vận đơn] Không có dữ liệu danh_sach_van_don, sử dụng tất cả users từ department "Vận Đơn"');
                nhanVienU1Names = usersList.map(user => user.name);
            }

            if (nhanVienU1Names.length === 0) {
                throw new Error('Không có nhân viên nào có trạng thái U1 hoặc không có nhân sự Vận Đơn');
            }

            // Bước 3: Phân loại nhân viên theo chi nhánh
            // Ưu tiên lấy từ danh_sach_van_don, fallback về branch từ users
            const nhanVienHCM = [];
            const nhanVienHaNoi = [];

            nhanVienU1Names.forEach(name => {
                const user = usersList.find(u => u.name === name);
                const vanDonInfo = vanDonMap[name];
                // Ưu tiên chi_nhanh từ danh_sach_van_don, fallback về branch từ users
                const chiNhanh = vanDonInfo?.chi_nhanh || user?.branch || '';

                if (chiNhanh === 'HCM' || chiNhanh?.toLowerCase() === 'hcm') {
                    nhanVienHCM.push(name);
                } else if (chiNhanh === 'Hà Nội' || chiNhanh?.toLowerCase() === 'hà nội' || chiNhanh?.toLowerCase() === 'ha noi' || chiNhanh?.toLowerCase() === 'hanoi') {
                    nhanVienHaNoi.push(name);
                }
            });

            if (nhanVienHCM.length === 0 && nhanVienHaNoi.length === 0) {
                throw new Error('Không có nhân viên nào thuộc HCM hoặc Hà Nội. Vui lòng kiểm tra dữ liệu trong bảng danh_sach_van_don hoặc branch trong bảng users');
            }

            // Bước 3: Lấy TẤT CẢ đơn hàng từ DB (cần dùng cho cả lọc đơn mới và đếm đơn hiện tại)
            const { data: allOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*');

            if (ordersError) {
                console.error('❌ [Chia đơn vận đơn] Lỗi query orders:', ordersError);
                throw ordersError;
            }

            const allOrdersArray = Array.isArray(allOrders) ? allOrders : [];

            // Bước 3a: Lọc đơn hàng cần chia (delivery_staff trống/null/empty)
            let ordersArray = allOrdersArray.filter(order => {
                const deliveryStaff = order.delivery_staff;
                return !deliveryStaff || deliveryStaff === '' || deliveryStaff === null || deliveryStaff === undefined;
            });

            console.log(`📦 [Chia đơn vận đơn] Đã lấy ${ordersArray.length} đơn có delivery_staff trống/null/empty từ database`);

            if (ordersArray.length === 0) {
                console.warn('⚠️ [Chia đơn vận đơn] Không tìm thấy đơn nào có delivery_staff trống/null/empty');
            }

            // Lọc tiếp: loại trừ "Nhật Bản" và "CĐ Nhật Bản", phân loại theo Team
            const ordersHCM = [];
            const ordersHaNoi = [];
            const ordersWithoutTeam = [];
            const ordersExcluded = [];

            ordersArray.forEach(order => {
                const countryRaw = order.country?.toString() || '';
                const country = countryRaw.trim().toLowerCase();
                const teamRaw = order.team?.toString() || '';
                const team = teamRaw.trim().toLowerCase();

                const japanKeywords = ['nhật bản', 'nhat ban', 'japan', 'jp'];
                const isJapan = japanKeywords.some(keyword => country.includes(keyword));
                if (isJapan) {
                    ordersExcluded.push({ ...order, reason: `Nhật Bản/CĐ Nhật Bản (country="${countryRaw}")` });
                    return;
                }

                const hcmVariants = ['hcm', 'hồ chí minh', 'ho chi minh', 'tp.hcm', 'tp hcm'];
                const hanoiVariants = ['hà nội', 'ha noi', 'hanoi', 'hn'];

                if (hcmVariants.includes(team)) {
                    ordersHCM.push(order);
                } else if (hanoiVariants.includes(team)) {
                    ordersHaNoi.push(order);
                } else {
                    ordersWithoutTeam.push({
                        ...order,
                        reason: `team="${teamRaw}" (normalized: "${team}", không phải HCM/Hà Nội)`
                    });
                }
            });

            // Log thống kê
            console.log(`📊 [Chia đơn vận đơn] Thống kê:`);
            console.log(`  - Tổng đơn từ query: ${ordersArray.length}`);
            console.log(`  - Đơn HCM: ${ordersHCM.length}`);
            console.log(`  - Đơn Hà Nội: ${ordersHaNoi.length}`);
            console.log(`  - Đơn không có team/team khác: ${ordersWithoutTeam.length}`);
            console.log(`  - Đơn bị loại trừ: ${ordersExcluded.length}`);

            const excludedByDeliveryStaff = ordersExcluded.filter(o => o.reason === 'delivery_staff đã có').length;
            const excludedByJapan = ordersExcluded.filter(o => o.reason?.includes('Nhật Bản')).length;
            console.log(`  - Đơn bị loại trừ do delivery_staff đã có: ${excludedByDeliveryStaff}`);
            console.log(`  - Đơn bị loại trừ do Nhật Bản: ${excludedByJapan}`);

            const ordersWithEmptyDeliveryStaff = ordersArray.length;
            console.log(`  - Tổng đơn có delivery_staff trống/null: ${ordersWithEmptyDeliveryStaff}`);
            console.log(`  - Đơn được chia (HCM + Hà Nội): ${ordersHCM.length + ordersHaNoi.length}`);
            const ordersNotDivided = ordersWithEmptyDeliveryStaff - (ordersHCM.length + ordersHaNoi.length);
            console.log(`  - Đơn không được chia (có delivery_staff trống nhưng bị loại): ${ordersNotDivided}`);

            // Danh sách đơn không được chia
            const allNotDividedOrders = [...ordersWithoutTeam, ...ordersExcluded.filter(o => o.reason?.includes('Nhật Bản'))];
            setNotDividedOrders(allNotDividedOrders);

            if (allNotDividedOrders.length > 0) {
                console.warn(`\n❌ [DANH SÁCH ĐƠN KHÔNG ĐƯỢC CHIA] Tổng: ${allNotDividedOrders.length} đơn`);
                console.table(allNotDividedOrders.map(o => ({
                    'Mã đơn': o.order_code || '(không có)',
                    'Team': o.team || '(null/empty)',
                    'Country': o.country || '(null/empty)',
                    'Delivery Staff': o.delivery_staff || '(null/empty)',
                    'Lý do': o.reason || 'Không xác định'
                })));
            }

            if (ordersWithoutTeam.length > 0) {
                console.warn(`\n⚠️ [Chia đơn vận đơn] Có ${ordersWithoutTeam.length} đơn không có team hoặc team khác, không được chia`);
            }

            const japanOrders = ordersExcluded.filter(o => o.reason?.includes('Nhật Bản'));
            if (japanOrders.length > 0) {
                const countryGroups = {};
                japanOrders.forEach(o => {
                    const cv = o.country || '(null/empty)';
                    if (!countryGroups[cv]) countryGroups[cv] = [];
                    countryGroups[cv].push(o);
                });
                console.log(`📋 Các biến thể country bị loại (Nhật Bản):`, Object.keys(countryGroups));
            }

            // ============================================================
            // Bước 4: CHIA ĐƠN THEO 4 RULES MỚI
            // Rule 1: Xác định người được chia cuối cùng (từ DB)
            // Rule 2: List nhân viên U1 đang đi làm (đã có ở trên)
            // Rule 3: Ưu tiên người có ít đơn hơn để cân bằng
            // Rule 4: Round-robin tiếp từ người sau người cuối cùng
            // ============================================================

            // Helper: Hàm chia đơn thông minh cho 1 chi nhánh
            const smartDistribute = (staffList, pendingOrders, allDBOrders, branchName) => {
                if (staffList.length === 0 || pendingOrders.length === 0) return [];

                const result = [];

                // --- RULE 1: Xác định người được chia cuối cùng từ DB ---
                // Tìm đơn gần nhất (theo order_date hoặc id) có delivery_staff thuộc staffList
                const staffSet = new Set(staffList);
                const assignedOrders = allDBOrders
                    .filter(o => o.delivery_staff && staffSet.has(o.delivery_staff.trim()))
                    .sort((a, b) => {
                        // Ưu tiên sort theo id (auto-increment, lớn hơn = mới hơn)
                        if (a.id && b.id) return b.id - a.id;
                        // Fallback theo order_date
                        const dateA = a.order_date ? new Date(a.order_date) : new Date(0);
                        const dateB = b.order_date ? new Date(b.order_date) : new Date(0);
                        return dateB - dateA;
                    });

                const lastAssignedPerson = assignedOrders.length > 0
                    ? assignedOrders[0].delivery_staff.trim()
                    : null;

                const lastAssignedIndex = lastAssignedPerson
                    ? staffList.indexOf(lastAssignedPerson)
                    : -1;

                console.log(`🔍 [${branchName}] Rule 1 - Người được chia cuối cùng: "${lastAssignedPerson || '(không có)'}" (index: ${lastAssignedIndex})`);

                // --- RULE 2: List nhân viên U1 (đã có sẵn = staffList) ---
                console.log(`👥 [${branchName}] Rule 2 - Nhân viên U1: [${staffList.join(', ')}]`);

                // --- RULE 3: Đếm số đơn hiện tại của mỗi nhân viên & cân bằng ---
                const orderCountMap = {};
                staffList.forEach(name => { orderCountMap[name] = 0; });

                allDBOrders.forEach(order => {
                    const ds = order.delivery_staff?.trim();
                    if (ds && orderCountMap[ds] !== undefined) {
                        orderCountMap[ds]++;
                    }
                });

                console.log(`📊 [${branchName}] Rule 3 - Số đơn hiện tại mỗi nhân viên:`, { ...orderCountMap });

                // Tìm số đơn lớn nhất để xác định mức cần cân bằng
                const maxOrders = Math.max(...Object.values(orderCountMap));
                console.log(`📊 [${branchName}] Rule 3 - Số đơn cao nhất: ${maxOrders}`);

                // Chia ưu tiên: ai có ít đơn hơn maxOrders → chia trước để bù cho cân
                let remainingOrders = [...pendingOrders];
                const balanceUpdates = [];

                // Tính số đơn cần bù cho mỗi người (sắp xếp theo số đơn tăng dần)
                const staffSorted = [...staffList].sort((a, b) => orderCountMap[a] - orderCountMap[b]);

                for (const staffName of staffSorted) {
                    if (remainingOrders.length === 0) break;
                    const deficit = maxOrders - orderCountMap[staffName];
                    if (deficit <= 0) continue;

                    const toAssign = Math.min(deficit, remainingOrders.length);
                    for (let i = 0; i < toAssign; i++) {
                        const order = remainingOrders.shift();
                        balanceUpdates.push({
                            order_code: order.order_code,
                            delivery_staff: staffName
                        });
                        orderCountMap[staffName]++;
                    }
                    console.log(`⚖️ [${branchName}] Rule 3 - Bù ${toAssign} đơn cho "${staffName}" (thiếu ${deficit}, còn lại: ${remainingOrders.length})`);
                }

                result.push(...balanceUpdates);
                console.log(`⚖️ [${branchName}] Rule 3 - Tổng đơn đã chia để cân bằng: ${balanceUpdates.length}, còn lại: ${remainingOrders.length}`);

                // --- RULE 4: Round-robin phần còn lại từ người tiếp theo sau người cuối cùng ---
                if (remainingOrders.length > 0) {
                    // Bắt đầu từ người SAU người được chia cuối cùng (Rule 1)
                    let startIndex = lastAssignedIndex >= 0
                        ? (lastAssignedIndex + 1) % staffList.length
                        : 0;

                    console.log(`🔄 [${branchName}] Rule 4 - Round-robin ${remainingOrders.length} đơn còn lại, bắt đầu từ index ${startIndex} ("${staffList[startIndex]}")`);

                    remainingOrders.forEach((order, i) => {
                        const idx = (startIndex + i) % staffList.length;
                        result.push({
                            order_code: order.order_code,
                            delivery_staff: staffList[idx]
                        });
                    });
                }

                // Log tổng kết
                const finalCount = {};
                staffList.forEach(name => { finalCount[name] = 0; });
                result.forEach(u => { finalCount[u.delivery_staff]++; });
                console.log(`✅ [${branchName}] Kết quả chia ${result.length} đơn:`, finalCount);

                return result;
            };

            // Bước 5: Thực hiện chia đơn
            const updates = [];
            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            // Lọc allDBOrders theo team cho mỗi chi nhánh (dùng để đếm đơn hiện tại)
            const hcmVariantsCheck = ['hcm', 'hồ chí minh', 'ho chi minh', 'tp.hcm', 'tp hcm'];
            const hanoiVariantsCheck = ['hà nội', 'ha noi', 'hanoi', 'hn'];

            const allDBOrdersHCM = allOrdersArray.filter(o => {
                const t = o.team?.toString().trim().toLowerCase() || '';
                return hcmVariantsCheck.includes(t);
            });
            const allDBOrdersHaNoi = allOrdersArray.filter(o => {
                const t = o.team?.toString().trim().toLowerCase() || '';
                return hanoiVariantsCheck.includes(t);
            });

            // Chia đơn HCM
            if (nhanVienHCM.length > 0 && ordersHCM.length > 0) {
                const hcmUpdates = smartDistribute(nhanVienHCM, ordersHCM, allDBOrdersHCM, 'HCM');
                updates.push(...hcmUpdates);
            }

            // Chia đơn Hà Nội
            if (nhanVienHaNoi.length > 0 && ordersHaNoi.length > 0) {
                const hanoiUpdates = smartDistribute(nhanVienHaNoi, ordersHaNoi, allDBOrdersHaNoi, 'Hà Nội');
                updates.push(...hanoiUpdates);
            }

            // Bước 6: Cập nhật database
            if (updates.length > 0) {
                console.log(`🔄 [Chia đơn vận đơn] Bắt đầu cập nhật ${updates.length} đơn hàng...`);
                const CHUNK_SIZE = 50;
                successCount = 0;
                errorCount = 0;
                errors.length = 0; // Clear array

                for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                    const chunk = updates.slice(i, i + CHUNK_SIZE);
                    console.log(`📦 [Chia đơn vận đơn] Đang xử lý chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(updates.length / CHUNK_SIZE)} (${chunk.length} đơn)`);

                    const updatePromises = chunk.map(async (update) => {
                        try {
                            const { data, error } = await supabase
                                .from('orders')
                                .update({ delivery_staff: update.delivery_staff })
                                .eq('order_code', update.order_code)
                                .select();

                            if (error) {
                                console.error(`❌ [Chia đơn vận đơn] Lỗi update đơn ${update.order_code}:`, error);
                                errors.push({ order_code: update.order_code, error: error.message });
                                errorCount++;
                                return { success: false, error };
                            }

                            successCount++;
                            return { success: true, data };
                        } catch (err) {
                            console.error(`❌ [Chia đơn vận đơn] Exception khi update đơn ${update.order_code}:`, err);
                            errors.push({ order_code: update.order_code, error: err.message });
                            errorCount++;
                            return { success: false, error: err };
                        }
                    });

                    const results = await Promise.all(updatePromises);
                    console.log(`✅ [Chia đơn vận đơn] Chunk ${Math.floor(i / CHUNK_SIZE) + 1} hoàn tất: ${results.filter(r => r.success).length}/${chunk.length} thành công`);
                }

                console.log(`📊 [Chia đơn vận đơn] Kết quả cập nhật: ${successCount} thành công, ${errorCount} lỗi`);

                if (errors.length > 0) {
                    console.warn(`⚠️ [Chia đơn vận đơn] Danh sách lỗi:`, errors);
                }
            } else {
                console.warn('⚠️ [Chia đơn vận đơn] Không có đơn nào để cập nhật!');
            }

            const message = `✅ Chia đơn vận đơn ${updates.length > 0 ? 'đã hoàn tất' : 'không có đơn để chia'}!\n\n` +
                `- Nhân viên HCM (U1): ${nhanVienHCM.length} người\n` +
                `- Nhân viên Hà Nội (U1): ${nhanVienHaNoi.length} người\n` +
                `- Đơn HCM cần chia: ${ordersHCM.length} đơn\n` +
                `- Đơn Hà Nội cần chia: ${ordersHaNoi.length} đơn\n` +
                `- Tổng đơn cần chia: ${updates.length} đơn\n` +
                (updates.length > 0 ? `- Đơn đã cập nhật thành công: ${successCount || updates.length}\n` : '') +
                (errorCount > 0 ? `- Đơn bị lỗi khi cập nhật: ${errorCount}\n` : '') +
                `\n📊 Thống kê chi tiết:\n` +
                `- Tổng đơn có delivery_staff trống/null: ${ordersWithEmptyDeliveryStaff}\n` +
                `- Đơn bị loại trừ do Nhật Bản: ${ordersExcluded.filter(o => o.reason?.includes('Nhật Bản')).length}\n` +
                `- Đơn không có team/team khác: ${ordersWithoutTeam.length}\n` +
                (ordersNotDivided > 0 ? `\n⚠️ CẢNH BÁO: Có ${ordersNotDivided} đơn có delivery_staff trống nhưng không được chia!\n` +
                    `   (Có thể do: không có team, team khác HCM/Hà Nội, hoặc country = Nhật Bản)\n` : '') +
                (errorCount > 0 ? `\n⚠️ LỖI: Có ${errorCount} đơn không thể cập nhật. Vui lòng kiểm tra Console để xem chi tiết.\n` : '');

            setAutoAssignResult({ success: updates.length > 0 && errorCount === 0, message });

            if (updates.length === 0) {
                toast.warning('Không có đơn nào để chia vận đơn!');
            } else if (errorCount > 0) {
                toast.warning(`Đã chia ${successCount} đơn, nhưng có ${errorCount} đơn bị lỗi!`);
            } else {
                toast.success(`Đã chia ${updates.length} đơn vận đơn thành công!`);
            }
        } catch (error) {
            console.error('Error in handleChiaDonVanDon:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi chia đơn vận đơn: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    // Helper function để normalize string
    const normalizeStr = (str) => {
        if (!str) return '';
        return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    // Xóa toàn bộ dữ liệu trong cột CSKH
    const handleSyncTeam = async () => {
        if (!window.confirm('🔄 Đồng bộ team dựa trên tên nhân viên?\n\nHành động này sẽ:\n- Lấy team từ bảng users dựa trên tên\n- Cập nhật team tương ứng trong các bảng orders, detail_reports, reports\n- Đồng bộ team cho sale_staff, cskh, delivery_staff\n\nBạn có chắc chắn muốn tiếp tục?')) {
            return;
        }

        setSyncTeamLoading(true);
        try {
            console.log('🔄 [Đồng bộ Team] Bắt đầu...');

            // 1. Lấy tất cả users với name và team
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('id, name, team')
                .not('name', 'is', null)
                .neq('name', '');

            if (usersError) {
                throw usersError;
            }

            if (!users || users.length === 0) {
                toast.warning('Không tìm thấy users nào có tên!');
                return;
            }

            console.log(`📊 [Đồng bộ Team] Tìm thấy ${users.length} users`);

            // Tạo map name -> team
            const nameToTeamMap = {};
            users.forEach(user => {
                if (user.name && user.team) {
                    const name = user.name.trim();
                    nameToTeamMap[name] = user.team;
                }
            });

            console.log(`📋 [Đồng bộ Team] Map name->team:`, Object.keys(nameToTeamMap).length, 'entries');

            let totalUpdated = 0;
            const results = {
                orders: { sale_staff: 0, cskh: 0, delivery_staff: 0 },
                detail_reports: 0,
                reports: 0
            };

            // 2. Đồng bộ trong bảng orders
            console.log('🔄 [Đồng bộ Team] Đang xử lý bảng orders...');

            // Lấy tất cả orders
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('id, sale_staff, cskh, delivery_staff, team');

            if (ordersError) {
                console.error('❌ [Đồng bộ Team] Lỗi lấy orders:', ordersError);
            } else if (orders && orders.length > 0) {
                const updates = [];

                for (const order of orders) {
                    const updatesForOrder = {};
                    let hasUpdate = false;

                    // Kiểm tra sale_staff
                    if (order.sale_staff && nameToTeamMap[order.sale_staff.trim()]) {
                        const team = nameToTeamMap[order.sale_staff.trim()];
                        if (order.team !== team) {
                            updatesForOrder.team = team;
                            hasUpdate = true;
                            results.orders.sale_staff++;
                        }
                    }

                    // Kiểm tra cskh
                    if (order.cskh && nameToTeamMap[order.cskh.trim()]) {
                        const team = nameToTeamMap[order.cskh.trim()];
                        if (order.team !== team) {
                            updatesForOrder.team = team;
                            hasUpdate = true;
                            results.orders.cskh++;
                        }
                    }

                    // Kiểm tra delivery_staff
                    if (order.delivery_staff && nameToTeamMap[order.delivery_staff.trim()]) {
                        const team = nameToTeamMap[order.delivery_staff.trim()];
                        if (order.team !== team) {
                            updatesForOrder.team = team;
                            hasUpdate = true;
                            results.orders.delivery_staff++;
                        }
                    }

                    if (hasUpdate) {
                        updates.push({ id: order.id, ...updatesForOrder });
                    }
                }

                // Batch update orders
                if (updates.length > 0) {
                    for (const update of updates) {
                        const { error: updateError } = await supabase
                            .from('orders')
                            .update({ team: update.team })
                            .eq('id', update.id);

                        if (updateError) {
                            console.error(`❌ [Đồng bộ Team] Lỗi cập nhật order ${update.id}:`, updateError);
                        } else {
                            totalUpdated++;
                        }
                    }
                }
            }

            // 3. Đồng bộ trong bảng detail_reports (nếu có trường team và owner)
            console.log('🔄 [Đồng bộ Team] Đang xử lý bảng detail_reports...');
            try {
                const { data: detailReports, error: detailReportsError } = await supabase
                    .from('detail_reports')
                    .select('id, owner, team')
                    .limit(1000); // Giới hạn để tránh quá tải

                if (!detailReportsError && detailReports && detailReports.length > 0) {
                    const updates = [];
                    for (const report of detailReports) {
                        if (report.owner && nameToTeamMap[report.owner.trim()]) {
                            const team = nameToTeamMap[report.owner.trim()];
                            if (report.team !== team) {
                                updates.push({ id: report.id, team });
                                results.detail_reports++;
                            }
                        }
                    }

                    // Batch update
                    for (const update of updates) {
                        const { error: updateError } = await supabase
                            .from('detail_reports')
                            .update({ team: update.team })
                            .eq('id', update.id);

                        if (!updateError) {
                            totalUpdated++;
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ [Đồng bộ Team] Bảng detail_reports có thể không có trường team:', err);
            }

            // 4. Đồng bộ trong bảng reports (nếu có trường team và owner)
            console.log('🔄 [Đồng bộ Team] Đang xử lý bảng reports...');
            try {
                const { data: reports, error: reportsError } = await supabase
                    .from('reports')
                    .select('id, owner, team')
                    .limit(1000);

                if (!reportsError && reports && reports.length > 0) {
                    const updates = [];
                    for (const report of reports) {
                        if (report.owner && nameToTeamMap[report.owner.trim()]) {
                            const team = nameToTeamMap[report.owner.trim()];
                            if (report.team !== team) {
                                updates.push({ id: report.id, team });
                                results.reports++;
                            }
                        }
                    }

                    // Batch update
                    for (const update of updates) {
                        const { error: updateError } = await supabase
                            .from('reports')
                            .update({ team: update.team })
                            .eq('id', update.id);

                        if (!updateError) {
                            totalUpdated++;
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ [Đồng bộ Team] Bảng reports có thể không có trường team:', err);
            }

            const summary = `
✅ Đồng bộ team hoàn tất!

📊 Kết quả:
- Orders (sale_staff): ${results.orders.sale_staff} records
- Orders (cskh): ${results.orders.cskh} records  
- Orders (delivery_staff): ${results.orders.delivery_staff} records
- Detail Reports: ${results.detail_reports} records
- Reports: ${results.reports} records

Tổng cộng: ${totalUpdated} records đã được cập nhật
            `.trim();

            console.log(summary);
            toast.success(`✅ Đã đồng bộ team cho ${totalUpdated} records!`, {
                autoClose: 5000
            });

        } catch (error) {
            console.error('❌ [Đồng bộ Team] Lỗi:', error);
            toast.error(`❌ Lỗi đồng bộ team: ${error.message}`);
        } finally {
            setSyncTeamLoading(false);
        }
    };

    // --- ACCOUNT MANAGEMENT FUNCTIONS ---
    const loadAuthAccounts = async () => {
        setAccountLoading(true);
        try {
            // Lấy danh sách từ bảng users (bao gồm can_day_ffm)
            const { data, error } = await supabase
                .from('users')
                .select('id, username, email, password, name, role, team, department, position, branch, shift, created_at, can_day_ffm')
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            const affectedCount = data?.length || 0;
            console.log(`✅ [Xóa CSKH] Đã xóa CSKH của ${affectedCount} đơn hàng`);

            toast.success(`✅ Đã xóa dữ liệu CSKH của ${affectedCount} đơn hàng!`);

            // Refresh page hoặc reload data nếu cần
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Lỗi khi tải danh sách tài khoản: ' + error.message);
        } finally {
            setAccountLoading(false);
        }
    };

    const handleViewLoginHistory = async (accountId) => {
        try {
            // Lấy lịch sử đăng nhập từ login_history dựa trên user_id hoặc email
            const account = authAccounts.find(a => a.id === accountId || a.user_id === accountId);
            if (!account) {
                toast.error('Không tìm thấy tài khoản');
                return;
            }

            // Thử query từ login_history nếu bảng tồn tại
            const { data, error } = await supabase
                .from('login_history')
                .select('*')
                .or(`user_id.eq.${accountId},email.eq.${account.email}`)
                .order('login_at', { ascending: false })
                .limit(50);

            if (error) {
                // Nếu bảng không tồn tại, hiển thị thông báo
                if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
                    toast.info('Bảng login_history chưa được tạo. Lịch sử đăng nhập sẽ được lưu sau khi bảng được tạo.');
                    setLoginHistory([]);
                    setShowLoginHistory(true);
                    return;
                }
                throw error;
            }

            setLoginHistory(data || []);
            setShowLoginHistory(true);
        } catch (error) {
            console.error('Error loading login history:', error);
            toast.error('Lỗi khi tải lịch sử đăng nhập: ' + error.message);
        }
    };

    const handleEditAccount = (account) => {
        setSelectedAccount(account);
        setAccountForm({
            email: account.email || '',
            username: account.username || '',
            name: account.name || '',
            password: '', // Không hiển thị password
            user_id: account.id || account.user_id || '',
            role: account.role || 'user',
            team: account.team || '',
            department: account.department || '',
            status: account.has_password ? 'active' : 'inactive',
            must_change_password: false
        });
        setShowAccountModal(true);
    };

    const handleLockAccount = async (accountId) => {
        if (!window.confirm('Bạn có chắc muốn vô hiệu hóa tài khoản này? (Sẽ xóa mật khẩu để ngăn đăng nhập)')) return;

        try {
            // Xóa mật khẩu để khóa tài khoản (hoặc có thể thêm cột status vào users)
            const { error } = await supabase
                .from('users')
                .update({
                    password: null // Xóa mật khẩu để khóa
                })
                .eq('id', accountId);

            if (error) throw error;

            toast.success('Đã vô hiệu hóa tài khoản thành công!');
            loadAuthAccounts();
        } catch (error) {
            console.error('Error locking account:', error);
            toast.error('Lỗi khi vô hiệu hóa tài khoản: ' + error.message);
        }
    };

    const handleUnlockAccount = async (accountId) => {
        try {
            // Để mở khóa, cần set lại mật khẩu tạm thời hoặc yêu cầu user đặt lại
            const newPassword = prompt('Nhập mật khẩu mới cho tài khoản này (hoặc để trống để user tự đặt):');

            if (newPassword === null) return; // User hủy

            if (newPassword) {
                // Hash password mới
                const bcrypt = await import('bcryptjs');
                const passwordHash = bcrypt.default.hashSync(newPassword, 10);

                const { error } = await supabase
                    .from('users')
                    .update({ password: passwordHash })
                    .eq('id', accountId);

                if (error) throw error;
                toast.success('Đã mở khóa tài khoản và set mật khẩu mới thành công!');
            } else {
                toast.info('Tài khoản đã được mở khóa nhưng cần user tự đặt mật khẩu mới khi đăng nhập.');
            }

            loadAuthAccounts();
        } catch (error) {
            console.error('Error unlocking account:', error);
            toast.error('Lỗi khi mở khóa tài khoản: ' + error.message);
        }
    };

    const handleSaveAccount = async () => {
        if (!accountForm.email) {
            toast.error('Email là bắt buộc!');
            return;
        }

        try {
            // Nếu có password, cần hash trước khi lưu
            let passwordHash = null;
            if (accountForm.password) {
                // Import bcryptjs để hash password
                const bcrypt = await import('bcryptjs');
                passwordHash = bcrypt.default.hashSync(accountForm.password, 10);
            }

            if (selectedAccount) {
                // Update existing user in users table
                const updateData = {
                    email: accountForm.email,
                    username: accountForm.username,
                    name: accountForm.name,
                    role: accountForm.role || 'user'
                };

                if (passwordHash) {
                    updateData.password = passwordHash;
                }

                if (accountForm.team !== undefined) {
                    updateData.team = accountForm.team || null;
                }
                if (accountForm.department !== undefined) {
                    updateData.department = accountForm.department || null;
                }

                const { error } = await supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', selectedAccount.id);

                if (error) throw error;
                toast.success('Đã cập nhật tài khoản thành công!');
            } else {
                // Create new user in users table
                if (!passwordHash) {
                    toast.error('Mật khẩu là bắt buộc khi tạo tài khoản mới!');
                    return;
                }

                if (!accountForm.username) {
                    toast.error('Username là bắt buộc!');
                    return;
                }

                if (!accountForm.name) {
                    toast.error('Tên là bắt buộc!');
                    return;
                }

                // Generate ID từ email hoặc username
                const userId = accountForm.email.toLowerCase().replace(/[^a-z0-9]/g, '_');

                const { error } = await supabase
                    .from('users')
                    .insert({
                        id: userId,
                        email: accountForm.email,
                        username: accountForm.username,
                        password: passwordHash,
                        name: accountForm.name,
                        role: accountForm.role || 'user',
                        team: accountForm.team || null,
                        department: accountForm.department || null
                    });

                if (error) {
                    // Nếu user đã tồn tại, update thông tin
                    if (error.code === '23505') { // Unique violation
                        const updateData = {
                            username: accountForm.username,
                            password: passwordHash,
                            name: accountForm.name,
                            role: accountForm.role || 'user'
                        };
                        if (accountForm.team) updateData.team = accountForm.team;
                        if (accountForm.department) updateData.department = accountForm.department;

                        const { error: updateError } = await supabase
                            .from('users')
                            .update(updateData)
                            .eq('email', accountForm.email);

                        if (updateError) throw updateError;
                        toast.success('Tài khoản đã tồn tại, đã cập nhật thông tin!');
                    } else {
                        throw error;
                    }
                } else {
                    toast.success('Đã tạo tài khoản thành công!');
                }
            }

            setShowAccountModal(false);
            setSelectedAccount(null);
            loadAuthAccounts();
        } catch (error) {
            console.error('Error saving account:', error);
            toast.error('Lỗi khi lưu tài khoản: ' + error.message);
        }
    };

    // Load accounts on mount if tab is active
    useEffect(() => {
        if (activeTab === 'account_management') {
            loadAuthAccounts();
        }
    }, [activeTab]);

    // Tự động điền Team từ bảng nhân sự vào orders
    const handleAutoFillTeam = async () => {
        if (!window.confirm('Bạn có chắc muốn tự động điền Team cho tất cả đơn hàng chưa có team?\n\nQuá trình này sẽ lấy dữ liệu từ bảng nhân sự (users/human_resources) dựa trên tên nhân viên sale.')) {
            return;
        }

        try {
            setIsFillingTeam(true);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });

            // 1. Lấy tất cả orders chưa có team (hoặc team rỗng/null)
            const { data: ordersWithoutTeam, error: ordersError } = await supabase
                .from('orders')
                .select('id, sale_staff, team')
                .not('sale_staff', 'is', null)
                .neq('sale_staff', '')
                .or('team.is.null,team.eq.');

            if (ordersError) throw ordersError;

            if (!ordersWithoutTeam || ordersWithoutTeam.length === 0) {
                toast.info('Tất cả đơn hàng đã có team!');
                setIsFillingTeam(false);
                return;
            }

            setFillTeamProgress(prev => ({ ...prev, total: ordersWithoutTeam.length }));

            // 2. Lấy dữ liệu từ bảng users (cột branch - sẽ dùng làm team)
            const { data: usersData, error: usersError } = await supabase
                .from('users')
                .select('name, branch')
                .not('branch', 'is', null)
                .neq('branch', '');

            if (usersError) throw usersError;

            // 3. Lấy dữ liệu từ bảng human_resources (cột "chi nhánh")
            const { data: hrData, error: hrError } = await supabase
                .from('human_resources')
                .select('"Họ Và Tên", "chi nhánh"')
                .not('"chi nhánh"', 'is', null)
                .neq('"chi nhánh"', '');

            if (hrError) {
                console.warn('Warning: Could not fetch human_resources:', hrError);
            }

            // 4. Tạo map: tên nhân viên -> branch (team)
            // Ưu tiên từ users, sau đó từ human_resources
            const nameToTeam = new Map();

            // Từ bảng users
            (usersData || []).forEach(user => {
                const name = normalizeStr(user.name);
                const branch = String(user.branch || '').trim();
                if (name && branch) {
                    nameToTeam.set(name, branch);
                }
            });

            // Từ bảng human_resources (nếu có, và chưa có trong map)
            (hrData || []).forEach(hr => {
                const name = normalizeStr(hr['Họ Và Tên']);
                const branch = String(hr['chi nhánh'] || '').trim();
                if (name && branch && !nameToTeam.has(name)) {
                    nameToTeam.set(name, branch);
                }
            });

            // 5. Điền team cho từng order
            let successCount = 0;
            let failCount = 0;

            for (let i = 0; i < ordersWithoutTeam.length; i++) {
                const order = ordersWithoutTeam[i];
                const saleName = normalizeStr(order.sale_staff);

                setFillTeamProgress({
                    current: i + 1,
                    total: ordersWithoutTeam.length,
                    success: successCount,
                    failed: failCount,
                    currentUser: order.sale_staff || 'N/A'
                });

                if (!saleName) {
                    failCount++;
                    continue;
                }

                const team = nameToTeam.get(saleName);

                if (!team) {
                    failCount++;
                    continue;
                }

                // Update team trong orders
                const { error: updateError } = await supabase
                    .from('orders')
                    .update({ team: team })
                    .eq('id', order.id);

                if (updateError) {
                    console.error(`Error updating order ${order.id}:`, updateError);
                    failCount++;
                } else {
                    successCount++;
                }
            }

            // 6. Kết quả
            toast.success(`✅ Hoàn thành! Đã điền team cho ${successCount} đơn hàng. ${failCount} đơn hàng không tìm thấy dữ liệu.`);
            setIsFillingTeam(false);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });
        } catch (err) {
            console.error('Error auto-filling team:', err);
            toast.error('Lỗi khi tự động điền team: ' + err.message);
            setIsFillingTeam(false);
            setFillTeamProgress({ current: 0, total: 0, success: 0, failed: 0, currentUser: '' });
        }
    };

    // Lấy danh sách sản phẩm từ database để hiển thị
    const displayedProducts = dbProducts
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!canView('ADMIN_TOOLS')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (ADMIN_TOOLS).</div>;
    }

    return (
        <div className="p-6 w-full mx-auto min-h-screen bg-gray-50">
            <h1 className="text-3xl font-bold mb-8 text-gray-800 flex items-center gap-3">
                <Settings className="w-8 h-8 text-gray-600" />
                Công cụ quản trị & Cấu hình
            </h1>

            {/* TAB NAVIGATION */}
            <div className="flex gap-4 mb-6 border-b border-gray-200 overflow-x-auto">
                {visibleTabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`pb-3 px-4 font-medium transition-all whitespace-nowrap ${activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Icon size={18} />
                                {tab.label}
                            </div>
                        </button>
                    );
                })}

                {/* SEARCH BAR (Right Aligned) */}
                <div className="ml-auto relative min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Tìm kiếm..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* TAB CONTENT: MAINTENANCE */}
            {activeTab === 'maintenance' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                    {/* Snapshot Card */}
                    {isSectionVisible('Chốt Ca & Đồng bộ Báo cáo', ['snapshot', 'báo cáo', 'chốt ca']) && (
                        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                    <Save size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">Chốt Ca & Đồng bộ Báo cáo</h2>
                                    <p className="text-sm text-gray-500">Cập nhật dữ liệu từ bảng thao tác sang bảng báo cáo</p>
                                </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                                <div className="flex gap-2 text-amber-800">
                                    <AlertTriangle size={20} />
                                    <span className="text-sm font-medium">Lưu ý quan trọng</span>
                                </div>
                                <ul className="list-disc list-inside mt-2 text-sm text-amber-700 space-y-1">
                                    <li>Hành động này sẽ sao chép toàn bộ dữ liệu hiện tại sang bảng báo cáo.</li>
                                    <li>Dữ liệu báo cáo cũ sẽ bị ghi đè.</li>
                                    <li>Nên thực hiện vào cuối mỗi ca làm việc.</li>
                                </ul>
                            </div>

                            <button
                                onClick={handleSnapshot}
                                disabled={loading}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all
                            ${loading
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                                    }`}
                            >
                                {loading ? (
                                    <>
                                        <span className="animate-spin text-xl">⟳</span>
                                        <span>Đang xử lý...</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle size={20} />
                                        <span>Thực hiện Chốt Ca Ngay</span>
                                    </>
                                )}
                            </button>

                            {lastSnapshot && (
                                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600">
                                    <Clock size={16} />
                                    <span>Đã chốt lần cuối lúc: {lastSnapshot.toLocaleTimeString()}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* System Health Check */}
                    {isSectionVisible('Kiểm tra Hệ thống', ['check', 'system', 'cơ sở dữ liệu', 'database']) && (
                        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <Activity size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">Kiểm tra Hệ thống</h2>
                                    <p className="text-sm text-gray-500">Kiểm tra kết nối Database & Bảng</p>
                                </div>
                            </div>

                            <div className="mb-6">
                                <p className="text-sm text-gray-600 mb-2">Sử dụng công cụ này để kiểm tra xem các bảng dữ liệu đã được khởi tạo đúng trên Supabase chưa.</p>
                            </div>

                            <button
                                onClick={checkSystem}
                                disabled={checkLoading}
                                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all mb-4
                            ${checkLoading
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                                    }`}
                            >
                                {checkLoading ? (
                                    <>
                                        <span className="animate-spin text-xl">⟳</span>
                                        <span>Đang kiểm tra...</span>
                                    </>
                                ) : (
                                    <>
                                        <Activity size={20} />
                                        <span>Quét lỗi toàn hệ thống</span>
                                    </>
                                )}
                            </button>

                            {dbStatus && (
                                <div className="space-y-4 border-t pt-4">
                                    {/* SUMMARY HEADER */}
                                    <div className="flex items-center justify-between pb-2 border-b">
                                        <h3 className="font-bold text-gray-700">Kết quả quét hệ thống</h3>
                                        <span className="text-xs text-gray-500">{new Date().toLocaleString()}</span>
                                    </div>
                                    {Object.entries(dbStatus).map(([key, result]) => {
                                        let statusColor = 'text-gray-500';
                                        let Icon = CheckCircle;

                                        if (result.status === 'OK') {
                                            statusColor = 'text-green-600';
                                            Icon = CheckCircle;
                                        } else if (result.status === 'WARNING') {
                                            statusColor = 'text-orange-500';
                                            Icon = AlertTriangle;
                                        } else if (result.status === 'ERROR') {
                                            statusColor = 'text-red-600';
                                            Icon = AlertCircle;
                                        } else if (result.status === 'INFO') {
                                            statusColor = 'text-blue-600';
                                            Icon = Clock;
                                        }

                                        return (
                                            <div key={key} className="flex items-center justify-between text-sm p-2 rounded bg-gray-50 border border-gray-100">
                                                <span className="font-medium text-gray-700 flex items-center gap-2">
                                                    {result.type === 'latency' && <Globe size={14} className="text-gray-400" />}
                                                    {key}
                                                </span>
                                                <span className={`${statusColor} flex items-center gap-1 font-medium`}>
                                                    <Icon size={14} />
                                                    {result.message}
                                                    {result.count !== undefined && `(${result.count} dòng)`}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: VERIFICATION */}
            {activeTab === 'verification' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-teal-100 text-teal-600 rounded-lg">
                            <GitCompare size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Đối soát Dữ liệu (Beta)</h2>
                            <p className="text-sm text-gray-500">So sánh chênh lệch giữa các bảng dữ liệu gốc và báo cáo.</p>
                        </div>
                    </div>

                    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="font-semibold text-gray-700 mb-2">So sánh App Sheet (Google Sheet) vs Web Orders (Supabase)</h3>
                        <p className="text-sm text-gray-600 mb-4">Kiểm tra xem số lượng đơn hàng có khớp giữa dữ liệu nhập (Orders) và dữ liệu báo cáo (Reports) hay không.</p>

                        <div className="flex gap-3">
                            <button
                                onClick={compareTables}
                                disabled={verifying}
                                className="bg-teal-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-teal-700 transition"
                            >
                                {verifying ? <RefreshCw className="animate-spin w-4 h-4" /> : <GitCompare className="w-4 h-4" />}
                                Thực hiện Đối soát
                            </button>
                        </div>

                        {verifyResult && (
                            <div className="mt-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 bg-white border rounded shadow-sm">
                                        <div className="text-sm text-gray-500">Google Sheet (Gốc)</div>
                                        <div className="text-2xl font-bold text-blue-600">{verifyResult.reports}</div>
                                    </div>
                                    <div className="p-4 bg-white border rounded shadow-sm">
                                        <div className="text-sm text-gray-500">Web Orders (Supabase)</div>
                                        <div className="text-2xl font-bold text-indigo-600">{verifyResult.orders}</div>
                                    </div>
                                    <div className={`p-4 bg-white border rounded shadow-sm ${verifyResult.diff === 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                                        <div className="text-sm text-gray-500">Chênh lệch</div>
                                        <div className={`text-2xl font-bold ${verifyResult.diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {verifyResult.diff > 0 ? `+${verifyResult.diff} (Web dư)` : verifyResult.diff}
                                        </div>
                                        <div className="text-xs mt-1">
                                            {verifyResult.diff === 0 ? '✅ Khớp số lượng tổng' : '⚠️ Có sự chênh lệch'}
                                        </div>
                                    </div>
                                </div>

                                {/* Actions based on Result */}
                                <div className="flex gap-4 items-center p-4 bg-gray-100 rounded border border-gray-200">
                                    {verifyResult.details.missingInSupabase > 0 ? (
                                        <div className="flex-1 flex gap-4 items-center justify-between">
                                            <span className="text-orange-700 font-medium">⚠️ Phát hiện {verifyResult.details.missingInSupabase} đơn thiếu trên Web.</span>
                                            <button
                                                onClick={handleSync}
                                                disabled={verifying}
                                                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded shadow flex items-center gap-2"
                                            >
                                                <RefreshCw size={16} className={verifying ? "animate-spin" : ""} />
                                                Đồng bộ {verifyResult.details.missingInSupabase} đơn này về Web
                                            </button>
                                        </div>
                                    ) : verifyResult.diff === 0 ? (
                                        <div className="flex-1 flex gap-4 items-center justify-between">
                                            <span className="text-green-700 font-medium">✅ Dữ liệu đã khớp hoàn toàn. Hệ thống sẵn sàng!</span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-500 italic">Vui lòng kiểm tra lại sự chênh lệch (Có thể do đơn mới trên web chưa có trên sheet).</span>
                                    )}
                                </div>


                                {/* Detailed Diff */}
                                {verifyResult.details && (verifyResult.details.missingInSupabase > 0 || verifyResult.details.missingInSheet > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        {verifyResult.details.missingInSupabase > 0 && (
                                            <div className="bg-orange-50 p-3 rounded border border-orange-100 text-sm">
                                                <h4 className="font-bold text-orange-700 mb-2">Thiếu trên Web (Có tại Sheet): {verifyResult.details.missingInSupabase} đơn</h4>
                                                <ul className="list-disc list-inside text-gray-600 max-h-32 overflow-y-auto">
                                                    {verifyResult.details.sampleMissing.map(code => (
                                                        <li key={code}>{code}</li>
                                                    ))}
                                                    {verifyResult.details.missingInSupabase > 5 && <li>... và {verifyResult.details.missingInSupabase - 5} đơn khác</li>}
                                                </ul>
                                            </div>
                                        )}
                                        {verifyResult.details.missingInSheet > 0 && (
                                            <div className="bg-blue-50 p-3 rounded border border-blue-100 text-sm">
                                                <h4 className="font-bold text-blue-700 mb-2">Mới trên Web (Chưa có tại Sheet): {verifyResult.details.missingInSheet} đơn</h4>
                                                <p className="text-gray-600 italic">Có thể là đơn mới tạo trên Web chưa đồng bộ ngược?</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}



            {/* TAB CONTENT: UPLOAD & DOWNLOAD */}
            {activeTab === 'upload_download' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn p-6">
                    <input type="file" id="json-upload-input" accept=".json" hidden onChange={handleFileUpload} />

                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                            <Download size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Upload & Tải dữ liệu</h2>
                            <p className="text-sm text-gray-500">Công cụ nhập và xuất dữ liệu hệ thống</p>
                        </div>
                    </div>

                    {downloadMode ? (
                        <div className="animate-fadeIn">
                            <button
                                onClick={() => setDownloadMode(false)}
                                className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-medium"
                            >
                                <ArrowLeft size={18} /> Quay lại
                            </button>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Table size={20} className="text-blue-600" />
                                Chọn bảng dữ liệu cần tải về (JSON)
                            </h3>

                            {/* DATE FILTER INPUTS */}
                            <div className="flex flex-wrap items-center gap-4 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700">Từ ngày:</span>
                                    <input
                                        type="date"
                                        value={dateFrom}
                                        onChange={(e) => setDateFrom(e.target.value)}
                                        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-700">Đến ngày:</span>
                                    <input
                                        type="date"
                                        value={dateTo}
                                        onChange={(e) => setDateTo(e.target.value)}
                                        className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="text-xs text-gray-500 italic">
                                    (Để trống để tải 10,000 dòng mới nhất)
                                </div>
                                {(dateFrom || dateTo) && (
                                    <button
                                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                                    >
                                        Xóa lọc
                                    </button>
                                )}

                                <div className="ml-auto">
                                    <button
                                        onClick={handleDownloadAll}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <Download size={18} />
                                        Tải Tất Cả (Backup)
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {AVAILABLE_TABLES.map(table => (
                                    <div
                                        key={table.id}
                                        onClick={() => handleDownloadTable(table.id)}
                                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all hover:shadow-md group"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border border-gray-100 group-hover:border-blue-200">
                                                <Database size={20} className="text-gray-500 group-hover:text-blue-600" />
                                            </div>
                                            <Download size={16} className="text-gray-400 group-hover:text-blue-500" />
                                        </div>
                                        <h4 className="font-bold text-gray-700 group-hover:text-blue-700">{table.name}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{table.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : uploadMode ? (
                        <div className="animate-fadeIn">
                            <button
                                onClick={() => setUploadMode(false)}
                                className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors font-medium"
                            >
                                <ArrowLeft size={18} /> Quay lại
                            </button>
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Upload size={20} className="text-green-600" />
                                Chọn bảng để Upload dữ liệu (JSON)
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {AVAILABLE_TABLES.map(table => (
                                    <div
                                        key={table.id}
                                        onClick={() => handleUploadCardClick(table.id)}
                                        className="bg-green-50 border border-green-200 rounded-lg p-4 cursor-pointer hover:bg-green-100 hover:border-green-300 transition-all hover:shadow-md group"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border border-green-100 group-hover:border-green-200">
                                                <Database size={20} className="text-gray-500 group-hover:text-green-600" />
                                            </div>
                                            <Upload size={16} className="text-gray-400 group-hover:text-green-500" />
                                        </div>
                                        <h4 className="font-bold text-gray-700 group-hover:text-green-700">{table.name}</h4>
                                        <p className="text-xs text-gray-500 mt-1">{table.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* DOWNLOAD SECTION */}
                            <div className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <FileJson size={18} className="text-blue-600" />
                                    Tải dữ liệu JSON
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Xuất dữ liệu hệ thống ra file JSON để lưu trữ hoặc xử lý offline.
                                </p>
                                <button
                                    onClick={() => setDownloadMode(true)}
                                    className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Table size={16} /> Chọn bảng để tải về
                                </button>
                            </div>

                            {/* UPLOAD SECTION */}
                            <div className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                                <h3 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                                    <Upload size={18} className="text-green-600" />
                                    Upload dữ liệu JSON
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Nhập dữ liệu mới hoặc cập nhật từ file JSON vào hệ thống.
                                </p>
                                <button
                                    onClick={() => setUploadMode(true)}
                                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Table size={16} /> Chọn bảng để Upload
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB CONTENT: SETTINGS */}
            {activeTab === 'settings' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">Cấu hình tham số hệ thống</h2>
                            <p className="text-sm text-gray-500 mt-1">Quản lý các thông số vận hành toàn hệ thống</p>
                        </div>
                        <button
                            onClick={handleSaveSettings}
                            className="bg-[#2d7c2d] text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-[#256625] transition-colors shadow-sm"
                        >
                            <Save size={18} /> Lưu Cấu hình
                        </button>
                    </div>

                    <div className="p-6 space-y-8">
                        {/* 1. Thresholds */}
                        {isSectionVisible('Ngưỡng cảnh báo chỉ số', ['threshold', 'chỉ số', 'cảnh báo', 'kpi', 'tồn kho', 'hoàn', 'ads']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <AlertCircle className="w-5 h-5 text-orange-500" />
                                    1. Ngưỡng cảnh báo chỉ số
                                </h3>
                                <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                                    {/* Dynamic Threshold List */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {Object.entries(settings.thresholds).map(([key, val]) => {
                                            const METRIC_LABELS = {
                                                inventoryLow: "Cảnh báo tồn kho thấp (đơn vị)",
                                                shippingDelay: "Cảnh báo giao hàng chậm (ngày)",
                                                maxReturnRate: "Tỉ lệ hoàn tối đa (%)",
                                                minProfitMargin: "Biên lợi nhuận tối thiểu (%)",
                                                maxAdsBudget: "Ngân sách Ads tối đa (VND)",
                                                kpiOrders: "KPI Đơn hàng / ngày"
                                            };
                                            return (
                                                <div key={key} className="relative group">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <label className="block text-sm font-medium text-gray-700">
                                                            {METRIC_LABELS[key] || key}
                                                        </label>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm("Xóa chỉ số này?")) {
                                                                    const newT = { ...settings.thresholds };
                                                                    delete newT[key];
                                                                    setSettings({ ...settings, thresholds: newT });
                                                                }
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Xóa chỉ số"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d]"
                                                        value={val}
                                                        onChange={(e) => setSettings({
                                                            ...settings,
                                                            thresholds: { ...settings.thresholds, [key]: parseInt(e.target.value) || 0 }
                                                        })}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Add New Threshold */}
                                    <div className="border-t pt-4 mt-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Thêm chỉ số mới</label>
                                        <div className="flex flex-wrap gap-2 items-end">
                                            <div className="flex-1 min-w-[200px]">
                                                <label className="text-xs text-gray-600 mb-1 block">Chọn chỉ số</label>
                                                <select
                                                    id="new-metric-select"
                                                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d] text-sm"
                                                >
                                                    <option value="inventoryLow">Cảnh báo tồn kho thấp</option>
                                                    <option value="shippingDelay">Cảnh báo giao hàng chậm</option>
                                                    <option value="maxReturnRate">Tỉ lệ hoàn tối đa (%)</option>
                                                    <option value="minProfitMargin">Biên lợi nhuận tối thiểu (%)</option>
                                                    <option value="maxAdsBudget">Ngân sách Ads tối đa (VND)</option>
                                                    <option value="kpiOrders">KPI Đơn hàng / ngày</option>
                                                </select>
                                            </div>
                                            <div className="w-32">
                                                <label className="text-xs text-gray-600 mb-1 block">Giá trị ngưỡng</label>
                                                <input
                                                    id="new-metric-value"
                                                    type="number"
                                                    placeholder="0"
                                                    className="w-full border-gray-300 rounded-md shadow-sm p-2 border focus:ring-[#2d7c2d] text-sm"
                                                />
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const select = document.getElementById('new-metric-select');
                                                    const input = document.getElementById('new-metric-value');
                                                    const key = select.value;
                                                    const val = parseInt(input.value);

                                                    if (!isNaN(val)) {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            thresholds: { ...prev.thresholds, [key]: val }
                                                        }));
                                                        input.value = '';
                                                        toast.success("Đã thêm chỉ số cảnh báo mới");
                                                    } else {
                                                        toast.error("Vui lòng nhập giá trị hợp lệ");
                                                    }
                                                }}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm flex items-center gap-1"
                                            >
                                                <Activity size={16} /> Thêm
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* 2 & 3. UNIFIED PRODUCT MANAGEMENT */}
                        {(isSectionVisible('Quản lý Danh sách Sản phẩm', ['product', 'sản phẩm', 'skus']) || displayedProducts.length > 0) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Tag className="w-5 h-5 text-purple-600" />
                                    2. Quản lý Danh sách Sản phẩm
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Quản lý danh sách sản phẩm, định nghĩa sản phẩm R&D (SP test) và sản phẩm trọng điểm.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <div className="max-h-[500px] overflow-y-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-700 font-semibold sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-4 py-3 border-b w-16 text-center">STT</th>
                                                    <th className="px-4 py-3 border-b">Tên sản phẩm</th>
                                                    <th className="px-4 py-3 border-b w-48">Loại sản phẩm</th>
                                                    <th className="px-4 py-3 border-b w-24 text-center">Hành động</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {displayedProducts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                            Chưa có sản phẩm nào. Hãy thêm sản phẩm mới ở bên dưới.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    displayedProducts.map((product, index) => {
                                                        return (
                                                            <tr key={product.id || product.name} className="hover:bg-gray-50">
                                                                <td className="px-4 py-2 text-center text-gray-500">{index + 1}</td>
                                                                <td className="px-4 py-2 font-medium">{product.name}</td>
                                                                <td className="px-4 py-2">
                                                                    <select
                                                                        value={product.type}
                                                                        onChange={async (e) => {
                                                                            const newType = e.target.value;
                                                                            try {
                                                                                await updateProductTypeInDatabase(product.name, newType);
                                                                                // Cập nhật local state
                                                                                setDbProducts(prev => prev.map(p =>
                                                                                    p.name === product.name ? { ...p, type: newType } : p
                                                                                ));
                                                                                toast.success(`Đã cập nhật loại sản phẩm "${product.name}"`);
                                                                            } catch (err) {
                                                                                toast.error(`Lỗi cập nhật: ${err.message}`);
                                                                            }
                                                                        }}
                                                                        className={`w-full text-xs py-1 px-2 rounded border focus:outline-none focus:ring-2 
                                                                        ${product.type === 'test' ? 'bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500' :
                                                                                product.type === 'key' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 focus:ring-indigo-500' :
                                                                                    'bg-white text-gray-700 border-gray-300 focus:ring-gray-500'}`}
                                                                    >
                                                                        <option value="normal">SP thường</option>
                                                                        <option value="test">SP Test (R&D)</option>
                                                                        <option value="key">SP Trọng điểm</option>
                                                                    </select>
                                                                </td>
                                                                <td className="px-4 py-2 text-center">
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product.name}" khỏi danh sách?`)) {
                                                                                try {
                                                                                    await deleteProductFromDatabase(product.name);
                                                                                    // Cập nhật local state
                                                                                    setDbProducts(prev => prev.filter(p => p.name !== product.name));
                                                                                    toast.success(`Đã xóa sản phẩm "${product.name}"`);
                                                                                    // Reload reference data để cập nhật gợi ý
                                                                                    await fetchReferenceData();
                                                                                } catch (err) {
                                                                                    toast.error(`Lỗi xóa: ${err.message}`);
                                                                                }
                                                                            }
                                                                        }}
                                                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Add Product Footer */}
                                    <div className="bg-gray-50 p-3 border-t flex gap-2">
                                        <input
                                            type="text"
                                            list="product-suggestions"
                                            placeholder="Nhập tên sản phẩm mới (có thể gõ tay)..."
                                            className="flex-1 text-sm border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            onKeyDown={async (e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.target.value.trim();
                                                    if (!val) return;

                                                    // Kiểm tra xem đã có trong database chưa
                                                    const existsInDb = dbProducts.some(p =>
                                                        p.name.toLowerCase().trim() === val.toLowerCase().trim()
                                                    );

                                                    if (existsInDb) {
                                                        toast.warning('Sản phẩm này đã có trong danh sách!');
                                                        return;
                                                    }

                                                    try {
                                                        // Lưu vào database với type mặc định là 'normal'
                                                        await saveProductToDatabase(val, 'normal');
                                                        // Reload danh sách từ database
                                                        await fetchProductsFromDatabase();
                                                        e.target.value = '';
                                                        toast.success(`Đã thêm sản phẩm "${val}"`);
                                                    } catch (err) {
                                                        toast.error(`Lỗi thêm sản phẩm: ${err.message}`);
                                                    }
                                                }
                                            }}
                                            id="new-product-input"
                                        />
                                        <datalist id="product-suggestions">
                                            {productSuggestions.map(p => <option key={p} value={p} />)}
                                        </datalist>
                                        <button
                                            onClick={async () => {
                                                const input = document.getElementById('new-product-input');
                                                const val = input.value.trim();
                                                if (!val) {
                                                    toast.warning('Vui lòng nhập tên sản phẩm');
                                                    return;
                                                }

                                                // Kiểm tra xem đã có trong database chưa
                                                const existsInDb = dbProducts.some(p =>
                                                    p.name.toLowerCase().trim() === val.toLowerCase().trim()
                                                );

                                                if (existsInDb) {
                                                    toast.warning('Sản phẩm này đã có trong danh sách!');
                                                    return;
                                                }

                                                try {
                                                    // Lưu vào database với type mặc định là 'normal'
                                                    await saveProductToDatabase(val, 'normal');
                                                    // Reload danh sách từ database
                                                    await fetchProductsFromDatabase();
                                                    input.value = '';
                                                    toast.success(`Đã thêm sản phẩm "${val}"`);
                                                } catch (err) {
                                                    toast.error(`Lỗi thêm sản phẩm: ${err.message}`);
                                                }
                                            }}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. Market Management */}
                        {isSectionVisible('Quản lý Thị trường Trọng điểm', ['market', 'thị trường', 'khu vực']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-teal-600" />
                                    3. Quản lý Thị trường Trọng điểm
                                </h3>
                                <p className="text-sm text-gray-500">Các thị trường (Khu vực) chính cần theo dõi trong báo cáo.</p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-700 font-semibold sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3 border-b w-16 text-center">STT</th>
                                                <th className="px-4 py-3 border-b">Tên Thị trường</th>
                                                <th className="px-4 py-3 border-b w-24 text-center">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {settings.keyMarkets
                                                .filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map((market, index) => (
                                                    <tr key={market} className="hover:bg-gray-50">
                                                        <td className="px-4 py-2 text-center text-gray-500">{index + 1}</td>
                                                        <td className="px-4 py-2 font-medium">{market}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    if (window.confirm(`Xóa thị trường "${market}"?`)) {
                                                                        setSettings(prev => ({
                                                                            ...prev,
                                                                            keyMarkets: prev.keyMarkets.filter(m => m !== market)
                                                                        }));
                                                                    }
                                                                }}
                                                                className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>

                                    {/* Add Market Footer */}
                                    <div className="bg-gray-50 p-3 border-t flex gap-2">
                                        <input
                                            type="text"
                                            list="market-suggestions"
                                            placeholder="Nhập tên thị trường mới..."
                                            className="flex-1 text-sm border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.target.value.trim();
                                                    if (val && !settings.keyMarkets.includes(val)) {
                                                        setSettings(prev => ({ ...prev, keyMarkets: [...prev.keyMarkets, val].sort() }));
                                                        // Also add to availableMarkets if not there
                                                        if (!availableMarkets.includes(val)) setAvailableMarkets(prev => [...prev, val].sort());
                                                        e.target.value = '';
                                                    }
                                                }
                                            }}
                                            id="new-market-input"
                                        />
                                        <datalist id="market-suggestions">
                                            {availableMarkets.map(m => <option key={m} value={m} />)}
                                        </datalist>
                                        <button
                                            onClick={() => {
                                                const input = document.getElementById('new-market-input');
                                                const val = input.value.trim();
                                                if (val && !settings.keyMarkets.includes(val)) {
                                                    setSettings(prev => ({ ...prev, keyMarkets: [...prev.keyMarkets, val].sort() }));
                                                    if (!availableMarkets.includes(val)) setAvailableMarkets(prev => [...prev, val].sort());
                                                    input.value = '';
                                                    toast.success('Đã thêm thị trường mới');
                                                } else if (settings.keyMarkets.includes(val)) {
                                                    toast.warning('Thị trường này đã có!');
                                                }
                                            }}
                                            className="bg-teal-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-teal-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. Auto Fill Team */}
                        {isSectionVisible('Tự động điền Team', ['team', 'tự động', 'điền', 'auto fill']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-indigo-600" />
                                    4. Tự động điền Team vào đơn hàng
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Tự động điền Team cho các đơn hàng chưa có team dựa trên tên nhân viên sale từ bảng nhân sự.
                                </p>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-gray-700 mb-2">
                                                <strong>Chức năng:</strong> Tự động điền Team (Chi nhánh) vào cột team của orders dựa trên tên nhân viên sale.
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                • Lấy dữ liệu từ bảng users (cột branch) và human_resources (cột "chi nhánh")<br />
                                                • Chỉ điền cho các đơn hàng chưa có team (team = null hoặc rỗng)<br />
                                                • Match theo tên nhân viên sale (sale_staff)
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleAutoFillTeam}
                                            disabled={isFillingTeam}
                                            className="px-6 py-3 bg-indigo-600 text-white rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                            title="Tự động điền Team từ bảng nhân sự vào đơn hàng"
                                        >
                                            {isFillingTeam ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    <span>Đang điền...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Users className="w-5 h-5" />
                                                    <span>Tự động điền Team</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* Progress Modal for Auto Fill Team */}
            {isFillingTeam && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 rounded-t-lg">
                            <h3 className="text-xl font-bold text-white">🔄 Đang điền Team tự động</h3>
                        </div>
                        <div className="p-6">
                            <div className="mb-4">
                                <div className="flex justify-between text-sm text-gray-600 mb-2">
                                    <span>Tiến trình:</span>
                                    <span className="font-semibold">
                                        {fillTeamProgress.current} / {fillTeamProgress.total}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-3">
                                    <div
                                        className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${fillTeamProgress.total > 0 ? (fillTeamProgress.current / fillTeamProgress.total) * 100 : 0}%`
                                        }}
                                    ></div>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Đang xử lý:</span>
                                    <span className="font-semibold text-indigo-600">{fillTeamProgress.currentUser || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Thành công:</span>
                                    <span className="font-semibold text-green-600">{fillTeamProgress.success}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Thất bại:</span>
                                    <span className="font-semibold text-red-600">{fillTeamProgress.failed}</span>
                                </div>
                            </div>

                            <div className="mt-4 text-xs text-gray-500">
                                <p>Đang lấy dữ liệu từ bảng nhân sự (users/human_resources) và điền vào cột team trong orders...</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: PERMISSIONS */}
            {activeTab === 'permissions' && (
                <PermissionManager searchQuery={searchQuery} />
            )}

            {/* TAB CONTENT: AUTO ASSIGN */}
            {activeTab === 'auto_assign' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Users className="w-6 h-6 text-blue-600" />
                            Chia đơn tự động cho CSKH
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Phân bổ đơn hàng và hạch toán báo cáo tự động</p>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Configuration */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h3 className="font-semibold text-gray-800 mb-3">Cấu hình</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                                    <select
                                        value={selectedTeam}
                                        onChange={(e) => setSelectedTeam(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="Hà Nội">Hà Nội</option>
                                        <option value="HCM">HCM</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tháng (Ngày lên đơn)</label>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                                <div className="text-xs text-gray-600 space-y-1">
                                    <p><strong>Điều kiện:</strong></p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-2">
                                        <li>Team = "{selectedTeam}"</li>
                                        <li>Kế toán xác nhận = "Đã thu tiền"</li>
                                        <li>Tháng của Ngày lên đơn = {selectedMonth}</li>
                                        <li>Cột CSKH trống</li>
                                    </ul>
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                        <p><strong className="text-gray-800">Logic chia đơn CSKH:</strong></p>
                                        <ol className="list-decimal list-inside space-y-1 ml-2 mt-1 text-xs">
                                            <li><strong>Đếm số đơn hiện tại</strong> của mỗi nhân viên CSKH <strong>theo từng tháng</strong> (dựa trên tháng của "Ngày lên đơn")</li>
                                            <li><strong>Đơn Sale tự chăm:</strong> Nếu nhân viên Sale cũng là CSKH → tự động gán cho họ</li>
                                            <li><strong>Chia đều:</strong> Với mỗi đơn còn lại, lấy tháng của "Ngày lên đơn", chọn nhân viên CSKH có <strong>ít đơn nhất trong tháng đó</strong></li>
                                        </ol>
                                        <p className="mt-2 text-blue-700 text-xs">
                                            💡 Ví dụ: Nhân viên A có 5 đơn tháng 1, 3 đơn tháng 2. Nhân viên B có 2 đơn tháng 1, 4 đơn tháng 2.
                                            Đơn mới tháng 1 → chia cho B (B có ít đơn tháng 1 hơn). Đơn mới tháng 2 → chia cho A (A có ít đơn tháng 2 hơn).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Chia đơn CSKH</h3>
                                <div className="flex gap-4">
                                    <button
                                        onClick={handlePhanBoDonHang}
                                        disabled={autoAssignLoading}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {autoAssignLoading ? (
                                            <>
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <Users className="w-5 h-5" />
                                                Phân bổ đơn hàng
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleHachToanBaoCao}
                                        disabled={autoAssignLoading}
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {autoAssignLoading ? (
                                            <>
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <Activity className="w-5 h-5" />
                                                Hạch toán báo cáo
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={handleRunAll}
                                        disabled={autoAssignLoading}
                                        className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {autoAssignLoading ? (
                                            <>
                                                <RefreshCw className="w-5 h-5 animate-spin" />
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-5 h-5" />
                                                Chạy toàn bộ
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Tìm kiếm đơn hàng</h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                placeholder="Nhập mã đơn hàng..."
                                                value={orderSearchCode}
                                                onChange={(e) => setOrderSearchCode(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && orderSearchCode.trim()) {
                                                        handleSearchOrder();
                                                    }
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <button
                                            onClick={handleSearchOrder}
                                            disabled={orderSearchLoading || !orderSearchCode.trim()}
                                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {orderSearchLoading ? (
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Search className="w-4 h-4" />
                                            )}
                                            Tìm kiếm
                                        </button>
                                    </div>

                                    {/* Kết quả tìm kiếm */}
                                    {orderSearchResult && (
                                        <div className={`mt-4 p-4 rounded-lg border ${orderSearchResult.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                                            {orderSearchResult.error ? (
                                                <div>
                                                    <h4 className="font-semibold text-red-800 mb-2">❌ Lỗi tìm kiếm</h4>
                                                    <p className="text-sm text-red-700">{orderSearchResult.error}</p>
                                                    {orderSearchResult.details && (
                                                        <div className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded">
                                                            <strong>Chi tiết:</strong> {orderSearchResult.details}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <h4 className="font-semibold text-green-800 mb-3">✅ Thông tin đơn hàng</h4>
                                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                                        <div>
                                                            <span className="font-medium text-gray-700">Mã đơn hàng:</span>
                                                            <span className="ml-2 font-mono text-blue-600">{orderSearchResult.order_code || 'N/A'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Ngày lên đơn:</span>
                                                            <span className="ml-2">{orderSearchResult.order_date || 'N/A'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Team:</span>
                                                            <span className="ml-2">{orderSearchResult.team || 'N/A'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-medium text-gray-700">Country:</span>
                                                            <span className="ml-2">{orderSearchResult.country || 'N/A'}</span>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <span className="font-medium text-gray-700">NV Vận đơn:</span>
                                                            <span className={`ml-2 font-semibold ${orderSearchResult.delivery_staff ? 'text-green-600' : 'text-red-600'}`}>
                                                                {orderSearchResult.delivery_staff || 'Chưa được gán'}
                                                            </span>
                                                        </div>
                                                        {orderSearchResult.delivery_staff && (
                                                            <div className="col-span-2 text-xs text-green-700 bg-green-100 p-2 rounded">
                                                                ✅ Đơn hàng đã được gán cho: <strong>{orderSearchResult.delivery_staff}</strong>
                                                            </div>
                                                        )}
                                                        {!orderSearchResult.delivery_staff && (
                                                            <div className="col-span-2 text-xs text-orange-700 bg-orange-100 p-2 rounded">
                                                                ⚠️ Đơn hàng chưa được gán NV vận đơn. Có thể do:
                                                                <ul className="list-disc list-inside mt-1 space-y-1">
                                                                    {!orderSearchResult.team && <li>Không có Team (cần Team = HCM hoặc Hà Nội)</li>}
                                                                    {orderSearchResult.country && (orderSearchResult.country.toLowerCase().includes('nhật') || orderSearchResult.country.toLowerCase().includes('nhat')) && <li>Country = Nhật Bản (bị loại trừ)</li>}
                                                                    {orderSearchResult.team && !['hcm', 'hà nội', 'ha noi', 'hanoi'].includes(orderSearchResult.team.toLowerCase().trim()) && <li>Team không phải HCM/Hà Nội: "{orderSearchResult.team}"</li>}
                                                                    {orderSearchResult.team && ['hcm', 'hà nội', 'ha noi', 'hanoi'].includes(orderSearchResult.team.toLowerCase().trim()) && !orderSearchResult.country?.toLowerCase().includes('nhật') && <li>Đơn này đủ điều kiện để chia, có thể chạy lại "Chia đơn vận đơn"</li>}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <h3 className="font-semibold text-gray-700">Chia đơn vận đơn</h3>
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                                    <p className="text-xs text-gray-700 mb-2"><strong>Logic chia đơn vận đơn:</strong></p>
                                    <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                                        <li>Lọc nhân viên có trạng thái "U1" từ danh sách vận đơn</li>
                                        <li>Phân loại theo chi nhánh (HCM và Hà Nội)</li>
                                        <li>Sử dụng lastIndex để đảm bảo tính công bằng (chia đều, bắt đầu từ vị trí tiếp theo)</li>
                                        <li>Lọc đơn: delivery_staff trống, loại trừ "Nhật Bản" và "CĐ Nhật Bản"</li>
                                        <li>Chia đều cho nhân viên theo Team tương ứng</li>
                                    </ol>
                                </div>
                                <button
                                    onClick={handleChiaDonVanDon}
                                    disabled={autoAssignLoading}
                                    className="w-full bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {autoAssignLoading ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Đang xử lý...
                                        </>
                                    ) : (
                                        <>
                                            <Package className="w-5 h-5" />
                                            Chia đơn vận đơn
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Đồng bộ team */}
                        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 mb-6">
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Đồng bộ team</h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                                    <p className="text-xs text-blue-700 mb-2"><strong>ℹ️ Thông tin:</strong></p>
                                    <ul className="list-disc list-inside space-y-1 text-xs text-blue-600">
                                        <li>Đồng bộ team dựa trên tên nhân viên từ bảng users</li>
                                        <li>Cập nhật team trong các bảng: orders, detail_reports, reports</li>
                                        <li>Khớp theo tên trong các trường: sale_staff, cskh, delivery_staff, owner</li>
                                        <li>Team sẽ được lấy từ bảng users dựa trên name tương ứng</li>
                                    </ul>
                                </div>
                                <button
                                    onClick={handleSyncTeam}
                                    disabled={syncTeamLoading}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {syncTeamLoading ? (
                                        <>
                                            <RefreshCw className="w-5 h-5 animate-spin" />
                                            Đang đồng bộ...
                                        </>
                                    ) : (
                                        <>
                                            <RefreshCw className="w-5 h-5" />
                                            Đồng bộ team
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Results */}
                        {autoAssignResult && (
                            <div className={`border rounded-lg p-4 ${autoAssignResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                <h3 className={`font-semibold mb-2 ${autoAssignResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                    {autoAssignResult.success ? '✅ Thành công' : '❌ Lỗi'}
                                </h3>
                                <pre className="text-sm whitespace-pre-wrap overflow-auto max-h-96">
                                    {autoAssignResult.message}
                                </pre>
                            </div>
                        )}

                        {/* Hiển thị danh sách đơn không được chia */}
                        {notDividedOrders.length > 0 && (
                            <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200 mt-4">
                                <h3 className="font-semibold mb-3 text-yellow-800">
                                    ⚠️ Danh sách đơn không được chia ({notDividedOrders.length} đơn)
                                </h3>

                                {/* Bảng danh sách */}
                                <div className="overflow-x-auto mb-4">
                                    <table className="min-w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-yellow-100">
                                                <th className="border border-yellow-300 px-3 py-2 text-left font-semibold">Mã đơn</th>
                                                <th className="border border-yellow-300 px-3 py-2 text-left font-semibold">Team</th>
                                                <th className="border border-yellow-300 px-3 py-2 text-left font-semibold">Country</th>
                                                <th className="border border-yellow-300 px-3 py-2 text-left font-semibold">Delivery Staff</th>
                                                <th className="border border-yellow-300 px-3 py-2 text-left font-semibold">Lý do</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {notDividedOrders.map((order, idx) => (
                                                <tr key={idx} className="hover:bg-yellow-50">
                                                    <td className="border border-yellow-300 px-3 py-2 font-mono text-xs">
                                                        {order.order_code || '(không có)'}
                                                    </td>
                                                    <td className="border border-yellow-300 px-3 py-2">
                                                        {order.team || '(null/empty)'}
                                                    </td>
                                                    <td className="border border-yellow-300 px-3 py-2">
                                                        {order.country || '(null/empty)'}
                                                    </td>
                                                    <td className="border border-yellow-300 px-3 py-2">
                                                        {order.delivery_staff || '(null/empty)'}
                                                    </td>
                                                    <td className="border border-yellow-300 px-3 py-2 text-xs">
                                                        {order.reason || 'Không xác định'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Danh sách mã đơn hàng để copy */}
                                <div className="mt-4">
                                    <h4 className="font-semibold text-yellow-800 mb-2">📋 Danh sách mã đơn hàng (để copy):</h4>
                                    <div className="bg-white border border-yellow-300 rounded p-3 mb-2">
                                        <code className="text-xs break-all">
                                            {notDividedOrders.map(o => o.order_code).filter(Boolean).join(', ')}
                                        </code>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const orderCodes = notDividedOrders.map(o => o.order_code).filter(Boolean).join(', ');
                                            navigator.clipboard.writeText(orderCodes);
                                            toast.success('Đã copy danh sách mã đơn hàng!');
                                        }}
                                        className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                                    >
                                        📋 Copy danh sách mã đơn
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB CONTENT: ACCOUNT MANAGEMENT */}
            {activeTab === 'account_management' && (
                <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Key className="w-6 h-6 text-blue-600" />
                            Quản lý tài khoản đăng nhập và mật khẩu
                        </h2>
                        <p className="text-sm text-gray-600 mt-2">
                            Quản lý tài khoản đăng nhập, mật khẩu và lịch sử đăng nhập của người dùng
                        </p>
                    </div>

                    <div className="p-6">
                        {/* Action Buttons */}
                        <div className="flex gap-3 mb-6">
                            <button
                                onClick={loadAuthAccounts}
                                disabled={accountLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <RefreshCw className={`w-4 h-4 ${accountLoading ? 'animate-spin' : ''}`} />
                                Tải lại danh sách
                            </button>
                            <button
                                onClick={() => {
                                    setAccountForm({
                                        email: '',
                                        username: '',
                                        name: '',
                                        password: '',
                                        user_id: '',
                                        role: 'user',
                                        team: '',
                                        department: '',
                                        status: 'active',
                                        must_change_password: false
                                    });
                                    setSelectedAccount(null);
                                    setShowAccountModal(true);
                                }}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
                            >
                                <Users className="w-4 h-4" />
                                Tạo tài khoản mới
                            </button>
                        </div>

                        {/* Accounts List */}
                        {accountLoading ? (
                            <div className="text-center py-8">
                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                                <p className="mt-2 text-gray-600">Đang tải danh sách tài khoản...</p>
                            </div>
                        ) : authAccounts.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>Chưa có tài khoản nào. Nhấn "Tạo tài khoản mới" để bắt đầu.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse border border-gray-300">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Email</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Username</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Tên</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Password</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Role</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Team</th>
                                            <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Đẩy FFM</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Trạng thái</th>
                                            <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Thao tác</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {authAccounts.map((account) => (
                                            <tr key={account.id} className="hover:bg-gray-50">
                                                <td className="border border-gray-300 px-4 py-3">{account.email}</td>
                                                <td className="border border-gray-300 px-4 py-3">{account.username || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">{account.name || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {showPasswords[account.id] ? (
                                                            <>
                                                                <input
                                                                    type="text"
                                                                    value={passwordInputs[account.id] !== undefined ? passwordInputs[account.id] : (account.password ? '••••••••' : '')}
                                                                    onChange={(e) => setPasswordInputs({ ...passwordInputs, [account.id]: e.target.value })}
                                                                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                                                                    placeholder="Nhập mật khẩu mới"
                                                                />
                                                                <button
                                                                    onClick={async () => {
                                                                        const newPassword = passwordInputs[account.id];
                                                                        if (newPassword && newPassword.trim()) {
                                                                            const bcrypt = await import('bcryptjs');
                                                                            const passwordHash = bcrypt.default.hashSync(newPassword, 10);
                                                                            const { error } = await supabase
                                                                                .from('users')
                                                                                .update({ password: passwordHash })
                                                                                .eq('id', account.id);
                                                                            if (error) {
                                                                                toast.error('Lỗi: ' + error.message);
                                                                            } else {
                                                                                toast.success('Đã cập nhật mật khẩu!');
                                                                                loadAuthAccounts();
                                                                                setShowPasswords({ ...showPasswords, [account.id]: false });
                                                                                delete passwordInputs[account.id];
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                                                                    title="Lưu mật khẩu"
                                                                >
                                                                    <Save className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-gray-600">
                                                                    {account.has_password ? '••••••••' : 'Chưa có'}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowPasswords({ ...showPasswords, [account.id]: true });
                                                                        setPasswordInputs({ ...passwordInputs, [account.id]: '' });
                                                                    }}
                                                                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                                                    title="Đặt mật khẩu"
                                                                >
                                                                    <Key className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setShowPasswords({ ...showPasswords, [account.id]: !showPasswords[account.id] });
                                                                if (showPasswords[account.id]) {
                                                                    const newInputs = { ...passwordInputs };
                                                                    delete newInputs[account.id];
                                                                    setPasswordInputs(newInputs);
                                                                }
                                                            }}
                                                            className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                                                            title={showPasswords[account.id] ? 'Hủy' : 'Sửa mật khẩu'}
                                                        >
                                                            {showPasswords[account.id] ? <X className="w-3 h-3" /> : <Settings className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${account.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                                        account.role === 'leader' ? 'bg-blue-100 text-blue-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {account.role || 'user'}
                                                    </span>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">{account.team || '-'}</td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <label className="flex items-center justify-center cursor-pointer group">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={account.can_day_ffm === true}
                                                                onChange={async (e) => {
                                                                    const newValue = e.target.checked;
                                                                    try {
                                                                        const { error } = await supabase
                                                                            .from('users')
                                                                            .update({ can_day_ffm: newValue })
                                                                            .eq('id', account.id);

                                                                        if (error) {
                                                                            toast.error('Lỗi cập nhật quyền đẩy FFM: ' + error.message);
                                                                        } else {
                                                                            toast.success(newValue ? 'Đã cấp quyền đẩy FFM' : 'Đã thu hồi quyền đẩy FFM');
                                                                            loadAuthAccounts(); // Reload để cập nhật UI
                                                                        }
                                                                    } catch (err) {
                                                                        toast.error('Lỗi: ' + err.message);
                                                                    }
                                                                }}
                                                                className="sr-only"
                                                            />
                                                            <div className={`
                                                                w-11 h-6 rounded-full transition-all duration-200 ease-in-out
                                                                ${account.can_day_ffm
                                                                    ? 'bg-green-500'
                                                                    : 'bg-gray-300'
                                                                }
                                                                group-hover:opacity-80
                                                            `}>
                                                                <div className={`
                                                                    w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out
                                                                    ${account.can_day_ffm
                                                                        ? 'translate-x-5'
                                                                        : 'translate-x-0.5'
                                                                    }
                                                                    mt-0.5
                                                                `}></div>
                                                            </div>
                                                        </div>
                                                        <span className={`ml-2 text-xs font-medium ${account.can_day_ffm ? 'text-green-700' : 'text-gray-500'
                                                            }`}>
                                                            {account.can_day_ffm ? 'Có' : 'Không'}
                                                        </span>
                                                    </label>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${account.status === 'active' ? 'bg-green-100 text-green-800' :
                                                        account.status === 'locked' ? 'bg-red-100 text-red-800' :
                                                            account.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                                                                'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {account.has_password ? 'Có mật khẩu' : 'Chưa có mật khẩu'}
                                                    </span>
                                                </td>
                                                <td className="border border-gray-300 px-4 py-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleViewLoginHistory(account.id)}
                                                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                                            title="Xem lịch sử đăng nhập"
                                                        >
                                                            <Clock className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleEditAccount(account)}
                                                            className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
                                                            title="Sửa tài khoản"
                                                        >
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                        {account.has_password ? (
                                                            <button
                                                                onClick={() => handleLockAccount(account.id)}
                                                                className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                                                                title="Vô hiệu hóa tài khoản (xóa mật khẩu)"
                                                            >
                                                                <Lock className="w-4 h-4" />
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleUnlockAccount(account.id)}
                                                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                                                                title="Kích hoạt tài khoản (set mật khẩu)"
                                                            >
                                                                <Lock className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Account Modal */}
                        {showAccountModal && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold text-gray-800">
                                            {selectedAccount ? 'Sửa tài khoản' : 'Tạo tài khoản mới'}
                                        </h3>
                                        <button
                                            onClick={() => {
                                                setShowAccountModal(false);
                                                setSelectedAccount(null);
                                            }}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Email <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                value={accountForm.email}
                                                onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="user@example.com"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Username <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.username}
                                                onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="username"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Tên <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.name}
                                                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Họ và tên"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Mật khẩu {selectedAccount ? '(để trống nếu không đổi)' : <span className="text-red-500">*</span>}
                                            </label>
                                            <input
                                                type="password"
                                                value={accountForm.password}
                                                onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder={selectedAccount ? 'Nhập mật khẩu mới (nếu muốn đổi)' : 'Nhập mật khẩu'}
                                                required={!selectedAccount}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Role
                                            </label>
                                            <select
                                                value={accountForm.role}
                                                onChange={(e) => setAccountForm({ ...accountForm, role: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value="user">User</option>
                                                <option value="leader">Leader</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Team
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.team}
                                                onChange={(e) => setAccountForm({ ...accountForm, team: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="HCM, Hà Nội, ..."
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Department
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.department}
                                                onChange={(e) => setAccountForm({ ...accountForm, department: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="Marketing, Sales, CSKH, ..."
                                            />
                                        </div>

                                        <div className="flex gap-3 pt-4">
                                            <button
                                                onClick={handleSaveAccount}
                                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                                            >
                                                {selectedAccount ? 'Cập nhật' : 'Tạo mới'}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setShowAccountModal(false);
                                                    setSelectedAccount(null);
                                                }}
                                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
                                            >
                                                Hủy
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Login History Modal */}
                        {showLoginHistory && (
                            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                                <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-xl font-bold text-gray-800">Lịch sử đăng nhập</h3>
                                        <button
                                            onClick={() => setShowLoginHistory(false)}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {loginHistory.length === 0 ? (
                                        <p className="text-gray-500 text-center py-8">Chưa có lịch sử đăng nhập</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full border-collapse border border-gray-300">
                                                <thead>
                                                    <tr className="bg-gray-100">
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Thời gian</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Trạng thái</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">IP</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Thiết bị</th>
                                                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Lý do</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {loginHistory.map((history) => (
                                                        <tr key={history.id} className="hover:bg-gray-50">
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">
                                                                {new Date(history.login_at).toLocaleString('vi-VN')}
                                                            </td>
                                                            <td className="border border-gray-300 px-4 py-2">
                                                                <span className={`px-2 py-1 rounded text-xs font-medium ${history.status === 'success' ? 'bg-green-100 text-green-800' :
                                                                    history.status === 'failed' ? 'bg-red-100 text-red-800' :
                                                                        'bg-yellow-100 text-yellow-800'
                                                                    }`}>
                                                                    {history.status === 'success' ? 'Thành công' :
                                                                        history.status === 'failed' ? 'Thất bại' :
                                                                            history.status}
                                                                </span>
                                                            </td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">{history.login_ip || '-'}</td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm">{history.user_agent || '-'}</td>
                                                            <td className="border border-gray-300 px-4 py-2 text-sm text-red-600">{history.failure_reason || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminTools;
