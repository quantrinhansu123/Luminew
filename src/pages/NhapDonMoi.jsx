import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { AlertCircle, Check, ChevronDown, RefreshCcw, Save, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions'; // Added missing import
import { recalcMktSoDonAfterOrderSave } from '../services/mktRecalcSoDonThucTeFromOrders';
import { recalcSaleOrderCountAfterOrderSave } from '../services/saleRecalcOrderCountFromOrders';
import { supabase } from '../supabase/config';
import {
    buildOrderLogDiffEntries,
    buildTrackedFieldsPayloadForLog,
    mergeOrderLogJsonb,
    parseOrderLogJsonb,
    pickTrackedFieldsFromOrderRow,
    pickTrackedFieldsFromPayload,
} from '../utils/orderLogJsonb';

const ADMIN_MAIL = import.meta.env.VITE_ADMIN_MAIL || "admin@marketing.com";

/** Chuẩn hóa SĐT để so trùng (chỉ chữ số, 9 số cuối). */
function normalizePhoneDigits(raw) {
    const d = String(raw ?? "").replace(/\D/g, "");
    if (d.length >= 9) return d.slice(-9);
    return d;
}

/** Chuẩn hóa tên / địa chỉ: thường, gộp khoảng trắng, bỏ dấu (so trùng mềm). */
function normalizeCustomerTextForDup(raw) {
    let s = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
    try {
        s = s.normalize("NFD").replace(/\p{M}/gu, "");
    } catch {
        /* ignore */
    }
    return s;
}

/** Điều kiện OR: đủ SĐT HOẶC đủ tên HOẶC đủ địa chỉ thì mới quét trùng theo các nhánh đó. */
function customerDupCheckContext(phone, name, address) {
    const normPhone = normalizePhoneDigits(phone);
    const normName = normalizeCustomerTextForDup(name);
    const normAddr = normalizeCustomerTextForDup(address);
    return {
        normPhone,
        normName,
        normAddr,
        phoneOk: normPhone.length >= 9,
        nameOk: normName.length >= 2,
        addrOk: normAddr.length >= 10,
    };
}

function rowMatchesCustomerDupOr(ctx, row) {
    if (ctx.phoneOk && normalizePhoneDigits(row.customer_phone) === ctx.normPhone) return true;
    if (ctx.nameOk && normalizeCustomerTextForDup(row.customer_name) === ctx.normName) return true;
    if (ctx.addrOk && normalizeCustomerTextForDup(row.customer_address) === ctx.normAddr) return true;
    return false;
}

/** Trùng đơn nếu cùng SĐT HOẶC cùng tên HOẶC cùng địa chỉ (so với đơn khác). */
async function fetchDuplicateOrderCodesByCustomerOr(supabaseClient, { phone, name, address }, excludeOrderCode, tableName = "orders") {
    const ctx = customerDupCheckContext(phone, name, address);
    if (!(ctx.phoneOk || ctx.nameOk || ctx.addrOk)) return [];
    const { data, error } = await supabaseClient
        .from(tableName)
        .select("order_code, customer_phone, customer_name, customer_address")
        .order("created_at", { ascending: false })
        .limit(2500);
    if (error || !data?.length) return [];
    const ex = String(excludeOrderCode ?? "").trim();
    const matches = [];
    const seen = new Set();
    for (const row of data) {
        const code = row.order_code;
        if (!code || code === ex) continue;
        if (!rowMatchesCustomerDupOr(ctx, row)) continue;
        if (seen.has(code)) continue;
        seen.add(code);
        matches.push(code);
        if (matches.length >= 20) break;
    }
    return matches;
}

/**
 * Nội dung cột canh_bao (nhiều dòng, khớp khối cảnh báo trên UI).
 * Luôn có dòng NV Sale phụ trách khi có cảnh báo trùng hoặc blacklist.
 */
function buildCanhBaoFromChecks(dupCodes, blacklistStatus, blacklistReason, saleStaff) {
    const sale = String(saleStaff ?? "").trim();
    const saleLine = sale || "— chưa chọn —";

    const detailLines = [];
    if (dupCodes.length) {
        detailLines.push(`Trùng SĐT hoặc tên hoặc địa chỉ — mã đơn: ${dupCodes.join(", ")}`);
    }
    if (blacklistStatus === "warning" && String(blacklistReason || "").trim()) {
        detailLines.push(`Danh sách hạn chế: ${String(blacklistReason).trim()}`);
    }

    if (detailLines.length === 0) return "";

    return [
        "Cảnh báo cho Nhân viên Sale",
        `NV Sale phụ trách đơn: ${saleLine}`,
        "",
        ...detailLines,
    ].join("\n");
}

/** order_date dạng YYYY-MM-DD (khớp handleSave). */
function computeOrderDateValueForPayload(createdAtField) {
    if (createdAtField) {
        const dateTimeStr = createdAtField;
        if (dateTimeStr.includes("T")) {
            const [datePart] = dateTimeStr.split("T");
            if (datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return datePart;
            }
            const [year, month, day] = datePart.split("-").map(Number);
            const localDate = new Date(year, month - 1, day);
            const yearStr = localDate.getFullYear();
            const monthStr = String(localDate.getMonth() + 1).padStart(2, "0");
            const dayStr = String(localDate.getDate()).padStart(2, "0");
            return `${yearStr}-${monthStr}-${dayStr}`;
        }
        if (dateTimeStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return dateTimeStr;
        }
        const dateFromForm = new Date(dateTimeStr);
        const year = dateFromForm.getFullYear();
        const month = String(dateFromForm.getMonth() + 1).padStart(2, "0");
        const day = String(dateFromForm.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Bộ phận MKT trong bảng users (department) — chuẩn hóa để lọc danh sách nhân sự */
const isUserDepartmentMkt = (department) => {
    const d = (department ?? "").toString().trim().toLowerCase();
    if (!d) return false;
    return d === "mkt" || d === "marketing";
};

// Simple Button component
const Button = ({ children, onClick, variant = "default", className = "", disabled = false, type = "button" }) => {
    const baseClasses = "px-4 py-2 rounded-md font-medium transition-colors inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed";
    const variants = {
        default: "bg-[#2d7c2d] text-white hover:bg-[#256625]",
        outline: "border border-gray-300 bg-white hover:bg-gray-50 text-gray-700",
    };
    return (
        <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>
            {children}
        </button>
    );
};

// Simple Input component
const Input = ({ id, placeholder, type = "text", className = "", value, onChange, ...props }) => (
    <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] ${className}`}
        {...props}
    />
);

// Simple Label component
const Label = ({ htmlFor, children, className = "" }) => (
    <label htmlFor={htmlFor} className={`block text-sm font-medium text-gray-700 ${className}`}>
        {children}
    </label>
);

// Simple Textarea component
const Textarea = ({ id, placeholder, className = "", value, onChange, ...props }) => (
    <textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] resize-none ${className}`}
        {...props}
    />
);

// Simple Tabs components
const Tabs = ({ children, defaultValue }) => {
    return (
        <div>
            {children}
        </div>
    );
};

const Card = ({ children, className = "" }) => <div className={`bg-white rounded-lg shadow ${className}`}>{children}</div>;
const CardHeader = ({ children, className = "" }) => <div className={`p-6 ${className}`}>{children}</div>;
const CardTitle = ({ children, className = "" }) => <h3 className={`${className}`}>{children}</h3>;
const CardContent = ({ children, className = "" }) => <div className={`p-6 ${className}`}>{children}</div>;

// Simple DatePicker component
// Fix: Parse date correctly to avoid timezone issues
const DatePicker = ({ value, onChange, className = "" }) => {
    const formatDateForInput = (date) => {
        if (!date) return '';
        // Get local date string (YYYY-MM-DD) without timezone conversion
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const handleDateChange = (e) => {
        const dateString = e.target.value; // Format: YYYY-MM-DD
        if (!dateString) {
            onChange(null);
            return;
        }
        // Parse date string correctly without timezone issues
        // Split YYYY-MM-DD and create date in local timezone
        const [year, month, day] = dateString.split('-').map(Number);
        const newDate = new Date(year, month - 1, day); // month is 0-indexed
        onChange(newDate);
    };

    return (
        <input
            type="date"
            value={formatDateForInput(value)}
            onChange={handleDateChange}
            className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] ${className}`}
        />
    );
};


const cn = (...classes) => classes.filter(Boolean).join(' ');

export default function NhapDonMoi({ isEdit = false }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const teamFilter = searchParams.get('team'); // 'RD' or null
    const dataView = String(searchParams.get('view') || '').toLowerCase();
    const isHcmView = dataView === 'hcm';
    const ordersTableName = isHcmView ? 'order_code_hcm' : 'orders';
    const buildNhapDonPath = (nextIsHcm) => {
        const params = new URLSearchParams(searchParams);
        if (nextIsHcm) params.set('view', 'hcm');
        else params.delete('view');
        const basePath = isEdit ? '/chinh-sua-don' : '/nhap-don';
        const query = params.toString();
        return query ? `${basePath}?${query}` : basePath;
    };

    // Permission Logic
    const { canView } = usePermissions();
    // Ưu tiên cùng mã với DanhSachDon (SALE_ORDERS / RND_ORDERS); vẫn cho phép mã nhập đơn cũ nếu role
    // chưa có dòng SALE_ORDERS / RND_ORDERS trong app_page_permissions.
    const hasAccess = useMemo(() => {
        if (teamFilter === 'RD') {
            return (
                canView('RND_ORDERS') ||
                canView('RND_NEW_ORDER') ||
                canView('RND_NEW_ORDER_HCM')
            );
        }
        return (
            canView('SALE_ORDERS') ||
            canView('SALE_ORDERS_HCM') ||
            canView('SALE_NEW_ORDER') ||
            canView('SALE_NEW_ORDER_HCM') ||
            canView('CSKH_NEW_ORDER') ||
            canView('CSKH_NEW_ORDER_HCM') ||
            canView('ORDERS_NEW') ||
            canView('RND_NEW_ORDER')
        );
    }, [canView, teamFilter]);



    // -------------------------------------------------------------------------
    // 0. USER INFO (Extracted early for state initialization)
    // -------------------------------------------------------------------------
    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const userEmail = (user?.Email || user?.email || localStorage.getItem("userEmail") || "").toString().toLowerCase().trim();

    // PRIORITY: Check localStorage "username" directly first (matches Header.jsx logic)
    // Then fallback to parsing "user" object
    const userName = localStorage.getItem("username") || user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || user?.username || user?.name || "";
    const boPhan = user?.['Bộ_phận'] || user?.['Bộ phận'] || localStorage.getItem("userTeam") || "";

    // -------------------------------------------------------------------------
    // 1. STATE MANAGEMENT
    // -------------------------------------------------------------------------
    const [date, setDate] = useState(new Date());
    const [popoverWidth, setPopoverWidth] = useState("auto");
    const containerRef = useRef(null);
    const mktRef = useRef(null); // Ref for Marketing dropdown
    const pageRef = useRef(null); // Ref for Page dropdown
    const [mktPopoverWidth, setMktPopoverWidth] = useState("auto"); // Width for MKT dropdown
    const [pagePopoverWidth, setPagePopoverWidth] = useState("auto"); // Width for Page dropdown
    const [productPopoverWidth, setProductPopoverWidth] = useState("auto"); // Width for Product dropdown
    const productRef = useRef(null); // Ref for Product dropdown
    const [activeTab, setActiveTab] = useState("khach-hang");
    const [isSaving, setIsSaving] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);



    // Edit Mode State
    const [searchQuery, setSearchQuery] = useState(searchParams.get("orderId") || "");
    const [isSearching, setIsSearching] = useState(false);
    const [isOrderLoaded, setIsOrderLoaded] = useState(false);

    // Autocomplete State
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    // Form Data - Centralized State
    const [formData, setFormData] = useState({
        "ma-don": "",
        "created_at": new Date().toISOString().slice(0, 16), // datetime-local format
        "tracking_code": "",

        "ten-kh": "",
        "phone": "",
        "add": "",
        "city": "",
        "state": "",
        "zipcode": "",
        "country": "", // Khu vực (đổi từ area sang country)

        "productMain": "",
        "mathang1": "", "sl1": 1,
        "mathang2": "", "sl2": 0,
        "quatang": "", "slq": 0,

        "sale_price": 0, // Giá bán
        "paymentType": "", // Loại tiền (Currency) - bắt buộc chọn
        "exchange_rate": 25000, // Tỷ giá mặc định (ví dụ)
        "tong-tien": 0, // Tổng tiền VNĐ
        "hinh-thuc": "", // Hình thức thanh toán (text)
        "shipping_fee": "", "shipping_cost": 0,
        "base_price": 0, "reconciled_vnd": 0,

        "note_sale": "",
        "team": "",
        "creator_name": "",
    });

    const [trangThaiDon, setTrangThaiDon] = useState(null); // 'hop-le', 'xem-xet'

    // Blacklist State
    const [blacklistStatus, setBlacklistStatus] = useState(null); // null, 'clean', 'warning'
    const [blacklistReason, setBlacklistReason] = useState("");
    const [blacklistInfo, setBlacklistInfo] = useState(null); // { name, phone } to display comparison
    const [blacklistItems, setBlacklistItems] = useState([]); // List of all blacklist items
    const [showBlacklist, setShowBlacklist] = useState(false); // Toggle visibility

    /** Mã đơn trùng (SĐT hoặc tên hoặc địa chỉ — OR) */
    const [duplicateOrderCodes, setDuplicateOrderCodes] = useState([]);

    const duplicateCheckUsable = useMemo(() => {
        const c = customerDupCheckContext(formData.phone, formData["ten-kh"], formData["add"]);
        return c.phoneOk || c.nameOk || c.addrOk;
    }, [formData.phone, formData["ten-kh"], formData["add"]]);

    /** Nhật ký jsonb: bản đầy đủ hiện tại (đồng bộ DB khi sửa đơn hoặc chỉ bộ nhớ khi tạo mới). */
    const logDbArrayRef = useRef([]);
    /** Trạng thái field đã log lần cuối — diff với form để auto-append. */
    const logBaselineTrackedRef = useRef({});

    // -------------------------------------------------------------------------
    // 2. DATA LOADING (Employees & Pages)
    // -------------------------------------------------------------------------
    const [pages, setPages] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [selectedPage, setSelectedPage] = useState("");
    const [pageSearch, setPageSearch] = useState("");
    const [isPageOpen, setIsPageOpen] = useState(false);

    const [saleEmployees, setSaleEmployees] = useState([]);
    const [loadingSale, setLoadingSale] = useState(false);
    // Initialize selectedSale with current userName immediately
    const [selectedSale, setSelectedSale] = useState(userName || "");
    const [saleSearch, setSaleSearch] = useState("");
    const [isSaleOpen, setIsSaleOpen] = useState(false);

    const [mktEmployees, setMktEmployees] = useState([]);
    /** Nhân sự bộ phận MKT từ bảng users — dùng cho trang Sửa đơn */
    const [mktDeptStaff, setMktDeptStaff] = useState([]);
    const [loadingMkt, setLoadingMkt] = useState(false);
    const [selectedMkt, setSelectedMkt] = useState("");
    const [mktSearch, setMktSearch] = useState("");
    const [isMktOpen, setIsMktOpen] = useState(false);

    const [productSearch, setProductSearch] = useState("");
    const [isProductOpen, setIsProductOpen] = useState(false);
    const productDropdownRef = useRef(null);

    // Click outside to close product dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (productDropdownRef.current && !productDropdownRef.current.contains(event.target)) {
                setIsProductOpen(false);
            }
        };

        if (isProductOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isProductOpen]);

    // --- DATA LISTS ---
    const AREA_LIST = ["US", "Nhật Bản", "Hàn Quốc", "Canada", "Úc", "Anh", "CĐ Nhật Bản"];

    // Sản phẩm sẽ được load từ database system_settings (type <> 'test')
    const [PRODUCT_LIST, setPRODUCT_LIST] = useState([
        "Glutathione Collagen", "Bakuchiol Retinol", "Nám DR Hancy", "Kem Body",
        "DG", "Fitgum CAFE 20X", "Kẹo Táo", "ComboGold24k",
        "Gel Xương Khớp", "Dán Kinoki", "Sữa tắm CUISHIFAN",
        "Bonavita Coffee", "Gel Dạ Dày", "Gel Trĩ"
    ]);

    // Các sản phẩm CHỈ dành cho nhân viên có quyền R&D (type = 'test')
    const [rdProducts, setRdProducts] = useState([
        "Glutathione Collagen NEW",
        "Dragon Blood Cream",
        "Gel XK Thái",
        "Gel XK Phi"
    ]);

    useEffect(() => {
        const fetchSystemSettings = async () => {
            try {
                // Load tất cả sản phẩm từ system_settings (type <> 'test')
                const { data: productsData, error: productsError } = await supabase
                    .from('system_settings')
                    .select('name, type')
                    .order('name', { ascending: true });

                if (!productsError && productsData && productsData.length > 0) {
                    const normalProducts = productsData
                        .filter(item => item.type !== 'test')
                        .map(item => item.name)
                        .filter(Boolean);

                    const testProducts = productsData
                        .filter(item => item.type === 'test')
                        .map(item => item.name)
                        .filter(Boolean);

                    if (normalProducts.length > 0) {
                        setPRODUCT_LIST(normalProducts);
                        console.log(`✅ Loaded ${normalProducts.length} products from system_settings (excluding test)`);
                    }

                    if (testProducts.length > 0) {
                        setRdProducts(testProducts);
                        console.log(`✅ Loaded ${testProducts.length} R&D products from system_settings`);
                    }
                    return;
                }
            } catch (err) {
                console.error('Error fetching products from system_settings:', err);
            }

            // Fallback: giữ nguyên giá trị mặc định nếu không load được từ database
        };

        fetchSystemSettings();

        // Load Blacklist Items for reference
        const fetchBlacklist = async () => {
            const { data } = await supabase.from('blacklist').select('*').order('created_at', { ascending: false });
            if (data) setBlacklistItems(data);
        };
        fetchBlacklist();
    }, []);

    // Check R&D Permission
    const hasRndPermission = useMemo(() => {
        if (!user) return false;
        // Kiểm tra trường "Phân quyền" hoặc "Thẻ phân quyền" hoặc role R&D
        const permissions = user['Phân_quyền'] || user['Phân quyền'] || user['permissions'] || "";

        if (Array.isArray(permissions)) return permissions.includes("R&D");
        return String(permissions).includes("R&D");
    }, [user]);

    // Used for filtering normal users
    const RD_EXCLUSIVE_PRODUCTS = rdProducts;
    const GIFT_LIST = [
        "Serum Sâm", "Cream Sâm", "VIT C", "Dưỡng Tóc", "Kem Body",
        "Cream Bakuchiol", "Serum Bakuchiol", "Kẹo Dâu Glu", "Dầu gội",
        "Gel xương khớp", "Đường"
    ];
    const PAYMENT_METHODS = ["Zelle", "COD", "MO", "E-transfer", "Bank transfer", "Paypal", "Venmo", "Money Gram", "RIA", "CHECK", "Cash App"];
    const CURRENCY_LIST = ["USD", "JPY", "KRW", "CAD", "AUD", "GBP", "VND"];
    const EXCHANGE_RATES = {
        "USD": 25500,
        "JPY": 170, // Updated recent rate if needed, keeping consistency with user's old file
        "KRW": 18,
        "CAD": 18000,
        "AUD": 16500,
        "GBP": 32000,
        "VND": 1
    };

    // Filter Products
    const visibleProducts = useMemo(() => {
        if (hasRndPermission) {
            // R&D User: Show ONLY 'SP Test' products (defined in settings)
            return rdProducts.length > 0 ? rdProducts : PRODUCT_LIST;
        }
        // Normal User: Show Standard list excluding R&D products
        return PRODUCT_LIST.filter(p => !RD_EXCLUSIVE_PRODUCTS.includes(p));
    }, [hasRndPermission, PRODUCT_LIST, rdProducts, RD_EXCLUSIVE_PRODUCTS]);

    const loadPageData = async () => {
        setLoadingPages(true);
        setLoadingSale(true);
        setLoadingMkt(true);
        try {
            // 1. Nhân viên sale: distinct sale_staff từ orders, team (chi nhánh) từ orders
            const { data: ordersData, error: ordersError } = await supabase
                .from(ordersTableName)
                .select('sale_staff, team')
                .not('sale_staff', 'is', null)
                .order('created_at', { ascending: false })
                .limit(3000);

            if (!ordersError && ordersData?.length) {
                const seen = new Set();
                const saleList = [];
                for (const row of ordersData) {
                    const name = (row.sale_staff || "").trim();
                    if (!name || seen.has(name)) continue;
                    seen.add(name);
                    saleList.push({
                        'Họ_và_tên': name,
                        'Team': (row.team || "").trim(),
                    });
                }
                setSaleEmployees(saleList);
            } else {
                setSaleEmployees([]);
            }

            // 2. Fetch Pages from Supabase 'marketing_pages'
            const { data: pagesData, error: pagesError } = await supabase
                .from('marketing_pages')
                .select('*');

            if (pagesError) throw pagesError;

            const pageList = pagesData || [];

            // 3. Extract MKT Employees from 'marketing_pages' (distinct mkt_staff)
            // This ensures "Nhân viên MKT" dropdown matches the pages available.
            const uniqueMktNames = [...new Set(pageList.map(p => p.mkt_staff).filter(Boolean))].sort();
            const mktList = uniqueMktNames.map(name => ({
                'Họ_và_tên': name,
                'Bộ_phận': 'Marketing'
            }));

            // Thêm các tùy chọn đặc biệt không cần page
            const specialMktOptions = [
                { 'Họ_và_tên': 'MKT chưa nhập page', 'Bộ_phận': 'Marketing', 'isSpecial': true },
                { 'Họ_và_tên': 'MKT LumiGlobal_HN', 'Bộ_phận': 'Marketing', 'isSpecial': true },
                { 'Họ_và_tên': 'MKT LumiGlobal_HCM', 'Bộ_phận': 'Marketing', 'isSpecial': true }
            ];

            setMktEmployees([...specialMktOptions, ...mktList]);

            // Nhân viên MKT theo cột department trong users (cho Sửa đơn)
            const { data: usersForMkt, error: usersForMktErr } = await supabase
                .from("users")
                .select("name, department")
                .order("name", { ascending: true });

            if (!usersForMktErr && usersForMkt?.length) {
                const seenNames = new Set();
                const fromDept = [];
                for (const u of usersForMkt) {
                    const rawName = (u.name ?? "").toString().trim();
                    if (!rawName || !isUserDepartmentMkt(u.department)) continue;
                    if (seenNames.has(rawName)) continue;
                    seenNames.add(rawName);
                    fromDept.push({ "Họ_và_tên": rawName, "Bộ_phận": "MKT" });
                }
                setMktDeptStaff(fromDept);
            } else {
                setMktDeptStaff([]);
            }

            // Auto-set defaults: If not selected, default to current user
            // Logic: "Ai đăng nhập thì tự điền tên người đó sau đó thích sửa thì cho sửa"
            if (!selectedSale && userName) {
                // Check if user is in valid lists or just set it?
                // User wants convenience, so we set it to userName.
                // If userName is not in the dropdown list, it might be an issue if dropdown is strict.
                // But the dropdown (popover) allows searching/filtering.
                // Let's check if we should strictly limit to 'Sale' department?
                // Request says: "ai đăng nhập thì tự điền tên người đó".
                // So we prioritize setting it.
                setSelectedSale(userName);
            }
            // Also optional: Set MKT default if MKT dept
            if (boPhan) {
                const userDep = boPhan.toString().trim().toLowerCase();
                if ((userDep === 'mkt' || userDep === 'marketing') && !selectedMkt) {
                    // Check if userName exists in uniqueMktNames (which we already derived)
                    const exactMatch = uniqueMktNames.find(n => n === userName);
                    const looseMatch = uniqueMktNames.find(n => n.toLowerCase() === userName.toLowerCase());

                    if (exactMatch) {
                        setSelectedMkt(exactMatch);
                    } else if (looseMatch) {
                        setSelectedMkt(looseMatch);
                    } else {
                        // Do NOT auto-set if no match found. 
                        // This prevents filtering out all pages.
                        console.warn(`User ${userName} is MKT but not found in marketing_pages staff list. Skipping auto-select.`);
                    }
                }
            }

            // Filter Pages logic based on Permissions
            // Assign all pages directly without permission filtering
            setPages(pageList);

        } catch (error) {
            console.error("Lỗi khi tải dữ liệu page/nhân sự (Có thể do mất mạng hoặc lỗi server):", error);
            // Không hiện alert để tránh làm phiền, chỉ log warning
        } finally {
            setLoadingPages(false);
            setLoadingSale(false);
            setLoadingMkt(false);
        }
    };


    useEffect(() => {
        loadPageData();
    }, [ordersTableName]);

    const [dbRates, setDbRates] = useState({});

    useEffect(() => {
        const orderIdParam = searchParams.get("orderId");
        if (orderIdParam && isEdit) {
            setSearchQuery(orderIdParam);
            // Delay slightly to ensure component mounted or just call directly
            handleSearch(null, orderIdParam);
        }
    }, [searchParams, isEdit]);

    // --- LOGIC: Auto-fill Product Names ---
    useEffect(() => {
        const product = formData.productMain || "";
        let name1 = product;
        let name2 = ""; // Default empty for single products

        if (product === "Bakuchiol Retinol") {
            name1 = "Bakuchiol Retinol - Serum";
            name2 = "Bakuchiol Retinol - Cream";
        } else if (product === "ComboGold24k") {
            name1 = "Serum Gold 24k";
            name2 = "Cream Sâm";
        }

        setFormData(prev => ({
            ...prev,
            mathang1: name1,
            mathang2: name2
            // Note: sl1 defaults to 1 and sl2 to 0 in initial state, user inputs manually
        }));
    }, [formData.productMain]);

    // --- LOGIC: Calculate Total VND ---
    useEffect(() => {
        const price = parseFloat(formData.sale_price) || 0;
        const rate = parseFloat(formData.exchange_rate) || 0;
        const total = price * rate;
        setFormData(prev => ({ ...prev, "tong-tien": total }));
    }, [formData.sale_price, formData.exchange_rate]);

    // --- LOGIC: Sync date state with formData["created_at"] ---
    useEffect(() => {
        if (date) {
            // Convert date to datetime-local format (YYYY-MM-DDTHH:mm) in LOCAL timezone
            // Avoid using toISOString() as it converts to UTC and may change the date
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const dateTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;

            setFormData(prev => {
                // Only update if different to avoid infinite loop
                if (prev["created_at"] !== dateTimeString) {
                    return { ...prev, "created_at": dateTimeString };
                }
                return prev;
            });
        }
    }, [date]);

    // Load DB Rates từ bảng exchange_rates (schema mới: ti_gia, gia_tri)
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const { data, error } = await supabase
                    .from('exchange_rates')
                    .select('ti_gia, gia_tri')
                    .order('ti_gia');
                
                if (error) throw error;
                
                if (data && data.length > 0) {
                    // Map từ schema mới (ti_gia, gia_tri) sang object dbRates
                    const ratesMap = {};
                    data.forEach(rate => {
                        const currency = (rate.ti_gia || '').trim().toUpperCase();
                        const value = parseFloat(rate.gia_tri) || 0;
                        if (currency) {
                            ratesMap[currency] = value;
                        }
                    });
                    
                    // Đảm bảo VND luôn = 1
                    ratesMap["VND"] = 1;
                    
                    setDbRates(ratesMap);
                    console.log('✅ Đã tải tỷ giá từ bảng exchange_rates:', ratesMap);
                } else {
                    console.warn("Không có dữ liệu tỷ giá trong DB, sử dụng tỷ giá mặc định");
                }
            } catch (err) {
                console.warn("Không thể tải tỷ giá từ DB (Dùng mặc định):", err);
            }
        };
        fetchRates();
    }, []);

    // ...

    // --- LOGIC: Auto-Currency by Country ---
    useEffect(() => {
        let currency = "VND";
        const country = formData.country;
        if (country === "US") currency = "USD";
        if (country === "Nhật Bản" || country === "CĐ Nhật Bản") currency = "JPY";
        if (country === "Hàn Quốc") currency = "KRW";
        if (country === "Canada") currency = "CAD";
        if (country === "Úc") currency = "AUD";
        if (country === "Anh") currency = "GBP";

        // Auto-set Currency and Exchange Rate
        if (country) {
            // Priority: DB Rate > Hardcoded Constant > 1
            const rate = dbRates[currency] || EXCHANGE_RATES[currency] || 1;
            setFormData(prev => ({
                ...prev,
                paymentType: currency,
                exchange_rate: rate
            }));
        }
    }, [formData.country, dbRates]); // Add dbRates dependency

    // --- LOGIC: Auto-update Rate when Currency Changes Manually ---
    useEffect(() => {
        const rate = dbRates[formData.paymentType] || EXCHANGE_RATES[formData.paymentType] || 1;
        setFormData(prev => ({ ...prev, exchange_rate: rate }));
    }, [formData.paymentType, dbRates]);

    // --- LOGIC: Check Blacklist (Debounced) ---
    useEffect(() => {
        const checkBlacklist = async () => {
            const phone = formData.phone ? formData.phone.trim() : "";
            const name = formData["ten-kh"] ? formData["ten-kh"].trim() : "";

            if (!phone && !name) {
                setBlacklistStatus(null);
                setBlacklistReason("");
                setBlacklistInfo(null);
                return;
            }

            try {
                // Query blacklist table
                // Check exact phone OR name contains (case insensitive)
                let query = supabase.from('blacklist').select('*');

                // Construct OR condition
                const conditions = [];
                if (phone) conditions.push(`phone.eq.${phone}`);
                if (name) conditions.push(`name.ilike.%${name}%`);

                if (conditions.length > 0) {
                    const { data, error } = await query.or(conditions.join(',')).limit(1);

                    if (data && data.length > 0) {
                        setBlacklistStatus('warning');
                        setBlacklistReason(data[0].reason || "Không rõ lý do");
                        // Store detailed info for comparison
                        setBlacklistInfo(data[0]);
                    } else {
                        setBlacklistStatus('clean');
                        setBlacklistReason("");
                        setBlacklistInfo(null);
                    }
                }
            } catch (err) {
                console.error("Blacklist check error:", err);
            }
        };

        const timeoutId = setTimeout(checkBlacklist, 500); // Debounce 500ms
        return () => clearTimeout(timeoutId);
    }, [formData.phone, formData["ten-kh"]]);

    // Trùng khách (SĐT HOẶC tên HOẶC địa chỉ) — xem trước (debounce; khi lưu tính lại)
    useEffect(() => {
        let cancelled = false;
        const phone = formData.phone;
        const name = formData["ten-kh"];
        const address = formData["add"];
        const exclude = (formData["ma-don"] || "").trim();

        const run = async () => {
            const ctx = customerDupCheckContext(phone, name, address);
            if (!(ctx.phoneOk || ctx.nameOk || ctx.addrOk)) {
                if (!cancelled) setDuplicateOrderCodes([]);
                return;
            }
            const { data, error } = await supabase
                .from(ordersTableName)
                .select("order_code, customer_phone, customer_name, customer_address")
                .order("created_at", { ascending: false })
                .limit(2500);
            if (cancelled || error) return;
            const matches = [];
            const seen = new Set();
            for (const row of data || []) {
                const code = row.order_code;
                if (!code || code === exclude) continue;
                if (!rowMatchesCustomerDupOr(ctx, row)) continue;
                if (seen.has(code)) continue;
                seen.add(code);
                matches.push(code);
                if (matches.length >= 15) break;
            }
            if (!cancelled) setDuplicateOrderCodes(matches);
        };

        const t = setTimeout(run, 450);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [formData.phone, formData["ten-kh"], formData["add"], formData["ma-don"]]);

    // Sửa đơn: ghi cột canh_bao trên DB ngay khi trùng/blacklist/Sale đổi (debounce; không chạy khi chưa load xong đơn)
    useEffect(() => {
        if (!isEdit || !isOrderLoaded) return;
        const oc = (formData["ma-don"] || "").trim();
        if (!oc) return;

        let cancelled = false;
        let testMode = false;
        try {
            const settingsJson = localStorage.getItem("system_settings");
            testMode = JSON.parse(settingsJson || "{}").dataSource === "test";
        } catch {
            /* ignore */
        }
        if (testMode) return;

        const canh_bao = buildCanhBaoFromChecks(
            duplicateOrderCodes,
            blacklistStatus,
            blacklistReason,
            selectedSale
        );

        const t = setTimeout(async () => {
            if (cancelled) return;
            const { error } = await supabase.from(ordersTableName).update({ canh_bao }).eq("order_code", oc);
            if (error) console.warn("Đồng bộ cột canh_bao:", error.message);
        }, 900);

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [
        isEdit,
        isOrderLoaded,
        formData["ma-don"],
        duplicateOrderCodes.join("|"),
        blacklistStatus,
        blacklistReason,
        selectedSale,
    ]);

    const filteredSaleEmployees = useMemo(() => {
        if (!saleSearch) return saleEmployees;
        return saleEmployees.filter(e => (e['Họ_và_tên'] || e['Họ và tên'] || "").toLowerCase().includes(saleSearch.toLowerCase()));
    }, [saleEmployees, saleSearch]);

    // State to track if we are currently fetching team/branch info
    const [isCheckingTeam, setIsCheckingTeam] = useState(false);
    // State to store the found branch temporarily (to avoid race condition)
    const [foundBranchCache, setFoundBranchCache] = useState(null);

    // --- Tự động điền team (chi nhánh) theo nhân viên sale từ bảng users ---
    useEffect(() => {
        if (!selectedSale) return;

        const fetchBranchFromUsers = async () => {
            setIsCheckingTeam(true);
            try {
                // Helper function để normalize tên (xử lý dấu cách thừa, lowercase)
                const normalizeStr = (str) => {
                    if (!str) return '';
                    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
                };

                const saleName = selectedSale.trim();
                const saleNameNormalized = normalizeStr(saleName);
                let foundBranch = null;
                let source = '';
                let matchedName = '';

                console.log(`🔍 Đang tìm branch cho nhân viên: "${saleName}" (normalized: "${saleNameNormalized}")`);

                // BƯỚC 1: Ưu tiên lấy từ bảng users (match chính xác)
                let { data: userData, error } = await supabase
                    .from('users')
                    .select('branch, name')
                    .eq('name', saleName)
                    .limit(1);

                // BƯỚC 2: Nếu không tìm thấy, thử ilike (partial match)
                if ((!userData || userData.length === 0) && error === null) {
                    const { data: userDataLike, error: errorLike } = await supabase
                        .from('users')
                        .select('branch, name')
                        .ilike('name', `%${saleName}%`)
                        .limit(1);

                    if (!errorLike && userDataLike && userDataLike.length > 0) {
                        userData = userDataLike;
                        error = null;
                    }
                }

                // BƯỚC 3: Nếu tìm thấy user và có branch
                if (!error && userData && userData.length > 0) {
                    const branch = userData[0].branch;
                    if (branch && String(branch).trim()) {
                        foundBranch = String(branch).trim();
                        source = 'users';
                        matchedName = userData[0].name;
                        console.log(`  ✅ Match trong users: "${matchedName}" → branch: "${foundBranch}"`);
                    } else {
                        console.log(`  ⚠️ Tìm thấy user "${userData[0].name}" nhưng không có branch`);
                    }
                }

                // BƯỚC 4: Fallback - Fetch nhiều users và so sánh normalized (xử lý dấu cách thừa)
                if (!foundBranch) {
                    const { data: allUsers, error: allUsersError } = await supabase
                        .from('users')
                        .select('branch, name')
                        .not('branch', 'is', null)
                        .neq('branch', '');

                    if (!allUsersError && allUsers && allUsers.length > 0) {
                        // So sánh normalized để tìm match chính xác (xử lý dấu cách thừa)
                        const matchedUser = allUsers.find(user => {
                            const userNameNormalized = normalizeStr(user.name);
                            return userNameNormalized === saleNameNormalized;
                        });

                        if (matchedUser) {
                            foundBranch = String(matchedUser.branch).trim();
                            source = 'users (normalized match)';
                            matchedName = matchedUser.name;
                            console.log(`  ✅ Match normalized trong users: "${matchedName}" → branch: "${foundBranch}"`);
                        }
                    }
                }

                // BƯỚC 5: Fallback - Nếu không tìm thấy trong users, thử lấy từ orders (đơn hàng gần nhất)
                if (!foundBranch) {
                    const { data: orderData, error: orderError } = await supabase
                        .from(ordersTableName)
                        .select('team, sale_staff')
                        .eq('sale_staff', saleName)
                        .not('team', 'is', null)
                        .neq('team', '')
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (!orderError && orderData && orderData.length > 0) {
                        const team = orderData[0].team;
                        if (team && String(team).trim()) {
                            foundBranch = String(team).trim();
                            source = 'orders';
                            matchedName = orderData[0].sale_staff;
                            console.log(`  ✅ Match trong orders: "${matchedName}" → team: "${foundBranch}"`);
                        }
                    }
                }

                // BƯỚC 6: Fallback - Thử ilike trong orders
                if (!foundBranch) {
                    const { data: orderDataLike, error: orderErrorLike } = await supabase
                        .from(ordersTableName)
                        .select('team, sale_staff')
                        .ilike('sale_staff', `%${saleName}%`)
                        .not('team', 'is', null)
                        .neq('team', '')
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (!orderErrorLike && orderDataLike && orderDataLike.length > 0) {
                        const team = orderDataLike[0].team;
                        if (team && String(team).trim()) {
                            foundBranch = String(team).trim();
                            source = 'orders (ilike)';
                            matchedName = orderDataLike[0].sale_staff;
                            console.log(`  ✅ Match ilike trong orders: "${matchedName}" → team: "${foundBranch}"`);
                        }
                    }
                }

                // BƯỚC 7: Fallback cuối cùng - Fetch nhiều orders và so sánh normalized
                if (!foundBranch) {
                    const { data: recentOrders, error: recentOrdersError } = await supabase
                        .from(ordersTableName)
                        .select('team, sale_staff')
                        .not('team', 'is', null)
                        .neq('team', '')
                        .not('sale_staff', 'is', null)
                        .neq('sale_staff', '')
                        .order('created_at', { ascending: false })
                        .limit(500); // Lấy 500 đơn hàng gần nhất

                    if (!recentOrdersError && recentOrders && recentOrders.length > 0) {
                        // So sánh normalized để tìm match chính xác
                        const matchedOrder = recentOrders.find(order => {
                            const orderSaleNameNormalized = normalizeStr(order.sale_staff);
                            return orderSaleNameNormalized === saleNameNormalized;
                        });

                        if (matchedOrder) {
                            foundBranch = String(matchedOrder.team).trim();
                            source = 'orders (normalized match)';
                            matchedName = matchedOrder.sale_staff;
                            console.log(`  ✅ Match normalized trong orders: "${matchedName}" → team: "${foundBranch}"`);
                        }
                    }
                }

                // BƯỚC 8: Cập nhật form và cache
                if (foundBranch) {
                    setFoundBranchCache(foundBranch); // Cache để tránh race condition
                    setFormData((prev) => ({ ...prev, team: foundBranch }));
                    console.log(`✅ Tự động điền Chi nhánh: "${foundBranch}" cho nhân viên "${selectedSale}" (matched: "${matchedName}", từ ${source})`);
                } else {
                    setFoundBranchCache(null); // Clear cache nếu không tìm thấy
                    console.log(`⚠️ Không tìm thấy branch cho nhân viên "${selectedSale}" (normalized: "${saleNameNormalized}") trong cả users và orders`);
                    console.log(`   💡 Kiểm tra: Tên có dấu cách thừa? Tên có khác với database?`);
                    // Giữ nguyên giá trị hiện tại thay vì reset về "" để tránh mất dữ liệu
                }
            } catch (err) {
                console.error('❌ Lỗi khi fetch branch:', err);
            } finally {
                setIsCheckingTeam(false);
            }
        };

        fetchBranchFromUsers();
    }, [selectedSale]);

    const specialMktOptionRows = useMemo(
        () => [
            { "Họ_và_tên": "MKT chưa nhập page", "Bộ_phận": "Marketing", isSpecial: true },
            { "Họ_và_tên": "MKT LumiGlobal_HN", "Bộ_phận": "Marketing", isSpecial: true },
            { "Họ_và_tên": "MKT LumiGlobal_HCM", "Bộ_phận": "Marketing", isSpecial: true },
        ],
        []
    );

    /** Nguồn danh sách MKT: sửa đơn = users (bộ phận MKT) + tùy chọn đặc biệt; tạo mới = giữ logic page */
    const mktPickerList = useMemo(() => {
        if (!isEdit) return mktEmployees;
        const byName = new Set(specialMktOptionRows.map((r) => r["Họ_và_tên"]));
        const rest = mktDeptStaff.filter((e) => !byName.has(e["Họ_và_tên"]));
        let list = [...specialMktOptionRows, ...rest];
        if (selectedMkt && !list.some((e) => (e["Họ_và_tên"] || "") === selectedMkt)) {
            list = [...list, { "Họ_và_tên": selectedMkt, isLegacy: true }];
        }
        return list;
    }, [isEdit, mktEmployees, mktDeptStaff, selectedMkt, specialMktOptionRows]);

    const filteredMktEmployees = useMemo(() => {
        const source = mktPickerList;
        if (!mktSearch) return source;
        const q = mktSearch.toLowerCase();
        return source.filter((e) =>
            (e["Họ_và_tên"] || e["Họ và tên"] || "").toLowerCase().includes(q)
        );
    }, [mktPickerList, mktSearch]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return visibleProducts;
        return visibleProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase()));
    }, [visibleProducts, productSearch]);

    // -------------------------------------------------------------------------
    // 2.5 FILTER LOGIC (Missing previously => Fixed)
    // -------------------------------------------------------------------------
    const filteredPages = pages.filter(p => {
        const matchesSearch = !pageSearch || (p.page_name || "").toLowerCase().includes(pageSearch.toLowerCase());
        // REMOVED dependency on selectedMkt to allow switching to any page/staff
        return matchesSearch;
    });



    // -------------------------------------------------------------------------
    // 3. HANDLERS
    // -------------------------------------------------------------------------
    const handleInputChange = (e) => {
        const { id, value } = e.target;
        // Cho phép phone nhập text (có thể có ký tự đặc biệt như +, -, dấu cách, dấu ngoặc đơn, v.v.)
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const toggleXacNhan = (key) => {
        setXacNhan(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // --- Autocomplete Logic ---
    useEffect(() => {
        const fetchSuggestions = async () => {
            // Only fetch if NOT already searching/loading to avoid spam
            if (isSearching) return;

            try {
                let queryBuilder = supabase
                    .from(ordersTableName)
                    .select('order_code, customer_name');

                if (!searchQuery || searchQuery.trim() === '') {
                    // Empty query: Fetch recent 100 orders
                    queryBuilder = queryBuilder.order('created_at', { ascending: false }).limit(100);
                } else {
                    // Search query: Filter by order_code
                    queryBuilder = queryBuilder.ilike('order_code', `%${searchQuery}%`).limit(5);
                }

                const { data, error } = await queryBuilder;

                if (error) throw error;
                setSuggestions(data || []);
                // Only show if we have data
                if (data && data.length > 0) {
                    // We control show/hide via onFocus/onBlur, but this ensures data is ready
                }
            } catch (err) {
                console.error("Suggestion error:", err);
            }
        };

        const timeoutId = setTimeout(fetchSuggestions, 300); // Debounce
        return () => clearTimeout(timeoutId);
    }, [searchQuery, isSearching]);

    const selectSuggestion = (code) => {
        setSearchQuery(code);
        setShowSuggestions(false);
        handleSearch(null, code);
    };

    const handleSearch = async (e, queryOverride) => {
        if (e) e.preventDefault();
        const query = queryOverride || searchQuery;
        if (!query || !query.trim()) return;

        setIsSearching(true);
        try {
            // Search primarily by order_code. ID search removed to prevent UUID casting errors.
            const { data, error } = await supabase
                .from(ordersTableName)
                .select('*')
                .eq('order_code', query.trim())
                .maybeSingle(); // Use maybeSingle to return null instead of throwing error if not found

            if (error) throw error;

            if (!data) {
                alert("Không tìm thấy đơn hàng có mã này!");
                setIsOrderLoaded(false); // Reset loaded state
                logDbArrayRef.current = [];
                logBaselineTrackedRef.current = {};
                return;
            }

            // Map Data to Form
            // Parse order_date properly - handle both DATE and TIMESTAMP formats
            let orderDateTimeString = new Date().toISOString().slice(0, 16);
            if (data.order_date) {
                try {
                    const orderDate = new Date(data.order_date);
                    // Format as datetime-local: YYYY-MM-DDTHH:mm
                    const year = orderDate.getFullYear();
                    const month = String(orderDate.getMonth() + 1).padStart(2, '0');
                    const day = String(orderDate.getDate()).padStart(2, '0');
                    const hours = String(orderDate.getHours()).padStart(2, '0');
                    const minutes = String(orderDate.getMinutes()).padStart(2, '0');
                    orderDateTimeString = `${year}-${month}-${day}T${hours}:${minutes}`;
                } catch (e) {
                    console.warn("Error parsing order_date:", e);
                    orderDateTimeString = new Date().toISOString().slice(0, 16);
                }
            }

            setFormData({
                "ma-don": data.order_code,
                "created_at": orderDateTimeString,
                "tracking_code": data.tracking_code || "",

                "ten-kh": data.customer_name || "",
                "phone": data.customer_phone || "",
                "add": data.customer_address || "",
                "city": data.city || "",
                "state": data.state || "",
                "zipcode": data.zipcode || "",
                "country": data.country || "", // Lấy từ country

                "productMain": data.product || "", // Bỏ qua product_main, chỉ lấy từ product
                "mathang1": data.product_name_1 || "", "sl1": data.quantity_1 || 1,
                "mathang2": data.product_name_2 || "", "sl2": data.quantity_2 || 0,
                "quatang": data.gift || "", "slq": data.gift_quantity || 0,

                "sale_price": data.sale_price || 0,
                "paymentType": data.payment_type || "VND",
                "exchange_rate": data.exchange_rate || 1,
                "tong-tien": data.total_amount_vnd || 0,
                "hinh-thuc": data.payment_method_text || "",
                "shipping_fee": data.shipping_fee || 0,
                "shipping_cost": data.shipping_cost || 0,
                "base_price": data.base_price || 0,
                "reconciled_vnd": data.reconciled_vnd || 0,

                "note_sale": data.note ? data.note.split('\nRef:')[0] : "",
                "team": data.team || "",
                "creator_name": data.created_by || "",
            });

            // Sync date state with parsed order_date
            if (data.order_date) {
                try {
                    setDate(new Date(data.order_date));
                } catch (e) {
                    console.warn("Error parsing order_date for date state:", e);
                    setDate(new Date());
                }
            } else {
                setDate(new Date());
            }
            setSelectedPage(data.page_name || "");
            setSelectedMkt(data.marketing_staff || "");
            setSelectedSale(data.sale_staff || "");
            setTrangThaiDon(null); // Reset status check
            logDbArrayRef.current = parseOrderLogJsonb(data.log);
            logBaselineTrackedRef.current = pickTrackedFieldsFromOrderRow(data);
            setIsOrderLoaded(true);



        } catch (err) {
            console.error("Search error:", err);
            alert("Lỗi khi tìm đơn hàng: " + err.message);
        } finally {
            setIsSearching(false);
        }
    };

    // Hàm tính ca từ thời gian lên đơn
    const calculateShiftFromTime = (dateTimeString) => {
        if (!dateTimeString) return null;

        try {
            const date = new Date(dateTimeString);
            const hour = date.getHours();
            const minute = date.getMinutes();
            const totalMinutes = hour * 60 + minute;

            // Logic phân ca:
            // - 07:30 -> 15:30: "Giữa ca"
            // - 15:31 -> 23:59: "Giữa ca,Hết ca" (để tính được cả 2 nhóm ca)
            // - Còn lại (00:00 -> 07:29): "Hết ca"
            const startGiuaCa = 7 * 60 + 30;   // 07:30
            const endGiuaCa = 15 * 60 + 30;    // 15:30
            const startBoth = 15 * 60 + 31;    // 15:31
            const endDay = 23 * 60 + 59;       // 23:59

            if (totalMinutes >= startGiuaCa && totalMinutes <= endGiuaCa) {
                return "Giữa ca";
            }
            if (totalMinutes >= startBoth && totalMinutes <= endDay) {
                return "Giữa ca,Hết ca";
            }
            return "Hết ca";
        } catch (error) {
            console.error("Error calculating shift:", error);
            return null;
        }
    };

    // Ghi cột log tự động khi field theo dõi đổi (debounce). Sửa đơn: PATCH DB; tạo mới: chỉ bộ nhớ tới lúc Lưu.
    useEffect(() => {
        let testMode = false;
        try {
            testMode = JSON.parse(localStorage.getItem("system_settings") || "{}").dataSource === "test";
        } catch {
            /* ignore */
        }
        if (testMode || isSaving) return;
        if (isEdit && !isOrderLoaded) return;

        let cancelled = false;
        const t = setTimeout(async () => {
            if (cancelled || isSaving) return;

            const orderDateValue = computeOrderDateValueForPayload(formData["created_at"]);
            const orderDateTime = formData["created_at"] || new Date().toISOString();
            const calculatedShift = calculateShiftFromTime(orderDateTime);
            const current = buildTrackedFieldsPayloadForLog({
                formData,
                selectedPage,
                selectedMkt,
                selectedSale,
                hasRndPermission,
                foundBranchCache,
                orderDateValue,
                calculatedShift,
                isEdit,
            });
            const actor = (userName || userEmail || "hệ thống").toString().trim();
            const entries = buildOrderLogDiffEntries({
                baseline: logBaselineTrackedRef.current,
                current,
                actor,
            });
            if (!entries.length) return;

            const merged = mergeOrderLogJsonb(logDbArrayRef.current, entries);
            const oc = (formData["ma-don"] || "").trim();

            if (isEdit && oc) {
                const { error } = await supabase.from(ordersTableName).update({ log: merged }).eq("order_code", oc);
                if (error) {
                    console.warn("Tự động ghi log:", error.message);
                    return;
                }
            }

            if (cancelled) return;
            logDbArrayRef.current = parseOrderLogJsonb(merged);
            logBaselineTrackedRef.current = { ...current };
        }, 900);

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [
        isSaving,
        isEdit,
        isOrderLoaded,
        formData,
        selectedPage,
        selectedMkt,
        selectedSale,
        hasRndPermission,
        foundBranchCache,
        userName,
        userEmail,
    ]);

    const handleSave = async () => {
        setSubmitAttempted(true);
        // Validation
        // Kiểm tra xem MKT có phải là tùy chọn đặc biệt không (không cần page)
        const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
        const isSpecialMkt = selectedMkt && specialMktOptions.includes(selectedMkt);

        // Validation - Only strict for new orders
        // Bỏ qua validation page nếu chọn MKT đặc biệt
        if (!isEdit && (!formData["ten-kh"] || !formData["phone"] || (!selectedPage && !isSpecialMkt))) {
            alert("Vui lòng nhập tên, số điện thoại khách hàng và chọn Page (hoặc chọn MKT đặc biệt)!");
            return;
        }

        // Validation - Khu vực bắt buộc cho cả tạo mới và edit
        if (!formData.country || formData.country.trim() === "") {
            alert("⚠️ Vui lòng chọn Khu vực! Đây là trường bắt buộc.");
            return;
        }

        // Validation - Bắt buộc Hình thức thanh toán và Loại tiền
        if (!String(formData["hinh-thuc"] || "").trim()) {
            alert("⚠️ Vui lòng chọn Hình thức thanh toán! Đây là trường bắt buộc.");
            return;
        }
        if (!String(formData.paymentType || "").trim()) {
            alert("⚠️ Vui lòng chọn Loại tiền! Đây là trường bắt buộc.");
            return;
        }

        // Prevent race condition: Block save if we are still checking team info
        if (isCheckingTeam) {
            alert("⏳ Đang lấy thông tin Chi nhánh (Team) cho nhân viên Sale. Vui lòng đợi trong giây lát rồi thử lại!");
            return;
        }

        setIsSaving(true);
        try {
            // Generate Code if empty (Only for new orders)
            let orderCode = formData["ma-don"];
            if (!orderCode && !isEdit) {
                // Rule: Remove spaces, take first 3 characters + Random 7-9 alphanumeric
                let prefix = "DH";
                if (formData.productMain) {
                    // Remove all spaces and take first 3 characters
                    const noSpaces = formData.productMain.replace(/\s+/g, '');
                    prefix = noSpaces.substring(0, 3);
                }
                // Generate random alphanumeric string (letters + numbers), length 7-9
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                const randomLength = Math.floor(Math.random() * 3) + 7; // 7-9 characters
                let randomStr = '';
                for (let i = 0; i < randomLength; i++) {
                    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                orderCode = `${prefix}${randomStr}`;
            } else if (!orderCode && isEdit) {
                alert("Đơn hàng chỉnh sửa phải có Mã Đơn Hàng!");
                setIsSaving(false);
                return;
            }

            /** Đơn hiện tại (edit): ngày cũ + snapshot MKT + log — kiểm tra tồn tại sớm */
            let previousOrderDate = null;
            let existingOrderSnapshot = null;
            if (isEdit && orderCode) {
                const { data: ex, error: exErr } = await supabase
                    .from(ordersTableName)
                    .select('*')
                    .eq('order_code', orderCode)
                    .maybeSingle();
                if (exErr) {
                    console.error("❌ Error checking existing order:", exErr);
                    throw new Error(`Lỗi khi kiểm tra đơn hàng: ${exErr.message}`);
                }
                if (!ex) {
                    throw new Error(`⚠️ Không tìm thấy đơn hàng với mã: ${orderCode}. Đơn hàng có thể đã bị xóa hoặc mã đơn hàng không đúng.`);
                }
                existingOrderSnapshot = ex;
                if (ex.order_date != null) {
                    const od = ex.order_date;
                    previousOrderDate = typeof od === 'string' ? od.split('T')[0] : od;
                }
            }

            const orderDateTime = formData["created_at"] || new Date().toISOString();
            const calculatedShift = calculateShiftFromTime(orderDateTime);
            const orderDateValue = computeOrderDateValueForPayload(formData["created_at"]);

            const dupCodes = await fetchDuplicateOrderCodesByCustomerOr(
                supabase,
                { phone: formData["phone"], name: formData["ten-kh"], address: formData["add"] },
                orderCode,
                ordersTableName
            );
            const canh_bao = buildCanhBaoFromChecks(dupCodes, blacklistStatus, blacklistReason, selectedSale);
            const actor = (userName || userEmail || "hệ thống").toString().trim();

            // Prepare payload
            // LƯU Ý: Khi edit, KHÔNG gửi order_code trong payload vì:
            // 1. order_code đã được dùng làm điều kiện WHERE
            // 2. order_code không nên được thay đổi khi edit
            const orderPayload = {
                // Chỉ thêm order_code khi tạo mới, không thêm khi edit
                ...(isEdit ? {} : { order_code: orderCode }),
                order_date: orderDateValue,
                tracking_code: formData.tracking_code,

                customer_name: formData["ten-kh"],
                customer_phone: formData["phone"],
                customer_address: formData["add"],
                city: formData.city,
                state: formData.state,
                zipcode: formData.zipcode,
                country: formData.country, // Lưu vào country

                // Products
                product: formData.productMain,
                product_name_1: formData.mathang1,
                quantity_1: parseFloat(formData.sl1) || 0,
                product_name_2: formData.mathang2,
                quantity_2: parseFloat(formData.sl2) || 0,
                gift: formData.quatang,
                gift_quantity: parseFloat(formData.slq) || 0,

                // Payment
                sale_price: parseFloat(formData.sale_price) || 0,
                payment_type: formData.paymentType,
                exchange_rate: parseFloat(formData.exchange_rate) || 1,
                total_amount_vnd: (() => {
                    const n = parseFloat(formData["tong-tien"]);
                    return Number.isFinite(n) ? n : 0;
                })(),
                payment_method_text: formData["hinh-thuc"],

                shipping_fee: formData.shipping_fee === '' ? null : parseFloat(formData.shipping_fee),
                shipping_cost: parseFloat(formData.shipping_cost) || 0,
                base_price: parseFloat(formData.base_price) || 0,
                reconciled_vnd: parseFloat(formData.reconciled_vnd) || 0,

                page_name: selectedPage,
                marketing_staff: selectedMkt,
                sale_staff: selectedSale,

                // Tự động điền ca từ thời gian lên đơn
                shift: calculatedShift || (isEdit ? undefined : "Giữa ca"), // Chỉ điền khi tạo mới hoặc có thể tính được

                // Defaults / System
                delivery_status: isEdit ? undefined : "Chờ xử lý", // Don't overwrite status on edit
                check_result: isEdit ? undefined : "Vận đơn XL", // Default to "Vận đơn XL" for new orders
                // User Info - CSKH không tự động điền, để trống hoặc người dùng tự nhập
                // cskh: undefined, // Đã xóa tự động điền CSKH
                // Don't overwrite created_by on edit ideally, but here we just send it if new

                // FORCE R&D TAG if user is R&D
                // Ưu tiên dùng foundBranchCache nếu có (tránh race condition), sau đó dùng formData.team
                // Chỉ gửi team nếu có giá trị hợp lệ (không phải empty string)
                team: hasRndPermission 
                    ? "RD" 
                    : (foundBranchCache && foundBranchCache.trim() 
                        ? foundBranchCache.trim() 
                        : (formData.team && formData.team.trim() 
                            ? formData.team.trim() 
                            : undefined)),

                note: formData["note_sale"] || "",
            };

            // Remove undefined keys và null values (giữ lại empty string và 0)
            Object.keys(orderPayload).forEach(key => {
                if (orderPayload[key] === undefined || orderPayload[key] === null) {
                    delete orderPayload[key];
                }
            });

            const saveLogTail = buildOrderLogDiffEntries({
                baseline: logBaselineTrackedRef.current,
                current: pickTrackedFieldsFromPayload(orderPayload),
                actor,
            });
            // Luôn nối từ log trong ref (đã sync với debounce PATCH), không dùng snapshot đầu save — tránh ghi trùng vào JSONB
            const mergedLog = mergeOrderLogJsonb(logDbArrayRef.current, saveLogTail);
            orderPayload.log = mergedLog;
            orderPayload.canh_bao = canh_bao;

            // Log payload để debug
            console.log("📦 Update payload:", {
                isEdit,
                orderCode,
                payload: orderPayload,
                payloadKeys: Object.keys(orderPayload)
            });

            // check Data Source Mode
            const settingsJson = localStorage.getItem('system_settings');
            const settings = settingsJson ? JSON.parse(settingsJson) : {};
            if (settings.dataSource === 'test') {
                console.log("🔶 [TEST MODE] Skipping DB Save. Payload:", orderPayload);
                await new Promise(r => setTimeout(r, 800)); // Fake delay
                alert(isEdit ? "✅ [TEST MODE] Giả lập cập nhật đơn hàng thành công!" : "✅ [TEST MODE] Giả lập lưu đơn hàng thành công!");
                if (!isEdit) handleReset();
                return;
            }

            const query = supabase.from(ordersTableName);
            let result;

            if (isEdit) {
                // Khi edit, sử dụng UPDATE với order_code làm điều kiện (đã kiểm tra tồn tại ở trên)
                if (!orderCode) {
                    throw new Error("Không tìm thấy mã đơn hàng để cập nhật!");
                }

                console.log(`🔄 Updating order with code: ${orderCode} (ID: ${existingOrderSnapshot.id})`);
                console.log(`📦 Payload keys:`, Object.keys(orderPayload));
                console.log(`📦 Payload (first 5 keys):`, Object.fromEntries(Object.entries(orderPayload).slice(0, 5)));

                // Đảm bảo KHÔNG có order_code trong payload khi edit
                const updatePayload = { ...orderPayload };
                delete updatePayload.order_code; // Xóa order_code khỏi payload để tránh conflict

                // Update bằng order_code
                result = await query
                    .update(updatePayload)
                    .eq('order_code', orderCode)
                    .select();

                console.log("📊 Update result:", {
                    hasData: !!result.data,
                    dataLength: result.data?.length,
                    error: result.error,
                    updatedOrderCode: result.data?.[0]?.order_code
                });
            } else {
                // Khi tạo mới, sử dụng INSERT
                console.log("➕ Inserting new order");
                result = await query.insert([orderPayload]).select();
            }

            const { data: savedData, error } = result;

            if (error) {
                console.error("❌ Save error details:", {
                    error,
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });

                // Hiển thị lỗi chi tiết hơn
                let errorMsg = `❌ Lỗi ${isEdit ? 'cập nhật' : 'lưu'} đơn hàng: ${error.message}`;
                if (error.details) {
                    errorMsg += `\n\nChi tiết: ${error.details}`;
                }
                if (error.hint) {
                    errorMsg += `\n\nGợi ý: ${error.hint}`;
                }
                if (error.code === '42501') {
                    errorMsg += `\n\n⚠️ Lỗi quyền truy cập (RLS Policy). Vui lòng kiểm tra quyền của bạn.`;
                }

                throw new Error(errorMsg);
            }

            /** Chỉ tính lại Số đơn TT khi chắc chắn DB đã ghi đơn thành công */
            let saveOkForMktSync = false;

            if (!savedData || savedData.length === 0) {
                console.warn("⚠️ Warning: Update completed but no data returned.");
                console.warn("   This could mean:");
                console.warn("   1. RLS Policy doesn't allow SELECT after UPDATE");
                console.warn("   2. No rows matched the update condition");
                console.warn("   3. Update succeeded but SELECT was blocked");

                // Kiểm tra lại xem order có tồn tại không
                if (isEdit) {
                    const { data: checkData, error: checkError } = await supabase
                        .from(ordersTableName)
                        .select('order_code, order_date')
                        .eq('order_code', orderCode)
                        .maybeSingle();

                    if (checkError) {
                        console.error("❌ Error checking updated order:", checkError);
                        alert(`⚠️ Cập nhật có thể đã thành công nhưng không thể xác nhận. Lỗi: ${checkError.message}`);
                    } else if (checkData) {
                        console.log("✅ Order exists after update:", checkData);
                        alert("✅ Cập nhật đơn hàng thành công!");
                        saveOkForMktSync = true;
                    } else {
                        console.error("❌ Order not found after update!");
                        alert("⚠️ Cảnh báo: Không tìm thấy đơn hàng sau khi cập nhật. Vui lòng kiểm tra lại.");
                    }
                } else {
                    alert("✅ Lưu đơn hàng thành công! (Không thể xác nhận do RLS policy)");
                    saveOkForMktSync = true;
                }
            } else {
                console.log("✅ Update successful, returned data:", savedData);
                alert(isEdit ? "✅ Cập nhật đơn hàng thành công!" : "✅ Lưu đơn hàng thành công!");
                saveOkForMktSync = true;
            }

            if (saveOkForMktSync) {
                logDbArrayRef.current = parseOrderLogJsonb(orderPayload.log);
                logBaselineTrackedRef.current = pickTrackedFieldsFromPayload(orderPayload);
                const newMktKey = {
                    date: orderDateValue,
                    name: selectedMkt,
                    product: formData.productMain,
                    market: formData.country,
                };
                const oldMktKey = (isEdit && existingOrderSnapshot)
                    ? {
                        date: existingOrderSnapshot.order_date,
                        name: existingOrderSnapshot.marketing_staff,
                        product: existingOrderSnapshot.product,
                        market: existingOrderSnapshot.country,
                    }
                    : null;
                void recalcMktSoDonAfterOrderSave({
                    newOrderDate: orderDateValue,
                    previousOrderDate,
                    newOrderKey: newMktKey,
                    previousOrderKey: oldMktKey,
                })
                    .then((r) => {
                        if (r?.skipped) return;
                        console.log('✅ Đã đồng bộ Số đơn TT (Báo cáo MKT):', r?.upserted ?? r);
                    })
                    .catch((err) => console.error('⚠️ Đồng bộ Số đơn TT (MKT) sau lưu đơn:', err));

                const newSaleKey = {
                    date: orderDateValue,
                    name: selectedSale,
                    product: formData.productMain,
                    market: formData.country,
                };
                const oldSaleKey = (isEdit && existingOrderSnapshot)
                    ? {
                        date: existingOrderSnapshot.order_date,
                        name: existingOrderSnapshot.sale_staff,
                        product: existingOrderSnapshot.product,
                        market: existingOrderSnapshot.country,
                    }
                    : null;
                void recalcSaleOrderCountAfterOrderSave({
                    newOrderDate: orderDateValue,
                    previousOrderDate,
                    newOrderKey: newSaleKey,
                    previousOrderKey: oldSaleKey,
                    createMissingForHetCa: true,
                })
                    .then((r) => {
                        if (r?.skipped) return;
                        console.log('✅ Đã đồng bộ sales_reports (key-scoped):', r?.upserted ?? r);
                    })
                    .catch((err) => console.error('⚠️ Đồng bộ sales_reports sau lưu đơn:', err));
            }

            // Optional: Reset form or Redirect
            if (!isEdit) {
                handleReset();
            }

        } catch (error) {
            console.error("Save error:", error);
            alert(`❌ Lỗi lưu đơn: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setFormData({
            "ma-don": "",
            "created_at": new Date().toISOString().slice(0, 16),
            "tracking_code": "",
            "ten-kh": "",
            "phone": "",
            "add": "",
            "city": "",
            "state": "",
            "zipcode": "",
            "country": "",
            "productMain": "",
            "mathang1": "", "sl1": 1,
            "mathang2": "", "sl2": 0,
            "quatang": "", "slq": 0,
            "sale_price": 0,
            "paymentType": "VND",
            "exchange_rate": 25000,
            "tong-tien": 0,
            "hinh-thuc": "",
            "shipping_fee": 0, "shipping_cost": 0,
            "base_price": 0, "reconciled_vnd": 0,
            "note_sale": "",
            "team": "",
            "creator_name": "",
        });
        setSelectedPage("");
        setSelectedMkt("");
        // Reset to current user by default
        setSelectedSale(userName || "");
        setProductSearch("");
        setDate(new Date());
        setActiveTab("khach-hang");

        // Reset Blacklist State
        setBlacklistStatus(null);
        setBlacklistReason("");
        setBlacklistInfo(null);
        setBlacklistItems([]); // Optional: keep items or clear? Better keep to save fetch? Actually keep items is better, but clear status is must
        setDuplicateOrderCodes([]);
        logDbArrayRef.current = [];
        logBaselineTrackedRef.current = {};
    };

    if (!hasAccess) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này.</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Back Button */}


                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-[#2d7c2d]">{isEdit ? "Chỉnh Sửa Đơn Hàng" : "Nhập đơn hàng mới"}</h1>
                            <p className="text-gray-500 italic text-sm">Vui lòng điền đầy đủ các thông tin bắt buộc (*)</p>
                            <p className="text-xs text-gray-500 mt-1">
                                View dữ liệu: <span className="font-semibold">{isHcmView ? 'HCM (order_code_hcm)' : 'Mặc định (orders)'}</span>
                            </p>
                        </div>
                        <div className="flex gap-2 items-center">
                            <div className="flex bg-white border border-gray-300 rounded-md overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => navigate(buildNhapDonPath(false))}
                                    className={`px-3 py-1.5 text-xs font-medium ${!isHcmView ? 'bg-[#2d7c2d] text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                    View mặc định
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate(buildNhapDonPath(true))}
                                    className={`px-3 py-1.5 text-xs font-medium border-l border-gray-300 ${isHcmView ? 'bg-[#2d7c2d] text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                                >
                                    View HCM
                                </button>
                            </div>
                            <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleReset}>
                                <XCircle className="w-4 h-4 mr-2" />
                                Hủy bỏ
                            </Button>
                            <Button className="bg-[#2d7c2d] hover:bg-[#256625]" onClick={handleSave} disabled={isSaving}>
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving ? "Đang lưu..." : (isEdit ? "Cập nhật đơn hàng" : "Lưu đơn hàng")}
                            </Button>
                        </div>
                    </div>

                    {/* Edit Mode Search Bar */}
                    {isEdit && (
                        <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="p-4 flex gap-4 items-center">
                                <div className="flex-1">
                                    <Label className="mb-1 text-blue-700">Tìm kiếm đơn hàng để sửa</Label>
                                    <div className="flex gap-2 relative">
                                        <div className="relative w-full">
                                            <Input
                                                placeholder="Nhập mã đơn hàng..."
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    setShowSuggestions(true);
                                                }}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                                onFocus={() => setShowSuggestions(true)}
                                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)} // Delay to allow click
                                            />
                                            {showSuggestions && suggestions.length > 0 && (
                                                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                                                    {suggestions.map((s) => (
                                                        <div
                                                            key={s.order_code}
                                                            className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                                            onClick={() => selectSuggestion(s.order_code)}
                                                        >
                                                            <span className="font-medium text-blue-700">{s.order_code}</span>
                                                            <span className="text-gray-500 ml-2">- {s.customer_name}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <Button onClick={() => handleSearch()} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 whitespace-nowrap">
                                            {isSearching ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex-1 text-sm text-blue-600 italic">
                                    Nhập mã đơn hàng chính xác để tải dữ liệu. Cẩn thận khi chỉnh sửa các trường quan trọng.
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Only show form if NOT Edit Mode OR (Edit Mode AND Order is Loaded) */}
                    {(!isEdit || isOrderLoaded) && (
                        <>
                            {/* Tabs */}
                            <div className="w-full">
                                <div className="grid grid-cols-3 bg-gray-100 p-1 rounded-lg mb-4">
                                    <button
                                        onClick={() => setActiveTab("khach-hang")}
                                        className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "khach-hang" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                                    >
                                        Thông tin khách hàng
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("thong-tin-don")}
                                        className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "thong-tin-don" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                                    >
                                        Thông tin đơn
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("nhan-su")}
                                        className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "nhan-su" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                                    >
                                        Thông tin nhân sự
                                    </button>
                                </div>

                                {/* Tab: Thông tin khách hàng */}
                                {activeTab === "khach-hang" && (
                                    <Card>
                                        <CardHeader className="pb-3 border-b mb-4">
                                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                                <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                                Thông tin khách hàng
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <div className="space-y-2">
                                                <Label htmlFor="ngay-len-don">Ngày lên đơn*</Label>
                                                <DatePicker value={date} onChange={setDate} className="w-full" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="nv-mkt">Nhân viên marketing</Label>
                                                <Popover open={isMktOpen} onOpenChange={setIsMktOpen}>
                                                    <div className="relative" ref={mktRef}>
                                                        <PopoverAnchor asChild>
                                                            <div className="relative">
                                                                {isEdit ? (
                                                                    <Input
                                                                        id="nv-mkt"
                                                                        placeholder="Gõ hoặc chọn nhân viên MKT (bộ phận MKT)..."
                                                                        value={selectedMkt}
                                                                        onChange={(e) => {
                                                                            setSelectedMkt(e.target.value);
                                                                            setMktSearch(e.target.value);
                                                                            setIsMktOpen(true);
                                                                        }}
                                                                        onFocus={() => {
                                                                            if (mktRef.current) setMktPopoverWidth(mktRef.current.offsetWidth);
                                                                        }}
                                                                        onClick={() => {
                                                                            if (mktRef.current) setMktPopoverWidth(mktRef.current.offsetWidth);
                                                                            setIsMktOpen(true);
                                                                        }}
                                                                        className="pr-8 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                                                                    />
                                                                ) : (
                                                                    (() => {
                                                                        const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                                        const isSpecialMkt = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                                        if (!isSpecialMkt) {
                                                                            return (
                                                                                <Input
                                                                                    id="nv-mkt"
                                                                                    value={selectedMkt || ''}
                                                                                    readOnly
                                                                                    onClick={() => {
                                                                                        if (mktRef.current) setMktPopoverWidth(mktRef.current.offsetWidth);
                                                                                        setIsMktOpen(true);
                                                                                    }}
                                                                                    className="bg-gray-100 cursor-pointer text-gray-700 font-medium pr-8"
                                                                                    placeholder="Tự động theo Page (click để chọn tùy chọn đặc biệt)..."
                                                                                />
                                                                            );
                                                                        }
                                                                        return (
                                                                            <Input
                                                                                id="nv-mkt"
                                                                                placeholder="Chọn nhân viên MKT đặc biệt..."
                                                                                value={selectedMkt}
                                                                                onChange={(e) => {
                                                                                    setSelectedMkt(e.target.value);
                                                                                    setMktSearch(e.target.value);
                                                                                    setIsMktOpen(true);
                                                                                }}
                                                                                onFocus={() => {
                                                                                    if (mktRef.current) setMktPopoverWidth(mktRef.current.offsetWidth);
                                                                                }}
                                                                                onClick={() => {
                                                                                    if (mktRef.current) setMktPopoverWidth(mktRef.current.offsetWidth);
                                                                                    setIsMktOpen(true);
                                                                                }}
                                                                                className="pr-8 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                                                                            />
                                                                        );
                                                                    })()
                                                                )}
                                                                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
                                                            </div>
                                                        </PopoverAnchor>
                                                        {isMktOpen && (
                                                            <PopoverContent
                                                                className="p-0 bg-white"
                                                                align="start"
                                                                style={{ width: mktPopoverWidth }}
                                                                onOpenAutoFocus={(e) => e.preventDefault()}
                                                            >
                                                                <div className="max-h-[300px] overflow-y-auto p-1">
                                                                    {filteredMktEmployees.length > 0 ? (
                                                                        filteredMktEmployees.map((e, idx) => {
                                                                            const empName = e['Họ_và_tên'] || e['Họ và tên'] || `MKT ${idx}`;
                                                                            const isSelected = selectedMkt === empName;
                                                                            const isSpecial = e.isSpecial || false;
                                                                            const isLegacy = e.isLegacy || false;
                                                                            if (!isEdit && !isSpecial) return null;
                                                                            return (
                                                                                <div
                                                                                    key={`mkt-row-${empName}-${idx}`}
                                                                                    className={cn(
                                                                                        "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100",
                                                                                        isSelected && "bg-gray-100 font-medium",
                                                                                        isSpecial && "bg-blue-50 font-semibold"
                                                                                    )}
                                                                                    onClick={() => {
                                                                                        setSelectedMkt(empName);
                                                                                        setMktSearch(empName);
                                                                                        setIsMktOpen(false);
                                                                                    }}
                                                                                >
                                                                                    <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                    <span className="truncate">{empName}</span>
                                                                                    {isSpecial && <span className="ml-2 text-xs text-blue-600 shrink-0">(Không cần page)</span>}
                                                                                    {isLegacy && <span className="ml-2 text-xs text-amber-600 shrink-0">(Giá trị đơn cũ)</span>}
                                                                                </div>
                                                                            );
                                                                        }).filter(Boolean)
                                                                    ) : (
                                                                        <div className="p-2 text-sm text-gray-500">
                                                                            {isEdit ? "Không tìm thấy. Có thể gõ tên và lưu." : "Không tìm thấy kết quả."}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </PopoverContent>
                                                        )}
                                                    </div>
                                                </Popover>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label htmlFor="ten-page">
                                                        Tên page
                                                        {(() => {
                                                            const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                            const isSpecialMkt = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                            return !isSpecialMkt ? '*' : '';
                                                        })()}
                                                    </Label>
                                                    <button onClick={loadPageData} disabled={loadingPages} className="text-[10px] text-blue-600 flex items-center gap-1 hover:underline">
                                                        <RefreshCcw className={cn("w-3 h-3", loadingPages && "animate-spin")} /> Làm mới
                                                    </button>
                                                </div>
                                                <Popover open={isPageOpen} onOpenChange={setIsPageOpen}>
                                                    <div className="relative" ref={pageRef}>
                                                        <PopoverAnchor asChild>
                                                            <div className="relative">
                                                                <Input
                                                                    placeholder="Chọn page..."
                                                                    value={selectedPage}
                                                                    onChange={(e) => {
                                                                        try {
                                                                            const inputValue = e.target.value.trim();
                                                                            setSelectedPage(inputValue);
                                                                            setIsPageOpen(true);

                                                                            // Tự động điền MKT khi nhập/dán tên page đúng
                                                                            if (inputValue && Array.isArray(pages) && pages.length > 0) {
                                                                                // Tìm page có page_name khớp chính xác (case-insensitive)
                                                                                const matchedPage = pages.find(p => {
                                                                                    if (!p || typeof p !== 'object') return false;
                                                                                    const pageName = (p.page_name || "").trim();
                                                                                    return pageName.toLowerCase() === inputValue.toLowerCase();
                                                                                });

                                                                                if (matchedPage) {
                                                                                    const mktStaff = matchedPage.mkt_staff || matchedPage.Mkt_staff || "";
                                                                                    if (mktStaff) {
                                                                                        console.log("✅ Auto-fill MKT từ page:", mktStaff);
                                                                                        // Chỉ tự động điền nếu chưa chọn tùy chọn đặc biệt
                                                                                        const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                                                        const currentIsSpecial = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                                                        if (!currentIsSpecial) {
                                                                                            setSelectedMkt(String(mktStaff).trim());
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    // Nếu không tìm thấy page, xóa MKT (trừ khi đã chọn tùy chọn đặc biệt)
                                                                                    const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                                                    const currentIsSpecial = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                                                    if (!currentIsSpecial) {
                                                                                        setSelectedMkt("");
                                                                                    }
                                                                                }
                                                                            } else if (!inputValue) {
                                                                                // Nếu xóa page, xóa MKT (trừ khi đã chọn tùy chọn đặc biệt)
                                                                                const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                                                const currentIsSpecial = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                                                if (!currentIsSpecial) {
                                                                                    setSelectedMkt("");
                                                                                }
                                                                            }
                                                                        } catch (error) {
                                                                            console.error("❌ Error in page onChange:", error);
                                                                            // Không block user input nếu có lỗi
                                                                        }
                                                                    }}
                                                                    onFocus={() => {
                                                                        if (pageRef.current) setPagePopoverWidth(pageRef.current.offsetWidth);
                                                                    }}
                                                                    onClick={() => {
                                                                        if (pageRef.current) setPagePopoverWidth(pageRef.current.offsetWidth);
                                                                        setIsPageOpen(true);
                                                                    }}
                                                                    disabled={loadingPages}
                                                                    className="pr-8 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                                                                />
                                                                <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
                                                            </div>
                                                        </PopoverAnchor>
                                                        {isPageOpen && (
                                                            <PopoverContent
                                                                className="p-0 bg-white"
                                                                align="start"
                                                                style={{ width: pagePopoverWidth }}
                                                                onOpenAutoFocus={(e) => e.preventDefault()}
                                                            >
                                                                <div className="max-h-[300px] overflow-y-auto p-1">
                                                                    {filteredPages.length === 0 ? (
                                                                        <div className="p-2 text-sm text-gray-500">Không tìm thấy kết quả.</div>
                                                                    ) : (
                                                                        filteredPages.map((p, idx) => {
                                                                            const pageName = p.page_name || `Page ${idx}`;
                                                                            const isSelected = selectedPage === pageName;
                                                                            return (
                                                                                <div key={idx} className={cn("flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100", isSelected && "bg-gray-100 font-medium")} onClick={() => {
                                                                                    console.log("DEBUG: Selecting page:", p);
                                                                                    setSelectedPage(pageName);
                                                                                    // Tự động điền MKT từ page (trừ khi đã chọn tùy chọn đặc biệt)
                                                                                    const specialMktOptions = ['MKT chưa nhập page', 'MKT LumiGlobal_HN', 'MKT LumiGlobal_HCM'];
                                                                                    const currentIsSpecial = selectedMkt && specialMktOptions.includes(selectedMkt);
                                                                                    if (!currentIsSpecial) {
                                                                                        const mktStaff = p.mkt_staff || p.Mkt_staff || "";
                                                                                        console.log("DEBUG: Setting MKT Staff to:", mktStaff);
                                                                                        setSelectedMkt(mktStaff.toString().trim());
                                                                                    }
                                                                                    setIsPageOpen(false);
                                                                                    setPageSearch("");
                                                                                }}>
                                                                                    <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                    <span className="truncate">{pageName}</span>
                                                                                </div>
                                                                            );
                                                                        })
                                                                    )}
                                                                </div>
                                                            </PopoverContent>
                                                        )}
                                                    </div>
                                                </Popover>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="phone">Phone*</Label>
                                                <Input
                                                    id="phone"
                                                    value={formData.phone}
                                                    onChange={handleInputChange}
                                                    placeholder="Số điện thoại..."
                                                    className={cn(
                                                        submitAttempted && !String(formData.phone || '').trim() && 'border-red-500 ring-1 ring-red-300'
                                                    )}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="ten-kh">Tên*</Label>
                                                <Input
                                                    id="ten-kh"
                                                    value={formData["ten-kh"]}
                                                    onChange={handleInputChange}
                                                    placeholder="Họ và tên khách hàng..."
                                                    className={cn(
                                                        submitAttempted && !String(formData["ten-kh"] || '').trim() && 'border-red-500 ring-1 ring-red-300'
                                                    )}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="add">Add*</Label>
                                                <Input id="add" value={formData.add} onChange={handleInputChange} placeholder="Địa chỉ chi tiết..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="country" className={cn(submitAttempted && !String(formData.country || '').trim() && 'text-red-600 font-bold')}>
                                                    Khu vực*
                                                </Label>
                                                <select
                                                    id="country"
                                                    value={formData.country}
                                                    onChange={handleInputChange}
                                                    required
                                                    className={cn(
                                                        "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]",
                                                        submitAttempted && !String(formData.country || '').trim() && 'border-red-500 ring-1 ring-red-300'
                                                    )}
                                                >
                                                    <option value="">Chọn khu vực...</option>
                                                    {AREA_LIST.map(a => <option key={a} value={a}>{a}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="space-y-2 flex-1">
                                                    <Label htmlFor="city">City</Label>
                                                    <Input id="city" value={formData.city} onChange={handleInputChange} placeholder="Thành phố..." />
                                                </div>
                                                <div className="space-y-2 flex-1">
                                                    <Label htmlFor="state">State</Label>
                                                    <Input id="state" value={formData.state} onChange={handleInputChange} placeholder="Tỉnh/Bang..." />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="zipcode">Zipcode</Label>
                                                <Input id="zipcode" value={formData.zipcode} onChange={handleInputChange} placeholder="Mã bưu điện..." />
                                            </div>

                                            <div className="col-span-1 md:col-span-2 lg:col-span-3">
                                                <Card className="border-yellow-200 bg-yellow-50/30">
                                                    <CardHeader className="pb-2">
                                                        <CardTitle className="text-sm font-bold text-yellow-700 flex items-center gap-2">
                                                            <AlertCircle className="w-4 h-4" />
                                                            Kiểm tra hệ thống
                                                        </CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="text-xs space-y-2 text-yellow-800">
                                                        {(duplicateOrderCodes.length > 0 || blacklistStatus === "warning") && (
                                                            <div
                                                                role="alert"
                                                                className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-3 text-red-900 space-y-3"
                                                            >
                                                                <div>
                                                                    <div className="font-bold text-sm leading-snug">
                                                                        Cảnh báo cho Nhân viên Sale
                                                                    </div>
                                                                    <p className="mt-1.5 text-sm leading-snug">
                                                                        <span className="text-red-800">NV Sale phụ trách đơn:</span>{" "}
                                                                        <span className="font-semibold text-red-950">
                                                                            {selectedSale?.trim() ? selectedSale.trim() : "— chưa chọn —"}
                                                                        </span>
                                                                    </p>
                                                                </div>

                                                                <div className="text-xs leading-relaxed space-y-1.5 border-t border-red-200/80 pt-3">
                                                                    {duplicateOrderCodes.length > 0 && (
                                                                        <p>
                                                                            Trùng SĐT hoặc tên hoặc địa chỉ — mã đơn:{" "}
                                                                            <span className="font-semibold">{duplicateOrderCodes.join(", ")}</span>
                                                                        </p>
                                                                    )}
                                                                    {blacklistStatus === "warning" && (
                                                                        <p className="font-semibold">
                                                                            Danh sách hạn chế: {blacklistReason || "có khớp"}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div>
                                                            • Cảnh báo danh sách hạn chế:
                                                            {blacklistStatus === "warning" ? (
                                                                <>
                                                                    <span className="font-bold text-red-600 ml-1">
                                                                        CẢNH BÁO ({blacklistReason})
                                                                    </span>
                                                                    {blacklistInfo && (
                                                                        <div className="mt-1 pl-4 text-xs text-red-800 bg-red-50 p-1 rounded border border-red-200">
                                                                            <div><strong>Khách trong sổ đen:</strong></div>
                                                                            <div>- Tên: {blacklistInfo.name}</div>
                                                                            <div>- SĐT: {blacklistInfo.phone}</div>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            ) : blacklistStatus === "clean" ? (
                                                                <span className="font-semibold text-green-600 ml-1">Sạch</span>
                                                            ) : (
                                                                <span className="text-gray-400 ml-1">...</span>
                                                            )}
                                                        </div>
                                                        <p>
                                                            • Trùng đơn (SĐT <span className="font-medium">hoặc</span> tên{" "}
                                                            <span className="font-medium">hoặc</span> địa chỉ):{" "}
                                                            {!duplicateCheckUsable ? (
                                                                <span className="text-gray-500 font-normal">
                                                                    Nhập SĐT (≥9 số), hoặc tên (≥2 ký tự), hoặc địa chỉ (≥10 ký tự) để kiểm tra
                                                                </span>
                                                            ) : duplicateOrderCodes.length > 0 ? (
                                                                <span className="font-semibold text-amber-700">
                                                                    Có đơn trùng — mã: {duplicateOrderCodes.join(", ")}
                                                                </span>
                                                            ) : (
                                                                <span className="font-semibold text-green-600">Không phát hiện</span>
                                                            )}
                                                        </p>

                                                        <div className="pt-2 border-t mt-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowBlacklist(!showBlacklist)}
                                                                className="text-blue-600 hover:underline flex items-center gap-1"
                                                            >
                                                                {showBlacklist ? "Thu gọn danh sách hạn chế" : "Xem danh sách hạn chế"}
                                                                <ChevronDown className={`w-3 h-3 transition-transform ${showBlacklist ? "rotate-180" : ""}`} />
                                                            </button>

                                                            {showBlacklist && (
                                                                <div className="mt-2 max-h-40 overflow-y-auto border rounded bg-white p-2">
                                                                    {blacklistItems.length === 0 ? (
                                                                        <p className="text-gray-400 italic">Danh sách trống</p>
                                                                    ) : (
                                                                        <ul className="space-y-1">
                                                                            {blacklistItems.map((item) => (
                                                                                <li key={item.id} className="border-b last:border-0 pb-1">
                                                                                    <div className="font-medium">
                                                                                        {item.phone} - {item.name}
                                                                                    </div>
                                                                                    <div className="text-[10px] text-gray-500">{item.reason}</div>
                                                                                </li>
                                                                            ))}
                                                                        </ul>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </div>

                                            {/* Tracking Code & Date moved/added here for logical flow? Or separate tab? Keeping layout structure. */}
                                            <div className="space-y-2 pt-4 border-t">
                                                <Label htmlFor="tracking_code">Mã Tracking</Label>
                                                <Input
                                                    id="tracking_code"
                                                    value={formData.tracking_code || ""}
                                                    placeholder="Chưa có mã tracking"
                                                    readOnly
                                                    className="bg-gray-100 cursor-not-allowed"
                                                />
                                            </div>
                                            {/* Tracking Code end of card content */}
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Tab: Thông tin đơn */}
                                {activeTab === "thong-tin-don" && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        <Card className="lg:col-span-2">
                                            <CardHeader className="pb-3 border-b mb-4">
                                                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                                    <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                                    Chi tiết mặt hàng
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                {/* Row 1: Main Product & Order Code */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="productMain">Mặt hàng (Chính)</Label>
                                                        <Popover
                                                            open={isProductOpen}
                                                            onOpenChange={(open) => {
                                                                setIsProductOpen(open);
                                                                // Mở lại luôn hiển thị đủ gợi ý (không giữ bộ lọc theo mặt hàng đã chọn).
                                                                if (open) setProductSearch("");
                                                            }}
                                                        >
                                                            <div className="relative" ref={productRef}>
                                                                <PopoverAnchor asChild>
                                                                    <div className="relative">
                                                                        <Input
                                                                            placeholder="Chọn mặt hàng..."
                                                                            value={formData.productMain || ""}
                                                                            readOnly
                                                                            onFocus={() => {
                                                                                if (productRef.current) setProductPopoverWidth(productRef.current.offsetWidth);
                                                                            }}
                                                                            onClick={() => {
                                                                                if (productRef.current) setProductPopoverWidth(productRef.current.offsetWidth);
                                                                                setProductSearch("");
                                                                                setIsProductOpen(true);
                                                                            }}
                                                                            className="pr-8 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] bg-white cursor-pointer"
                                                                        />
                                                                        <ChevronDown
                                                                            className="absolute right-3 top-3 h-4 w-4 opacity-50 cursor-pointer"
                                                                            aria-hidden
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                if (productRef.current) setProductPopoverWidth(productRef.current.offsetWidth);
                                                                                setProductSearch("");
                                                                                setIsProductOpen((v) => !v);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </PopoverAnchor>
                                                                {isProductOpen && (
                                                                    <PopoverContent
                                                                        className="p-0 bg-white"
                                                                        align="start"
                                                                        style={{ width: productPopoverWidth }}
                                                                        onOpenAutoFocus={(e) => e.preventDefault()}
                                                                    >
                                                                        <div className="max-h-[300px] overflow-y-auto p-1">
                                                                            {filteredProducts.length > 0 ? (
                                                                                filteredProducts.map((p, idx) => (
                                                                                    <div
                                                                                        key={idx}
                                                                                        className="flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100"
                                                                                        onClick={() => {
                                                                                            setFormData(prev => ({ ...prev, productMain: p }));
                                                                                            setIsProductOpen(false);
                                                                                        }}
                                                                                    >
                                                                                        <Check className={cn("mr-2 h-4 w-4", formData.productMain === p ? "opacity-100" : "opacity-0")} />
                                                                                        <span className="truncate">{p}</span>
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="p-2 text-sm text-gray-500">
                                                                                    Không có sản phẩm nào.
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </PopoverContent>
                                                                )}
                                                            </div>
                                                        </Popover>
                                                    </div>
                                                    {/* Hidden - Mã đơn hàng auto-generated 
                                                    <div className="space-y-2">
                                                        <Label htmlFor="ma-don">Mã đơn hàng (Tự sinh)</Label>
                                                        <Input id="ma-don" value={formData["ma-don"]} onChange={handleInputChange} placeholder="Để trống tự sinh..." disabled={isEdit} />
                                                    </div>
                                                    */}
                                                </div>

                                                {/* Row 2: Item 1 */}
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-md">
                                                    <div className="md:col-span-3 space-y-2">
                                                        <Label htmlFor="mathang1">Tên mặt hàng 1</Label>
                                                        <Input id="mathang1" value={formData.mathang1} onChange={handleInputChange} placeholder="Tự động..." />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="sl1">Số lượng 1</Label>
                                                        <Input id="sl1" type="number" value={formData.sl1} onChange={handleInputChange} />
                                                    </div>
                                                </div>

                                                {/* Row 3: Item 2 */}
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-md">
                                                    <div className="md:col-span-3 space-y-2">
                                                        <Label htmlFor="mathang2">Tên mặt hàng 2 (Auto)</Label>
                                                        <Input id="mathang2" value={formData.mathang2} onChange={handleInputChange} placeholder="Tự động..." />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="sl2">Số lượng 2</Label>
                                                        <Input id="sl2" type="number" value={formData.sl2 || ""} onChange={handleInputChange} />
                                                    </div>
                                                </div>

                                                {/* Row 4: Gift */}
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t pt-4">
                                                    <div className="md:col-span-3 space-y-2">
                                                        <Label htmlFor="quatang">Quà tặng</Label>
                                                        <select id="quatang" value={formData.quatang} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                                            <option value="">Không có quà...</option>
                                                            {GIFT_LIST.map(g => <option key={g} value={g}>{g}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="slq">Số lượng quà</Label>
                                                        <Input id="slq" type="number" value={formData.slq || ""} onChange={handleInputChange} />
                                                    </div>
                                                </div>

                                                {/* FINANCIAL SECTION */}
                                                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="sale_price">Giá bán (Ngoại tệ)</Label>
                                                        <Input id="sale_price" type="number" value={formData.sale_price || ""} onChange={handleInputChange} placeholder="0" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className={cn(submitAttempted && !String(formData.paymentType || '').trim() && 'text-red-600 font-bold')}>
                                                            Loại tiền*
                                                        </Label>
                                                        <select
                                                            id="paymentType"
                                                            value={formData.paymentType}
                                                            onChange={handleInputChange}
                                                            className={cn(
                                                                "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]",
                                                                submitAttempted && !String(formData.paymentType || '').trim() && 'border-red-500 ring-1 ring-red-300'
                                                            )}
                                                        >
                                                            <option value="">Chọn loại tiền...</option>
                                                            {CURRENCY_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="exchange_rate">Tỷ giá</Label>
                                                        <Input
                                                            id="exchange_rate"
                                                            type="number"
                                                            value={formData.exchange_rate}
                                                            readOnly
                                                            className="bg-gray-100 cursor-not-allowed"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-red-600 font-bold">Tổng tiền (VNĐ)</Label>
                                                        <div className="px-3 py-2 bg-gray-100 border rounded-md font-bold text-lg">
                                                            {(parseFloat(formData["tong-tien"]) || 0).toLocaleString()} đ
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label
                                                            htmlFor="hinh-thuc"
                                                            className={cn(submitAttempted && !String(formData["hinh-thuc"] || "").trim() && 'text-red-600 font-bold')}
                                                        >
                                                            Hình thức thanh toán*
                                                        </Label>
                                                        <select
                                                            id="hinh-thuc"
                                                            value={formData["hinh-thuc"]}
                                                            onChange={handleInputChange}
                                                            className={cn(
                                                                "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]",
                                                                submitAttempted && !String(formData["hinh-thuc"] || "").trim() && 'border-red-500 ring-1 ring-red-300'
                                                            )}
                                                        >
                                                            <option value="">Chọn hình thức...</option>
                                                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <div className="space-y-6">
                                            <Card>
                                                <CardHeader className="pb-2">
                                                    <CardTitle className="text-sm font-bold">Ghi chú & Phản hồi</CardTitle>
                                                </CardHeader>
                                                <CardContent className="space-y-4">
                                                    <div className="space-y-1">
                                                        <Label htmlFor="note_sale" className="text-xs">Ghi chú</Label>
                                                        <Textarea id="note_sale" value={formData["note_sale"]} onChange={handleInputChange} placeholder="Nhập ghi chú..." className="h-20" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="ph-tc" className="text-xs text-green-600">Phản hồi tích cực</Label>
                                                        <Textarea id="ph-tc" value={formData["ph-tc"]} onChange={handleInputChange} placeholder="..." className="h-16" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label htmlFor="ph-tn" className="text-xs text-red-600">Phản hồi tiêu cực</Label>
                                                        <Textarea id="ph-tn" value={formData["ph-tn"]} onChange={handleInputChange} placeholder="..." className="h-16" />
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    </div>
                                )}

                                {/* Tab: Thông tin nhân sự */}
                                {activeTab === "nhan-su" && (
                                    <Card>
                                        <CardHeader className="pb-3 border-b mb-4">
                                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                                <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                                Xử lý bởi nhân viên
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-8">
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="space-y-2">
                                                    <Label>Nhân viên Sale</Label>
                                                    <Popover open={isSaleOpen} onOpenChange={setIsSaleOpen}>
                                                        <div className="relative" ref={containerRef}>
                                                            <PopoverAnchor asChild>
                                                                <div className="relative">
                                                                    <Input
                                                                        placeholder="Nhập hoặc chọn nhân viên..."
                                                                        value={selectedSale}
                                                                        onChange={(e) => {
                                                                            setSelectedSale(e.target.value);
                                                                            setSaleSearch(e.target.value);
                                                                            setIsSaleOpen(true);
                                                                        }}
                                                                        onFocus={() => {
                                                                            if (containerRef.current) {
                                                                                setPopoverWidth(containerRef.current.offsetWidth);
                                                                            }
                                                                        }}
                                                                        onClick={() => {
                                                                            if (containerRef.current) {
                                                                                setPopoverWidth(containerRef.current.offsetWidth);
                                                                            }
                                                                            setIsSaleOpen(true);
                                                                        }}
                                                                        className="pr-8 w-full h-10 px-4 font-normal border-gray-300 focus-visible:ring-[#2d7c2d] focus-visible:ring-offset-0"
                                                                    />
                                                                    <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
                                                                </div>
                                                            </PopoverAnchor>
                                                            {isSaleOpen && (
                                                                <PopoverContent
                                                                    className="p-0 bg-white"
                                                                    align="start"
                                                                    style={{ width: popoverWidth }}
                                                                    onOpenAutoFocus={(e) => e.preventDefault()}
                                                                >
                                                                    <div className="flex flex-col">
                                                                        <div className="max-h-[300px] overflow-y-auto p-1">
                                                                            {filteredSaleEmployees.length === 0 ? (
                                                                                <div className="p-2 text-sm text-gray-500">Không tìm thấy kết quả. Nhấn Enter để dùng tên này.</div>
                                                                            ) : (
                                                                                filteredSaleEmployees.map((e, idx) => {
                                                                                    const empName = e['Họ_và_tên'] || e['Họ và tên'] || `NV ${idx}`;
                                                                                    const isSelected = selectedSale === empName;
                                                                                    return (
                                                                                        <div
                                                                                            key={idx}
                                                                                            className={cn(
                                                                                                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100",
                                                                                                isSelected && "bg-gray-100 font-medium"
                                                                                            )}
                                                                                            onClick={() => {
                                                                                                setSelectedSale(empName);
                                                                                                setSaleSearch(empName);
                                                                                                setIsSaleOpen(false);
                                                                                            }}
                                                                                        >
                                                                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                            <span className="truncate">{empName}</span>
                                                                                        </div>
                                                                                    );
                                                                                })
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </PopoverContent>
                                                            )}
                                                        </div>
                                                    </Popover>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Chi nhánh</Label>
                                                    <Input
                                                        id="team"
                                                        value={formData.team || ""}
                                                        onChange={handleInputChange}
                                                        placeholder="Tự động theo nhân viên sale..."
                                                        readOnly
                                                        className="bg-gray-100 cursor-not-allowed"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Phân loại khách hàng</Label>
                                                    <select id="customerType" value={formData.customerType} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                                        <option value="">Chọn phân loại...</option>
                                                        <option value="moi">Khách mới</option>
                                                        <option value="cu">Khách cũ</option>
                                                        <option value="vip">VIP</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Trạng thái đơn</Label>
                                                    <div className="flex gap-2">
                                                        <Button type="button" variant={trangThaiDon === "hop-le" ? "default" : "outline"} className={cn("flex-1", trangThaiDon === "hop-le" && "bg-green-600 hover:bg-green-700")} onClick={() => setTrangThaiDon("hop-le")}>
                                                            Đơn hợp lệ
                                                        </Button>
                                                        <Button type="button" variant={trangThaiDon === "xem-xet" ? "default" : "outline"} className={cn("flex-1", trangThaiDon === "xem-xet" && "bg-yellow-600 hover:bg-yellow-700")} onClick={() => setTrangThaiDon("xem-xet")}>
                                                            Đơn xem xét
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="dien-giai">Diễn giải</Label>
                                                <Textarea id="dien-giai" value={formData["dien-giai"]} onChange={handleInputChange} placeholder="Nhập diễn giải chi tiết về đơn hàng hoặc khách hàng..." className="h-24" />
                                            </div>

                                            <div className="space-y-4 border-t pt-6">
                                                <Label className="text-base font-bold text-[#2d7c2d]">Lưu ý</Label>
                                                <div className="text-sm text-gray-600">
                                                    Vui lòng kiểm tra kỹ thông tin trước khi lưu. Đơn hàng sẽ được chuyển sang trạng thái "Chờ xử lý".
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </>
                    )}

                </div >
            </div >
        </div >
    );
}
