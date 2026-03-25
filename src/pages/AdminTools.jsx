import JSZip from 'jszip';
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, CheckCircle, Clock, CloudUpload, Database, Download, FileJson, GitCompare, Globe, Key, Lock, Package, RefreshCw, Save, Search, Settings, Shield, Table, Tag, Trash2, Upload, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import PermissionManager from '../components/admin/PermissionManager';
import usePermissions from '../hooks/usePermissions';
import { performEndOfShiftSnapshot } from '../services/snapshotService';
import { recalcMktSoDonThucTeFromOrders } from '../services/mktRecalcSoDonThucTeFromOrders';
import {
    recalcSaleOrderCountFromOrders,
    SALES_REPORTS_AUTO_CREATE_MISSING_ROWS,
} from '../services/saleRecalcOrderCountFromOrders';
import { supabase } from '../supabase/config';
import * as ApiService from '../services/api';

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

const CURRENCY_OPTIONS = [
    { key: 'usd', label: 'USD', symbol: '$' },
    { key: 'jpy', label: 'JPY (YEN)', symbol: '¥' },
    { key: 'cad', label: 'CAD', symbol: 'C$' },
    { key: 'aud', label: 'AUD', symbol: 'A$' },
    { key: 'gbp', label: 'GBP', symbol: '£' },
    { key: 'krw', label: 'KRW', symbol: '₩' },
];

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
    const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'upload_download' | 'permissions' | 'auto_assign' | 'account_management'

    // --- MAINTENANCE STATE ---
    const [loading, setLoading] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState(null);
    const [lastSnapshot, setLastSnapshot] = useState(null);
    const userEmail = localStorage.getItem('userEmail') || 'unknown';

    // MKT recalculation
    const [mktRecalcLoading, setMktRecalcLoading] = useState(false);
    const [mktRecalcStartDate, setMktRecalcStartDate] = useState(() => {
        const today = new Date();
        const d = new Date(today);
        d.setDate(d.getDate() - 30);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [mktRecalcEndDate, setMktRecalcEndDate] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [mktRecalcResult, setMktRecalcResult] = useState(null);

    // Sale reports: order_count từ orders (sale_staff)
    const [saleRecalcLoading, setSaleRecalcLoading] = useState(false);
    const [saleRecalcStartDate, setSaleRecalcStartDate] = useState(() => {
        const today = new Date();
        const d = new Date(today);
        d.setDate(d.getDate() - 30);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [saleRecalcEndDate, setSaleRecalcEndDate] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [saleRecalcResult, setSaleRecalcResult] = useState(null);

    // --- SETTINGS STATE ---
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [productSuggestions, setProductSuggestions] = useState([]); // Suggested from DB history (loại bỏ các SP đã có trong DB)
    const [availableMarkets, setAvailableMarkets] = useState([]); // Managed + Suggested markets for autocomplete
    const [loadingData, setLoadingData] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingSettings, setLoadingSettings] = useState(false);

    // State để lưu danh sách sản phẩm từ database (bảng system_settings với 2 cột)
    const [dbProducts, setDbProducts] = useState([]); // [{id, name, type}, ...]

    // --- EXCHANGE RATES (TỶ GIÁ) STATE ---
    const [exchangeRates, setExchangeRates] = useState([]); // [{id, ti_gia, gia_tri}, ...]
    const [exchangeLoading, setExchangeLoading] = useState(false);
    const [exchangeSaving, setExchangeSaving] = useState(false);
    const [syncMktTeamLoading, setSyncMktTeamLoading] = useState(false);
    const [editingRateId, setEditingRateId] = useState(null); // ID của dòng đang được edit
    const [editValues, setEditValues] = useState({}); // {rateId: {ti_gia: '', gia_tri: ''}} để lưu giá trị đang edit

    // --- AUTO ASSIGN STATE ---
    const [autoAssignLoading, setAutoAssignLoading] = useState(false);
    const [autoAssignResult, setAutoAssignResult] = useState(null);
    const [notDividedOrders, setNotDividedOrders] = useState([]); // Danh sách đơn không được chia
    const [selectedTeam, setSelectedTeam] = useState('Hà Nội');
    const [stepLogs, setStepLogs] = useState([]); // Log từng bước để hiển thị trong UI
    
    // --- AUTO CHIA ĐƠN VẬN ĐƠN THEO GIỜ CHẴN ---
    const [autoChiaDonEnabled, setAutoChiaDonEnabled] = useState(() => {
        const saved = localStorage.getItem('autoChiaDonEnabled');
        return saved === 'true';
    });
    const [lastAutoChiaHour, setLastAutoChiaHour] = useState(null); // Lưu giờ cuối cùng đã chạy

    // --- VIEW CHIA ĐƠN VẬN ĐƠN ---
    const [chiaDonViewDate, setChiaDonViewDate] = useState(() => {
        const now = new Date();
        return now.toISOString().slice(0, 10); // YYYY-MM-DD
    });
    const [chiaDonViewLoading, setChiaDonViewLoading] = useState(false);
    const [chiaDonViewOrders, setChiaDonViewOrders] = useState([]);

    // --- CLEAR NV VẬN ĐƠN THEO ORDER_DATE ---
    const [clearOrderDate, setClearOrderDate] = useState('');

    // --- ORDER SEARCH STATE ---
    const [orderSearchCode, setOrderSearchCode] = useState('');
    const [orderSearchResult, setOrderSearchResult] = useState(null);
    const [orderSearchLoading, setOrderSearchLoading] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [cskhStaff, setCskhStaff] = useState([]);

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
        branch: '',
        department: '',
        status: 'active',
        must_change_password: false
    });
    const [loginHistory, setLoginHistory] = useState([]);
    const [showLoginHistory, setShowLoginHistory] = useState(false);
    const [showPasswords, setShowPasswords] = useState({}); // Track which passwords are visible
    const [passwordInputs, setPasswordInputs] = useState({}); // Store password inputs for quick edit
    const [nameSearchQuery, setNameSearchQuery] = useState(''); // Search query for account name

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
        { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings, keywords: ['cài đặt', 'cấu hình', 'setting', 'sản phẩm', 'product', 'thị trường', 'market', 'ngưỡng', 'threshold', 'chỉ số'] },
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

    // Auto-load accounts when entering account management tab
    useEffect(() => {
        if (activeTab === 'account_management' && authAccounts.length === 0 && !accountLoading) {
            loadAuthAccounts();
        }
    }, [activeTab]);

    // Auto-load exchange rates when entering settings tab
    useEffect(() => {
        if (activeTab === 'settings' && exchangeRates.length === 0 && !exchangeLoading) {
            loadExchangeRates();
        }
    }, [activeTab]);

    // --- TỰ ĐỘNG CHIA ĐƠN VẬN ĐƠN VÀO GIỜ CHẴN ---
    useEffect(() => {
        if (!autoChiaDonEnabled) return;

        const checkAndRunAutoChia = () => {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            // Chỉ chạy vào phút 0 của mỗi giờ (ví dụ: 1:00, 2:00, 3:00...)
            if (currentMinute === 0) {
                setLastAutoChiaHour(prev => {
                    // Chỉ chạy nếu chưa chạy trong giờ này
                    if (prev !== currentHour) {
                        console.log(`🕐 [Tự động chia đơn] Đến giờ ${currentHour}:00, bắt đầu chia đơn vận đơn...`);
                        
                        // Chạy chia đơn cho cả HCM và Hà Nội
                        // Chạy tuần tự để tránh conflict
                        handleChiaDonVanDon('HCM').then(() => {
                            // Đợi 2 giây trước khi chạy Hà Nội
                            setTimeout(() => {
                                handleChiaDonVanDon('Hà Nội').catch(err => {
                                    console.error('❌ [Tự động chia đơn] Lỗi khi chia đơn Hà Nội:', err);
                                });
                            }, 2000);
                        }).catch(err => {
                            console.error('❌ [Tự động chia đơn] Lỗi khi chia đơn HCM:', err);
                        });
                        
                        return currentHour;
                    }
                    return prev;
                });
            }
        };

        // Kiểm tra ngay lập tức
        checkAndRunAutoChia();

        // Kiểm tra mỗi phút
        const interval = setInterval(checkAndRunAutoChia, 60000); // 60000ms = 1 phút

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoChiaDonEnabled]);

    // Lưu trạng thái autoChiaDonEnabled vào localStorage
    useEffect(() => {
        localStorage.setItem('autoChiaDonEnabled', String(autoChiaDonEnabled));
    }, [autoChiaDonEnabled]);

    // --- VERIFICATION STATE ---
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifying, setVerifying] = useState(false);

    // --- EMPTY COLUMNS SYNC STATE ---
    const [emptyColsChecking, setEmptyColsChecking] = useState(false);
    const [emptyColsSyncing, setEmptyColsSyncing] = useState(false);
    const [emptyColsSummary, setEmptyColsSummary] = useState(null); // { totalOrders, totalCells, perColumn: [{column, count, samples}] }

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

    const handleUploadToDrive = async (tableId, event) => {
        // Prevent card click event from firing
        event.stopPropagation();
        
        const tableName = getRealTableName(tableId);

        let confirmMsg = `Bạn có muốn đẩy dữ liệu [${tableId}] lên Google Drive không?`;
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

            // Format file name: table name + date + time
            const tableInfo = AVAILABLE_TABLES.find(t => t.id === tableId);
            const tableDisplayName = tableInfo ? tableInfo.name.replace(/\//g, '-') : tableId;
            
            // Get current date/time in Vietnam timezone (UTC+7)
            const now = new Date();
            const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
            const year = vietnamTime.getUTCFullYear();
            const month = String(vietnamTime.getUTCMonth() + 1).padStart(2, '0');
            const day = String(vietnamTime.getUTCDate()).padStart(2, '0');
            const hours = String(vietnamTime.getUTCHours()).padStart(2, '0');
            const minutes = String(vietnamTime.getUTCMinutes()).padStart(2, '0');
            const seconds = String(vietnamTime.getUTCSeconds()).padStart(2, '0');
            
            const dateStr = `${year}${month}${day}`;
            const timeStr = `${hours}${minutes}${seconds}`;
            const fileName = `${tableDisplayName}_${dateStr}_${timeStr}.json`;

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });

            // Upload to Google Drive using Google Apps Script or backend endpoint
            // Folder ID: 1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5
            const DRIVE_FOLDER_ID = '1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5';
            
            // Convert blob to base64
            toast.info(`Đang đẩy file [${fileName}] lên Google Drive...`);
            
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    
                    // Try to use Google Apps Script web app if available
                    const appsScriptUrl = import.meta.env.VITE_GOOGLE_DRIVE_UPLOAD_URL || 'https://script.google.com/macros/s/AKfycbw-y-vLK1sDH15ski_IgTY31AletNjknER04FcZTtZDql36pHWTg1YsIGQ4Gl72U6ow3Q/exec';
                    
                    if (appsScriptUrl) {
                        // Use Google Apps Script web app
                        try {
                            // Check if file is too large (Google Apps Script has ~6MB limit for POST)
                            if (base64Data.length > 5000000) {
                                toast.warn('File khá lớn, có thể mất thời gian upload...');
                            }
                            
                            console.log('Starting upload to Google Drive...', {
                                fileName,
                                base64Length: base64Data.length,
                                url: appsScriptUrl
                            });
                            
                            // Try using fetch with proper error handling
                            const payload = {
                                folderId: DRIVE_FOLDER_ID,
                                fileName: fileName,
                                fileContent: base64Data,
                                mimeType: 'application/json'
                            };
                            
                            console.log('Sending request...');
                            
                            // Try multiple methods to ensure compatibility
                            let response;
                            let lastError;
                            
                            // Method 1: Try fetch with no-cors mode (may not read response but upload might work)
                            try {
                                console.log('Attempting Method 1: fetch with no-cors...');
                                const testResponse = await fetch(appsScriptUrl, {
                                    method: 'POST',
                                    mode: 'no-cors', // This bypasses CORS but we can't read response
                                    headers: {
                                        'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify(payload)
                                });
                                
                                // With no-cors, response is opaque, but request might have succeeded
                                // Wait a bit and assume success (user can check Drive folder)
                                console.log('No-cors request sent (response opaque)');
                                toast.success(`Đã gửi yêu cầu đẩy file [${fileName}] lên Google Drive. Vui lòng kiểm tra folder Google Drive để xác nhận file đã được upload.`);
                                return; // Exit early since we can't verify with no-cors
                                
                            } catch (noCorsError) {
                                console.warn('Method 1 (no-cors) failed:', noCorsError);
                                lastError = noCorsError;
                            }
                            
                            // Method 2: Try XMLHttpRequest with proper error handling
                            try {
                                console.log('Attempting Method 2: XMLHttpRequest...');
                                response = await new Promise((resolve, reject) => {
                                    const xhr = new XMLHttpRequest();
                                    
                                    xhr.addEventListener('load', function() {
                                        console.log('XHR load event:', {
                                            status: xhr.status,
                                            statusText: xhr.statusText,
                                            responseText: xhr.responseText.substring(0, 200)
                                        });
                                        
                                        if (xhr.status === 200 || xhr.status === 0) {
                                            resolve({
                                                ok: true,
                                                status: xhr.status,
                                                text: () => Promise.resolve(xhr.responseText)
                                            });
                                        } else {
                                            reject(new Error(`XHR HTTP error: ${xhr.status} ${xhr.statusText}`));
                                        }
                                    });
                                    
                                    xhr.addEventListener('error', function(e) {
                                        console.error('XHR error event:', e);
                                        reject(new Error('XMLHttpRequest network error'));
                                    });
                                    
                                    xhr.addEventListener('timeout', function() {
                                        reject(new Error('XMLHttpRequest timeout'));
                                    });
                                    
                                    xhr.addEventListener('abort', function() {
                                        reject(new Error('XMLHttpRequest aborted'));
                                    });
                                    
                                    xhr.open('POST', appsScriptUrl, true);
                                    xhr.setRequestHeader('Content-Type', 'application/json');
                                    xhr.timeout = 120000; // 2 minutes for large files
                                    
                                    console.log('XHR sending payload, size:', JSON.stringify(payload).length);
                                    xhr.send(JSON.stringify(payload));
                                });
                                
                                console.log('Method 2 (XHR) succeeded');
                                
                            } catch (xhrError) {
                                console.warn('Method 2 (XHR) failed:', xhrError);
                                lastError = xhrError;
                                
                                // Method 3: Try fetch with cors as last resort
                                try {
                                    console.log('Attempting Method 3: fetch with cors...');
                                    response = await fetch(appsScriptUrl, {
                                        method: 'POST',
                                        mode: 'cors',
                                        headers: {
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify(payload),
                                        redirect: 'follow'
                                    });
                                    console.log('Method 3 (fetch cors) succeeded');
                                } catch (fetchError) {
                                    console.error('All methods failed:', { xhrError, fetchError });
                                    throw new Error(`Tất cả phương thức upload đều thất bại. Lỗi cuối cùng: ${lastError?.message || fetchError.message}. Vui lòng kiểm tra:\n1. Kết nối internet\n2. Google Apps Script đã được deploy với quyền "Anyone"\n3. Thử lại sau vài giây`);
                                }
                            }
                            
                            console.log('Response received:', {
                                status: response.status,
                                statusText: response.statusText,
                                ok: response.ok
                            });
                            
                            // Get response text first to see what we got
                            const responseText = await response.text();
                            console.log('Response text:', responseText.substring(0, 200)); // First 200 chars
                            
                            if (!response.ok && response.status !== 0) {
                                throw new Error(`HTTP error! status: ${response.status}, response: ${responseText.substring(0, 100)}`);
                            }
                            
                            // Try to parse as JSON
                            let result;
                            try {
                                result = JSON.parse(responseText);
                            } catch (parseError) {
                                // If not JSON, check if it contains success indicators
                                if (responseText.includes('success') || response.status === 200 || response.status === 0) {
                                    result = { success: true, message: 'Upload may have succeeded (unable to parse response)' };
                                } else {
                                    throw new Error('Response is not valid JSON: ' + responseText.substring(0, 200));
                                }
                            }
                            
                            if (result.success) {
                                toast.success(`Đã đẩy file [${fileName}] lên Google Drive thành công!`);
                                if (result.fileUrl) {
                                    console.log('File URL:', result.fileUrl);
                                }
                            } else {
                                throw new Error(result.error || 'Lỗi không xác định từ server');
                            }
                            
                        } catch (fetchError) {
                            console.error('Upload error details:', {
                                error: fetchError,
                                message: fetchError.message,
                                stack: fetchError.stack
                            });
                            
                            // More specific error messages
                            if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
                                throw new Error('Không thể kết nối đến Google Apps Script. Vui lòng kiểm tra:\n1. URL có đúng không\n2. Script đã được deploy với quyền "Anyone"\n3. Kết nối internet của bạn');
                            } else if (fetchError.message.includes('timeout')) {
                                throw new Error('Request timeout. File có thể quá lớn hoặc server mất quá nhiều thời gian xử lý.');
                            } else {
                                throw new Error(`Lỗi đẩy file: ${fetchError.message}`);
                            }
                        }
                    } else {
                        // Fallback: Show helpful error message
                        toast.error('Vui lòng cấu hình VITE_GOOGLE_DRIVE_UPLOAD_URL trong file .env để sử dụng tính năng đẩy lên Google Drive. Xem file scripts/google-drive-upload-handler.gs để biết cách setup.');
                        console.log('File data ready for upload:', {
                            fileName,
                            size: blob.size,
                            folderId: DRIVE_FOLDER_ID,
                            base64Length: base64Data.length
                        });
                    }
                } catch (err) {
                    console.error('Upload error:', err);
                    toast.error(`Lỗi đẩy file lên Google Drive: ${err.message}`);
                }
            };
            reader.onerror = () => {
                toast.error('Lỗi đọc file để upload');
            };
            reader.readAsDataURL(blob);

        } catch (err) {
            console.error(err);
            toast.error(`Lỗi tải dữ liệu bảng ${tableName}: ${err.message}`);
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

                const salesReportsIntegerFields = new Set([
                    'mess_count', 'response_count', 'order_count',
                    'order_count_actual', 'order_cancel_count_actual',
                    'order_cancel_count', 'order_success_count',
                    'customer_old', 'customer_new', 'cross_sale'
                ]);

                const salesReportsNumericFields = new Set([
                    'revenue_mess', 'revenue_actual', 'revenue_go_actual',
                    'revenue_cancel_actual', 'revenue_after_cancel_actual',
                    'revenue_go', 'revenue_cancel', 'revenue_success'
                ]);

                const normalizeSalesReportsRow = (row) => {
                    const normalized = { ...row };

                    Object.keys(normalized).forEach((key) => {
                        const rawValue = normalized[key];

                        if (salesReportsIntegerFields.has(key) || salesReportsNumericFields.has(key)) {
                            if (rawValue === '' || rawValue === null || rawValue === undefined) {
                                normalized[key] = 0;
                                return;
                            }

                            if (typeof rawValue === 'string') {
                                // Handle values like "1.234.567" or "1,234,567"
                                const sign = rawValue.trim().startsWith('-') ? '-' : '';
                                const digits = rawValue.replace(/[^0-9]/g, '');
                                normalized[key] = digits ? Number(sign + digits) : 0;
                                return;
                            }

                            const parsed = Number(rawValue);
                            normalized[key] = Number.isFinite(parsed) ? parsed : 0;
                        }
                    });

                    return normalized;
                };

                const normalizeDetailReportsRow = (row) => {
                    const normalized = { ...row };

                    // Prevent invalid date syntax: "" -> null for DATE columns
                    ['Ngày', 'ngay', 'date'].forEach((dateKey) => {
                        if (Object.prototype.hasOwnProperty.call(normalized, dateKey)) {
                            const val = normalized[dateKey];
                            if (val === '' || val === undefined) {
                                normalized[dateKey] = null;
                            }
                        }
                    });

                    return normalized;
                };

                for (let i = 0; i < json.length; i += CHUNK_SIZE) {
                    const chunkRaw = json.slice(i, i + CHUNK_SIZE);
                    const chunk = tableName === 'sales_reports'
                        ? chunkRaw.map(normalizeSalesReportsRow)
                        : tableName === 'detail_reports'
                            ? chunkRaw.map(normalizeDetailReportsRow)
                            : chunkRaw;
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
                .select('product_name_1, product, country, city')
                .limit(1000); // Sample data

            if (error) throw error;

            if (data) {
                const products = new Set();
                const markets = new Set();
                data.forEach(r => {
                    if (r.product) products.add(r.product); // Bỏ qua product_main, chỉ dùng product
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

    // Load tỷ giá từ database
    const loadExchangeRates = async () => {
        setExchangeLoading(true);
        try {
            const { data, error } = await supabase
                .from('exchange_rates')
                .select('*')
                .order('ti_gia', { ascending: true });

            if (error) {
                throw error;
            } else if (data && data.length > 0) {
                setExchangeRates(data);
            } else {
                // Nếu chưa có dữ liệu, insert dữ liệu mặc định vào database
                const defaultRates = [
                    { ti_gia: 'USD', gia_tri: 25000 },
                    { ti_gia: 'JPY', gia_tri: 180 },
                    { ti_gia: 'CAD', gia_tri: 19000 },
                    { ti_gia: 'AUD', gia_tri: 18000 },
                    { ti_gia: 'GBP', gia_tri: 32000 },
                    { ti_gia: 'KRW', gia_tri: 20 },
                ];
                
                const { data: insertedData, error: insertError } = await supabase
                    .from('exchange_rates')
                    .insert(defaultRates)
                    .select();

                if (insertError) {
                    console.error('Error inserting default rates:', insertError);
                    // Nếu insert lỗi, vẫn set vào state để hiển thị
                    setExchangeRates(defaultRates);
                } else {
                    setExchangeRates(insertedData || defaultRates);
                }
            }
        } catch (error) {
            console.error('Error loading exchange rates:', error);
            toast.error('Lỗi khi tải tỷ giá: ' + error.message);
        } finally {
            setExchangeLoading(false);
        }
    };

    // Save tỷ giá đơn lẻ vào database (khi edit từng dòng)
    const handleSaveSingleRate = async (rateId) => {
        try {
            const rateData = exchangeRates.find(r => r.id === rateId);
            if (!rateData) {
                toast.error('Không tìm thấy tỷ giá cần cập nhật');
                return;
            }

            const editData = editValues[rateId];
            if (!editData) {
                toast.error('Không có dữ liệu để lưu');
                return;
            }

            const updateData = {
                gia_tri: parseFloat(editData.gia_tri) || 0,
                updated_at: new Date().toISOString(),
            };

            // Nếu ti_gia thay đổi, cập nhật cả ti_gia
            if (editData.ti_gia && editData.ti_gia.trim() !== rateData.ti_gia) {
                updateData.ti_gia = editData.ti_gia.trim().toUpperCase();
            }

            const { error } = await supabase
                .from('exchange_rates')
                .update(updateData)
                .eq('id', rateId);

            if (error) throw error;
            
            // Reload để đảm bảo đồng bộ với database
            await loadExchangeRates();
            setEditingRateId(null);
            setEditValues(prev => {
                const newVals = { ...prev };
                delete newVals[rateId];
                return newVals;
            });
            toast.success('Đã cập nhật tỷ giá thành công!');
        } catch (error) {
            console.error('Error saving exchange rate:', error);
            toast.error('Lỗi khi lưu tỷ giá: ' + error.message);
        }
    };

    // Save tất cả tỷ giá vào database (khi nhấn nút Lưu tỷ giá)
    const handleSaveExchangeRates = async () => {
        setExchangeSaving(true);
        try {
            // Upsert tất cả các tỷ giá
            const updates = exchangeRates.map(rate => ({
                ti_gia: rate.ti_gia,
                gia_tri: rate.gia_tri,
                updated_at: new Date().toISOString(),
            }));

            // Sử dụng upsert với onConflict để update nếu đã tồn tại
            const { error } = await supabase
                .from('exchange_rates')
                .upsert(updates, {
                    onConflict: 'ti_gia',
                    ignoreDuplicates: false
                });

            if (error) throw error;
            
            // Reload để lấy ID mới nếu có
            await loadExchangeRates();
            toast.success('Đã lưu tất cả tỷ giá thành công!');
        } catch (error) {
            console.error('Error saving exchange rates:', error);
            toast.error('Lỗi khi lưu tỷ giá: ' + error.message);
        } finally {
            setExchangeSaving(false);
        }
    };

    // Đồng bộ users.team theo dữ liệu MKT (detail_reports) khớp theo tên nhân sự.
    const handleSyncMktTeamsToUsers = async () => {
        if (!window.confirm('Đồng bộ toàn bộ cột team trong bảng users theo tên từ dữ liệu MKT?')) return;

        setSyncMktTeamLoading(true);
        try {
            const normalizeName = (v) =>
                String(v || '')
                    .trim()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ');

            const normalizeTeam = (v) => String(v || '').trim();

            // 1) Đọc users để biết danh sách cần update
            const { data: users, error: usersErr } = await supabase
                .from('users')
                .select('id, name, team');
            if (usersErr) throw usersErr;

            // 2) Đọc nguồn MKT team từ detail_reports (ưu tiên schema snake_case)
            let mktRows = [];
            const { data: snakeRows, error: snakeErr } = await supabase
                .from('detail_reports')
                .select('ten, team')
                .not('team', 'is', null)
                .neq('team', '');

            if (!snakeErr) {
                mktRows = (snakeRows || []).map((r) => ({ name: r.ten, team: r.team }));
            } else {
                // Fallback nếu DB đang dùng cột tiếng Việt
                const { data: viRows, error: viErr } = await supabase
                    .from('detail_reports')
                    .select('"Tên", "Team"')
                    .not('"Team"', 'is', null)
                    .neq('"Team"', '');
                if (viErr) throw viErr;
                mktRows = (viRows || []).map((r) => ({ name: r['Tên'], team: r['Team'] }));
            }

            // 3) Gom team theo tên và chọn team xuất hiện nhiều nhất
            const nameTeamCounter = new Map(); // normalizedName -> Map(team -> count)
            (mktRows || []).forEach((row) => {
                const n = normalizeName(row?.name);
                const t = normalizeTeam(row?.team);
                if (!n || !t) return;
                if (!nameTeamCounter.has(n)) nameTeamCounter.set(n, new Map());
                const teamMap = nameTeamCounter.get(n);
                teamMap.set(t, (teamMap.get(t) || 0) + 1);
            });

            const nameToBestTeam = new Map();
            nameTeamCounter.forEach((teamMap, n) => {
                let bestTeam = '';
                let bestCount = -1;
                teamMap.forEach((count, teamName) => {
                    if (count > bestCount) {
                        bestCount = count;
                        bestTeam = teamName;
                    }
                });
                if (bestTeam) nameToBestTeam.set(n, bestTeam);
            });

            // 4) Tạo danh sách update: chỉ update khi team tìm thấy và khác team hiện tại
            const updates = [];
            (users || []).forEach((u) => {
                const n = normalizeName(u?.name);
                if (!n) return;
                const mappedTeam = nameToBestTeam.get(n);
                if (!mappedTeam) return;
                const currentTeam = normalizeTeam(u?.team);
                if (currentTeam === mappedTeam) return;
                updates.push({ id: u.id, team: mappedTeam, name: u.name || '' });
            });

            if (updates.length === 0) {
                toast.info('Không có dữ liệu cần đồng bộ team.');
                return;
            }

            // 5) Update theo lô
            const CHUNK_SIZE = 100;
            let done = 0;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                await Promise.all(
                    chunk.map((u) =>
                        supabase
                            .from('users')
                            .update({ team: u.team })
                            .eq('id', u.id)
                    )
                );
                done += chunk.length;
            }

            toast.success(`Đã đồng bộ team MKT cho ${done} nhân sự (khớp theo Tên).`);
        } catch (error) {
            console.error('Error syncing MKT teams to users:', error);
            toast.error('Lỗi đồng bộ team MKT: ' + (error?.message || 'Unknown error'));
        } finally {
            setSyncMktTeamLoading(false);
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

    // --- MKT: Recalculate "Số đơn thực tế" (Số đơn TT) from orders using Key match ---
    const handleRecalcMktSoDonTT = async () => {
        if (mktRecalcLoading) return;

        const ok = window.confirm(
            'Tính lại cho Báo cáo MKT: Số đơn thực tế, Doanh số TT (tổng VND mọi đơn), đơn/DS hoàn hủy thực tế — Key match orders ↔ detail_reports.\n\n' +
            'Đơn hủy (đếm + DS hủy): Kết quả Check = Hủy (check_result, fallback payment_status).\n\n' +
            'Email/Team trên dòng đang trống sẽ tự điền từ users (theo tên+email), sau đó human_resources nếu cần.\n\n' +
            'Thao tác sẽ cập nhật các dòng hiện có và có thể tạo thêm dòng mới nếu thiếu key.\n\n' +
            'Bạn có chắc muốn chạy không?'
        );
        if (!ok) return;

        const normStart = String(mktRecalcStartDate || '').trim();
        const normEnd = String(mktRecalcEndDate || '').trim();
        if (!normStart || !normEnd) {
            alert('Vui lòng nhập đầy đủ TỪ NGÀY và ĐẾN NGÀY.');
            return;
        }

        if (normStart > normEnd) {
            alert('Từ ngày phải <= đến ngày.');
            return;
        }

        try {
            setMktRecalcLoading(true);
            setMktRecalcResult(null);
            toast.info('Đang tính lại Báo cáo MKT (đơn TT, đơn hủy, DS hủy)...', { autoClose: false });

            const result = await recalcMktSoDonThucTeFromOrders({
                startDate: normStart,
                endDate: normEnd,
                createMissingRows: true, // Có key trong orders mà thiếu ở detail_reports => tự tạo dòng
            });

            toast.dismiss();
            toast.success(`Hoàn tất: cập nhật ${result.upserted || 0} dòng.`);
            setMktRecalcResult(result);
        } catch (error) {
            console.error('Recalc MKT error:', error);
            const msg = error?.message || String(error);
            const fetchHint = /failed to fetch/i.test(msg)
                ? ' Thao tác này chỉ gọi Supabase (orders, detail_reports). Kiểm tra: mạng/VPN, .env có VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY, dự án Supabase không bị pause, thử tắt extension chặn request.'
                : '';
            toast.error('Lỗi tính lại Số đơn TT: ' + msg + fetchHint, { autoClose: 12000 });
        } finally {
            setMktRecalcLoading(false);
        }
    };

    const handleRecalcSaleOrderCount = async () => {
        if (saleRecalcLoading) return;

        const ok = window.confirm(
            'Tính lại sales_reports: order_count, revenue_actual, order_cancel_count_actual, revenue_cancel_actual (tổng VND các đơn hủy).\n\n' +
            'Key match giữa orders (sale_staff) và sales_reports (name, date, shift, product, market).\n\n' +
            (SALES_REPORTS_AUTO_CREATE_MISSING_ROWS
                ? 'Thao tác sẽ cập nhật các dòng hiện có và có thể tạo thêm dòng mới nếu thiếu key.\n\n'
                : 'Tạm thời: chỉ cập nhật các dòng đã có — không tạo dòng mới từ orders.\n\n') +
            'Bạn có chắc muốn chạy không?'
        );
        if (!ok) return;

        const normStart = String(saleRecalcStartDate || '').trim();
        const normEnd = String(saleRecalcEndDate || '').trim();
        if (!normStart || !normEnd) {
            alert('Vui lòng nhập đầy đủ TỪ NGÀY và ĐẾN NGÀY.');
            return;
        }

        if (normStart > normEnd) {
            alert('Từ ngày phải <= đến ngày.');
            return;
        }

        try {
            setSaleRecalcLoading(true);
            setSaleRecalcResult(null);
            toast.info('Đang tính lại sales_reports (đơn, doanh thu, hủy)...', { autoClose: false });

            const result = await recalcSaleOrderCountFromOrders({
                startDate: normStart,
                endDate: normEnd,
            });

            toast.dismiss();
            const n = result.upserted ?? result.upsertCount ?? 0;
            toast.success(`Hoàn tất: cập nhật ${n} dòng.`);
            setSaleRecalcResult(result);
        } catch (error) {
            console.error('Recalc sales_reports error:', error);
            toast.error('Lỗi tính lại sales_reports: ' + (error?.message || String(error)));
        } finally {
            setSaleRecalcLoading(false);
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

    // -----------------------------
    // AUTO PAYMENT CURRENCY SYNC (Country -> Payment Currency)
    // Tự động điền `payment_currency` (và đồng bộ `payment_type`, `exchange_rate` nếu cần)
    // theo logic "Auto-Currency by Country" ở trang `NhapDonMoi`.
    // Example: US -> USD
    // -----------------------------
    const isEmptySupabaseValue = (v) => {
        if (v === null || v === undefined) return true;
        if (typeof v === 'string' && v.trim() === '') return true;
        return false;
    };

    const EXCHANGE_RATES = {
        USD: 25500,
        JPY: 170,
        KRW: 18,
        CAD: 18000,
        AUD: 16500,
        GBP: 32000,
        VND: 1
    };

    const getCurrencyFromCountry = (country) => {
        const c = country ? String(country).trim() : '';
        if (c === 'US') return 'USD';
        if (c === 'Nhật Bản' || c === 'CĐ Nhật Bản') return 'JPY';
        if (c === 'Hàn Quốc') return 'KRW';
        if (c === 'Canada') return 'CAD';
        if (c === 'Úc') return 'AUD';
        if (c === 'Anh') return 'GBP';
        return 'VND';
    };

    const buildEmptyColumnsSummary = async () => {
        setEmptyColsChecking(true);
        try {
            setEmptyColsSummary(null);
            let ordersQuery = supabase
                .from('orders')
                .select('order_code,country,payment_currency,payment_type,exchange_rate');

            if (dateFrom) ordersQuery = ordersQuery.gte('order_date', dateFrom);
            if (dateTo) ordersQuery = ordersQuery.lte('order_date', dateTo);

            // Only rows where payment_currency is empty (NULL or '')
            // If PostgREST parsing for empty string fails, we fallback to client-side filtering.
            let orders = [];
            let queryErr = null;
            try {
                const { data, error } = await ordersQuery.or('payment_currency.is.null,payment_currency.eq.');
                queryErr = error;
                orders = data || [];
            } catch (e) {
                queryErr = e;
            }

            if (queryErr) {
                const { data: fallbackData, error: fallbackErr } = await ordersQuery;
                if (fallbackErr) throw fallbackErr;
                orders = fallbackData || [];
            }

            const candidates = (orders || []).filter((o) => isEmptySupabaseValue(o.payment_currency));

            const totalOrders = candidates.length;
            const totalCells = totalOrders; // We are filling 1 column: payment_currency
            const perColumn = [
                {
                    column: 'Loại tiền thanh toán',
                    count: totalOrders,
                    samples: candidates.slice(0, 5).map((o) => o.order_code)
                }
            ];

            setEmptyColsSummary({ totalOrders, totalCells, perColumn });
            toast.success('Đã kiểm tra đơn cần tự điền Loại tiền thanh toán');
        } catch (e) {
            console.error('EmptyColsSync check error:', e);
            toast.error('Lỗi kiểm tra cột trống theo country: ' + (e?.message || String(e)));
        } finally {
            setEmptyColsChecking(false);
        }
    };

    const handleSyncEmptyColumns = async () => {
        if (emptyColsSyncing) return;
        const hasWork = emptyColsSummary && (emptyColsSummary.totalCells || emptyColsSummary.totalOrders) > 0;
        if (!hasWork) {
            toast.info('Chưa có đơn cần tự điền. Hãy bấm "Xem cột trống" trước.');
            return;
        }

        if (!window.confirm(`Tự động điền "Loại tiền thanh toán" theo country:\n- Đơn cần cập nhật: ${emptyColsSummary.totalOrders}\n- Số ô cần điền: ${emptyColsSummary.totalCells}\n\nThao tác sẽ CHỈ điền vào các ô đang trống (không ghi đè nếu đã có).`)) {
            return;
        }

        setEmptyColsSyncing(true);
        try {
            let ordersQuery = supabase
                .from('orders')
                .select('order_code,country,payment_currency,payment_type,exchange_rate');

            if (dateFrom) ordersQuery = ordersQuery.gte('order_date', dateFrom);
            if (dateTo) ordersQuery = ordersQuery.lte('order_date', dateTo);
            let orders = [];
            let queryErr = null;
            try {
                const { data, error } = await ordersQuery.or('payment_currency.is.null,payment_currency.eq.');
                queryErr = error;
                orders = data || [];
            } catch (e) {
                queryErr = e;
            }

            if (queryErr) {
                const { data: fallbackData, error: fallbackErr } = await ordersQuery;
                if (fallbackErr) throw fallbackErr;
                orders = fallbackData || [];
            }

            const candidates = (orders || []).filter((o) => isEmptySupabaseValue(o.payment_currency));

            if (candidates.length === 0) {
                toast.info('Không có dòng cần cập nhật sau khi tính lại.');
                return;
            }

            const updates = candidates.map((o) => {
                const currency = getCurrencyFromCountry(o.country);
                const rate = EXCHANGE_RATES[currency] ?? 1;
                const upd = {
                    order_code: o.order_code,
                    payment_currency: currency,
                };
                // Only fill if empty to avoid overriding
                if (isEmptySupabaseValue(o.payment_type)) upd.payment_type = currency;
                if (isEmptySupabaseValue(o.exchange_rate)) upd.exchange_rate = rate;
                return upd;
            });

            toast.info(`Đang tự điền cho ${updates.length} đơn...`, { autoClose: false });
            const CHUNK_SIZE = 100;
            let processed = 0;
            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const { error: upsertError } = await supabase
                    .from('orders')
                    .upsert(chunk, { onConflict: 'order_code' });

                if (upsertError) throw upsertError;
                processed += chunk.length;
            }

            toast.dismiss();
            toast.success(`Xong: đã điền "Loại tiền thanh toán" cho ${processed} đơn trống.`);
            await buildEmptyColumnsSummary(); // refresh preview
        } catch (e) {
            console.error('EmptyColsSync error:', e);
            toast.error('Lỗi tự điền Loại tiền thanh toán: ' + (e?.message || String(e)));
        } finally {
            setEmptyColsSyncing(false);
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

    // --- VIEW DANH SÁCH ĐƠN ĐÃ CHIA VẬN ĐƠN THEO NGÀY ---
    const handleLoadChiaDonView = async () => {
        if (!chiaDonViewDate) return;
        setChiaDonViewLoading(true);
        try {
            // Lấy tất cả đơn đã được chia vận đơn trong ngày được chọn
            const { data, error } = await supabase
                .from('orders')
                .select('order_code, customer_name, team, delivery_staff, ngay_chia_van_don, thu_tu_chia, order_date, country')
                .eq('ngay_chia_van_don', chiaDonViewDate)
                .not('delivery_staff', 'is', null);

            if (error) {
                console.error('❌ [View chia đơn vận đơn] Lỗi load dữ liệu:', error);
                toast.error('Lỗi tải danh sách đơn đã chia vận đơn');
                setChiaDonViewOrders([]);
                return;
            }

            const list = data || [];

            // Sắp xếp theo thời gian lên đơn (hoặc theo order_code) để có thứ tự ổn định
            const sorted = [...list].sort((a, b) => {
                const d1 = a.order_date ? new Date(a.order_date) : new Date(0);
                const d2 = b.order_date ? new Date(b.order_date) : new Date(0);
                if (d1.getTime() !== d2.getTime()) {
                    return d1 - d2;
                }
                return (a.order_code || '').localeCompare(b.order_code || '');
            });

            // Tính thứ tự chia trong ngày (STT) theo thứ tự đã sort
            const withIndex = sorted.map((o, idx) => ({
                ...o,
                chia_order_index: idx + 1,
            }));

            setChiaDonViewOrders(withIndex);
        } catch (err) {
            console.error('❌ [View chia đơn vận đơn] Exception:', err);
            toast.error('Có lỗi xảy ra khi tải danh sách đơn đã chia vận đơn');
            setChiaDonViewOrders([]);
        } finally {
            setChiaDonViewLoading(false);
        }
    };

    // --- CLEAR NV VẬN ĐƠN THEO NGÀY CHIA ---
    const handleClearDeliveryStaffByDate = async () => {
        if (!chiaDonViewDate) {
            toast.warning('Vui lòng chọn ngày chia vận đơn trước khi xóa!');
            return;
        }

        const confirmMsg =
            `Bạn có chắc muốn XÓA cột NV vận đơn cho tất cả đơn có ngay_chia_van_don = ${chiaDonViewDate}?\n\n` +
            `- Cột sẽ bị xóa: delivery_staff, ngay_chia_van_don\n` +
            `- Hành động này không thể hoàn tác trực tiếp trên giao diện.`;

        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info(`Đang xóa NV vận đơn theo ngày ${chiaDonViewDate}...`);

            const { data, error } = await supabase
                .from('orders')
                .update({
                    delivery_staff: null,
                    ngay_chia_van_don: null,
                })
                .eq('ngay_chia_van_don', chiaDonViewDate)
                .not('delivery_staff', 'is', null)
                .select('order_code');

            if (error) {
                console.error('❌ [Clear NV vận đơn] Lỗi xóa:', error);
                toast.error('Lỗi khi xóa NV vận đơn theo ngày đã chọn');
                return;
            }

            const affected = data?.length || 0;
            toast.success(`Đã xóa NV vận đơn cho ${affected} đơn có ngay_chia_van_don = ${chiaDonViewDate}`);

            // Reload lại view danh sách đã chia
            await handleLoadChiaDonView();
        } catch (err) {
            console.error('❌ [Clear NV vận đơn] Exception:', err);
            toast.error('Có lỗi xảy ra khi xóa NV vận đơn theo ngày đã chọn');
        }
    };

    // --- CLEAR NV VẬN ĐƠN THEO ORDER_DATE ---
    const handleClearDeliveryStaffByOrderDate = async () => {
        if (!clearOrderDate) {
            toast.warning('Vui lòng chọn Ngày lên đơn (order_date) trước khi xóa!');
            return;
        }

        const confirmMsg =
            `Bạn có chắc muốn XÓA NV vận đơn cho tất cả đơn có order_date = ${clearOrderDate}?\n\n` +
            `- Cột sẽ bị xóa: delivery_staff, ngay_chia_van_don\n` +
            `- Hành động này không thể hoàn tác trực tiếp trên giao diện.`;

        if (!window.confirm(confirmMsg)) return;

        try {
            toast.info(`Đang xóa NV vận đơn theo order_date = ${clearOrderDate}...`);

            const { data, error } = await supabase
                .from('orders')
                .update({
                    delivery_staff: null,
                    ngay_chia_van_don: null,
                })
                .eq('order_date', clearOrderDate)
                .not('delivery_staff', 'is', null)
                .select('order_code');

            if (error) {
                console.error('❌ [Clear NV vận đơn theo order_date] Lỗi xóa:', error);
                toast.error('Lỗi khi xóa NV vận đơn theo order_date đã chọn');
                return;
            }

            const affected = data?.length || 0;
            toast.success(`Đã xóa NV vận đơn cho ${affected} đơn có order_date = ${clearOrderDate}`);

            // Nếu đang xem view theo ngày chia, reload lại để cập nhật (optional)
            if (chiaDonViewDate) {
                await handleLoadChiaDonView();
            }
        } catch (err) {
            console.error('❌ [Clear NV vận đơn theo order_date] Exception:', err);
            toast.error('Có lỗi xảy ra khi xóa NV vận đơn theo order_date đã chọn');
        }
    };

    // --- CHIA ĐƠN VẬN ĐƠN ---
    // branchFilter: 'HCM' | 'Hà Nội' | undefined (undefined = cả hai)
    const handleChiaDonVanDon = async (branchFilter) => {
        setAutoAssignLoading(true);
        setAutoAssignResult(null);
        setNotDividedOrders([]);
        setOrderSearchResult(null);
        setStepLogs([]); // Reset log

        // Helper function để thêm log vào state và console
        const addLog = (message, type = 'info') => {
            const timestamp = new Date().toLocaleTimeString('vi-VN');
            const logEntry = {
                timestamp,
                type, // 'info', 'success', 'warning', 'error'
                message
            };
            setStepLogs(prev => [...prev, logEntry]);
            // Vẫn log vào console để debug
            if (type === 'error') {
                console.error(`[${timestamp}] ${message}`);
            } else if (type === 'warning') {
                console.warn(`[${timestamp}] ${message}`);
            } else {
                console.log(`[${timestamp}] ${message}`);
            }
        };

        // Đơn cần kiểm tra đặc biệt
        const TARGET_ORDER_CODE = 'Kemce7fc5bf'; // Đơn cần kiểm tra

        try {
            addLog(`🚀 Bắt đầu quá trình chia đơn vận đơn${branchFilter ? ' cho ' + branchFilter : ''}...`, 'info');
            // Bước 1: Lấy danh sách nhân sự từ danh_sach_van_don
            const { data: vanDonList, error: vanDonError } = await supabase
                .from('danh_sach_van_don')
                .select('ho_va_ten, chi_nhanh, trang_thai_chia');

            if (vanDonError) throw vanDonError;

            if (!vanDonList || vanDonList.length === 0) {
                throw new Error('Không có nhân sự nào trong bảng danh_sach_van_don');
            }

            // Bước 2: Lọc nhân viên có trạng thái = "U1"
            addLog('📋 Bước 1: Lấy danh sách nhân viên vận đơn từ bảng danh_sach_van_don', 'info');
            const nhanVienU1 = vanDonList.filter(item => item.trang_thai_chia === 'U1');

            addLog(`👥 Tổng số nhân viên U1 tìm được: ${nhanVienU1.length}`, 'info');
            addLog(`👥 Danh sách nhân viên U1: ${nhanVienU1.map(u => u.ho_va_ten).join(', ')}`, 'info');
            console.log(`👥 [Chia đơn vận đơn] Danh sách nhân viên U1:`, nhanVienU1.map(u => u.ho_va_ten));

            if (nhanVienU1.length === 0) {
                addLog('❌ Không có nhân viên nào có trạng thái U1', 'error');
                throw new Error('Không có nhân viên nào có trạng thái U1');
            }

            // Bước 3: Phân loại nhân viên theo chi nhánh từ danh_sach_van_don
            // Lưu cả name và chi_nhanh để khớp với team của đơn
            const nhanVienHCM = [];
            const nhanVienHaNoi = [];

            nhanVienU1.forEach(item => {
                const name = item.ho_va_ten;
                const chiNhanhRaw = item.chi_nhanh || '';
                const chiNhanh = chiNhanhRaw.toString().trim();
                const chiNhanhLower = chiNhanh.toLowerCase();
                const chiNhanhClean = chiNhanhLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
                
                // Kiểm tra HCM - nhận diện nhiều biến thể
                const isHCM = chiNhanh === 'HCM' ||
                             chiNhanhLower === 'hcm' ||
                             chiNhanhClean === 'hcm' ||
                             chiNhanhLower === 'hồ chí minh' ||
                             chiNhanhLower === 'ho chi minh' ||
                             chiNhanhClean === 'hochiminh' ||
                             chiNhanhLower.includes('hcm') ||
                             chiNhanhLower.includes('hồ chí minh') ||
                             chiNhanhLower.includes('ho chi minh') ||
                             chiNhanhClean.includes('hcm') ||
                             chiNhanhClean.includes('hochiminh');
                
                // Kiểm tra Hà Nội - nhận diện nhiều biến thể
                const isHanoi = chiNhanh === 'Hà Nội' ||
                               chiNhanhLower === 'hà nội' ||
                               chiNhanhClean === 'hanoi' ||
                               chiNhanhClean === 'ha noi' ||
                               chiNhanhLower === 'ha noi' ||
                               chiNhanhLower === 'hanoi' ||
                               chiNhanhLower.includes('hà nội') ||
                               chiNhanhLower.includes('hanoi') ||
                               chiNhanhLower.includes('ha noi') ||
                               chiNhanhClean.includes('hanoi');
                
                if (isHCM) {
                    nhanVienHCM.push({ name, chi_nhanh: 'HCM' }); // Chuẩn hóa về 'HCM'
                } else if (isHanoi) {
                    nhanVienHaNoi.push({ name, chi_nhanh: 'Hà Nội' }); // Chuẩn hóa về 'Hà Nội'
                } else if (chiNhanh) {
                    console.warn(`⚠️ [Chia đơn vận đơn] Nhân viên "${name}" có chi_nhanh="${chiNhanh}" không phải HCM/Hà Nội, bỏ qua`);
                }
            });

            addLog('📋 Bước 2: Phân loại nhân viên theo chi nhánh', 'info');
            addLog(`📍 HCM: ${nhanVienHCM.length} nhân viên (${nhanVienHCM.map(s => s.name).join(', ')})`, 'info');
            addLog(`📍 Hà Nội: ${nhanVienHaNoi.length} nhân viên (${nhanVienHaNoi.map(s => s.name).join(', ')})`, 'info');
            console.log(`📍 [Chia đơn vận đơn] Phân loại nhân viên theo chi nhánh:`);
            console.log(`  - HCM: ${nhanVienHCM.length} nhân viên`, nhanVienHCM.map(s => s.name));
            console.log(`  - Hà Nội: ${nhanVienHaNoi.length} nhân viên`, nhanVienHaNoi.map(s => s.name));

            if (nhanVienHCM.length === 0 && nhanVienHaNoi.length === 0) {
                addLog('❌ Không có nhân viên nào thuộc HCM hoặc Hà Nội', 'error');
                throw new Error('Không có nhân viên nào thuộc HCM hoặc Hà Nội. Vui lòng kiểm tra dữ liệu trong bảng danh_sach_van_don');
            }

            // Bước 3: Lấy TẤT CẢ đơn hàng từ DB (cần dùng cho cả lọc đơn mới và đếm đơn hiện tại)
            addLog('📋 Bước 3: Query đơn hàng từ database', 'info');
            addLog('🔍 Đang query từ Supabase: bảng orders...', 'info');
            console.log(`🔍 [Chia đơn vận đơn] Đang query từ Supabase: bảng orders...`);
            console.log(`📡 [Chia đơn vận đơn] Query: SELECT * FROM orders`);
            
            // Query trực tiếp đơn cần kiểm tra trước
            console.log(`\n${'='.repeat(60)}`);
            console.log(`🔍 [KIỂM TRA CHI TIẾT ĐƠN ${TARGET_ORDER_CODE}]`);
            console.log(`${'='.repeat(60)}`);
            console.log(`Đang query trực tiếp từ bảng orders...`);
            
            const { data: targetOrderData, error: targetOrderError } = await supabase
                .from('orders')
                .select('*')
                .eq('order_code', TARGET_ORDER_CODE)
                .maybeSingle();
            
            if (targetOrderError) {
                console.error(`❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Lỗi query:`, targetOrderError);
                console.error(`❌ Chi tiết lỗi:`, JSON.stringify(targetOrderError, null, 2));
            } else if (targetOrderData) {
                console.log(`✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn TỒN TẠI trong bảng orders`);
                console.log(`\n📋 Thông tin đơn hàng:`);
                console.log(`  - order_code: "${targetOrderData.order_code}"`);
                console.log(`  - id: ${targetOrderData.id || '(null)'}`);
                console.log(`  - team: "${targetOrderData.team || '(null)'}"`);
                console.log(`  - country: "${targetOrderData.country || '(null)'}"`);
                console.log(`  - sale_staff: "${targetOrderData.sale_staff || '(null)'}"`);
                
                console.log(`\n🔍 PHÂN TÍCH CHI TIẾT CỘT delivery_staff:`);
                const ds = targetOrderData.delivery_staff;
                console.log(`  - Giá trị gốc: "${ds}"`);
                console.log(`  - Kiểu dữ liệu: ${typeof ds}`);
                console.log(`  - === null: ${ds === null}`);
                console.log(`  - === undefined: ${ds === undefined}`);
                console.log(`  - === '': ${ds === ''}`);
                console.log(`  - Cột có tồn tại: ${'delivery_staff' in targetOrderData}`);
                
                if (ds !== null && ds !== undefined) {
                    const dsStr = String(ds);
                    const dsTrimmed = dsStr.trim();
                    const dsUpper = dsTrimmed.toUpperCase();
                    console.log(`  - Sau String(): "${dsStr}"`);
                    console.log(`  - Sau trim(): "${dsTrimmed}"`);
                    console.log(`  - Sau toUpperCase(): "${dsUpper}"`);
                    console.log(`  - Độ dài sau trim: ${dsTrimmed.length}`);
                    console.log(`  - Có phải empty string: ${dsTrimmed === ''}`);
                    console.log(`  - Có phải 'EMPTY': ${dsUpper === 'EMPTY'}`);
                    console.log(`  - Có phải 'NULL': ${dsUpper === 'NULL'}`);
                    console.log(`  - Có phải 'NONE': ${dsUpper === 'NONE'}`);
                    
                    // Kiểm tra các ký tự đặc biệt
                    console.log(`  - Chứa ký tự đặc biệt: ${/[^\w\s]/.test(dsStr)}`);
                    console.log(`  - Chỉ có khoảng trắng: ${/^\s+$/.test(dsStr)}`);
                    console.log(`  - Hex dump (10 ký tự đầu): ${Array.from(dsStr.slice(0, 10)).map(c => c.charCodeAt(0).toString(16)).join(' ')}`);
                }
                
                // Kết luận
                console.log(`\n📊 KẾT LUẬN:`);
                let canBeDivided = false;
                let reason = '';
                
                if (ds === null || ds === undefined) {
                    canBeDivided = true;
                    reason = 'delivery_staff là null/undefined';
                } else if (!('delivery_staff' in targetOrderData)) {
                    canBeDivided = true;
                    reason = 'Cột delivery_staff không tồn tại';
                } else {
                    const dsTrimmed = String(ds).trim();
                    if (dsTrimmed === '') {
                        canBeDivided = true;
                        reason = 'delivery_staff là empty string';
                    } else {
                        const dsUpper = dsTrimmed.toUpperCase();
                        if (dsUpper === 'EMPTY' || dsUpper === 'NULL' || dsUpper === 'NONE') {
                            canBeDivided = true;
                            reason = `delivery_staff là "${dsUpper}"`;
                        } else {
                            canBeDivided = false;
                            reason = `delivery_staff có giá trị "${ds}" (không phải null/empty/EMPTY/NULL/NONE)`;
                        }
                    }
                }
                
                console.log(`  - Có thể chia đơn: ${canBeDivided ? '✅ CÓ' : '❌ KHÔNG'}`);
                console.log(`  - Lý do: ${reason}`);
                console.log(`${'='.repeat(60)}\n`);
            } else {
                console.log(`❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG TỒN TẠI trong bảng orders!`);
                console.log(`  - Query trả về null/undefined - đơn không có trong database`);
                console.log(`  - Vui lòng kiểm tra lại mã đơn hàng hoặc import đơn vào database`);
                console.log(`${'='.repeat(60)}\n`);
            }
            
            // Helper function để query với pagination (lấy tất cả rows)
            const queryAllOrders = async (queryBuilder) => {
                const allResults = [];
                let from = 0;
                const pageSize = 1000; // Supabase limit
                let hasMore = true;
                
                while (hasMore) {
                    const { data, error } = await queryBuilder
                        .range(from, from + pageSize - 1);
                    
                    if (error) {
                        throw error;
                    }
                    
                    if (data && data.length > 0) {
                        allResults.push(...data);
                        from += pageSize;
                        hasMore = data.length === pageSize; // Nếu trả về đủ pageSize thì có thể còn nữa
                    } else {
                        hasMore = false;
                    }
                }
                
                return allResults;
            };

            // BƯỚC 1: Lấy TẤT CẢ đơn từ database (với pagination)
            addLog('📋 Bước 3: Query TẤT CẢ đơn từ database (với pagination)...', 'info');
            console.log(`🔍 [Chia đơn vận đơn] Đang query TẤT CẢ đơn từ Supabase với pagination...`);
            
            let allOrdersArray = [];
            try {
                const allOrdersQuery = supabase.from('orders').select('*');
                allOrdersArray = await queryAllOrders(allOrdersQuery);
                addLog(`✅ Đã lấy ${allOrdersArray.length} đơn từ database (tất cả)`, 'success');
                console.log(`✅ [Chia đơn vận đơn] Đã lấy ${allOrdersArray.length} đơn từ Supabase (bảng orders)`);
            } catch (allOrdersError) {
                addLog(`❌ Lỗi query tất cả đơn: ${allOrdersError.message}`, 'error');
                console.error('❌ [Chia đơn vận đơn] Lỗi query tất cả đơn:', allOrdersError);
                throw allOrdersError;
            }

            // BƯỚC 2: Loại trừ đơn Nhật Bản TRƯỚC
            addLog('📋 Bước 4: Loại trừ đơn Nhật Bản...', 'info');
            const japanKeywords = ['nhật bản', 'nhat ban', 'japan', 'jp'];
            const ordersExcludedJapan = [];
            const ordersAfterJapanFilter = [];
            
            allOrdersArray.forEach(order => {
                const countryRaw = order.country?.toString() || '';
                const country = countryRaw.trim().toLowerCase();
                const isJapan = japanKeywords.some(keyword => country.includes(keyword));
                
                if (isJapan) {
                    ordersExcludedJapan.push({
                        ...order,
                        reason: `Nhật Bản/CĐ Nhật Bản (country="${countryRaw}")`
                    });
                } else {
                    ordersAfterJapanFilter.push(order);
                }
            });
            
            addLog(`✅ Đã loại trừ ${ordersExcludedJapan.length} đơn Nhật Bản, còn lại ${ordersAfterJapanFilter.length} đơn`, 'info');
            console.log(`✅ [Chia đơn vận đơn] Đã loại trừ ${ordersExcludedJapan.length} đơn Nhật Bản, còn lại ${ordersAfterJapanFilter.length} đơn`);

            // BƯỚC 3: Lọc đơn có delivery_staff trống/null/empty
            addLog('📋 Bước 5: Lọc đơn có delivery_staff trống/null/empty...', 'info');
            console.log(`🔍 [Chia đơn vận đơn] Đang lọc đơn có delivery_staff trống/null/empty từ ${ordersAfterJapanFilter.length} đơn...`);
            
            let ordersArray = [];
            const deliveryStaffStats = {
                null: 0,
                empty: 0,
                nullStr: 0,
                emptyStr: 0,
                noneStr: 0,
                other: 0
            };
            
            ordersAfterJapanFilter.forEach(order => {
                const ds = order.delivery_staff;
                let shouldAdd = false;
                
                // Kiểm tra null/undefined
                if (ds == null || ds === undefined) {
                    shouldAdd = true;
                    deliveryStaffStats.null++;
                } else {
                    // Kiểm tra empty string hoặc chỉ có whitespace
                    const dsStr = String(ds).trim();
                    if (dsStr === '') {
                        shouldAdd = true;
                        deliveryStaffStats.empty++;
                    } else {
                        // Kiểm tra các giá trị đặc biệt (case insensitive)
                        const dsUpper = dsStr.toUpperCase();
                        if (dsUpper === 'NULL') {
                            shouldAdd = true;
                            deliveryStaffStats.nullStr++;
                        } else if (dsUpper === 'EMPTY') {
                            shouldAdd = true;
                            deliveryStaffStats.emptyStr++;
                        } else if (dsUpper === 'NONE') {
                            shouldAdd = true;
                            deliveryStaffStats.noneStr++;
                        } else {
                            deliveryStaffStats.other++;
                        }
                    }
                }
                
                if (shouldAdd) {
                    ordersArray.push(order);
                }
            });
            
            addLog('✅ Query kết quả:', 'info');
            addLog(`  - Đơn delivery_staff NULL: ${deliveryStaffStats.null}`, 'info');
            addLog(`  - Đơn delivery_staff empty string: ${deliveryStaffStats.empty}`, 'info');
            addLog(`  - Đơn delivery_staff = "NULL": ${deliveryStaffStats.nullStr}`, 'info');
            addLog(`  - Đơn delivery_staff = "EMPTY": ${deliveryStaffStats.emptyStr}`, 'info');
            addLog(`  - Đơn delivery_staff = "NONE": ${deliveryStaffStats.noneStr}`, 'info');
            addLog(`  - Tổng đơn có delivery_staff trống/null/empty: ${ordersArray.length}`, 'info');
            addLog(`  - Đơn bị loại trừ (Nhật Bản): ${ordersExcludedJapan.length}`, 'info');
            addLog(`  - Tổng tất cả đơn: ${allOrdersArray.length}`, 'info');
            console.log(`✅ [Chia đơn vận đơn] Query kết quả:`);
            console.log(`  - Đơn delivery_staff NULL: ${deliveryStaffStats.null}`);
            console.log(`  - Đơn delivery_staff empty string: ${deliveryStaffStats.empty}`);
            console.log(`  - Đơn delivery_staff = "NULL": ${deliveryStaffStats.nullStr}`);
            console.log(`  - Đơn delivery_staff = "EMPTY": ${deliveryStaffStats.emptyStr}`);
            console.log(`  - Đơn delivery_staff = "NONE": ${deliveryStaffStats.noneStr}`);
            console.log(`  - Tổng đơn có delivery_staff trống/null/empty: ${ordersArray.length}`);
            console.log(`  - Đơn bị loại trừ (Nhật Bản): ${ordersExcludedJapan.length}`);
            console.log(`  - Tổng tất cả đơn: ${allOrdersArray.length}`);
            console.log(`✅ [Chia đơn vận đơn] Đã lấy ${allOrdersArray.length} đơn từ Supabase (bảng orders)`);
            
            // Kiểm tra đơn đặc biệt trong dữ liệu lấy về
            const targetInAllOrders = allOrdersArray.find(o => o.order_code === TARGET_ORDER_CODE);
            if (targetInAllOrders) {
                console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn có trong dữ liệu từ bảng orders`);
                console.log(`  - delivery_staff: "${targetInAllOrders.delivery_staff || '(null)'}"`);
                console.log(`  - team: "${targetInAllOrders.team || '(null)'}"`);
                console.log(`  - country: "${targetInAllOrders.country || '(null)'}"`);
                console.log(`  - sale_staff: "${targetInAllOrders.sale_staff || '(null)'}"`);
            } else {
                console.log(`\n❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG có trong dữ liệu từ bảng orders!`);
                console.log(`  - Đơn không tồn tại trong database hoặc có lỗi khi query`);
                console.log(`  - Vui lòng kiểm tra xem đơn có tồn tại trong bảng orders không`);
            }

            // Thống kê delivery_staff để debug (tất cả đơn)
            const deliveryStaffStatsAll = {};
            allOrdersArray.forEach(order => {
                const ds = order.delivery_staff;
                let key = 'NULL';
                if (ds === null) key = 'NULL';
                else if (ds === undefined) key = 'UNDEFINED';
                else if (ds === '') key = 'EMPTY_STRING';
                else {
                    const dsStr = String(ds).trim().toUpperCase();
                    key = dsStr || 'EMPTY_AFTER_TRIM';
                }
                deliveryStaffStatsAll[key] = (deliveryStaffStatsAll[key] || 0) + 1;
            });
            console.log(`📊 [Chia đơn vận đơn] Thống kê delivery_staff (tất cả đơn):`, deliveryStaffStatsAll);
            
            // Log một vài đơn để kiểm tra
            if (ordersArray.length > 0) {
                console.log(`📋 [Chia đơn vận đơn] Sample đơn cần chia (5 đơn đầu):`);
                ordersArray.slice(0, 5).forEach((o, idx) => {
                    console.log(`  ${idx + 1}. ${o.order_code}: delivery_staff="${o.delivery_staff}" (type: ${typeof o.delivery_staff}), team="${o.team || '(null)'}", country="${o.country || '(null)'}"`);
                });
            }

            if (ordersArray.length === 0) {
                addLog('⚠️ Không tìm thấy đơn nào có delivery_staff trống/null/empty', 'warning');
                console.warn('⚠️ [Chia đơn vận đơn] Không tìm thấy đơn nào có delivery_staff trống/null/empty');
            }

            // --- Bước bổ sung: Điền team cho đơn hàng trống ---
            addLog('📋 Bước 5: Điền team cho đơn hàng chưa có team', 'info');
            // Lấy giá trị cột branch từ bảng users dựa trên sale_staff của đơn, điền vào cột team của order
            const ordersNeedTeam = ordersArray.filter(o => {
                const team = o.team?.toString().trim().toLowerCase() || '';
                const hcmVariants = ['hcm', 'hồ chí minh', 'ho chi minh', 'tp.hcm', 'tp hcm'];
                const hanoiVariants = ['hà nội', 'ha noi', 'hanoi', 'hn'];
                return !team || (!hcmVariants.includes(team) && !hanoiVariants.includes(team));
            });

            if (ordersNeedTeam.length > 0) {
                console.log(`🔍 [Chia đơn vận đơn] Có ${ordersNeedTeam.length} đơn chưa có team hoặc team không phải HCM/Hà Nội, đang điền lại...`);

                // Lấy danh sách users để tra cứu branch theo sale_staff
                const { data: allUsers, error: usersError } = await supabase
                    .from('users')
                    .select('name, branch');

                if (usersError) {
                    console.warn('⚠️ [Chia đơn vận đơn] Lỗi query users để lấy branch:', usersError);
                } else {
                    const nameToBranch = {};
                    (allUsers || []).forEach(u => {
                        if (u.name && u.branch) {
                            nameToBranch[u.name.trim()] = u.branch.trim();
                        }
                    });

                    console.log(`📋 [Chia đơn vận đơn] Đã load ${Object.keys(nameToBranch).length} mapping name->branch từ bảng users`);
                    if (Object.keys(nameToBranch).length > 0) {
                        console.log(`📋 [Chia đơn vận đơn] Sample mappings:`, Object.entries(nameToBranch).slice(0, 5));
                    }

                    const teamUpdates = [];
                    let foundCount = 0;
                    let notFoundCount = 0;
                    
                    ordersNeedTeam.forEach(order => {
                        // Log đặc biệt cho đơn cần kiểm tra
                        const isTargetOrder = order.order_code === TARGET_ORDER_CODE;
                        
                        // Tìm từ sale_staff
                        let foundBranch = null;
                        let foundName = null;
                        const saleStaffName = order.sale_staff?.toString().trim();
                        
                        if (isTargetOrder) {
                            console.log(`\n🔍 [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - ĐIỀN TEAM]`);
                            console.log(`  - sale_staff: "${saleStaffName || '(null)'}"`);
                            console.log(`  - team hiện tại: "${order.team || '(null)'}"`);
                        }
                        
                        if (saleStaffName && nameToBranch[saleStaffName]) {
                            foundBranch = nameToBranch[saleStaffName];
                            foundName = saleStaffName;
                            if (isTargetOrder) {
                                console.log(`  ✅ Tìm thấy branch: "${foundBranch}" cho sale_staff "${saleStaffName}"`);
                            }
                        } else {
                            // Thử tìm team từ các đơn khác có cùng sale_staff
                            if (saleStaffName) {
                                const otherOrdersWithSameSaleStaff = allOrdersArray.filter(o => {
                                    const otherSaleStaff = o.sale_staff?.toString().trim();
                                    return otherSaleStaff === saleStaffName && o.team && o.team.toString().trim() !== '';
                                });
                                
                                if (otherOrdersWithSameSaleStaff.length > 0) {
                                    // Lấy team phổ biến nhất từ các đơn khác
                                    const teamCounts = {};
                                    otherOrdersWithSameSaleStaff.forEach(o => {
                                        const team = o.team?.toString().trim() || '';
                                        if (team) {
                                            teamCounts[team] = (teamCounts[team] || 0) + 1;
                                        }
                                    });
                                    
                                    const mostCommonTeam = Object.keys(teamCounts).reduce((a, b) => 
                                        teamCounts[a] > teamCounts[b] ? a : b
                                    );
                                    
                                    const teamLower = mostCommonTeam.toLowerCase();
                                    if (teamLower.includes('hcm') || teamLower.includes('hồ chí minh') || teamLower.includes('ho chi minh')) {
                                        foundBranch = 'HCM';
                                        foundName = saleStaffName;
                                        if (isTargetOrder) {
                                            console.log(`  ✅ Tìm thấy team từ đơn khác: "${mostCommonTeam}" → HCM (từ ${otherOrdersWithSameSaleStaff.length} đơn khác)`);
                                        }
                                    } else if (teamLower.includes('hà nội') || teamLower.includes('hanoi') || teamLower.includes('ha noi')) {
                                        foundBranch = 'Hà Nội';
                                        foundName = saleStaffName;
                                        if (isTargetOrder) {
                                            console.log(`  ✅ Tìm thấy team từ đơn khác: "${mostCommonTeam}" → Hà Nội (từ ${otherOrdersWithSameSaleStaff.length} đơn khác)`);
                                        }
                                    } else {
                                        if (isTargetOrder) {
                                            console.log(`  ⚠ Team từ đơn khác "${mostCommonTeam}" không phải HCM/Hà Nội`);
                                        }
                                    }
                                } else {
                                    if (isTargetOrder) {
                                        console.log(`  ❌ Không tìm thấy đơn khác có cùng sale_staff "${saleStaffName}" với team hợp lệ`);
                                    }
                                }
                            }
                            
                            // Nếu vẫn chưa tìm thấy, thử tìm từ các đơn có cùng country
                            if (!foundBranch && order.country) {
                                const country = order.country.toString().trim();
                                const otherOrdersWithSameCountry = allOrdersArray.filter(o => {
                                    const otherCountry = o.country?.toString().trim();
                                    return otherCountry === country && 
                                           o.team && 
                                           o.team.toString().trim() !== '' &&
                                           o.order_code !== order.order_code; // Loại trừ chính đơn này
                                });
                                
                                if (otherOrdersWithSameCountry.length > 0) {
                                    // Lấy team phổ biến nhất từ các đơn có cùng country
                                    const teamCounts = {};
                                    otherOrdersWithSameCountry.forEach(o => {
                                        const team = o.team?.toString().trim() || '';
                                        if (team) {
                                            const teamLower = team.toLowerCase();
                                            // Chỉ tính các team hợp lệ (HCM hoặc Hà Nội)
                                            if (teamLower.includes('hcm') || teamLower.includes('hồ chí minh') || teamLower.includes('ho chi minh')) {
                                                teamCounts['HCM'] = (teamCounts['HCM'] || 0) + 1;
                                            } else if (teamLower.includes('hà nội') || teamLower.includes('hanoi') || teamLower.includes('ha noi')) {
                                                teamCounts['Hà Nội'] = (teamCounts['Hà Nội'] || 0) + 1;
                                            }
                                        }
                                    });
                                    
                                    if (Object.keys(teamCounts).length > 0) {
                                        const mostCommonTeam = Object.keys(teamCounts).reduce((a, b) => 
                                            teamCounts[a] > teamCounts[b] ? a : b
                                        );
                                        
                                        foundBranch = mostCommonTeam;
                                        if (isTargetOrder) {
                                            console.log(`  ✅ Tìm thấy team từ đơn có cùng country "${country}": "${mostCommonTeam}" (từ ${otherOrdersWithSameCountry.length} đơn khác)`);
                                        }
                                    } else {
                                        if (isTargetOrder) {
                                            console.log(`  ⚠ Có ${otherOrdersWithSameCountry.length} đơn khác có cùng country "${country}" nhưng không có team hợp lệ (HCM/Hà Nội)`);
                                        }
                                    }
                                } else {
                                    if (isTargetOrder) {
                                        console.log(`  ⚠ Không tìm thấy đơn khác có cùng country "${country}" với team hợp lệ`);
                                    }
                                }
                            }
                            
                            if (!foundBranch) {
                                if (isTargetOrder) {
                                    if (!saleStaffName) {
                                        console.log(`  ❌ sale_staff trống/null → Không thể điền team`);
                                        if (order.country) {
                                            console.log(`  - Đã thử tìm từ country "${order.country}" nhưng không tìm thấy đơn khác có team hợp lệ`);
                                        }
                                    } else {
                                        console.log(`  ❌ Không tìm thấy branch cho sale_staff "${saleStaffName}" trong bảng users và không có đơn khác để tham khảo`);
                                        console.log(`  - Kiểm tra xem "${saleStaffName}" có trong bảng users không`);
                                        console.log(`  - Kiểm tra xem "${saleStaffName}" có branch không`);
                                        if (order.country) {
                                            console.log(`  - Đã thử tìm từ country "${order.country}" nhưng không tìm thấy đơn khác có team hợp lệ`);
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (foundBranch) {
                            // Map branch sang format chuẩn (HCM hoặc Hà Nội)
                            // foundBranch có thể là 'HCM' hoặc 'Hà Nội' (nếu lấy từ đơn khác) hoặc branch từ users
                            let teamValue = foundBranch;
                            const branchLower = foundBranch.toLowerCase();
                            if (branchLower === 'hcm' || branchLower === 'hồ chí minh' || branchLower === 'ho chi minh' || branchLower.includes('hcm')) {
                                teamValue = 'HCM';
                            } else if (branchLower === 'hà nội' || branchLower === 'ha noi' || branchLower === 'hanoi' || branchLower.includes('hà nội')) {
                                teamValue = 'Hà Nội';
                            } else {
                                // Nếu branch không phải HCM/Hà Nội, bỏ qua
                                notFoundCount++;
                                if (isTargetOrder || notFoundCount <= 5) {
                                    console.log(`  ⚠ Đơn ${order.order_code}: branch "${foundBranch}" không phải HCM/Hà Nội`);
                                }
                                return;
                            }

                            teamUpdates.push({
                                order_code: order.order_code,
                                team: teamValue
                            });
                            // Cập nhật luôn trong array ordersArray để logic phía sau dùng đúng
                            order.team = teamValue;
                            foundCount++;
                            if (isTargetOrder || foundCount <= 10) {
                                console.log(`  ✓ [${foundCount}] Điền team "${teamValue}" cho đơn ${order.order_code} (sale_staff: ${foundName}, branch: ${foundBranch})`);
                            }
                        } else {
                            notFoundCount++;
                            if (isTargetOrder || notFoundCount <= 10) {
                                console.log(`  ✗ Không tìm thấy branch cho đơn ${order.order_code} (sale_staff: "${saleStaffName || '(null)'}")`);
                            }
                        }
                    });
                    
                    addLog(`📊 Kết quả điền team: ${foundCount} đơn tìm thấy, ${notFoundCount} đơn không tìm thấy`, 'info');
                    console.log(`📊 [Chia đơn vận đơn] Kết quả điền team: ${foundCount} đơn tìm thấy, ${notFoundCount} đơn không tìm thấy`);

                    if (teamUpdates.length > 0) {
                        addLog(`📝 Đang cập nhật team cho ${teamUpdates.length} đơn...`, 'info');
                        console.log(`📝 [Chia đơn vận đơn] Đang cập nhật team cho ${teamUpdates.length} đơn...`);
                        const CHUNK_SIZE = 50;
                        for (let i = 0; i < teamUpdates.length; i += CHUNK_SIZE) {
                            const chunk = teamUpdates.slice(i, i + CHUNK_SIZE);
                            const updatePromises = chunk.map(u =>
                                supabase
                                    .from('orders')
                                    .update({ team: u.team })
                                    .eq('order_code', u.order_code)
                            );
                            await Promise.all(updatePromises);
                        }
                        addLog(`✅ Đã điền team cho ${teamUpdates.length} đơn`, 'success');
                        console.log(`✅ [Chia đơn vận đơn] Đã điền team cho ${teamUpdates.length} đơn`);
                        toast.info(`Đã điền team cho ${teamUpdates.length} đơn trước khi chia`);
                        
                        // Sau khi điền team, reload lại ordersArray từ database để có dữ liệu mới nhất
                        console.log(`🔄 [Chia đơn vận đơn] Reload lại đơn hàng sau khi điền team...`);
                        const { data: reloadedOrders, error: reloadError } = await supabase
                            .from('orders')
                            .select('*')
                            .in('order_code', teamUpdates.map(u => u.order_code));
                        
                        if (!reloadError && reloadedOrders) {
                            // Cập nhật team trong ordersArray với dữ liệu mới từ DB
                            const orderCodeMap = {};
                            reloadedOrders.forEach(o => {
                                orderCodeMap[o.order_code] = o;
                            });
                            
                            ordersArray.forEach(order => {
                                if (orderCodeMap[order.order_code]) {
                                    const updatedOrder = orderCodeMap[order.order_code];
                                    const oldTeam = order.team;
                                    order.team = updatedOrder.team;
                                    // Cập nhật toàn bộ thông tin từ DB để đảm bảo đồng bộ
                                    Object.assign(order, updatedOrder);
                                    
                                    // Log đặc biệt cho đơn cần kiểm tra
                                    if (order.order_code === TARGET_ORDER_CODE) {
                                        console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - SAU KHI RELOAD]`);
                                        console.log(`  - team cũ: "${oldTeam || '(null)'}"`);
                                        console.log(`  - team mới: "${order.team || '(null)'}"`);
                                        console.log(`  - Đơn đã được cập nhật trong ordersArray`);
                                    }
                                }
                            });
                            console.log(`✅ [Chia đơn vận đơn] Đã reload ${reloadedOrders.length} đơn với team mới`);
                            
                            // Log một vài đơn để kiểm tra
                            reloadedOrders.slice(0, 5).forEach(o => {
                                console.log(`  ✓ Đơn ${o.order_code}: team="${o.team || '(null)'}"`);
                            });
                            
                            // Kiểm tra đơn đặc biệt sau khi reload
                            const targetAfterReload = ordersArray.find(o => o.order_code === TARGET_ORDER_CODE);
                            if (targetAfterReload) {
                                console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - SAU RELOAD]`);
                                console.log(`  - team trong ordersArray: "${targetAfterReload.team || '(null)'}"`);
                                console.log(`  - delivery_staff: "${targetAfterReload.delivery_staff || '(null)'}"`);
                                console.log(`  - country: "${targetAfterReload.country || '(null)'}"`);
                            }
                        }
                    } else {
                        console.log(`⚠️ [Chia đơn vận đơn] Không tìm được branch cho ${ordersNeedTeam.length} đơn (sale_staff không có trong bảng users hoặc không có branch)`);
                    }
                }
            }

            // Phân loại đơn theo Team (đơn Nhật Bản đã được loại trừ ở bước trước)
            addLog('📋 Bước 6: Phân loại đơn theo team (HCM/Hà Nội)', 'info');
            const ordersHCM = [];
            const ordersHaNoi = [];
            const ordersWithoutTeam = [];
            // Sử dụng ordersExcludedJapan đã được tạo ở bước trước
            const ordersExcluded = ordersExcludedJapan;

            addLog(`🔍 Bắt đầu phân loại ${ordersArray.length} đơn theo team...`, 'info');
            console.log(`🔍 [Chia đơn vận đơn] Bắt đầu phân loại ${ordersArray.length} đơn theo team...`);
            
            // Thống kê team trước khi phân loại
            const teamStats = {};
            const teamDetails = []; // Lưu chi tiết để debug
            ordersArray.forEach(order => {
                const team = order.team?.toString().trim() || '(null/empty)';
                teamStats[team] = (teamStats[team] || 0) + 1;
                
                // Lưu chi tiết 10 đơn đầu để debug
                if (teamDetails.length < 10) {
                    const teamLower = team.toLowerCase();
                    const isHCMCheck = team === 'HCM' || teamLower === 'hcm' || teamLower.includes('hcm') || teamLower.includes('hồ chí minh') || teamLower.includes('ho chi minh');
                    const isHanoiCheck = team === 'Hà Nội' || teamLower === 'hà nội' || teamLower === 'ha noi' || teamLower === 'hanoi' || teamLower.includes('hà nội') || teamLower.includes('hanoi') || teamLower.includes('ha noi');
                    teamDetails.push({
                        order_code: order.order_code,
                        team_raw: order.team,
                        team_trimmed: team,
                        team_lower: teamLower,
                        isHCM: isHCMCheck,
                        isHanoi: isHanoiCheck
                    });
                }
            });
            console.log(`📊 [Chia đơn vận đơn] Thống kê team trước khi phân loại:`, teamStats);
            if (teamDetails.length > 0) {
                console.log(`📋 [Chia đơn vận đơn] Chi tiết team của 10 đơn đầu:`, teamDetails);
            }

            ordersArray.forEach((order, index) => {
                const teamRaw = order.team?.toString() || '';
                const team = teamRaw.trim().toLowerCase();

                // Log đặc biệt cho đơn cần kiểm tra
                if (order.order_code === TARGET_ORDER_CODE) {
                    console.log(`\n🔍 [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - PHÂN LOẠI]`);
                    console.log(`  - team: "${teamRaw}" (normalized: "${team}")`);
                }

                // Debug: Log một vài đơn đầu tiên để kiểm tra
                if (index < 10 || order.order_code === TARGET_ORDER_CODE) {
                    console.log(`  [Đơn ${index + 1}] order_code: ${order.order_code}, team: "${teamRaw}" (normalized: "${team}"), delivery_staff: "${order.delivery_staff || '(null)'}", sale_staff: "${order.sale_staff || '(null)'}"`);
                }

                // KHÔNG cần kiểm tra Nhật Bản nữa vì đã loại trừ ở bước trước

                // Kiểm tra team - normalize và so sánh (mở rộng để nhận diện nhiều biến thể hơn)
                const teamNormalized = (teamRaw || '').toString().trim();
                const teamLower = teamNormalized.toLowerCase();
                
                // Loại bỏ các ký tự đặc biệt và khoảng trắng thừa để so sánh
                const teamClean = teamLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
                
                // Kiểm tra HCM - nhận diện nhiều biến thể
                const isHCM = teamNormalized === 'HCM' ||
                             teamLower === 'hcm' ||
                             teamClean === 'hcm' ||
                             teamLower === 'hồ chí minh' ||
                             teamLower === 'ho chi minh' ||
                             teamClean === 'hochiminh' ||
                             teamClean === 'ho chi minh' ||
                             teamLower.includes('hcm') ||
                             teamLower.includes('hồ chí minh') ||
                             teamLower.includes('ho chi minh') ||
                             teamClean.includes('hcm') ||
                             teamClean.includes('hochiminh');
                
                // Kiểm tra Hà Nội - nhận diện nhiều biến thể
                const isHanoi = teamNormalized === 'Hà Nội' ||
                               teamLower === 'hà nội' ||
                               teamClean === 'hanoi' ||
                               teamClean === 'ha noi' ||
                               teamLower === 'ha noi' ||
                               teamLower === 'hanoi' ||
                               teamLower.includes('hà nội') ||
                               teamLower.includes('hanoi') ||
                               teamLower.includes('ha noi') ||
                               teamClean.includes('hanoi') ||
                               teamClean.includes('hanoi');
                
                // Debug log để kiểm tra
                if (index < 5 || order.order_code === TARGET_ORDER_CODE) {
                    console.log(`  🔍 [Đơn ${index + 1}] order_code=${order.order_code}, team="${teamRaw}" -> normalized="${teamNormalized}" -> lower="${teamLower}" -> clean="${teamClean}" -> isHCM=${isHCM}, isHanoi=${isHanoi}`);
                }

                if (isHCM) {
                    if (order.order_code === TARGET_ORDER_CODE) {
                        console.log(`  ✅ Đơn ${TARGET_ORDER_CODE} được phân loại vào ordersHCM`);
                    }
                    ordersHCM.push(order);
                } else if (isHanoi) {
                    if (order.order_code === TARGET_ORDER_CODE) {
                        console.log(`  ✅ Đơn ${TARGET_ORDER_CODE} được phân loại vào ordersHaNoi`);
                    }
                    ordersHaNoi.push(order);
                } else {
                    if (order.order_code === TARGET_ORDER_CODE) {
                        console.log(`  ❌ Đơn ${TARGET_ORDER_CODE} KHÔNG được phân loại: team="${teamRaw}" không phải HCM/Hà Nội`);
                    }
                    ordersWithoutTeam.push({
                        ...order,
                        reason: `team="${teamRaw}" (normalized: "${team}", không phải HCM/Hà Nội)`
                    });
                }
            });

            addLog(`✅ Phân loại xong: HCM=${ordersHCM.length}, Hà Nội=${ordersHaNoi.length}, Không có team=${ordersWithoutTeam.length}, Loại trừ=${ordersExcluded.length}`, 'success');
            console.log(`✅ [Chia đơn vận đơn] Phân loại xong: HCM=${ordersHCM.length}, Hà Nội=${ordersHaNoi.length}, Không có team=${ordersWithoutTeam.length}, Loại trừ=${ordersExcluded.length}`);
            
            // Log chi tiết các đơn không có team
            if (ordersWithoutTeam.length > 0 && ordersWithoutTeam.length <= 20) {
                addLog(`📋 Danh sách đơn không có team/team khác (${ordersWithoutTeam.length} đơn)`, 'warning');
                console.log(`📋 [Chia đơn vận đơn] Danh sách đơn không có team/team khác (${ordersWithoutTeam.length} đơn):`);
                ordersWithoutTeam.forEach((o, idx) => {
                    console.log(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}", country="${o.country || '(null)'}", sale_staff="${o.sale_staff || '(null)'}"`);
                });
            } else if (ordersWithoutTeam.length > 20) {
                addLog(`📋 Có ${ordersWithoutTeam.length} đơn không có team/team khác`, 'warning');
                console.log(`📋 [Chia đơn vận đơn] Có ${ordersWithoutTeam.length} đơn không có team/team khác (chỉ hiển thị 10 đơn đầu):`);
                ordersWithoutTeam.slice(0, 10).forEach((o, idx) => {
                    console.log(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}", country="${o.country || '(null)'}", sale_staff="${o.sale_staff || '(null)'}"`);
                });
            }

            // Log thống kê
            addLog(`📊 Thống kê: Tổng đơn=${ordersArray.length}, HCM=${ordersHCM.length}, Hà Nội=${ordersHaNoi.length}, Không có team=${ordersWithoutTeam.length}, Loại trừ=${ordersExcluded.length}`, 'info');
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

            // Danh sách đơn không được chia (sẽ cập nhật sau khi chia xong)
            // Loại bỏ các đơn có lý do "Nhật Bản/CĐ Nhật Bản" khỏi danh sách hiển thị
            // (Đơn Nhật Bản đã được loại trừ ở bước phân loại, nên ordersWithoutTeam không chứa đơn Nhật Bản)
            let allNotDividedOrders = [...ordersWithoutTeam];

            // Thu thập lý do cụ thể cho đơn cần kiểm tra
            let targetOrderReason = null;
            // Tìm đơn trong allOrdersArray hoặc từ query trực tiếp
            let targetOrder = allOrdersArray.find(o => o.order_code === TARGET_ORDER_CODE);
            if (!targetOrder && targetOrderData) {
                targetOrder = targetOrderData;
            }
            
            if (targetOrder) {
                const reasons = [];
                
                // Kiểm tra delivery_staff
                const ds = targetOrder.delivery_staff;
                if (ds !== null && ds !== undefined && ds !== '') {
                    const dsStr = String(ds).trim().toUpperCase();
                    if (dsStr !== 'EMPTY' && dsStr !== 'NULL' && dsStr !== 'NONE') {
                        reasons.push(`delivery_staff không trống (giá trị: "${ds}") → Đơn bị lọc ra ở bước kiểm tra delivery_staff`);
                        reasons.push(`  → Đơn chỉ được chia khi delivery_staff là: null, undefined, '', 'EMPTY', 'NULL', hoặc 'NONE'`);
                    }
                }
                
                // Kiểm tra country
                const country = targetOrder.country?.toString().trim().toLowerCase() || '';
                const japanKeywords = ['nhật bản', 'nhat ban', 'japan', 'jp'];
                if (japanKeywords.some(keyword => country.includes(keyword))) {
                    reasons.push(`country = "${targetOrder.country}" (Nhật Bản)`);
                }
                
                // Kiểm tra team
                const team = targetOrder.team?.toString().trim() || '';
                const teamLower = team.toLowerCase();
                const isHCM = teamLower === 'hcm' || teamLower === 'hồ chí minh' || teamLower === 'ho chi minh' || teamLower.includes('hcm');
                const isHanoi = teamLower === 'hà nội' || teamLower === 'ha noi' || teamLower === 'hanoi' || teamLower.includes('hà nội') || teamLower.includes('hanoi');
                
                if (!team) {
                    reasons.push(`team trống/null`);
                } else if (!isHCM && !isHanoi) {
                    reasons.push(`team = "${team}" (không phải HCM/Hà Nội)`);
                }
                
                // Kiểm tra xem đơn có trong ordersHCM hoặc ordersHaNoi không
                const inHCM = ordersHCM.find(o => o.order_code === TARGET_ORDER_CODE);
                const inHaNoi = ordersHaNoi.find(o => o.order_code === TARGET_ORDER_CODE);
                if (!inHCM && !inHaNoi && (isHCM || isHanoi)) {
                    // Phân tích nguyên nhân chi tiết
                    const orderInArray = ordersArray.find(o => o.order_code === TARGET_ORDER_CODE);
                    let reasonDetail = `đơn có team hợp lệ ("${team}") nhưng không được phân loại vào ordersHCM/ordersHaNoi`;
                    
                    if (!orderInArray) {
                        const ds = targetOrder.delivery_staff;
                        let dsInfo = '';
                        if (ds === null || ds === undefined) {
                            dsInfo = 'null/undefined';
                        } else {
                            const dsTrimmed = String(ds).trim();
                            if (dsTrimmed === '') {
                                dsInfo = 'empty string';
                            } else {
                                const dsUpper = dsTrimmed.toUpperCase();
                                if (dsUpper === 'EMPTY' || dsUpper === 'NULL' || dsUpper === 'NONE') {
                                    dsInfo = `"${dsUpper}"`;
                                } else {
                                    dsInfo = `có giá trị "${ds}"`;
                                }
                            }
                        }
                        reasonDetail += `\n    → Nguyên nhân: Đơn không có trong ordersArray (bị lọc ở bước kiểm tra delivery_staff)`;
                        reasonDetail += `\n    → delivery_staff hiện tại: ${dsInfo}`;
                        reasonDetail += `\n    → Giải pháp: Đơn chỉ được chia khi delivery_staff là: null, undefined, '', 'EMPTY', 'NULL', hoặc 'NONE'`;
                    } else {
                        // Kiểm tra lại logic phân loại
                        const teamRawCheck = orderInArray.team?.toString() || '';
                        const teamNormalizedCheck = teamRawCheck.trim();
                        const teamLowerCheck = teamNormalizedCheck.toLowerCase();
                        
                        const isHCMCheck = teamNormalizedCheck === 'HCM' ||
                                         teamLowerCheck === 'hcm' ||
                                         teamLowerCheck === 'hồ chí minh' ||
                                         teamLowerCheck === 'ho chi minh' ||
                                         teamLowerCheck.includes('hcm') ||
                                         teamLowerCheck.includes('hồ chí minh') ||
                                         teamLowerCheck.includes('ho chi minh');
                        
                        const isHanoiCheck = teamNormalizedCheck === 'Hà Nội' ||
                                           teamLowerCheck === 'hà nội' ||
                                           teamLowerCheck === 'ha noi' ||
                                           teamLowerCheck === 'hanoi' ||
                                           teamLowerCheck.includes('hà nội') ||
                                           teamLowerCheck.includes('hanoi') ||
                                           teamLowerCheck.includes('ha noi');
                        
                        reasonDetail += `\n    → Kiểm tra lại logic phân loại:`;
                        reasonDetail += `\n      - teamRaw: "${teamRawCheck}"`;
                        reasonDetail += `\n      - teamNormalized: "${teamNormalizedCheck}"`;
                        reasonDetail += `\n      - teamLower: "${teamLowerCheck}"`;
                        reasonDetail += `\n      - isHCM: ${isHCMCheck}`;
                        reasonDetail += `\n      - isHanoi: ${isHanoiCheck}`;
                        
                        if (!isHCMCheck && !isHanoiCheck) {
                            reasonDetail += `\n    → Nguyên nhân: Logic phân loại không nhận diện được team "${teamRawCheck}" là HCM hoặc Hà Nội`;
                            reasonDetail += `\n      (Có thể do format team không khớp với điều kiện kiểm tra)`;
                        } else {
                            reasonDetail += `\n    → Nguyên nhân: Logic phân loại nhận diện được nhưng đơn vẫn không được thêm vào ordersHCM/ordersHaNoi`;
                            reasonDetail += `\n      (Có thể do lỗi trong quá trình push vào array)`;
                        }
                    }
                    
                    reasons.push(reasonDetail);
                }
                
                // Lưu tạm reasons để kiểm tra sau khi có updates
                // (sẽ cập nhật lại sau khi chia đơn)
                if (reasons.length > 0) {
                    targetOrderReason = `Đơn ${TARGET_ORDER_CODE} không được chia vì:\n${reasons.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}`;
                }
            } else {
                // Đơn không tồn tại trong database
                targetOrderReason = `Đơn ${TARGET_ORDER_CODE} KHÔNG TỒN TẠI trong bảng orders!\n\n` +
                    `Các khả năng:\n` +
                    `  1. Đơn chưa được import vào database\n` +
                    `  2. Đơn đã bị xóa\n` +
                    `  3. Mã đơn hàng không đúng\n` +
                    `  4. Đơn có thể ở bảng khác (không phải bảng orders)\n\n` +
                    `Vui lòng kiểm tra lại mã đơn hàng hoặc import đơn vào database trước khi chia.`;
            }

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
            // Bước 4: CHIA ĐƠN THEO 4 RULES + RULE LOẠI TRỪ NHẬT BẢN
            // 
            // RULE LOẠI TRỪ: Đơn có country = "Nhật Bản"/"CĐ Nhật Bản" sẽ KHÔNG được chia
            //   (Đã được xử lý ở bước 3a: ordersExcluded - dòng 1291-1296)
            //
            // Rule 1: Xác định người được chia cuối cùng (từ DB)
            // Rule 2: List nhân viên U1 đang đi làm (đã có ở trên)
            // Rule 3: Ưu tiên người có ít đơn hơn để cân bằng
            // Rule 4: Round-robin tiếp từ người sau người cuối cùng
            // ============================================================

            // Helper: Hàm chia đơn thông minh cho 1 chi nhánh
            // staffListWithBranch: array of {name, chi_nhanh}
            // pendingOrders: đơn cần chia (đã được lọc theo team)
            // allDBOrders: tất cả đơn trong DB (để đếm đơn hiện tại)
            // branchName: tên chi nhánh (HCM hoặc Hà Nội)
            const smartDistribute = (staffListWithBranch, pendingOrders, allDBOrders, branchName) => {
                console.log(`\n🔍 [${branchName}] smartDistribute được gọi với:`);
                console.log(`  - Số nhân viên: ${staffListWithBranch.length}`);
                console.log(`  - Số đơn cần chia: ${pendingOrders.length}`);
                console.log(`  - Số đơn trong DB để đếm: ${allDBOrders.length}`);
                
                if (staffListWithBranch.length === 0) {
                    console.warn(`⚠️ [${branchName}] Không có nhân viên để chia đơn!`);
                    return [];
                }
                if (pendingOrders.length === 0) {
                    console.warn(`⚠️ [${branchName}] Không có đơn nào cần chia!`);
                    return [];
                }

                const isTeamBranchMatch = (orderTeamRaw, staffChiNhanhRaw) => {
                    const orderTeam = orderTeamRaw?.toString().trim() || '';
                    const staffChiNhanh = staffChiNhanhRaw?.toString().trim() || '';
                    const orderTeamLower = orderTeam.toLowerCase();
                    const staffChiNhanhLower = staffChiNhanh.toLowerCase();
                    
                    // Loại bỏ các ký tự đặc biệt và khoảng trắng thừa để so sánh
                    const orderTeamClean = orderTeamLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();
                    const staffChiNhanhClean = staffChiNhanhLower.replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi, '').replace(/\s+/g, ' ').trim();

                    // Kiểm tra HCM - nhận diện nhiều biến thể
                    const orderIsHCM = orderTeam === 'HCM' ||
                                       orderTeamLower === 'hcm' ||
                                       orderTeamClean === 'hcm' ||
                                       orderTeamLower === 'hồ chí minh' ||
                                       orderTeamLower === 'ho chi minh' ||
                                       orderTeamClean === 'hochiminh' ||
                                       orderTeamLower.includes('hcm') ||
                                       orderTeamLower.includes('hồ chí minh') ||
                                       orderTeamLower.includes('ho chi minh') ||
                                       orderTeamClean.includes('hcm') ||
                                       orderTeamClean.includes('hochiminh');
                    
                    const staffIsHCM = staffChiNhanh === 'HCM' ||
                                      staffChiNhanhLower === 'hcm' ||
                                      staffChiNhanhClean === 'hcm' ||
                                      staffChiNhanhLower === 'hồ chí minh' ||
                                      staffChiNhanhLower === 'ho chi minh' ||
                                      staffChiNhanhClean === 'hochiminh' ||
                                      staffChiNhanhLower.includes('hcm') ||
                                      staffChiNhanhLower.includes('hồ chí minh') ||
                                      staffChiNhanhLower.includes('ho chi minh') ||
                                      staffChiNhanhClean.includes('hcm') ||
                                      staffChiNhanhClean.includes('hochiminh');
                    
                    const isHCM = orderIsHCM && staffIsHCM;

                    // Kiểm tra Hà Nội - nhận diện nhiều biến thể
                    const orderIsHanoi = orderTeam === 'Hà Nội' ||
                                        orderTeamLower === 'hà nội' ||
                                        orderTeamClean === 'hanoi' ||
                                        orderTeamClean === 'ha noi' ||
                                        orderTeamLower === 'ha noi' ||
                                        orderTeamLower === 'hanoi' ||
                                        orderTeamLower.includes('hà nội') ||
                                        orderTeamLower.includes('hanoi') ||
                                        orderTeamLower.includes('ha noi') ||
                                        orderTeamClean.includes('hanoi');
                    
                    const staffIsHanoi = staffChiNhanh === 'Hà Nội' ||
                                        staffChiNhanhLower === 'hà nội' ||
                                        staffChiNhanhClean === 'hanoi' ||
                                        staffChiNhanhClean === 'ha noi' ||
                                        staffChiNhanhLower === 'ha noi' ||
                                        staffChiNhanhLower === 'hanoi' ||
                                        staffChiNhanhLower.includes('hà nội') ||
                                        staffChiNhanhLower.includes('hanoi') ||
                                        staffChiNhanhLower.includes('ha noi') ||
                                        staffChiNhanhClean.includes('hanoi');
                    
                    const isHanoi = orderIsHanoi && staffIsHanoi;

                    return isHCM || isHanoi;
                };

                // Kiểm tra đơn đặc biệt
                const targetOrderInPending = pendingOrders.find(o => o.order_code === TARGET_ORDER_CODE);
                if (targetOrderInPending) {
                    console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - TRONG smartDistribute]`);
                    console.log(`  - Đơn có trong pendingOrders cho ${branchName}`);
                    console.log(`  - team: "${targetOrderInPending.team}"`);
                    console.log(`  - Số nhân viên: ${staffListWithBranch.length}`);
                }

                const result = [];
                const staffList = staffListWithBranch.map(s => s.name);

                // --- RULE 1: Xác định người được chia cuối cùng ---
                // MỚI: Lấy người có số lớn nhất trong cột thu_tu_chia của NGÀY HÔM TRƯỚC (ngay_chia_van_don)
                const staffSet = new Set(staffList);

                // Tính ngày hôm trước theo định dạng YYYY-MM-DD
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().slice(0, 10);

                // Ưu tiên: tìm trong allDBOrders các đơn đã chia ngày hôm trước cho nhóm nhân viên này
                const yesterdayAssigned = allDBOrders
                    .filter(o => {
                        const ds = o.delivery_staff?.toString().trim();
                        const ngayChia = o.ngay_chia_van_don?.toString().slice(0, 10); // phòng trường hợp là Date/Timestamp
                        const thuTu = o.thu_tu_chia;
                        return (
                            ds &&
                            staffSet.has(ds) &&
                            ngayChia === yesterdayStr &&
                            thuTu !== null &&
                            thuTu !== undefined
                        );
                    })
                    .sort((a, b) => {
                        const aVal = Number(a.thu_tu_chia) || 0;
                        const bVal = Number(b.thu_tu_chia) || 0;
                        // Lớn hơn = được chia sau hơn
                        return bVal - aVal;
                    });

                let lastAssignedPerson = null;

                if (yesterdayAssigned.length > 0) {
                    // Lấy người được chia CUỐI CÙNG trong ngày hôm trước
                    lastAssignedPerson = yesterdayAssigned[0].delivery_staff?.toString().trim() || null;
                    console.log(`🔍 [${branchName}] Rule 1 - Dùng thu_tu_chia ngày hôm trước (${yesterdayStr}), người cuối cùng: "${lastAssignedPerson}"`);
                } else {
                    // Fallback cũ: nếu chưa có dữ liệu thu_tu_chia, dùng đơn mới nhất theo id/order_date
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

                    lastAssignedPerson = assignedOrders.length > 0
                        ? assignedOrders[0].delivery_staff.trim()
                        : null;

                    console.log(`🔍 [${branchName}] Rule 1 - Không tìm thấy thu_tu_chia ngày hôm trước, fallback dùng đơn mới nhất trong DB`);
                }

                const lastAssignedIndex = lastAssignedPerson
                    ? staffList.indexOf(lastAssignedPerson)
                    : -1;

                console.log(`🔍 [${branchName}] Rule 1 - Người được chia cuối cùng: "${lastAssignedPerson || '(không có)'}" (index: ${lastAssignedIndex})`);

                // --- RULE 2: List nhân viên U1 (đã có sẵn = staffList) ---
                console.log(`👥 [${branchName}] Rule 2 - Nhân viên U1: [${staffList.join(', ')}]`);

                // Bỏ RULE 3: không cân bằng theo số đơn nữa, chỉ dùng round-robin theo thứ tự danh sách U1
                let remainingOrders = [...pendingOrders];

                // --- RULE 4: Round-robin phần còn lại từ người tiếp theo sau người cuối cùng ---
                if (remainingOrders.length > 0) {
                    // Bắt đầu từ người SAU người được chia cuối cùng (Rule 1)
                    let startIndex = lastAssignedIndex >= 0
                        ? (lastAssignedIndex + 1) % staffListWithBranch.length
                        : 0;

                    console.log(`🔄 [${branchName}] Rule 4 - Round-robin ${remainingOrders.length} đơn còn lại, bắt đầu từ index ${startIndex} ("${staffListWithBranch[startIndex].name}")`);

                    let nextIndex = startIndex;

                    remainingOrders.forEach((order, i) => {
                        let assigned = false;

                        for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
                            const idx = (nextIndex + attempt) % staffListWithBranch.length;
                            const staff = staffListWithBranch[idx];
                            const orderTeam = order.team?.toString().trim() || '';
                            const staffChiNhanh = staff.chi_nhanh?.toString().trim() || '';
                            const isMatch = isTeamBranchMatch(orderTeam, staffChiNhanh);

                            // Log đặc biệt cho đơn cần kiểm tra
                            if (order.order_code === TARGET_ORDER_CODE) {
                                console.log(`\n🔍 [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE} - Rule 4]`);
                                console.log(`  - orderTeam: "${order.team || '(null)'}"`);
                                console.log(`  - staffChiNhanh: "${staff.chi_nhanh}"`);
                                console.log(`  - staff.name: "${staff.name}"`);
                                console.log(`  - index: ${idx}, startIndex: ${startIndex}, i: ${i}, attempt: ${attempt}`);
                                console.log(`  - isMatch: ${isMatch}`);
                            }

                            if (!isMatch) {
                                continue;
                            }

                            if (order.order_code === TARGET_ORDER_CODE) {
                                console.log(`  ✅ Đơn ${TARGET_ORDER_CODE} được chia cho: ${staff.name}`);
                            }

                            result.push({
                                order_code: order.order_code,
                                delivery_staff: staff.name
                            });

                            // Tiếp tục vòng tròn sau người vừa nhận đơn để giữ round-robin công bằng
                            nextIndex = (idx + 1) % staffListWithBranch.length;
                            assigned = true;
                            break;
                        }

                        if (!assigned) {
                            const orderTeam = order.team?.toString().trim() || '';
                            console.warn(`⚠️ [${branchName}] Rule 4 - Bỏ qua đơn ${order.order_code}: không tìm thấy nhân viên nào có chi_nhanh khớp với team="${orderTeam}"`);
                            // Log chi tiết để debug
                            console.warn(`  - Danh sách nhân viên và chi_nhanh:`);
                            staffListWithBranch.forEach(s => {
                                const isMatch = isTeamBranchMatch(orderTeam, s.chi_nhanh);
                                console.warn(`    - ${s.name}: chi_nhanh="${s.chi_nhanh}", isMatch=${isMatch}`);
                            });
                        }
                    });
                    console.log(`✅ [${branchName}] Rule 4 - Đã chia đơn theo round-robin`);
                } else if (balanceUpdates.length === 0 && pendingOrders.length > 0) {
                    // Trường hợp đặc biệt: Rule 3 không chia gì nhưng không còn đơn (không nên xảy ra)
                    console.error(`❌ [${branchName}] LỖI: Có ${pendingOrders.length} đơn cần chia nhưng không chia được!`);
                }

                // Log tổng kết
                const finalCount = {};
                staffList.forEach(name => { finalCount[name] = 0; });
                result.forEach(u => { finalCount[u.delivery_staff]++; });
                console.log(`✅ [${branchName}] Kết quả chia ${result.length} đơn:`, finalCount);
                
                if (result.length === 0 && pendingOrders.length > 0) {
                    console.warn(`⚠️ [${branchName}] CẢNH BÁO: Có ${pendingOrders.length} đơn cần chia nhưng không chia được!`);
                    console.warn(`  - Có thể do không khớp chi_nhanh giữa đơn và nhân viên`);
                    console.warn(`  - Sample đơn đầu tiên:`, pendingOrders[0] ? {
                        order_code: pendingOrders[0].order_code,
                        team: pendingOrders[0].team,
                        staff_chi_nhanh: staffListWithBranch.map(s => s.chi_nhanh)
                    } : 'N/A');
                }

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
            addLog('📋 Bước 7: Bắt đầu chia đơn theo 4 rules', 'info');
            if (!branchFilter || branchFilter === 'HCM') {
                addLog(`📋 Chia đơn HCM - Nhân viên: ${nhanVienHCM.length} người, Đơn cần chia: ${ordersHCM.length} đơn`, 'info');
                console.log(`\n📋 [Chia đơn vận đơn] ========== BẮT ĐẦU CHIA ĐƠN HCM ==========`);
                console.log(`📋 [Chia đơn vận đơn] HCM - Nhân viên: ${nhanVienHCM.length} người`);
                nhanVienHCM.forEach((nv, idx) => {
                    console.log(`  ${idx + 1}. ${nv.name} (chi_nhanh: "${nv.chi_nhanh}")`);
                });
                console.log(`📋 [Chia đơn vận đơn] HCM - Đơn cần chia: ${ordersHCM.length} đơn`);
                if (ordersHCM.length > 0 && ordersHCM.length <= 10) {
                    ordersHCM.forEach((o, idx) => {
                        console.log(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}"`);
                    });
                }
                
                if (nhanVienHCM.length > 0 && ordersHCM.length > 0) {
                    const hcmUpdates = smartDistribute(nhanVienHCM, ordersHCM, allDBOrdersHCM, 'HCM');
                    addLog(`✅ HCM - Kết quả: ${hcmUpdates.length} đơn được chia`, 'success');
                    console.log(`✅ [Chia đơn vận đơn] HCM - Kết quả: ${hcmUpdates.length} đơn được chia`);
                    if (hcmUpdates.length > 0) {
                        console.log(`📋 [Chia đơn vận đơn] HCM - Chi tiết đơn được chia:`);
                        hcmUpdates.forEach((u, idx) => {
                            console.log(`  ${idx + 1}. ${u.order_code} -> ${u.delivery_staff}`);
                        });
                    }
                    updates.push(...hcmUpdates);
                } else {
                    addLog(`⚠️ HCM - Không chia được: nhân viên=${nhanVienHCM.length}, đơn=${ordersHCM.length}`, 'warning');
                    console.warn(`⚠️ [Chia đơn vận đơn] HCM - Không chia được: nhân viên=${nhanVienHCM.length}, đơn=${ordersHCM.length}`);
                }
            } else {
                console.log('⏭️ Bỏ qua chia HCM vì branchFilter != HCM');
            }

            // Chia đơn Hà Nội
            if (!branchFilter || branchFilter === 'Hà Nội') {
                addLog(`📋 Chia đơn Hà Nội - Nhân viên: ${nhanVienHaNoi.length} người, Đơn cần chia: ${ordersHaNoi.length} đơn`, 'info');
                console.log(`\n📋 [Chia đơn vận đơn] ========== BẮT ĐẦU CHIA ĐƠN HÀ NỘI ==========`);
                console.log(`📋 [Chia đơn vận đơn] Hà Nội - Nhân viên: ${nhanVienHaNoi.length} người`);
                nhanVienHaNoi.forEach((nv, idx) => {
                    console.log(`  ${idx + 1}. ${nv.name} (chi_nhanh: "${nv.chi_nhanh}")`);
                });
                console.log(`📋 [Chia đơn vận đơn] Hà Nội - Đơn cần chia: ${ordersHaNoi.length} đơn`);
            
            // Kiểm tra đơn đặc biệt
            const targetOrderInHaNoi = ordersHaNoi.find(o => o.order_code === TARGET_ORDER_CODE);
            if (targetOrderInHaNoi) {
                console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn có trong ordersHaNoi!`);
                console.log(`  - team: "${targetOrderInHaNoi.team}"`);
                console.log(`  - country: "${targetOrderInHaNoi.country}"`);
            } else {
                console.log(`\n❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG có trong ordersHaNoi!`);
                // Tìm đơn trong ordersArray
                const targetInArray = ordersArray.find(o => o.order_code === TARGET_ORDER_CODE);
                if (targetInArray) {
                    console.log(`  - Đơn có trong ordersArray nhưng không được phân loại vào ordersHaNoi`);
                    console.log(`  - team trong ordersArray: "${targetInArray.team || '(null)'}"`);
                    console.log(`  - country: "${targetInArray.country || '(null)'}"`);
                } else {
                    console.log(`  - Đơn KHÔNG có trong ordersArray (có thể bị lọc ở bước delivery_staff)`);
                }
            }
            
            if (ordersHaNoi.length > 0 && ordersHaNoi.length <= 10) {
                ordersHaNoi.forEach((o, idx) => {
                    console.log(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}"`);
                });
            }
            
            if (nhanVienHaNoi.length > 0 && ordersHaNoi.length > 0) {
                const hanoiUpdates = smartDistribute(nhanVienHaNoi, ordersHaNoi, allDBOrdersHaNoi, 'Hà Nội');
                addLog(`✅ Hà Nội - Kết quả: ${hanoiUpdates.length} đơn được chia`, 'success');
                console.log(`✅ [Chia đơn vận đơn] Hà Nội - Kết quả: ${hanoiUpdates.length} đơn được chia`);
                
                // Kiểm tra đơn đặc biệt trong kết quả
                const targetInUpdates = hanoiUpdates.find(u => u.order_code === TARGET_ORDER_CODE);
                if (targetInUpdates) {
                    console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn đã được chia cho: ${targetInUpdates.delivery_staff}`);
                } else {
                    console.log(`\n❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG có trong kết quả chia!`);
                }
                
                if (hanoiUpdates.length > 0) {
                    console.log(`📋 [Chia đơn vận đơn] Hà Nội - Chi tiết đơn được chia:`);
                    hanoiUpdates.forEach((u, idx) => {
                        console.log(`  ${idx + 1}. ${u.order_code} -> ${u.delivery_staff}`);
                    });
                }
                updates.push(...hanoiUpdates);
            } else {
                addLog(`⚠️ Hà Nội - Không chia được: nhân viên=${nhanVienHaNoi.length}, đơn=${ordersHaNoi.length}`, 'warning');
                console.warn(`⚠️ [Chia đơn vận đơn] Hà Nội - Không chia được: nhân viên=${nhanVienHaNoi.length}, đơn=${ordersHaNoi.length}`);
            }
            } else {
                console.log('⏭️ Bỏ qua chia Hà Nội vì branchFilter != Hà Nội');
            }

            addLog(`📊 Tổng số đơn sẽ được cập nhật: ${updates.length}`, 'info');
            console.log(`📊 [Chia đơn vận đơn] Tổng số đơn sẽ được cập nhật: ${updates.length}`);
            
            // Log tổng hợp để debug
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📊 [TỔNG HỢP QUÁ TRÌNH CHIA ĐƠN]`);
            console.log(`${'='.repeat(60)}`);
            console.log(`1. Tổng đơn có delivery_staff trống/null: ${ordersArray.length}`);
            console.log(`2. Đơn HCM: ${ordersHCM.length}`);
            console.log(`3. Đơn Hà Nội: ${ordersHaNoi.length}`);
            console.log(`4. Đơn không có team/team khác: ${ordersWithoutTeam.length}`);
            console.log(`5. Đơn bị loại trừ (Nhật Bản): ${ordersExcluded.filter(o => o.reason?.includes('Nhật Bản')).length}`);
            console.log(`6. Nhân viên HCM (U1): ${nhanVienHCM.length}`);
            console.log(`7. Nhân viên Hà Nội (U1): ${nhanVienHaNoi.length}`);
            console.log(`8. Tổng đơn sẽ được cập nhật: ${updates.length}`);
            
            if (updates.length === 0) {
                console.warn(`\n⚠️ [CẢNH BÁO] Không có đơn nào được chia!`);
                if (ordersArray.length === 0) {
                    console.warn(`  - Nguyên nhân: Không có đơn nào có delivery_staff trống/null`);
                } else if (ordersHCM.length === 0 && ordersHaNoi.length === 0) {
                    console.warn(`  - Nguyên nhân: Tất cả đơn đều không có team hoặc team không phải HCM/Hà Nội`);
                    console.warn(`  - Đơn không có team: ${ordersWithoutTeam.length}`);
                } else if (nhanVienHCM.length === 0 && nhanVienHaNoi.length === 0) {
                    console.warn(`  - Nguyên nhân: Không có nhân viên U1 nào`);
                } else {
                    console.warn(`  - Nguyên nhân: Đơn có trong danh sách chia nhưng không được gán cho nhân viên`);
                    console.warn(`  - Có thể do không khớp chi_nhanh giữa đơn và nhân viên`);
                }
            }
            console.log(`${'='.repeat(60)}\n`);

            // Kiểm tra đơn có trong danh sách chia nhưng không được gán
            const orderCodesInUpdates = new Set(updates.map(u => u.order_code));
            const ordersNotAssigned = [];
            
            [...ordersHCM, ...ordersHaNoi].forEach(order => {
                if (!orderCodesInUpdates.has(order.order_code)) {
                    // Đơn có trong danh sách chia nhưng không được gán
                    const orderTeam = order.team?.toString().trim() || '';
                    const isHCM = orderTeam.toLowerCase().includes('hcm') || orderTeam.toLowerCase().includes('hồ chí minh');
                    const isHanoi = orderTeam.toLowerCase().includes('hà nội') || orderTeam.toLowerCase().includes('hanoi') || orderTeam.toLowerCase().includes('ha noi');
                    
                    let reason = 'Đơn có trong danh sách chia nhưng không được gán cho nhân viên';
                    if (isHCM && nhanVienHCM.length === 0) {
                        reason += ' (Không có nhân viên U1 thuộc HCM)';
                    } else if (isHanoi && nhanVienHaNoi.length === 0) {
                        reason += ' (Không có nhân viên U1 thuộc Hà Nội)';
                    } else {
                        reason += ' (Có thể do không khớp chi_nhanh giữa đơn và nhân viên, hoặc không có nhân viên phù hợp)';
                    }
                    
                    ordersNotAssigned.push({
                        ...order,
                        reason: reason
                    });
                }
            });
            
            if (ordersNotAssigned.length > 0) {
                console.warn(`⚠️ [Chia đơn vận đơn] Có ${ordersNotAssigned.length} đơn có trong danh sách chia nhưng không được gán:`);
                ordersNotAssigned.slice(0, 10).forEach((o, idx) => {
                    console.warn(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}", reason: ${o.reason}`);
                });
            }
            
            // Cập nhật danh sách đơn không được chia
            // Loại bỏ các đơn có lý do "Nhật Bản/CĐ Nhật Bản" khỏi danh sách hiển thị
            // (ordersNotAssigned chỉ chứa đơn đã được phân loại vào HCM/Hà Nội, nên không có đơn Nhật Bản)
            // Nhưng vẫn lọc để đảm bảo an toàn
            const ordersNotAssignedFiltered = ordersNotAssigned.filter(o => {
                const reason = o.reason?.toLowerCase() || '';
                return !reason.includes('nhật bản') && !reason.includes('cđ nhật bản') && !reason.includes('japan');
            });
            allNotDividedOrders = [...allNotDividedOrders, ...ordersNotAssignedFiltered];
            
            // Sắp xếp theo order_date giảm dần (ngày gần nhất lên đầu)
            allNotDividedOrders.sort((a, b) => {
                const dateA = a.order_date ? new Date(a.order_date) : new Date(0);
                const dateB = b.order_date ? new Date(b.order_date) : new Date(0);
                return dateB - dateA; // Giảm dần: ngày mới hơn lên đầu
            });
            
            setNotDividedOrders(allNotDividedOrders);

            // Cập nhật lại lý do cho đơn cần kiểm tra sau khi có updates
            if (targetOrder && targetOrderReason) {
                const inUpdates = updates.find(u => u.order_code === TARGET_ORDER_CODE);
                if (!inUpdates) {
                    const inHCM = ordersHCM.find(o => o.order_code === TARGET_ORDER_CODE);
                    const inHaNoi = ordersHaNoi.find(o => o.order_code === TARGET_ORDER_CODE);
                    if (inHCM || inHaNoi) {
                        const notAssignedOrder = ordersNotAssigned.find(o => o.order_code === TARGET_ORDER_CODE);
                        if (notAssignedOrder) {
                            targetOrderReason += `\n  - ${notAssignedOrder.reason}`;
                        } else {
                            targetOrderReason += `\n  - Đơn có trong danh sách chia nhưng không được gán cho nhân viên (có thể do không khớp chi_nhanh)`;
                        }
                    }
                } else {
                    targetOrderReason = `Đơn ${TARGET_ORDER_CODE} đã được chia thành công cho: ${inUpdates.delivery_staff}`;
                }
            }

            // Hiển thị lý do cụ thể cho đơn cần kiểm tra
            if (targetOrderReason) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`🔍 [LÝ DO ĐƠN ${TARGET_ORDER_CODE} KHÔNG ĐƯỢC CHIA]`);
                console.log(targetOrderReason);
                console.log(`${'='.repeat(60)}\n`);
            }

            // Bước 8: Cập nhật database
            if (updates.length > 0) {
                // Chuẩn hóa ngày hôm nay để dùng chung cho ngay_chia_van_don và tính thứ tự chia
                const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

                // Biến lưu "thứ tự chia" lớn nhất trong NGÀY HÔM NAY (toàn cục, không theo nhân viên)
                let globalOrderIndex = 0;

                try {
                    // Lấy các đơn đã được chia trong ngày hôm nay để biết thu_tu_chia hiện tại
                    const { data: todayAssignedOrders, error: todayAssignedError } = await supabase
                        .from('orders')
                        .select('delivery_staff, thu_tu_chia, ngay_chia_van_don')
                        .eq('ngay_chia_van_don', todayStr)
                        .not('delivery_staff', 'is', null);

                    if (todayAssignedError) {
                        console.warn('⚠️ [Chia đơn vận đơn] Không lấy được thu_tu_chia hiện tại, sẽ bắt đầu từ 0 cho tất cả:', todayAssignedError);
                    } else if (todayAssignedOrders && todayAssignedOrders.length > 0) {
                        todayAssignedOrders.forEach((row) => {
                            const idx = Number(row.thu_tu_chia) || 0;
                            if (idx > globalOrderIndex) {
                                globalOrderIndex = idx;
                            }
                        });
                    }
                } catch (e) {
                    console.warn('⚠️ [Chia đơn vận đơn] Lỗi khi khởi tạo thu_tu_chia, sẽ bắt đầu từ 0:', e);
                }
                addLog(`📋 Bước 8: Cập nhật database cho ${updates.length} đơn hàng`, 'info');
                addLog(`🔄 Bắt đầu cập nhật ${updates.length} đơn hàng...`, 'info');
                console.log(`🔄 [Chia đơn vận đơn] Bắt đầu cập nhật ${updates.length} đơn hàng...`);
                const CHUNK_SIZE = 50;
                successCount = 0;
                errorCount = 0;
                errors.length = 0; // Clear array

                for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                    const chunk = updates.slice(i, i + CHUNK_SIZE);
                    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
                    const totalChunks = Math.ceil(updates.length / CHUNK_SIZE);
                    addLog(`📦 Đang xử lý chunk ${chunkNum}/${totalChunks} (${chunk.length} đơn)`, 'info');
                    console.log(`📦 [Chia đơn vận đơn] Đang xử lý chunk ${chunkNum}/${totalChunks} (${chunk.length} đơn)`);

                    const updatePromises = chunk.map(async (update) => {
                        try {
                            // Thứ tự chia toàn cục trong ngày (1,2,3...) – không phụ thuộc nhân viên
                            globalOrderIndex += 1;
                            const nextOrderIndex = globalOrderIndex;

                            const { data, error } = await supabase
                                .from('orders')
                                .update({
                                    delivery_staff: update.delivery_staff,
                                    // Ghi lại ngày chia vận đơn là ngày hiện tại
                                    ngay_chia_van_don: todayStr, // format: YYYY-MM-DD
                                    // Ghi lại thứ tự chia trong ngày (toàn cục, không trùng)
                                    thu_tu_chia: nextOrderIndex,
                                })
                                .eq('order_code', update.order_code)
                                .select();

                            if (error) {
                                console.error(`❌ [Chia đơn vận đơn] Lỗi update đơn ${update.order_code}:`, error);
                                errors.push({ order_code: update.order_code, error: error.message });
                                errorCount++;
                                return { success: false, error };
                            }

                            // Kiểm tra xem update có thành công không
                            if (data && data.length > 0) {
                                const updatedOrder = data[0];
                                if (updatedOrder.delivery_staff === update.delivery_staff) {
                                    successCount++;
                                    if (successCount <= 5) {
                                        console.log(`✅ [Chia đơn vận đơn] Đã cập nhật đơn ${update.order_code} -> ${update.delivery_staff}`);
                                    }
                                    return { success: true, data };
                                } else {
                                    console.warn(`⚠️ [Chia đơn vận đơn] Đơn ${update.order_code} được update nhưng delivery_staff không khớp: expected="${update.delivery_staff}", actual="${updatedOrder.delivery_staff}"`);
                                    successCount++; // Vẫn tính là thành công vì đã update được
                                    return { success: true, data };
                                }
                            } else {
                                console.warn(`⚠️ [Chia đơn vận đơn] Đơn ${update.order_code} update không trả về data (có thể đơn không tồn tại)`);
                                errorCount++;
                                errors.push({ order_code: update.order_code, error: 'No data returned from update' });
                                return { success: false, error: new Error('No data returned') };
                            }
                        } catch (err) {
                            console.error(`❌ [Chia đơn vận đơn] Exception khi update đơn ${update.order_code}:`, err);
                            errors.push({ order_code: update.order_code, error: err.message });
                            errorCount++;
                            return { success: false, error: err };
                        }
                    });

                    const results = await Promise.all(updatePromises);
                    const chunkSuccess = results.filter(r => r.success).length;
                    addLog(`✅ Chunk ${chunkNum} hoàn tất: ${chunkSuccess}/${chunk.length} thành công`, 'success');
                    console.log(`✅ [Chia đơn vận đơn] Chunk ${chunkNum} hoàn tất: ${chunkSuccess}/${chunk.length} thành công`);
                }

                addLog(`📊 Kết quả cập nhật: ${successCount} thành công, ${errorCount} lỗi`, successCount > 0 ? 'success' : 'warning');
                console.log(`📊 [Chia đơn vận đơn] Kết quả cập nhật: ${successCount} thành công, ${errorCount} lỗi`);

                if (errors.length > 0) {
                    addLog(`⚠️ Có ${errors.length} đơn bị lỗi khi cập nhật`, 'error');
                    console.warn(`⚠️ [Chia đơn vận đơn] Danh sách lỗi:`, errors);
                }
            } else {
                addLog('⚠️ Không có đơn nào để cập nhật!', 'warning');
                console.warn('⚠️ [Chia đơn vận đơn] Không có đơn nào để cập nhật!');
            }

            addLog(`✅ Hoàn tất quá trình chia đơn vận đơn!`, 'success');
            let message = `✅ Chia đơn vận đơn ${updates.length > 0 ? 'đã hoàn tất' : 'không có đơn để chia'}!\n\n` +
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
                `- Đơn không có team/team khác: ${ordersWithoutTeam.length}\n`;
            
            // LUÔN hiển thị lý do cụ thể cho đơn cần kiểm tra ở phần Lỗi
            // Đảm bảo luôn có thông tin về đơn này
            let targetOrderInfo = '';
            
            if (targetOrderReason) {
                targetOrderInfo = `\n\n${'='.repeat(60)}\n` +
                    `❌ LỖI: ĐƠN ${TARGET_ORDER_CODE} KHÔNG ĐƯỢC CHIA\n` +
                    `${'='.repeat(60)}\n` +
                    targetOrderReason +
                    `\n${'='.repeat(60)}\n`;
            } else {
                // Nếu không có targetOrderReason, vẫn hiển thị thông tin kiểm tra
                const targetOrder = allOrdersArray.find(o => o.order_code === TARGET_ORDER_CODE);
                if (!targetOrder && targetOrderData) {
                    targetOrderInfo = `\n\n${'='.repeat(60)}\n` +
                        `❌ LỖI: ĐƠN ${TARGET_ORDER_CODE} KHÔNG TỒN TẠI\n` +
                        `${'='.repeat(60)}\n` +
                        `Đơn ${TARGET_ORDER_CODE} không tìm thấy trong bảng orders!\n` +
                        `Vui lòng kiểm tra lại mã đơn hàng hoặc import đơn vào database.\n` +
                        `${'='.repeat(60)}\n`;
                } else if (targetOrderData) {
                    // Hiển thị thông tin delivery_staff nếu có
                    const ds = targetOrderData.delivery_staff;
                    let dsStatus = '';
                    if (ds === null || ds === undefined) {
                        dsStatus = 'null/undefined';
                    } else {
                        const dsTrimmed = String(ds).trim();
                        if (dsTrimmed === '') {
                            dsStatus = 'empty string';
                        } else {
                            const dsUpper = dsTrimmed.toUpperCase();
                            if (dsUpper === 'EMPTY' || dsUpper === 'NULL' || dsUpper === 'NONE') {
                                dsStatus = `"${dsUpper}"`;
                            } else {
                                dsStatus = `có giá trị "${ds}"`;
                            }
                        }
                    }
                    
                    targetOrderInfo = `\n\n${'='.repeat(60)}\n` +
                        `❌ LỖI: ĐƠN ${TARGET_ORDER_CODE} KHÔNG ĐƯỢC CHIA\n` +
                        `${'='.repeat(60)}\n` +
                        `Thông tin đơn:\n` +
                        `- delivery_staff: ${dsStatus}\n` +
                        `- team: "${targetOrderData.team || '(null)'}"\n` +
                        `- country: "${targetOrderData.country || '(null)'}"\n` +
                        `- sale_staff: "${targetOrderData.sale_staff || '(null)'}"\n` +
                        `${'='.repeat(60)}\n`;
                } else {
                    // Nếu không có targetOrderData, vẫn hiển thị thông báo
                    targetOrderInfo = `\n\n${'='.repeat(60)}\n` +
                        `❌ LỖI: ĐƠN ${TARGET_ORDER_CODE} KHÔNG TỒN TẠI\n` +
                        `${'='.repeat(60)}\n` +
                        `Đơn ${TARGET_ORDER_CODE} không tìm thấy trong database!\n` +
                        `Vui lòng kiểm tra lại mã đơn hàng.\n` +
                        `${'='.repeat(60)}\n`;
                }
            }
            
            // LUÔN thêm thông tin về đơn vào message
            message += targetOrderInfo;
            
            message += (ordersNotDivided > 0 ? `\n⚠️ CẢNH BÁO: Có ${ordersNotDivided} đơn có delivery_staff trống nhưng không được chia!\n` +
                    `   (Có thể do: không có team, team khác HCM/Hà Nội, hoặc country = Nhật Bản)\n` : '') +
                (errorCount > 0 ? `\n⚠️ LỖI: Có ${errorCount} đơn không thể cập nhật. Vui lòng kiểm tra Console để xem chi tiết.\n` : '');

            // Luôn hiển thị là lỗi nếu đơn cần kiểm tra không được chia
            const isSuccess = updates.length > 0 && errorCount === 0;
            const hasTargetOrderIssue = targetOrderReason && !targetOrderReason.includes('đã được chia thành công');
            const finalSuccess = isSuccess && !hasTargetOrderIssue;
            
            setAutoAssignResult({ success: finalSuccess, message });

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

    // --- ACCOUNT MANAGEMENT FUNCTIONS ---
    const loadAuthAccounts = async () => {
        setAccountLoading(true);
        try {
            // Lấy danh sách từ bảng users (bao gồm can_day_ffm và password)
            const { data, error } = await supabase
                .from('users')
                .select('id, username, email, password, name, role, team, department, position, branch, shift, created_at, can_day_ffm')
                .order('created_at', { ascending: false });

            if (error) {
                throw error;
            }

            // Map dữ liệu và thêm thông tin has_password
            const accounts = (data || []).map(user => ({
                ...user,
                has_password: !!user.password,
                status: user.password ? 'active' : 'inactive',
                user_id: user.id // Để tương thích với auth_accounts structure
            }));

            setAuthAccounts(accounts);
            console.log(`✅ Đã tải ${accounts.length} tài khoản từ bảng users`);
        } catch (error) {
            console.error('Error loading users:', error);
            toast.error('Lỗi khi tải danh sách tài khoản: ' + error.message);
            setAuthAccounts([]);
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
            branch: account.branch || account.team || '',
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

                if (accountForm.branch !== undefined) {
                    updateData.branch = accountForm.branch || null;
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
                        branch: accountForm.branch || null,
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
                        if (accountForm.branch) updateData.branch = accountForm.branch;
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
        <div className="w-full max-w-[1400px] mx-auto px-3 md:px-5 lg:px-8 py-4 md:py-6 min-h-screen bg-gray-50">
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

                            {/* ACTION BUTTONS */}
                            <div className="flex flex-wrap items-center gap-4 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <div className="text-sm text-gray-600">
                                    Hệ thống sẽ tự động đẩy dữ liệu của ngày hôm nay lên Google Drive vào 23h hàng ngày.
                                </div>
                                <div className="ml-auto flex gap-2">
                                    <button
                                        onClick={handleDownloadAll}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <Download size={18} />
                                        Tải Tất Cả (Backup)
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm('Bạn có muốn đẩy dữ liệu ngày hôm nay lên Google Drive không?\n\nHệ thống sẽ tự động đẩy tất cả các bảng với dữ liệu của ngày hôm nay.')) return;
                                            try {
                                                toast.info('Đang đẩy dữ liệu ngày hôm nay lên Google Drive...');
                                                const { performDailyDriveUpload } = await import('../services/dailyDriveUploadService');
                                                const result = await performDailyDriveUpload('manual');
                                                if (result.success) {
                                                    toast.success(`Đã đẩy thành công ${result.tablesSucceeded}/${result.tablesProcessed} bảng (${result.totalRecords} bản ghi) lên Google Drive!`);
                                                } else {
                                                    toast.error('Có lỗi xảy ra khi đẩy dữ liệu');
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                toast.error(`Lỗi: ${err.message}`);
                                            }
                                        }}
                                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow flex items-center gap-2 font-medium transition-colors"
                                    >
                                        <CloudUpload size={18} />
                                        Đẩy Hôm Nay
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {AVAILABLE_TABLES.map(table => (
                                    <div
                                        key={table.id}
                                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-all hover:shadow-md group"
                                    >
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="p-2 bg-white rounded-md border border-gray-100 group-hover:border-blue-200">
                                                <Database size={20} className="text-gray-500 group-hover:text-blue-600" />
                                            </div>
                                        </div>
                                        <h4 className="font-bold text-gray-700 group-hover:text-blue-700 mb-2">{table.name}</h4>
                                        <p className="text-xs text-gray-500 mb-3">{table.desc}</p>
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={() => handleDownloadTable(table.id)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                            >
                                                <Download size={14} />
                                                Tải về
                                            </button>
                                            <button
                                                onClick={(e) => handleUploadToDrive(table.id, e)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                            >
                                                <CloudUpload size={14} />
                                                Đẩy Drive
                                            </button>
                                        </div>
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
                        {/* MKT RECALC */}
                        <div className="border border-gray-200 rounded-lg p-5 bg-white">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-2">
                                <RefreshCw className="w-5 h-5 text-blue-600" />
                                Cập nhật Số đơn TT cho Báo cáo MKT
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Tính lại theo Key: <span className="font-medium">Ngày + Tên (MKT) + Sản phẩm + Thị trường</span> khớp <span className="font-medium">orders</span> (marketing_staff, country), tách theo ca <span className="font-medium">Hết ca</span> / <span className="font-medium">Giữa ca</span>.
                                <span className="font-medium"> Số đơn thực tế</span> và <span className="font-medium">Doanh số TT</span>: mọi đơn khớp key (tổng VND không loại đơn Hủy). <span className="font-medium">Số đơn hoàn hủy thực tế</span> và <span className="font-medium">Doanh số hoàn hủy thực tế</span>: chỉ đơn có Kết quả Check dạng Hủy/Huỷ (ưu tiên <span className="font-medium">check_result</span>, fallback <span className="font-medium">payment_status</span>); VND: total_amount_vnd → total_vnd → reconciled_vnd → goods_amount → sale_price. Có thể tạo dòng mới nếu thiếu key trong <span className="font-medium">detail_reports</span>.
                                {' '}
                                <span className="font-medium text-gray-800">Tự điền khi trống:</span> cột <span className="font-medium">Email</span> và <span className="font-medium">Team</span> trên dòng hiện có — lấy từ bảng <span className="font-medium">users</span> (khớp tên và email khi có đủ hai), không có thì từ <span className="font-medium">human_resources</span>; dòng tạo mới dùng cùng thứ tự, Team cuối cùng có thể lấy từ đơn hoặc mặc định MKT.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Từ ngày</span>
                                    <input
                                        type="date"
                                        value={mktRecalcStartDate}
                                        onChange={(e) => setMktRecalcStartDate(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Đến ngày</span>
                                    <input
                                        type="date"
                                        value={mktRecalcEndDate}
                                        onChange={(e) => setMktRecalcEndDate(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </label>
                            </div>

                            <button
                                onClick={handleRecalcMktSoDonTT}
                                disabled={mktRecalcLoading || loading}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2 disabled:bg-gray-400"
                            >
                                {mktRecalcLoading ? (
                                    <>
                                        <span className="animate-spin">⏳</span> Đang cập nhật...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={18} /> Tính lại
                                    </>
                                )}
                            </button>

                            {mktRecalcResult && (
                                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <div className="text-sm font-semibold text-gray-800 mb-3">Kết quả tính toán</div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border border-gray-200 rounded-lg">
                                            <tbody>
                                                {Object.entries(mktRecalcResult).map(([k, v]) => {
                                                    if (k === 'previewRows') return null;
                                                    return (
                                                        <tr key={k} className="border-t border-gray-200">
                                                            <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{k}</td>
                                                            <td className="px-3 py-2 text-gray-900">
                                                                {typeof v === 'number' ? v : (v == null ? '-' : String(v))}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {Array.isArray(mktRecalcResult.previewRows) && mktRecalcResult.previewRows.length > 0 && (
                                        <div className="mt-4 overflow-x-auto">
                                            <div className="text-sm font-semibold text-gray-800 mb-2">Preview các dòng đã update/create</div>
                                            <table className="w-full text-sm border border-gray-200 rounded-lg">
                                                <thead className="bg-white">
                                                    <tr className="border-b border-gray-200">
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">#</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">ca</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Ngày</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Tên</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Sản_phẩm</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Thị_trường</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Số đơn thực tế</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Doanh số TT (VND)</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">Số đơn hoàn hủy TT</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">DS hoàn hủy TT (VND)</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {mktRecalcResult.previewRows.map((r, idx) => (
                                                        <tr key={`${r.action}-${idx}`} className="border-t border-gray-200">
                                                            <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.ca || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r['Ngày'] || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r['Tên'] || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r['Sản_phẩm'] || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r['Thị_trường'] || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-900">{r['Số đơn thực tế'] ?? 0}</td>
                                                            <td className="px-3 py-2 text-gray-900">{Number(r['Doanh số TT'] ?? 0).toLocaleString('vi-VN')}</td>
                                                            <td className="px-3 py-2 text-gray-900">{r['Số đơn hoàn hủy thực tế'] ?? 0}</td>
                                                            <td className="px-3 py-2 text-gray-900">{Number(r['Doanh số hoàn hủy thực tế'] ?? 0).toLocaleString('vi-VN')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.action || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SALES_REPORTS: order_count + revenue + cancel + revenue_cancel_actual */}
                        <div className="border border-gray-200 rounded-lg p-5 bg-white">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 mb-2">
                                <RefreshCw className="w-5 h-5 text-emerald-600" />
                                Cập nhật Báo cáo Sale (sales_reports)
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Tính lại theo Key: <span className="font-medium">Ngày + Tên (NV Sale) + Sản phẩm + Thị trường</span>, nguồn đơn: <span className="font-medium">orders.sale_staff</span>, <span className="font-medium">country</span>. Dòng báo cáo <span className="font-medium">Hết ca</span>: tổng mọi đơn khớp key (gồm cả đơn chỉ Giữa ca, chỉ Hết ca và gộp 2 ca; mỗi đơn chỉ cộng một lần). Dòng <span className="font-medium">Giữa ca</span>: chỉ đơn có ca Giữa ca (theo parse shift).
                                Ghi <span className="font-medium">order_count</span> (mọi đơn khớp key), <span className="font-medium">revenue_actual</span> (tổng VND mọi đơn khớp), <span className="font-medium">order_cancel_count_actual</span> và <span className="font-medium">revenue_cancel_actual</span> (số đơn hủy + tổng VND chỉ các đơn đó; Kết quả Check Hủy/Huỷ, ưu tiên <span className="font-medium">check_result</span>, fallback <span className="font-medium">payment_status</span>). Tiền VND: total_amount_vnd → total_vnd → goods_amount → sale_price. Có thể tạo dòng mới nếu thiếu key.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Từ ngày</span>
                                    <input
                                        type="date"
                                        value={saleRecalcStartDate}
                                        onChange={(e) => setSaleRecalcStartDate(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Đến ngày</span>
                                    <input
                                        type="date"
                                        value={saleRecalcEndDate}
                                        onChange={(e) => setSaleRecalcEndDate(e.target.value)}
                                        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                </label>
                            </div>

                            <button
                                onClick={handleRecalcSaleOrderCount}
                                disabled={saleRecalcLoading || loading}
                                className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors shadow-sm flex items-center justify-center gap-2 disabled:bg-gray-400"
                            >
                                {saleRecalcLoading ? (
                                    <>
                                        <span className="animate-spin">⏳</span> Đang cập nhật...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw size={18} /> Tính lại báo cáo Sale
                                    </>
                                )}
                            </button>

                            {saleRecalcResult && (
                                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                                    <div className="text-sm font-semibold text-gray-800 mb-3">Kết quả tính toán</div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border border-gray-200 rounded-lg">
                                            <tbody>
                                                {Object.entries(saleRecalcResult).map(([k, v]) => {
                                                    if (k === 'previewRows') return null;
                                                    return (
                                                        <tr key={k} className="border-t border-gray-200">
                                                            <td className="px-3 py-2 font-medium text-gray-700 whitespace-nowrap">{k}</td>
                                                            <td className="px-3 py-2 text-gray-900">
                                                                {typeof v === 'number' ? v : (v == null ? '-' : String(v))}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {Array.isArray(saleRecalcResult.previewRows) && saleRecalcResult.previewRows.length > 0 && (
                                        <div className="mt-4 overflow-x-auto">
                                            <div className="text-sm font-semibold text-gray-800 mb-2">Preview các dòng đã update/create</div>
                                            <table className="w-full text-sm border border-gray-200 rounded-lg">
                                                <thead className="bg-white">
                                                    <tr className="border-b border-gray-200">
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">#</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">shift (ca)</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">date</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">name</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">product</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">market</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">order_count</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">revenue_actual (VND)</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">order_cancel_count_actual</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">revenue_cancel_actual (VND)</th>
                                                        <th className="px-3 py-2 text-left whitespace-nowrap">action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {saleRecalcResult.previewRows.map((r, idx) => (
                                                        <tr key={`${r.action}-${idx}`} className="border-t border-gray-200">
                                                            <td className="px-3 py-2 text-gray-700">{idx + 1}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.ca || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.Ngày || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.Tên || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.Sản_phẩm || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.Thị_trường || '-'}</td>
                                                            <td className="px-3 py-2 text-gray-900">{r.order_count ?? 0}</td>
                                                            <td className="px-3 py-2 text-gray-900">{Number(r.revenue_actual ?? 0).toLocaleString('vi-VN')}</td>
                                                            <td className="px-3 py-2 text-gray-900">{r.order_cancel_count_actual ?? 0}</td>
                                                            <td className="px-3 py-2 text-gray-900">{Number(r.revenue_cancel_actual ?? 0).toLocaleString('vi-VN')}</td>
                                                            <td className="px-3 py-2 text-gray-700">{r.action || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

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

                        {/* 4. Đồng bộ Team MKT -> Users */}
                        {isSectionVisible('Đồng bộ Team MKT', ['mkt', 'team', 'đồng bộ', 'users', 'detail_reports']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-emerald-600" />
                                    4. Đồng bộ Team MKT vào Users
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Đồng bộ toàn bộ cột <code>users.team</code> theo dữ liệu MKT trong <code>detail_reports</code>, khớp theo cột Tên.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-gray-600 space-y-1">
                                            <div>• Nguồn team: bảng <code>detail_reports</code></div>
                                            <div>• Điều kiện: khớp theo <code>Tên</code> (normalize dấu + khoảng trắng)</div>
                                            <div>• Chỉ cập nhật khi team mới khác team hiện tại trong <code>users</code></div>
                                        </div>
                                        <button
                                            onClick={handleSyncMktTeamsToUsers}
                                            disabled={syncMktTeamLoading}
                                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${syncMktTeamLoading ? 'animate-spin' : ''}`} />
                                            {syncMktTeamLoading ? 'Đang đồng bộ...' : 'Đồng bộ Team MKT'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. Exchange Rates Management */}
                        {isSectionVisible('Quản lý tỷ giá', ['tỷ giá', 'exchange', 'rate', 'tiền tệ', 'currency']) && (
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                    <Package className="w-5 h-5 text-blue-600" />
                                    5. Quản lý tỷ giá
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Cài đặt tỷ giá quy đổi các loại tiền tệ sang VNĐ. Tỷ giá sẽ được tự động áp dụng khi chọn đơn vị tiền tệ trong bảng đối soát bill cước.
                                </p>

                                <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-gray-200 bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-800">Tỷ giá quy đổi (1 đơn vị = ? VNĐ)</h4>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Nhập tỷ giá quy đổi từ các loại tiền tệ sang VNĐ. Ví dụ: 1 USD = 25,000 VNĐ
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={loadExchangeRates}
                                                    disabled={exchangeLoading}
                                                    className="flex items-center gap-2 px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-4 h-4 ${exchangeLoading ? 'animate-spin' : ''}`} />
                                                    {exchangeLoading ? 'Đang tải...' : 'Tải lại'}
                                                </button>
                                                <button
                                                    onClick={handleSaveExchangeRates}
                                                    disabled={exchangeSaving}
                                                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    {exchangeSaving ? 'Đang lưu...' : 'Lưu tỷ giá'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Loại tiền tệ
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Ký hiệu
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Tỷ giá (VNĐ)
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
                                                        Ví dụ
                                                    </th>
                                                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase border-b border-gray-200 w-32">
                                                        Hành động
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {exchangeRates.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                                            {exchangeLoading ? 'Đang tải...' : 'Chưa có dữ liệu tỷ giá'}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    exchangeRates.map((rateData) => {
                                                        const rateValue = rateData?.gia_tri || 0;
                                                        const isEditing = editingRateId === rateData?.id;
                                                        const editData = editValues[rateData?.id] || { ti_gia: rateData.ti_gia, gia_tri: rateValue.toString() };
                                                        
                                                        // Tìm currency option để lấy symbol và label
                                                        const currencyOption = CURRENCY_OPTIONS.find(c => c.key.toUpperCase() === rateData.ti_gia.toUpperCase());
                                                        const currencyLabel = currencyOption?.label || rateData.ti_gia;
                                                        const currencySymbol = currencyOption?.symbol || '';

                                                        return (
                                                            <tr key={rateData.id} className="hover:bg-gray-50">
                                                                <td className="px-6 py-4">
                                                                    {isEditing ? (
                                                                        <input
                                                                            type="text"
                                                                            value={editData.ti_gia || ''}
                                                                            onChange={(e) => {
                                                                                setEditValues(prev => ({
                                                                                    ...prev,
                                                                                    [rateData.id]: {
                                                                                        ...prev[rateData.id],
                                                                                        ti_gia: e.target.value
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                            placeholder="USD, JPY, CAD..."
                                                                        />
                                                                    ) : (
                                                                        <span className="text-sm font-medium text-gray-900">
                                                                            {rateData.ti_gia}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                                    {currencySymbol || '-'}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    {isEditing ? (
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            value={editData.gia_tri || ''}
                                                                            onChange={(e) => {
                                                                                setEditValues(prev => ({
                                                                                    ...prev,
                                                                                    [rateData.id]: {
                                                                                        ...prev[rateData.id],
                                                                                        gia_tri: e.target.value
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                            placeholder="0.00"
                                                                        />
                                                                    ) : (
                                                                        <span className="text-sm text-gray-700 font-medium">
                                                                            {rateValue > 0 ? rateValue.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-sm text-gray-600">
                                                                    {rateValue > 0 ? (
                                                                        <>
                                                                            1 {rateData.ti_gia} = {rateValue.toLocaleString('vi-VN')} VNĐ
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-gray-400">-</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    {isEditing ? (
                                                                        <div className="flex items-center justify-center gap-2">
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (rateData?.id) {
                                                                                        handleSaveSingleRate(rateData.id);
                                                                                    }
                                                                                }}
                                                                                className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium transition"
                                                                            >
                                                                                Lưu
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingRateId(null);
                                                                                    setEditValues(prev => {
                                                                                        const newVals = { ...prev };
                                                                                        delete newVals[rateData.id];
                                                                                        return newVals;
                                                                                    });
                                                                                }}
                                                                                className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs font-medium transition"
                                                                            >
                                                                                Hủy
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => {
                                                                                if (rateData?.id) {
                                                                                    setEditingRateId(rateData.id);
                                                                                    setEditValues(prev => ({
                                                                                        ...prev,
                                                                                        [rateData.id]: {
                                                                                            ti_gia: rateData.ti_gia,
                                                                                            gia_tri: rateValue.toString()
                                                                                        }
                                                                                    }));
                                                                                }
                                                                            }}
                                                                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-medium transition"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Info Box */}
                                    <div className="p-4 bg-blue-50 border-t border-gray-200">
                                        <div className="text-sm text-blue-800">
                                            <p className="font-semibold mb-2">📝 Lưu ý:</p>
                                            <ul className="list-disc list-inside space-y-1 text-blue-700">
                                                <li>Tỷ giá sẽ được tự động áp dụng khi chọn đơn vị tiền tệ trong bảng đối soát bill cước</li>
                                                <li>Vui lòng cập nhật tỷ giá thường xuyên để đảm bảo tính chính xác</li>
                                                <li>Sau khi thay đổi, nhấn "Lưu tỷ giá" để lưu vào database</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 6. Auto-fill payment currency by country */}
                        <div className="space-y-4 mt-8">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                                <GitCompare className="w-5 h-5 text-indigo-600" />
                                6. Tự động điền Loại tiền thanh toán theo country
                            </h3>
                            <p className="text-sm text-gray-500">
                                Bước 1: Hệ thống sẽ kiểm tra trong Supabase các đơn có <strong>Loại tiền thanh toán</strong> đang <strong>trống</strong> (NULL/'').
                                Bước 2: Bấm <strong>Đồng bộ loạt</strong> để tự điền theo rule:
                                <span className="font-medium">US sang USD</span>, <span className="font-medium">Nhật Bản sang JPY</span>, <span className="font-medium">Hàn Quốc sang KRW</span>...
                            </p>

                            <div className="bg-white border rounded-lg shadow-sm p-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <button
                                        onClick={buildEmptyColumnsSummary}
                                        disabled={emptyColsChecking || loading}
                                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                    >
                                        {emptyColsChecking ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                Đang kiểm tra...
                                            </>
                                        ) : (
                                            <>
                                                <GitCompare className="w-4 h-4" />
                                                Xem cột trống
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={handleSyncEmptyColumns}
                                        disabled={emptyColsSyncing || !emptyColsSummary || (emptyColsSummary.totalCells || emptyColsSummary.totalOrders) === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                                    >
                                        {emptyColsSyncing ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                Đang đồng bộ...
                                            </>
                                        ) : (
                                            <>
                                                <Database className="w-4 h-4" />
                                                Đồng bộ loạt
                                            </>
                                        )}
                                    </button>
                                </div>

                                {emptyColsSummary && (
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-600">
                                            Tổng đơn cần cập nhật: <strong className="text-gray-900">{emptyColsSummary.totalOrders}</strong>
                                            {"  "}•{"  "}
                                            Tổng số ô trống cần điền: <strong className="text-gray-900">{emptyColsSummary.totalCells}</strong>
                                        </div>

                                        {emptyColsSummary.perColumn.length > 0 ? (
                                            <div className="max-h-56 overflow-y-auto border border-gray-200 rounded p-3 bg-gray-50">
                                                <div className="text-xs font-semibold text-gray-700 mb-2">Cột cần điền (top 12)</div>
                                                <div className="space-y-2">
                                                    {emptyColsSummary.perColumn.slice(0, 12).map((c) => (
                                                        <div key={c.column} className="text-xs bg-white border border-gray-200 rounded p-2">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-medium text-gray-800">{c.column}</span>
                                                                <span className="text-gray-700">{c.count}</span>
                                                            </div>
                                                            {c.samples && c.samples.length > 0 && (
                                                                <div className="text-[11px] text-gray-500 mt-1">
                                                                    VD: {c.samples.join(', ')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-500">Không có cột trống nào.</div>
                                        )}
                                    </div>
                                )}
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Chi nhánh</label>
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
                                        <li>Chi nhánh = "{selectedTeam}"</li>
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

                        {/* Actions - Chia đơn CSKH và Chia đơn vận đơn song song */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Cột trái: Chia đơn CSKH */}
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

                                {/* Tìm kiếm đơn hàng */}
                                <h3 className="font-semibold text-gray-700 mt-4">Tìm kiếm đơn hàng</h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
                            </div>

                            {/* Cột phải: Chia đơn vận đơn */}
                            <div className="space-y-4">
                                <h3 className="font-semibold text-gray-700">Chia đơn vận đơn</h3>
                                
                                {/* Toggle tự động chia đơn vào giờ chẵn */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                            <div>
                                                <p className="text-sm font-semibold text-gray-800">Tự động chia đơn vào giờ chẵn</p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Tự động chạy chia đơn HCM và Hà Nội vào các giờ: 1h, 2h, 3h, 4h, 5h...
                                                </p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={autoChiaDonEnabled}
                                                onChange={(e) => {
                                                    setAutoChiaDonEnabled(e.target.checked);
                                                    if (e.target.checked) {
                                                        toast.info('Đã bật tự động chia đơn vào giờ chẵn');
                                                    } else {
                                                        toast.info('Đã tắt tự động chia đơn');
                                                        setLastAutoChiaHour(null);
                                                    }
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                    {autoChiaDonEnabled && lastAutoChiaHour !== null && (
                                        <p className="text-xs text-blue-700 mt-2">
                                            ⏰ Lần chạy cuối: {lastAutoChiaHour}:00
                                        </p>
                                    )}
                                </div>

                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                                    <p className="text-xs text-gray-700 mb-2"><strong>Logic chia đơn vận đơn:</strong></p>
                                    <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
                                        <li>Lọc nhân viên có trạng thái "U1" từ danh sách vận đơn</li>
                                        <li>Phân loại theo chi nhánh (HCM và Hà Nội)</li>
                                        <li>Sử dụng lastIndex để đảm bảo tính công bằng (chia đều, bắt đầu từ vị trí tiếp theo)</li>
                                        <li>Lọc đơn: delivery_staff trống, loại trừ "Nhật Bản" và "CĐ Nhật Bản"</li>
                                        <li>Chia đều cho nhân viên theo Team tương ứng</li>
                                    </ol>
                                </div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button
                                            onClick={() => handleChiaDonVanDon('HCM')}
                                            disabled={autoAssignLoading}
                                            className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Package className="w-5 h-5" />
                                                    Chia đơn HCM
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleChiaDonVanDon('Hà Nội')}
                                            disabled={autoAssignLoading}
                                            className="w-full bg-orange-500 hover:bg-orange-600 text-white px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {autoAssignLoading ? (
                                                <>
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                    Đang xử lý...
                                                </>
                                            ) : (
                                                <>
                                                    <Package className="w-5 h-5" />
                                                    Chia đơn Hà Nội
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* View danh sách đơn đã chia vận đơn theo ngày */}
                                    <div className="mt-4 p-4 rounded-lg border bg-white border-orange-200">
                                        <h4 className="font-semibold text-gray-800 mb-3">Xem danh sách đơn đã chia vận đơn</h4>
                                        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-3">
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Ngày chia vận đơn
                                                </label>
                                                <input
                                                    type="date"
                                                    value={chiaDonViewDate}
                                                    onChange={(e) => setChiaDonViewDate(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={handleLoadChiaDonView}
                                                disabled={chiaDonViewLoading || !chiaDonViewDate}
                                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {chiaDonViewLoading ? (
                                                    <>
                                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                                        Đang tải...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Search className="w-4 h-4" />
                                                        Xem danh sách đã chia
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                                            <button
                                                onClick={handleClearDeliveryStaffByDate}
                                                disabled={!chiaDonViewDate}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Xóa NV vận đơn theo ngày đã chọn
                                            </button>
                                            <p className="text-[11px] text-gray-600">
                                                Hành động này sẽ đặt <strong>delivery_staff</strong> và <strong>ngay_chia_van_don</strong> về rỗng
                                                cho tất cả đơn có <strong>ngay_chia_van_don = {chiaDonViewDate || '...'}</strong>.
                                            </p>
                                        </div>

                                        {/* Xóa NV vận đơn theo Ngày lên đơn (order_date) */}
                                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                    Ngày lên đơn (order_date) cần xóa NV vận đơn
                                                </label>
                                                <input
                                                    type="date"
                                                    value={clearOrderDate}
                                                    onChange={(e) => setClearOrderDate(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
                                                />
                                            </div>
                                            <button
                                                onClick={handleClearDeliveryStaffByOrderDate}
                                                disabled={!clearOrderDate}
                                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Xóa NV vận đơn theo order_date
                                            </button>
                                        </div>

                                        {chiaDonViewOrders.length > 0 ? (
                                            <div className="mt-2 max-h-80 overflow-y-auto border border-gray-200 rounded-lg">
                                                <table className="min-w-full text-xs">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700"># (trong view)</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Mã đơn</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Khách hàng</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Chi nhánh</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">NV Vận đơn</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Ngày lên đơn</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Ngày chia vận đơn</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Thứ tự chia</th>
                                                            <th className="px-2 py-2 border-b text-left font-semibold text-gray-700">Country</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {chiaDonViewOrders.map((o) => {
                                                            let orderDateDisplay = '';
                                                            if (o.order_date) {
                                                                try {
                                                                    const d = new Date(o.order_date);
                                                                    if (!isNaN(d.getTime())) {
                                                                        orderDateDisplay = d.toLocaleDateString('vi-VN', {
                                                                            year: 'numeric',
                                                                            month: '2-digit',
                                                                            day: '2-digit',
                                                                        });
                                                                    } else {
                                                                        orderDateDisplay = String(o.order_date);
                                                                    }
                                                                } catch {
                                                                    orderDateDisplay = String(o.order_date);
                                                                }
                                                            }

                                                            let ngayChiaDisplay = '';
                                                            if (o.ngay_chia_van_don) {
                                                                try {
                                                                    const d2 = new Date(o.ngay_chia_van_don);
                                                                    if (!isNaN(d2.getTime())) {
                                                                        ngayChiaDisplay = d2.toLocaleDateString('vi-VN', {
                                                                            year: 'numeric',
                                                                            month: '2-digit',
                                                                            day: '2-digit',
                                                                        });
                                                                    } else {
                                                                        ngayChiaDisplay = String(o.ngay_chia_van_don);
                                                                    }
                                                                } catch {
                                                                    ngayChiaDisplay = String(o.ngay_chia_van_don);
                                                                }
                                                            }

                                                            return (
                                                                <tr key={o.order_code} className="hover:bg-gray-50">
                                                                    <td className="px-2 py-1 border-b text-gray-700 font-mono">
                                                                        {o.chia_order_index}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-blue-700 font-mono">
                                                                        {o.order_code || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700">
                                                                        {o.customer_name || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700">
                                                                        {o.team || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700">
                                                                        {o.delivery_staff || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700 whitespace-nowrap">
                                                                        {orderDateDisplay || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700 whitespace-nowrap">
                                                                        {ngayChiaDisplay || 'N/A'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700 text-center">
                                                                        {o.thu_tu_chia ?? '-'}
                                                                    </td>
                                                                    <td className="px-2 py-1 border-b text-gray-700">
                                                                        {o.country || 'N/A'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            !chiaDonViewLoading &&
                                            chiaDonViewDate && (
                                                <p className="mt-2 text-xs text-gray-600">
                                                    Không tìm thấy đơn nào đã được chia vận đơn trong ngày {chiaDonViewDate}.
                                                </p>
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Hiển thị log từng bước */}
                                {stepLogs.length > 0 && (
                                    <div className="mt-4 p-4 rounded-lg border bg-blue-50 border-blue-200">
                                        <h4 className="font-semibold mb-3 text-blue-800 flex items-center justify-between">
                                            <span>📋 Log từng bước</span>
                                            <span className="text-xs font-normal text-gray-600">({stepLogs.length} bước)</span>
                                        </h4>
                                        <div className="max-h-96 overflow-y-auto bg-white p-3 rounded border">
                                            <div className="space-y-1">
                                                {stepLogs.map((log, idx) => {
                                                    const bgColor = 
                                                        log.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                                        log.type === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' :
                                                        log.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                                                        'bg-gray-50 border-gray-200 text-gray-700';
                                                    return (
                                                        <div key={idx} className={`p-2 rounded border text-xs ${bgColor}`}>
                                                            <span className="font-mono text-xs text-gray-500 mr-2">{log.timestamp}</span>
                                                            <span>{log.message}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Hiển thị kết quả chia đơn */}
                                {autoAssignResult && (
                                    <div className={`mt-4 p-4 rounded-lg border ${autoAssignResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                                        <h4 className={`font-semibold mb-2 ${autoAssignResult.success ? 'text-green-800' : 'text-yellow-800'}`}>
                                            {autoAssignResult.success ? '✅ Kết quả chia đơn' : '⚠️ Kết quả chia đơn'}
                                        </h4>
                                        <pre className="text-xs whitespace-pre-wrap text-gray-700 bg-white p-3 rounded border max-h-60 overflow-y-auto">
                                            {autoAssignResult.message}
                                        </pre>
                                    </div>
                                )}

                                {/* Hiển thị danh sách đơn không được chia */}
                                {notDividedOrders.length > 0 ? (
                                    <div className="mt-4 p-4 rounded-lg border bg-red-50 border-red-200">
                                        <h4 className="font-semibold text-red-800 mb-3">
                                            ⚠️ Danh sách đơn không được chia ({notDividedOrders.length} đơn)
                                            <span className="text-xs font-normal text-gray-600 ml-2">(Sắp xếp theo ngày, mới nhất lên đầu)</span>
                                        </h4>
                                        <div className="max-h-60 overflow-y-auto">
                                            <div className="space-y-2">
                                                {notDividedOrders.slice(0, 50).map((order, idx) => {
                                                    // Format order_date để hiển thị
                                                    let orderDateDisplay = 'N/A';
                                                    if (order.order_date) {
                                                        try {
                                                            const date = new Date(order.order_date);
                                                            if (!isNaN(date.getTime())) {
                                                                orderDateDisplay = date.toLocaleDateString('vi-VN', {
                                                                    year: 'numeric',
                                                                    month: '2-digit',
                                                                    day: '2-digit'
                                                                });
                                                            }
                                                        } catch (e) {
                                                            orderDateDisplay = String(order.order_date);
                                                        }
                                                    }
                                                    
                                                    return (
                                                        <div key={idx} className="bg-white p-3 rounded border border-red-200 text-sm">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div className="flex-1">
                                                                    <div className="font-semibold text-gray-800 flex items-center gap-2">
                                                                        <span>Mã đơn: <span className="font-mono text-blue-600">{order.order_code || 'N/A'}</span></span>
                                                                        <span className="text-xs font-normal text-gray-500">({orderDateDisplay})</span>
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-600 space-y-1">
                                                                        <div>Team: <span className="font-medium">{order.team || '(null/empty)'}</span></div>
                                                                        <div>Country: <span className="font-medium">{order.country || '(null/empty)'}</span></div>
                                                                        <div>Delivery Staff: <span className="font-medium">{order.delivery_staff || '(null/empty)'}</span></div>
                                                                        {order.sale_staff && (
                                                                            <div>Sale Staff: <span className="font-medium">{order.sale_staff}</span></div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-shrink-0">
                                                                    <span className="inline-block px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                                                        Không chia
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {order.reason && (
                                                                <div className="mt-2 text-xs text-red-700 bg-red-100 p-2 rounded">
                                                                    <strong>Lý do:</strong> {order.reason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                {notDividedOrders.length > 50 && (
                                                    <div className="text-center text-xs text-gray-500 py-2">
                                                        ... và {notDividedOrders.length - 50} đơn khác (chỉ hiển thị 50 đơn đầu)
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-3 text-xs text-red-700 bg-red-100 p-2 rounded">
                                            <strong>💡 Lưu ý:</strong> Đơn không được chia thường do:
                                            <ul className="list-disc list-inside mt-1 space-y-1">
                                                <li>Team không phải HCM/Hà Nội (cần điền team dựa trên sale_staff)</li>
                                                <li>Country = Nhật Bản (bị loại trừ)</li>
                                                <li>Delivery_staff đã có giá trị (không trống)</li>
                                            </ul>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 p-4 rounded-lg border bg-green-50 border-green-200">
                                        <h4 className="font-semibold text-green-800 mb-2">
                                            ✅ Không có đơn nào không được chia
                                        </h4>
                                        <p className="text-sm text-green-700">
                                            Tất cả các đơn có delivery_staff trống đều đã được chia thành công (trừ đơn Nhật Bản - đã được loại trừ theo quy tắc).
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
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
                                        branch: '',
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

                        {/* Search by Name */}
                        <div className="mb-4">
                            <div className="relative max-w-md">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm theo tên..."
                                    value={nameSearchQuery}
                                    onChange={(e) => setNameSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
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
                        ) : (() => {
                            // Filter accounts by name search query
                            const filteredAccounts = authAccounts.filter(account => {
                                if (!nameSearchQuery.trim()) return true;
                                const searchLower = nameSearchQuery.toLowerCase();
                                const name = (account.name || '').toLowerCase();
                                const email = (account.email || '').toLowerCase();
                                const username = (account.username || '').toLowerCase();
                                return name.includes(searchLower) || email.includes(searchLower) || username.includes(searchLower);
                            });

                            if (filteredAccounts.length === 0) {
                                return (
                                    <div className="text-center py-8 text-gray-500">
                                        <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>Không tìm thấy tài khoản nào với từ khóa "{nameSearchQuery}"</p>
                                    </div>
                                );
                            }

                            return (
                                <div className="overflow-x-auto">
                                    <div className="mb-2 text-sm text-gray-600">
                                        Hiển thị {filteredAccounts.length} / {authAccounts.length} tài khoản
                                    </div>
                                    <table className="min-w-full border-collapse border border-gray-300">
                                        <thead>
                                            <tr className="bg-gray-100">
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Email</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Username</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Tên</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Password</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Role</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Chi nhánh</th>
                                                <th className="border border-gray-300 px-4 py-3 text-center font-semibold">Đẩy FFM</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Trạng thái</th>
                                                <th className="border border-gray-300 px-4 py-3 text-left font-semibold">Thao tác</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredAccounts.map((account) => (
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
                                                                    value={passwordInputs[account.id] !== undefined ? passwordInputs[account.id] : ''}
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
                                                                <span className="text-xs text-gray-600 font-mono max-w-xs truncate" title={account.password || 'Chưa có mật khẩu'}>
                                                                    {account.password ? account.password.substring(0, 30) + '...' : 'Chưa có'}
                                                                </span>
                                                                <button
                                                                    onClick={() => {
                                                                        setShowPasswords({ ...showPasswords, [account.id]: true });
                                                                        setPasswordInputs({ ...passwordInputs, [account.id]: '' });
                                                                    }}
                                                                    className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                                                    title="Đặt mật khẩu mới"
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
                                                <td className="border border-gray-300 px-4 py-3">{account.branch || account.team || '-'}</td>
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
                            );
                        })()}

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
                                                Chi nhánh
                                            </label>
                                            <input
                                                type="text"
                                                value={accountForm.branch}
                                                onChange={(e) => setAccountForm({ ...accountForm, branch: e.target.value })}
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
