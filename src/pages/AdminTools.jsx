import JSZip from 'jszip';
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, CheckCircle, Clock, Database, Download, FileJson, GitCompare, Globe, Package, RefreshCw, Save, Search, Settings, Shield, Table, Tag, Trash2, Upload, Users } from 'lucide-react';
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
    const [productSuggestions, setProductSuggestions] = useState([]); // Suggested from DB history
    const [availableMarkets, setAvailableMarkets] = useState([]); // Managed + Suggested markets for autocomplete
    const [loadingData, setLoadingData] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingSettings, setLoadingSettings] = useState(false);

    // --- AUTO ASSIGN STATE ---
    const [autoAssignLoading, setAutoAssignLoading] = useState(false);
    const [autoAssignResult, setAutoAssignResult] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState('Hà Nội');
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [cskhStaff, setCskhStaff] = useState([]);

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
        fetchReferenceData();
    }, []);

    const AVAILABLE_TABLES = [
        // SALES
        { id: 'sale_orders', name: 'Danh sách đơn (Sale)', desc: 'Danh sách đơn hàng của bộ phận Sale' },
        { id: 'sale_reports', name: 'Xem báo cáo (Sale)', desc: 'Dữ liệu báo cáo doanh số Sale' },

        // LOGISTICS (Vận đơn)
        { id: 'delivery_orders', name: 'Quản lý vận đơn', desc: 'Danh sách vận đơn (Delivery)' },
        { id: 'delivery_reports', name: 'Báo cáo vận đơn', desc: 'Dữ liệu báo cáo vận đơn' },

        // MARKETING
        { id: 'mkt_orders', name: 'Danh sách đơn (MKT)', desc: 'Danh sách đơn hàng Marketing' },
        { id: 'mkt_reports', name: 'Xem báo cáo (MKT)', desc: 'Báo cáo chi tiết Marketing (detail_reports)' },

        // CSKH (Customer Service)
        { id: 'cskh_all', name: 'Danh sách đơn (CSKH)', desc: 'Toàn bộ đơn hàng (Dùng cho CSKH)' },
        { id: 'cskh_money', name: 'Đơn đã thu tiền/cần CS (CSKH)', desc: 'Đơn hàng có trạng thái thu tiền/cần xử lý' },
        { id: 'cskh_report', name: 'Xem báo cáo CSKH', desc: 'Dữ liệu nguồn cho báo cáo CSKH' },
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

    const fetchSettingsFromSupabase = async () => {
        setLoadingSettings(true);
        try {
            const { data, error } = await supabase
                .from('system_settings')
                .select('*')
                .eq('id', GLOBAL_SETTINGS_ID)
                .single();

            if (data && data.settings) {
                setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
            }
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
                .select('product_name_1, product_main, area, city')
                .limit(1000); // Sample data

            if (error) throw error;

            if (data) {
                const products = new Set();
                const markets = new Set();
                data.forEach(r => {
                    if (r.product_main) products.add(r.product_main);
                    if (r.product_name_1) products.add(r.product_name_1);
                    if (r.area) markets.add(r.area);
                });

                // Merge with defaults to ensure basic list exists
                ["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"].forEach(p => products.add(p));
                ["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"].forEach(m => markets.add(m));

                setProductSuggestions(Array.from(products).sort());
                setAvailableMarkets(Array.from(markets).sort());
            }
        } catch (err) {
            console.error("Error fetching ref data", err);
            // Fallback
            setProductSuggestions(["Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body", "Glutathione Collagen NEW", "DG", "Dragon Blood Cream"]);
            setAvailableMarkets(["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh"]);
        } finally {
            setLoadingData(false);
        }
    };

    const handleSaveSettings = async () => {
        setLoadingSettings(true);
        try {
            // Save to LocalStorage as backup/cache
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

            // Save to Supabase
            const { error } = await supabase
                .from('system_settings')
                .upsert({
                    id: GLOBAL_SETTINGS_ID,
                    settings: settings,
                    updated_at: new Date().toISOString(),
                    updated_by: userEmail
                });

            if (error) {
                // If the table doesn't exist, we might get an error.
                // We will inform the user.
                throw error;
            }

            toast.success("✅ Đã lưu cấu hình lên Server thành công!");
            window.dispatchEvent(new Event('storage'));
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
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('*')
                .eq('team', selectedTeam)
                .eq('accountant_confirm', 'Đã thu tiền')
                .gte('order_date', startDate.toISOString().split('T')[0])
                .lte('order_date', endDate.toISOString().split('T')[0]);

            if (ordersError) throw ordersError;

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

    // --- CHIA ĐƠN VẬN ĐƠN ---
    const handleChiaDonVanDon = async () => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);

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

            if (vanDonError) throw vanDonError;

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

            // Lọc nhân viên có trạng thái "U1"
            const nhanVienU1 = usersList.filter(user => {
                const name = user.name;
                const vanDonInfo = vanDonMap[name];
                return vanDonInfo && vanDonInfo.trang_thai_chia === 'U1';
            });

            if (nhanVienU1.length === 0) {
                throw new Error('Không có nhân viên nào có trạng thái U1');
            }

            // Bước 3: Phân loại nhân viên theo chi nhánh (ưu tiên từ danh_sach_van_don, fallback về users.branch)
            const nhanVienHCM = [];
            const nhanVienHaNoi = [];

            nhanVienU1.forEach(user => {
                const name = user.name;
                const vanDonInfo = vanDonMap[name];
                const chiNhanh = vanDonInfo?.chi_nhanh || user.branch || '';

                if (chiNhanh === 'HCM') {
                    nhanVienHCM.push(name);
                } else if (chiNhanh === 'Hà Nội') {
                    nhanVienHaNoi.push(name);
                }
            });

            if (nhanVienHCM.length === 0 && nhanVienHaNoi.length === 0) {
                throw new Error('Không có nhân viên U1 nào thuộc HCM hoặc Hà Nội');
            }

            // Bước 3: Lấy lastIndex từ localStorage
            const lastIndexKey = 'van_don_last_index';
            const lastIndexData = localStorage.getItem(lastIndexKey);
            let lastIndexHCM = 0;
            let lastIndexHaNoi = 0;

            if (lastIndexData) {
                try {
                    const parsed = JSON.parse(lastIndexData);
                    lastIndexHCM = parsed.hcm || 0;
                    lastIndexHaNoi = parsed.hanoi || 0;
                } catch (e) {
                    console.warn('Error parsing lastIndex:', e);
                }
            }

            // Bước 4: Lọc đơn hàng cần chia
            const { data: allOrders, error: ordersError } = await supabase
                .from('orders')
                .select('*');

            if (ordersError) throw ordersError;

            // Lọc: delivery_staff trống, loại trừ "Nhật Bản" và "CĐ Nhật Bản"
            const ordersHCM = [];
            const ordersHaNoi = [];

            allOrders?.forEach(order => {
                const deliveryStaff = order.delivery_staff?.toString().trim() || '';
                const country = order.country?.toString().trim() || '';
                const team = order.team?.toString().trim() || '';

                // Chỉ chia cho đơn có delivery_staff trống
                if (deliveryStaff !== '') return;

                // Loại trừ "Nhật Bản" và "CĐ Nhật Bản"
                if (country === 'Nhật Bản' || country === 'CĐ Nhật Bản') return;

                // Phân loại theo Team
                if (team === 'HCM') {
                    ordersHCM.push(order);
                } else if (team === 'Hà Nội') {
                    ordersHaNoi.push(order);
                }
            });

            // Bước 5: Chia đơn cho nhân viên
            const updates = [];
            let currentIndexHCM = lastIndexHCM;
            let currentIndexHaNoi = lastIndexHaNoi;

            // Chia đơn HCM
            if (nhanVienHCM.length > 0) {
                ordersHCM.forEach(order => {
                    const selectedStaff = nhanVienHCM[currentIndexHCM % nhanVienHCM.length];
                    updates.push({
                        order_code: order.order_code,
                        delivery_staff: selectedStaff
                    });
                    currentIndexHCM++;
                });
            }

            // Chia đơn Hà Nội
            if (nhanVienHaNoi.length > 0) {
                ordersHaNoi.forEach(order => {
                    const selectedStaff = nhanVienHaNoi[currentIndexHaNoi % nhanVienHaNoi.length];
                    updates.push({
                        order_code: order.order_code,
                        delivery_staff: selectedStaff
                    });
                    currentIndexHaNoi++;
                });
            }

            // Bước 6: Cập nhật database
            if (updates.length > 0) {
                const CHUNK_SIZE = 50;
                for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                    const chunk = updates.slice(i, i + CHUNK_SIZE);
                    const updatePromises = chunk.map(update => 
                        supabase
                            .from('orders')
                            .update({ delivery_staff: update.delivery_staff })
                            .eq('order_code', update.order_code)
                    );
                    await Promise.all(updatePromises);
                }

                // Lưu lastIndex mới
                localStorage.setItem(lastIndexKey, JSON.stringify({
                    hcm: currentIndexHCM,
                    hanoi: currentIndexHaNoi
                }));
            }

            const message = `✅ Chia đơn vận đơn thành công!\n\n` +
                `- Nhân viên HCM (U1): ${nhanVienHCM.length} người\n` +
                `- Nhân viên Hà Nội (U1): ${nhanVienHaNoi.length} người\n` +
                `- Đơn HCM đã chia: ${ordersHCM.length} đơn\n` +
                `- Đơn Hà Nội đã chia: ${ordersHaNoi.length} đơn\n` +
                `- Tổng đơn đã chia: ${updates.length} đơn\n\n` +
                `- LastIndex HCM: ${currentIndexHCM}\n` +
                `- LastIndex Hà Nội: ${currentIndexHaNoi}`;

            setAutoAssignResult({ success: true, message });
            toast.success(`Đã chia ${updates.length} đơn vận đơn!`);
        } catch (error) {
            console.error('Error in handleChiaDonVanDon:', error);
            setAutoAssignResult({ success: false, message: `Lỗi: ${error.message}` });
            toast.error('Lỗi chia đơn vận đơn: ' + error.message);
        } finally {
            setAutoAssignLoading(false);
        }
    };

    // Ensure products in settings are always visible in the list, even if not in history
    const displayedProducts = Array.from(new Set([
        ...(settings.normalProducts || []),
        ...settings.rndProducts,
        ...settings.keyProducts
    ])).filter(p => p.toLowerCase().includes(searchQuery.toLowerCase())).sort();

    if (!canView('ADMIN_TOOLS')) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này (ADMIN_TOOLS).</div>;
    }

    return (
        <div className="p-6 max-w-6xl mx-auto min-h-screen bg-gray-50">
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
                                            {settings.dataSource === 'test' && (
                                                <button
                                                    onClick={handleSwitchToProd}
                                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow flex items-center gap-2 animate-pulse"
                                                >
                                                    <CheckCircle size={16} />
                                                    Chuyển sang Chế độ PRODUCTION
                                                </button>
                                            )}
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
                        {/* 0. DATA SOURCE MODE */}
                        {isSectionVisible('Chế độ Dữ liệu', ['environment', 'testing', 'production', 'dữ liệu']) && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2 mb-2">
                                    <Database className="w-5 h-5" />
                                    0. Chế độ Dữ liệu (Environment)
                                </h3>
                                <div className="flex items-center gap-4">
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            className="form-radio text-blue-600 w-5 h-5"
                                            name="dataSource"
                                            value="prod"
                                            checked={settings.dataSource !== 'test'}
                                            onChange={() => setSettings({ ...settings, dataSource: 'prod' })}
                                        />
                                        <span className="ml-2 font-medium">Production (Dữ liệu Thật)</span>
                                    </label>
                                    <label className="inline-flex items-center">
                                        <input
                                            type="radio"
                                            className="form-radio text-orange-500 w-5 h-5 "
                                            name="dataSource"
                                            value="test"
                                            checked={settings.dataSource === 'test'}
                                            onChange={() => setSettings({ ...settings, dataSource: 'test' })}
                                        />
                                        <span className="ml-2 font-medium text-orange-600">Testing (Dữ liệu Thử nghiệm)</span>
                                    </label>
                                </div>
                                <p className="text-xs text-blue-600 mt-2">
                                    <strong>Lưu ý:</strong> Chế độ Testing sẽ sử dụng nguồn dữ liệu riêng để không ảnh hưởng đến báo cáo thật.
                                </p>
                            </div>
                        )}
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
                                                {displayedProducts.map((product, index) => {
                                                    const isRnd = settings.rndProducts.includes(product);
                                                    const isKey = settings.keyProducts.includes(product);
                                                    let currentType = 'normal';
                                                    if (isRnd) currentType = 'test';
                                                    else if (isKey) currentType = 'key';

                                                    return (
                                                        <tr key={product} className="hover:bg-gray-50">
                                                            <td className="px-4 py-2 text-center text-gray-500">{index + 1}</td>
                                                            <td className="px-4 py-2 font-medium">{product}</td>
                                                            <td className="px-4 py-2">
                                                                <select
                                                                    value={currentType}
                                                                    onChange={(e) => {
                                                                        const newType = e.target.value;
                                                                        setSettings(prev => {
                                                                            let newNormal = (prev.normalProducts || []).filter(p => p !== product);
                                                                            let newRnd = prev.rndProducts.filter(p => p !== product);
                                                                            let newKey = prev.keyProducts.filter(p => p !== product);

                                                                            if (newType === 'normal') newNormal.push(product);
                                                                            if (newType === 'test') newRnd.push(product);
                                                                            if (newType === 'key') newKey.push(product);

                                                                            return { ...prev, normalProducts: newNormal, rndProducts: newRnd, keyProducts: newKey };
                                                                        });
                                                                    }}
                                                                    className={`w-full text-xs py-1 px-2 rounded border focus:outline-none focus:ring-2 
                                                                    ${currentType === 'test' ? 'bg-purple-50 text-purple-700 border-purple-200 focus:ring-purple-500' :
                                                                            currentType === 'key' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 focus:ring-indigo-500' :
                                                                                'bg-white text-gray-700 border-gray-300 focus:ring-gray-500'}`}
                                                                >
                                                                    <option value="normal">SP thường</option>
                                                                    <option value="test">SP Test (R&D)</option>
                                                                    <option value="key">SP Trọng điểm</option>
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-2 text-center">
                                                                <button
                                                                    onClick={() => {
                                                                        if (window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product}" khỏi danh sách?`)) {
                                                                            setSettings(prev => ({
                                                                                ...prev,
                                                                                normalProducts: (prev.normalProducts || []).filter(p => p !== product),
                                                                                rndProducts: prev.rndProducts.filter(p => p !== product),
                                                                                keyProducts: prev.keyProducts.filter(p => p !== product)
                                                                            }));
                                                                        }
                                                                    }}
                                                                    className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Add Product Footer */}
                                    <div className="bg-gray-50 p-3 border-t flex gap-2">
                                        <input
                                            type="text"
                                            list="product-suggestions"
                                            placeholder="Nhập tên sản phẩm mới..."
                                            className="flex-1 text-sm border-gray-300 rounded px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const val = e.target.value.trim();
                                                    if (val && !displayedProducts.includes(val)) {
                                                        setSettings(prev => ({
                                                            ...prev,
                                                            normalProducts: [...(prev.normalProducts || []), val].sort()
                                                        }));
                                                        e.target.value = '';
                                                    } else if (displayedProducts.includes(val)) {
                                                        toast.warning('Sản phẩm này đã có trong danh sách!');
                                                    }
                                                }
                                            }}
                                            id="new-product-input"
                                        />
                                        <datalist id="product-suggestions">
                                            {productSuggestions.map(p => <option key={p} value={p} />)}
                                        </datalist>
                                        <button
                                            onClick={() => {
                                                const input = document.getElementById('new-product-input');
                                                const val = input.value.trim();
                                                if (val && !displayedProducts.includes(val)) {
                                                    setSettings(prev => ({
                                                        ...prev,
                                                        normalProducts: [...(prev.normalProducts || []), val].sort()
                                                    }));
                                                    input.value = '';
                                                    toast.success('Đã thêm sản phẩm mới');
                                                } else if (displayedProducts.includes(val)) {
                                                    toast.warning('Sản phẩm này đã có trong danh sách!');
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
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminTools;
