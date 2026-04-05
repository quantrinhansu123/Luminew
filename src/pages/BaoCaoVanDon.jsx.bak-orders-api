// Columns to always hide
const HIDDEN_COLUMNS = ["Thuê TK", "Thời gian cutoff", "Tiền Hàng"];

import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Bar, Doughnut } from 'react-chartjs-2';

import { Download, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchOrdersFromAPI, convertDateToAPIFormat } from '../services/ordersApiService';
import MultiSelect from '../components/MultiSelect';
import * as rbacService from '../services/rbacService';

const ORDERS_API_BASE_URL = 'https://lumidataapi.vercel.app';
import { supabase } from '../supabase/config';
import './BaoCaoVanDon.css';

// Register ChartJS
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    ChartDataLabels
);

// Mapping Helper to map API order data to report format
const mapOrderToReportFormat = (order) => {
    // Map từ API order format (từ /orders endpoint) sang format mà component đang dùng
    return {
        ...order,
        // Date fields - ưu tiên order_date, sau đó ngaytao
        "Ngày lên đơn": order["Ngày lên đơn"] || order["Thời gian lên đơn"] || order.order_date || order.ngaytao || order.date || order.created_at,
        // Money fields - ưu tiên total_amount_vnd, sau đó tongtien
        "Tổng tiền VNĐ": order["Tổng tiền VNĐ"] || order["Tổng_tiền_VNĐ"] || order.total_amount_vnd || order.tongtien || order.revenue_vnd || order.total_amount || order.amount || 0,
        // Staff fields - ưu tiên delivery_staff, sau đó nhanvien_sale
        "NV Vận đơn": order["NV Vận đơn"] || order["NV_Vận_đơn"] || order.delivery_staff || order.nhanvien_sale || order.staff || order.staff_name || order.nhan_vien || '',
        // Shipping fields - có thể không có trong API này
        "Đơn vị vận chuyển": order["Đơn vị vận chuyển"] || order["Đơn_vị_vận_chuyển"] || order.shipping_unit || order.carrier || order.don_vi_van_chuyen || '',
        // Status fields - map trực tiếp từ API
        "Trạng thái giao hàng NB": order["Trạng thái giao hàng"] || order["Trạng thái giao hàng NB"] || order.delivery_status || order.status || '',
        "Trạng thái thu tiền": order["Trạng thái thu tiền"] || order.payment_status || '',
        "Kết quả check": order["Kết quả check"] || order.check_result || '',
        // Location/Market fields - map từ country
        "khu vực": order["Khu vực"] || order["khu vực"] || order.country || order.market || order.thi_truong || '',
        // Product fields - map từ product
        "Mặt hàng": order["Mặt hàng"] || order.product || order.san_pham || '',
        // Customer fields - có thể không có trong API này
        "Name*": order["Name*"] || order.name || order.customer_name || order.ten_khach_hang || '',
        "Phone*": order["Phone*"] || order.phone || order.phone_number || order.sdt || '',
        // Order code - map từ id
        "Mã đơn hàng": order["Mã đơn hàng"] || order.order_code || order.code || order.id || '',
        // Tracking - map từ tracking_code
        "Mã Tracking": order["Mã Tracking"] || order.tracking_code || order.tracking || '',
        // Chi nhánh - map từ team (ưu tiên order.team từ API)
        "Chi nhánh": order.team || order["Chi nhánh"] || order["Team"] || '',
        // Shift - map từ shift
        "Ca": order["Ca"] || order.shift || order.ca || '',
        // Marketing staff - map từ nhanvien_maketing
        "NV Marketing": order["NV Marketing"] || order.nhanvien_maketing || order.nhan_vien_marketing || '',
        // Notes - có thể không có trong API này
        "Ghi chú": order["Ghi chú"] || order.note || order.notes || '',
        "Lý do": order["Lý do"] || order.reason || order.ly_do || ''
    };
};

// --- UTILS ---
const formatDateForInput = (date) => {
    if (!date) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const parseDateString = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    const cleanedDateString = dateString.trim().replace(/[^\d\/\-\s]/g, '');
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanedDateString)) {
        const d = new Date(cleanedDateString);
        if (!isNaN(d.getTime())) return d;
    }
    const parts = cleanedDateString.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
    if (parts) {
        const month = parseInt(parts[2], 10);
        const day = parseInt(parts[1], 10);
        const year = parseInt(parts[3], 10);
        if (year > 1000 && month > 0 && month <= 12 && day > 0 && day <= 31) {
            const d = new Date(Date.UTC(year, month - 1, day));
            return d;
        }
    }
    return null;
};

const formatCurrency = (value) => {
    const n = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    if (isNaN(n)) return '0 ₫';
    return n.toLocaleString('vi-VN') + ' ₫';
};

const createEmptyStats = () => ({
    "Đã Thanh Toán (có bill)": { count: 0, amount: 0 },
    "Bill 1 phần": { count: 0 },
    "Tổng đơn lên nội bộ": { count: 0 },
    "Tổng đơn đủ đkien đẩy vh": { count: 0 },
    "Tổng đơn lên vận hành": { count: 0 },
    "Giao Thành Công": { count: 0 },
    "Đang Giao": { count: 0 },
    "Chưa Giao": { count: 0 },
    "Hoàn": { count: 0 },
    "Hủy": { count: 0 }, // New status
    "chờ check": { count: 0 },
    "Trống trạng thái": { count: 0 }
});


export default function BaoCaoVanDon() {
    console.log("BaoCaoVanDon rendering..."); // Debug log

    // --- URL PARAMS ---
    const [searchParams, setSearchParams] = useSearchParams();
    
    // Đọc dates từ URL nếu có
    const urlStartDate = searchParams.get('from_date');
    const urlEndDate = searchParams.get('to_date');

    // --- STATE ---
    const [activeTab, setActiveTab] = useState('VanDonReport');
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0, message: '' });
    const [rawData, setRawData] = useState([]);
    const [error, setError] = useState(null);
    const [showCharts, setShowCharts] = useState(false); // Mặc định ẩn biểu đồ
    const [selectedPersonnelNames, setSelectedPersonnelNames] = useState([]); // Selected personnel từ tài khoản đăng nhập
    const [userBranch, setUserBranch] = useState(null); // Branch của user hiện tại từ bảng users
    
    // Kiểm tra xem user có phải Admin không
    const userRole = localStorage.getItem('userRole') || '';
    const isAdmin = userRole.toLowerCase() === 'admin' || 
                    userRole.toLowerCase() === 'super_admin' || 
                    userRole.toLowerCase() === 'administrator' ||
                    userRole === 'ADMIN' || 
                    userRole === 'SUPER_ADMIN' || 
                    userRole === 'ADMINISTRATOR';

    // --- REPORT FILTERS ---
    // Tính toán 10 ngày gần nhất làm default
    const getDefaultDates = () => {
        if (urlStartDate && urlEndDate) {
            return { startDate: urlStartDate, endDate: urlEndDate };
        }
        // Default: 10 ngày gần nhất
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 9); // 10 ngày (bao gồm hôm nay)
        return {
            startDate: formatDateForInput(start),
            endDate: formatDateForInput(end)
        };
    };
    
    const [reportFilters, setReportFilters] = useState(() => {
        const defaultDates = getDefaultDates();
        return {
            dateRange: urlStartDate && urlEndDate ? '' : 'last10Days', // Default to last 10 days
            startDate: defaultDates.startDate,
            endDate: defaultDates.endDate,
            product: [], // Array of selected products
            market: [], // Array of selected markets
            staff: [], // Array of selected staff names
            team: [] // Array of selected teams (Chi nhánh)
        };
    });
    const [showStaffDropdown, setShowStaffDropdown] = useState(false);
    const staffDropdownRef = useRef(null);
    const staffButtonRef = useRef(null);
    const [staffDropdownPosition, setStaffDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    
    // Tính toán vị trí dropdown khi mở (giống MultiSelect)
    useEffect(() => {
        if (showStaffDropdown && staffButtonRef.current) {
            const rect = staffButtonRef.current.getBoundingClientRect();
            setStaffDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: Math.max(rect.width, 200) // Tối thiểu 200px
            });
        }
    }, [showStaffDropdown]);
    
    // Đóng dropdown khi click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target) && 
                staffButtonRef.current && !staffButtonRef.current.contains(event.target)) {
                setShowStaffDropdown(false);
            }
        };
        if (showStaffDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showStaffDropdown]);
    
    // Không tự động cập nhật URL khi dates thay đổi
    // URL chỉ được cập nhật khi user click "Tìm kiếm" hoặc thay đổi từ URL trực tiếp

    // Không auto-fetch khi URL có dates - user phải click "Tìm kiếm" để fetch
    // Chỉ cập nhật dates vào state từ URL
    useEffect(() => {
        if (urlStartDate && urlEndDate) {
            // Chỉ cập nhật dates vào state nếu chưa có hoặc khác với URL
            if (reportFilters.startDate !== urlStartDate || reportFilters.endDate !== urlEndDate) {
                console.log(`🔗 URL has dates, updating state: from_date=${urlStartDate}, to_date=${urlEndDate}`);
                setReportFilters(prev => ({
                    ...prev,
                    startDate: urlStartDate,
                    endDate: urlEndDate
                }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlStartDate, urlEndDate]);


    // --- DETAILED FILTERS ---
    const [detailFilters, setDetailFilters] = useState({
        checkResult: '',
        deliveryStatus: '',
        paymentStatus: '',
        staff: '',
        search: ''
    });

    // --- DERIVED LISTS ---
    // Extract unique values từ mapped data (đã được map từ API format)
    const uniqueProducts = useMemo(() => [...new Set(rawData.map(r => r["Mặt hàng"]).filter(Boolean))].sort(), [rawData]);
    const uniqueMarkets = useMemo(() => [...new Set(rawData.map(r => r["khu vực"] || r["Khu vực"]).filter(Boolean))].sort(), [rawData]);
    // uniqueStaff: Chỉ lấy từ selectedPersonnelNames (giới hạn dropdown)
    // Nếu có selectedPersonnelNames, chỉ hiển thị những người trong đó
    // Nếu không có selectedPersonnelNames, lấy từ rawData (fallback)
    const uniqueStaff = useMemo(() => {
        if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
            // Chỉ hiển thị staff trong selectedPersonnelNames
            return [...new Set(selectedPersonnelNames)].sort();
        }
        // Fallback: lấy từ rawData nếu không có selectedPersonnelNames
        return [...new Set(rawData.map(r => r["NV Vận đơn"] || r["NV_Vận_đơn"]).filter(Boolean))].sort();
    }, [rawData, selectedPersonnelNames]);
    // uniqueTeams: Chỉ lấy từ userBranch (giới hạn dropdown)
    // Nếu có userBranch, chỉ hiển thị branch đó
    // Nếu không có userBranch hoặc là admin, lấy từ rawData (fallback)
    const uniqueTeams = useMemo(() => {
        if (isAdmin) {
            // Admin: hiển thị tất cả teams từ rawData
            return [...new Set(rawData.map(r => r["Chi nhánh"]).filter(Boolean))].sort();
        }
        if (userBranch) {
            // Non-admin: chỉ hiển thị branch của user
            return [userBranch].filter(Boolean);
        }
        // Fallback: lấy từ rawData nếu không có userBranch
        return [...new Set(rawData.map(r => r["Chi nhánh"]).filter(Boolean))].sort();
    }, [rawData, userBranch, isAdmin]);

    const uniqueCheckResults = useMemo(() => [...new Set(rawData.map(r => r["Kết quả check"]).filter(Boolean))].sort(), [rawData]);
    const uniqueDeliveryStatuses = useMemo(() => [...new Set(rawData.map(r => r["Trạng thái giao hàng NB"]).filter(Boolean))].sort(), [rawData]);
    const uniquePaymentStatuses = useMemo(() => [...new Set(rawData.map(r => r["Trạng thái thu tiền"]).filter(Boolean))].sort(), [rawData]);

    // --- LOAD SELECTED PERSONNEL ---
    // Load selected_personnel từ tài khoản đăng nhập
    useEffect(() => {
        const loadSelectedPersonnel = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (!userEmail) {
                    console.log('⚠️ [BaoCaoVanDon] Không tìm thấy userEmail trong localStorage');
                    setSelectedPersonnelNames([]);
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                console.log('📧 [BaoCaoVanDon] Loading selected personnel for:', userEmailLower);

                // Get selected personnel (tên nhân viên)
                const personnelMap = await rbacService.getSelectedPersonnel([userEmailLower]);
                const personnelNames = personnelMap[userEmailLower] || [];

                console.log('📋 [BaoCaoVanDon] Personnel map from DB:', personnelMap);
                console.log('👥 [BaoCaoVanDon] Selected personnel names:', personnelNames);

                // Lọc chỉ lấy tên hợp lệ (không phải email)
                const validNames = personnelNames.filter(name => {
                    const nameStr = String(name).trim();
                    return nameStr.length > 0 && !nameStr.includes('@');
                });

                console.log('✅ [BaoCaoVanDon] Loaded', validNames.length, 'selected personnel:', validNames);
                setSelectedPersonnelNames(validNames);
            } catch (error) {
                console.error('❌ [BaoCaoVanDon] Error loading selected personnel:', error);
                setSelectedPersonnelNames([]);
            }
        };

        loadSelectedPersonnel();
    }, []);

    // --- LOAD USER BRANCH ---
    // Load branch của user hiện tại từ bảng users
    useEffect(() => {
        const loadUserBranch = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (!userEmail) {
                    console.log('⚠️ [BaoCaoVanDon] Không tìm thấy userEmail trong localStorage');
                    setUserBranch(null);
                    return;
                }

                const userEmailLower = userEmail.toLowerCase().trim();
                console.log('📧 [BaoCaoVanDon] Loading user branch for:', userEmailLower);

                // Get branch từ bảng users
                const { data, error } = await supabase
                    .from('users')
                    .select('branch, team')
                    .eq('email', userEmailLower)
                    .single();

                if (error) {
                    console.error('❌ [BaoCaoVanDon] Error loading user branch:', error);
                    setUserBranch(null);
                    return;
                }

                // Ưu tiên branch, sau đó team
                const branch = data?.branch || data?.team || null;
                console.log('✅ [BaoCaoVanDon] Loaded user branch from DB:', {
                    branch: data?.branch,
                    team: data?.team,
                    finalBranch: branch
                });
                setUserBranch(branch);
                
                // Log để debug nếu không có branch
                if (!branch) {
                    console.warn('⚠️ [BaoCaoVanDon] User does not have branch or team in users table');
                }
            } catch (error) {
                console.error('❌ [BaoCaoVanDon] Error loading user branch:', error);
                setUserBranch(null);
            }
        };

        loadUserBranch();
    }, []);

    // --- FETCH DATA ---
    // Tắt auto-fetch - chỉ fetch khi user chọn dates và click button hoặc thay đổi dates
    // useEffect tự động fetch đã bị tắt - chỉ fetch khi user thao tác

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        setLoadingProgress({ current: 0, total: 0, message: 'Đang bắt đầu tải dữ liệu...' });
        try {
            // Use fetchOrdersFromAPI to get data from orders API
            console.log(`📡 Fetching report data from Orders API for: ${reportFilters.startDate} to ${reportFilters.endDate}`);
            console.log(`🔗 Current URL: ${window.location.href}`);

            // Convert dates from YYYY-MM-DD to DD/MM/YYYY format for API
            const fromDate = reportFilters.startDate ? convertDateToAPIFormat(reportFilters.startDate) : '';
            const toDate = reportFilters.endDate ? convertDateToAPIFormat(reportFilters.endDate) : '';

            // Build filters for API - dates từ URL đã được gán vào reportFilters
            // Dates luôn được truyền vào URL API với format DD/MM/YYYY
            const apiFilters = {
                from_date: fromDate,
                to_date: toDate
                // Không set limit để lấy tất cả data
            };
            
            // Add optional filters if they exist
            // Map từ filter UI sang API filter names theo tài liệu BE
            if (reportFilters.product && reportFilters.product.length > 0) {
                // Product filter: UI dùng "Mặt hàng", API dùng "product"
                apiFilters.product = Array.isArray(reportFilters.product) 
                    ? reportFilters.product.join(',') 
                    : reportFilters.product;
            }
            if (reportFilters.market && reportFilters.market.length > 0) {
                // Market filter: UI dùng "khu vực", API dùng "country"
                apiFilters.country = Array.isArray(reportFilters.market) 
                    ? reportFilters.market.join(',') 
                    : reportFilters.market;
            }
            // Staff filter: UI dùng "NV Vận đơn", API dùng "delivery_staff"
            // Logic: Nếu không phải admin, chỉ dùng selected_personnel (tự động)
            // Nếu là admin, cho phép chọn thủ công và kết hợp với selected_personnel
            const staffFilters = [];
            
            if (isAdmin) {
                // Admin: cho phép chọn tất cả staff
                // Thêm selected_personnel từ tài khoản đăng nhập (nếu có)
                if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                    staffFilters.push(...selectedPersonnelNames);
                    console.log(`👥 [BaoCaoVanDon] Admin: Auto-adding selected_personnel to delivery_staff:`, selectedPersonnelNames);
                }
                
                // Thêm filter thủ công từ UI (nếu có)
                if (reportFilters.staff && reportFilters.staff.length > 0) {
                    const manualStaff = Array.isArray(reportFilters.staff) 
                        ? reportFilters.staff 
                        : [reportFilters.staff];
                    staffFilters.push(...manualStaff);
                    console.log(`👤 [BaoCaoVanDon] Admin: Adding manual staff filter:`, manualStaff);
                }
            } else {
                // Không phải admin: CHỈ dùng selected_personnel (tự động)
                if (selectedPersonnelNames && selectedPersonnelNames.length > 0) {
                    staffFilters.push(...selectedPersonnelNames);
                    console.log(`👥 [BaoCaoVanDon] Non-admin: Only using selected_personnel for delivery_staff:`, selectedPersonnelNames);
                } else {
                    console.log(`⚠️ [BaoCaoVanDon] Non-admin: No selected_personnel found. No delivery_staff filter will be applied.`);
                }
            }
            
            // Loại bỏ duplicate và set vào API filter
            if (staffFilters.length > 0) {
                const uniqueStaff = [...new Set(staffFilters)];
                apiFilters.delivery_staff = uniqueStaff.join(',');
                console.log(`✅ [BaoCaoVanDon] Final delivery_staff filter:`, uniqueStaff);
            }
            // Team filter: UI dùng "Chi nhánh", API dùng "team"
            // Logic: Nếu không phải admin, tự động thêm userBranch vào filter
            // Nếu là admin, cho phép chọn thủ công
            if (isAdmin) {
                // Admin: cho phép chọn thủ công
                if (reportFilters.team && reportFilters.team.length > 0) {
                    apiFilters.team = Array.isArray(reportFilters.team) 
                        ? reportFilters.team.join(',') 
                        : reportFilters.team;
                    console.log(`🏢 [BaoCaoVanDon] Admin: Team filter (Chi nhánh):`, reportFilters.team);
                    console.log(`🏢 [BaoCaoVanDon] Admin: Team filter → API parameter: team=${apiFilters.team}`);
                } else {
                    console.log(`🏢 [BaoCaoVanDon] Admin: No team filter selected`);
                }
            } else {
                // Non-admin: tự động thêm userBranch vào filter
                if (userBranch) {
                    apiFilters.team = userBranch;
                    console.log(`🏢 [BaoCaoVanDon] Non-admin: Auto-adding userBranch to team filter:`, userBranch);
                } else {
                    console.log(`⚠️ [BaoCaoVanDon] Non-admin: No userBranch found. No team filter will be applied.`);
                }
            }

            // Log để verify format và filters
            console.log(`📋 [BaoCaoVanDon] Input dates (YYYY-MM-DD): from_date=${reportFilters.startDate}, to_date=${reportFilters.endDate}`);
            console.log(`📋 [BaoCaoVanDon] API dates (DD/MM/YYYY): from_date=${fromDate}, to_date=${toDate}`);
            console.log(`📋 [BaoCaoVanDon] API Filters:`, JSON.stringify(apiFilters, null, 2));
            
            // Build full URL để log
            const urlParams = new URLSearchParams();
            Object.keys(apiFilters).forEach(key => {
                if (apiFilters[key]) {
                    urlParams.append(key, apiFilters[key]);
                }
            });
            const fullUrl = `${ORDERS_API_BASE_URL}/orders?${urlParams.toString()}`;
            console.log(`🔗 Full API URL: ${fullUrl}`);
            console.log('📡 Fetching all data using cursor pagination...');

            // Strategy: Fetch tất cả data với date range, dùng cursor pagination
            // Không fetch theo từng ngày để tăng tốc độ
            let allData = [];
            let nextAfterId = null;
            let pageNum = 1;
            const seenIds = new Set(); // Để tránh duplicate
            const MAX_PAGES = 100000; // Tăng giới hạn để lấy tất cả data
            
            do {
                const batchFilters = {
                    ...apiFilters,
                    next_after_id: nextAfterId,
                    limit: 10000 // Thêm limit lớn để lấy nhiều records hơn mỗi page
                };
                
                // Chỉ log mỗi 10 pages để giảm overhead
                if (pageNum === 1 || pageNum % 10 === 0) {
                    console.log(`📊 Fetching page ${pageNum}${nextAfterId ? ` (after_id: ${nextAfterId.substring(0, 8)}...)` : ' (first page)'}...`);
                }
                
                const response = await fetchOrdersFromAPI(batchFilters);
                
                // Log chi tiết response để debug
                if (pageNum === 1) {
                    console.log('📡 [BaoCaoVanDon] First page API response:', {
                        hasData: !!response?.data,
                        dataLength: response?.data?.length || 0,
                        hasNextAfterId: !!response?.next_after_id,
                        nextAfterId: response?.next_after_id,
                        count: response?.count,
                        statistics: response?.statistics,
                        filtersApplied: batchFilters,
                        sampleData: response?.data?.slice(0, 3) || []
                    });
                    
                    // Kiểm tra teams trong response
                    if (response?.data && response.data.length > 0) {
                        const teamsInResponse = [...new Set(response.data.map(o => o.team).filter(Boolean))];
                        console.log('🏢 [BaoCaoVanDon] Teams in first page response:', teamsInResponse);
                        if (batchFilters.team) {
                            console.log('🏢 [BaoCaoVanDon] Team filter was:', batchFilters.team);
                            console.log('🏢 [BaoCaoVanDon] Teams match filter?', teamsInResponse.includes(batchFilters.team));
                        }
                    }
                }
                
                let batchData = [];
                if (response && response.data && Array.isArray(response.data)) {
                    batchData = response.data;
                } else if (Array.isArray(response)) {
                    batchData = response;
                }
                
                // Nếu có team filter, kiểm tra xem API có filter đúng không
                // Nếu không, filter client-side
                if (apiFilters.team && batchData.length > 0) {
                    const requestedTeams = apiFilters.team.split(',').map(t => t.trim());
                    const teamsInBatch = [...new Set(batchData.map(o => o.team).filter(Boolean))];
                    const hasRequestedTeam = teamsInBatch.some(t => requestedTeams.includes(t));
                    
                    if (!hasRequestedTeam && pageNum === 1) {
                        console.warn('⚠️ [BaoCaoVanDon] API may not be filtering by team correctly. Teams in batch:', teamsInBatch);
                        console.warn('⚠️ [BaoCaoVanDon] Requested teams:', requestedTeams);
                        console.log('🔧 [BaoCaoVanDon] Applying client-side team filter...');
                    }
                    
                    // Filter client-side nếu API không filter đúng
                    if (!hasRequestedTeam) {
                        batchData = batchData.filter(item => {
                            const itemTeam = item.team || '';
                            return requestedTeams.some(req => 
                                itemTeam === req || 
                                itemTeam.toLowerCase() === req.toLowerCase()
                            );
                        });
                        
                        if (pageNum === 1 && batchData.length === 0) {
                            console.warn('⚠️ [BaoCaoVanDon] No data matches team filter after client-side filtering');
                        }
                    }
                }
                
                // Filter duplicate
                const newData = batchData.filter(item => {
                    const id = item.id || item.order_code || item.order_id;
                    if (id && seenIds.has(id)) {
                        return false;
                    }
                    if (id) {
                        seenIds.add(id);
                    }
                    return true;
                });
                
                if (newData.length > 0) {
                    allData.push(...newData);
                    // Chỉ log mỗi 10 pages
                    if (pageNum === 1 || pageNum % 10 === 0) {
                        console.log(`✅ Page ${pageNum}: Added ${newData.length} orders (Total: ${allData.length})`);
                    }
                }
                
                // Kiểm tra có page tiếp theo không
                nextAfterId = response?.next_after_id || null;
                
                // Kiểm tra nếu API trả về đúng limit records nhưng không có next_after_id
                // Có thể API có giới hạn cứng, cần fetch theo từng ngày
                const actualCount = batchData.length;
                const expectedCount = response?.count || response?.statistics?.total_orders;
                const limit = batchFilters.limit || 10000;
                
                // Log chi tiết nếu có vấn đề
                if (actualCount === limit && !nextAfterId) {
                    console.warn(`⚠️ WARNING: API returned exactly ${limit} records but no next_after_id.`, {
                        actualCount: actualCount,
                        expectedCount: expectedCount,
                        limit: limit,
                        hasNextAfterId: !!response?.next_after_id,
                        responseKeys: Object.keys(response || {}),
                        response: response
                    });
                    
                    // Nếu có expectedCount > limit, cảnh báo rõ ràng
                    if (expectedCount && expectedCount > limit) {
                        console.error(`❌ CRITICAL: API may have hard limit of ${limit} records. Expected ${expectedCount} but only got ${actualCount}. May need to fetch by date.`);
                    }
                    
                    // Nếu không có next_after_id nhưng có thể còn data, thử fetch theo từng ngày
                    if (expectedCount && expectedCount > actualCount && fromDate && toDate) {
                        console.log(`🔄 Attempting to fetch remaining data by date range...`);
                        // Sẽ fetch theo từng ngày ở bên dưới nếu cần
                    }
                }
                
                // Update loading progress
                setLoadingProgress({
                    current: allData.length,
                    total: response?.count || response?.statistics?.total_orders || 0,
                    message: nextAfterId ? `Đang tải trang ${pageNum}...` : 'Hoàn tất'
                });
                
                // Log thông tin về pagination (chỉ log mỗi 10 pages để giảm overhead)
                if (pageNum % 10 === 0 || !nextAfterId) {
                    console.log(`📊 Page ${pageNum} info:`, {
                        fetched: newData.length,
                        total: allData.length,
                        hasNextPage: !!nextAfterId,
                        next_after_id: nextAfterId ? nextAfterId.substring(0, 20) + '...' : null,
                        responseCount: response?.count,
                        actualDataCount: batchData.length
                    });
                }
                
                pageNum++;
                
                // Bỏ delay để tăng tốc độ
                // Chỉ delay nếu có quá nhiều pages (tránh rate limit)
                if (nextAfterId && pageNum > 50 && pageNum % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                // Safety limit
                if (pageNum > MAX_PAGES) {
                    console.warn(`⚠️ Reached max pages limit (${MAX_PAGES}). Stopping pagination.`);
                    break;
                }
            } while (nextAfterId);
            
            // Để đảm bảo lấy hết data, fetch theo từng ngày nếu khoảng thời gian > 1 ngày
            // Điều này đảm bảo không bỏ sót data do pagination issues
            if (fromDate && toDate) {
                // Parse dates để fetch theo từng ngày
                const parseDate = (dateStr) => {
                    // Format: DD/MM/YYYY
                    const [day, month, year] = dateStr.split('/');
                    return new Date(year, month - 1, day);
                };
                
                const startDate = parseDate(fromDate);
                const endDate = parseDate(toDate);
                const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
                
                // Nếu khoảng thời gian > 1 ngày, fetch theo từng ngày để đảm bảo lấy hết
                if (daysDiff > 1) {
                    console.log(`📅 Date range is ${daysDiff} days. Fetching by individual dates to ensure completeness...`);
                    
                    const dateBasedData = [];
                    const dateSeenIds = new Set(seenIds); // Copy existing seenIds
                    
                    // Fetch từng ngày
                    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                        const dayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                        const dayFilters = {
                            ...apiFilters,
                            from_date: dayStr,
                            to_date: dayStr,
                            limit: 10000
                        };
                        
                        // Remove next_after_id để fetch từ đầu
                        delete dayFilters.next_after_id;
                        
                        try {
                            let dayNextAfterId = null;
                            let dayPageNum = 1;
                            let dayData = [];
                            
                            do {
                                const dayBatchFilters = {
                                    ...dayFilters,
                                    next_after_id: dayNextAfterId
                                };
                                
                                const dayResponse = await fetchOrdersFromAPI(dayBatchFilters);
                                const dayBatchData = dayResponse?.data || [];
                                
                                // Filter duplicate
                                const newDayData = dayBatchData.filter(item => {
                                    const id = item.id || item.order_code || item.order_id;
                                    if (id && dateSeenIds.has(id)) {
                                        return false;
                                    }
                                    if (id) {
                                        dateSeenIds.add(id);
                                    }
                                    return true;
                                });
                                
                                if (newDayData.length > 0) {
                                    dayData.push(...newDayData);
                                }
                                
                                dayNextAfterId = dayResponse?.next_after_id || null;
                                dayPageNum++;
                                
                                if (dayPageNum > 100) break; // Safety limit per day
                            } while (dayNextAfterId);
                            
                            if (dayData.length > 0) {
                                dateBasedData.push(...dayData);
                                console.log(`✅ Fetched ${dayData.length} orders for ${dayStr} (Total so far: ${dateBasedData.length})`);
                            }
                        } catch (err) {
                            console.error(`❌ Error fetching data for ${dayStr}:`, err);
                        }
                    }
                    
                    // Merge date-based data vào allData (tránh duplicate)
                    const mergedData = [...allData];
                    dateBasedData.forEach(item => {
                        const id = item.id || item.order_code || item.order_id;
                        if (id && !seenIds.has(id)) {
                            seenIds.add(id);
                            mergedData.push(item);
                        }
                    });
                    
                    if (mergedData.length > allData.length) {
                        console.log(`✅ Added ${mergedData.length - allData.length} additional orders from date-based fetching`);
                        allData = mergedData;
                    } else {
                        console.log(`✅ Date-based fetching confirmed all data (${allData.length} total)`);
                    }
                }
            }
            
            const data = allData;
            const expectedCount = null; // API có thể không trả về total count
            
            console.log(`✅ Fetched total ${data.length} orders from API (${pageNum - 1} pages, ${seenIds.size} unique orders)`);
            
            // Cảnh báo nếu chỉ có 1000 records - có thể bị giới hạn
            if (data.length === 1000 && pageNum === 2) {
                console.warn(`⚠️ WARNING: Only fetched 1000 orders. API may have a hard limit. Consider fetching by date range if more data exists.`);
            }
            
            // Cảnh báo nếu thiếu data
            if (data.length === 0) {
                console.error('❌ [BaoCaoVanDon] WARNING: No data fetched!');
                console.error('❌ [BaoCaoVanDon] API Filters used:', apiFilters);
                
                // Nếu có team filter, thử fetch một ít data không filter team để xem có teams nào
                if (apiFilters.team) {
                    console.log('🔍 [BaoCaoVanDon] Team filter applied but no data. Checking available teams...');
                    try {
                        const sampleFilters = {
                            from_date: apiFilters.from_date,
                            to_date: apiFilters.to_date,
                            limit: 100 // Chỉ lấy 100 records để kiểm tra
                        };
                        console.log('🔍 [BaoCaoVanDon] Fetching sample data without team filter:', sampleFilters);
                        const sampleResponse = await fetchOrdersFromAPI(sampleFilters);
                        const sampleData = sampleResponse?.data || [];
                        const availableTeams = [...new Set(sampleData.map(o => o.team).filter(Boolean))].sort();
                        
                        console.log('🔍 [BaoCaoVanDon] Sample data count:', sampleData.length);
                        console.log('🔍 [BaoCaoVanDon] Available teams in date range:', availableTeams);
                        console.log('🔍 [BaoCaoVanDon] Requested team filter:', apiFilters.team);
                        
                        // Kiểm tra xem có data trong date range không
                        if (sampleData.length === 0) {
                            console.warn('⚠️ [BaoCaoVanDon] No data found in date range even without team filter!');
                            const errorMsg = `Không có dữ liệu trong khoảng thời gian từ ${apiFilters.from_date} đến ${apiFilters.to_date}. ` +
                                `Vui lòng chọn khoảng thời gian khác.`;
                            setError(errorMsg);
                            return;
                        }
                        
                        if (availableTeams.length > 0) {
                            // Normalize team names để so sánh
                            const normalizeTeam = (team) => {
                                if (!team) return '';
                                const lower = team.toLowerCase().trim();
                                // Map các biến thể về format chuẩn
                                if (lower === 'hcm' || lower === 'hồ chí minh' || lower === 'ho chi minh' || lower.includes('hcm')) {
                                    return 'HCM';
                                }
                                if (lower === 'hà nội' || lower === 'ha noi' || lower === 'hanoi' || lower.includes('hà nội')) {
                                    return 'Hà Nội';
                                }
                                return team.trim();
                            };
                            
                            const requestedTeams = apiFilters.team.split(',').map(t => normalizeTeam(t.trim()));
                            const normalizedAvailableTeams = availableTeams.map(t => normalizeTeam(t));
                            
                            const matchedTeams = availableTeams.filter((t, idx) => 
                                requestedTeams.some(req => {
                                    const normalizedT = normalizedAvailableTeams[idx];
                                    return normalizedT === req || 
                                           t.toLowerCase() === req.toLowerCase() || 
                                           t.toLowerCase().includes(req.toLowerCase()) || 
                                           req.toLowerCase().includes(t.toLowerCase());
                                })
                            );
                            
                            if (matchedTeams.length === 0) {
                                console.warn('⚠️ [BaoCaoVanDon] Team filter value does not match any available teams!');
                                console.warn('⚠️ [BaoCaoVanDon] Requested (normalized):', requestedTeams);
                                console.warn('⚠️ [BaoCaoVanDon] Available (raw):', availableTeams);
                                console.warn('⚠️ [BaoCaoVanDon] Available (normalized):', normalizedAvailableTeams);
                                
                                const errorMsg = `Không tìm thấy dữ liệu với bộ lọc "Chi nhánh: ${apiFilters.team}". ` +
                                    `Các chi nhánh có sẵn trong khoảng thời gian này: ${availableTeams.join(', ') || 'Không có'}. ` +
                                    `Vui lòng kiểm tra lại bộ lọc.`;
                                setError(errorMsg);
                                return; // Dừng lại, không set rawData
                            } else {
                                console.log('✅ [BaoCaoVanDon] Found matching teams:', matchedTeams);
                            }
                        }
                    } catch (err) {
                        console.error('❌ [BaoCaoVanDon] Error checking available teams:', err);
                    }
                }
                
                console.error('❌ [BaoCaoVanDon] Check if filters are too restrictive or date range has no data.');
                
                // Tạo error message chi tiết hơn
                const filterDetails = [];
                if (apiFilters.team) filterDetails.push(`Chi nhánh: ${apiFilters.team}`);
                if (apiFilters.delivery_staff) filterDetails.push(`NV Vận đơn: ${apiFilters.delivery_staff}`);
                if (apiFilters.product) filterDetails.push(`Mặt hàng: ${apiFilters.product}`);
                if (apiFilters.country) filterDetails.push(`Khu vực: ${apiFilters.country}`);
                
                const errorMsg = filterDetails.length > 0
                    ? `Không tìm thấy dữ liệu với bộ lọc: ${filterDetails.join(', ')}. Vui lòng kiểm tra lại bộ lọc và khoảng thời gian.`
                    : 'Không lấy được dữ liệu từ API. Vui lòng kiểm tra lại bộ lọc và khoảng thời gian.';
                
                setError(errorMsg);
            } else {
                setError(null); // Clear error nếu OK
            }
            
            // Debug: Log sample data để kiểm tra structure
            if (data.length > 0) {
                console.log('📊 Sample order data (first item):', data[0]);
                console.log('📊 Sample order keys:', Object.keys(data[0]));
                console.log('📊 Sample mapped fields:', {
                    order_date: data[0].order_date,
                    total_amount_vnd: data[0].total_amount_vnd,
                    tongtien: data[0].tongtien,
                    delivery_status: data[0].delivery_status,
                    payment_status: data[0].payment_status,
                    delivery_staff: data[0].delivery_staff,
                    nhanvien_sale: data[0].nhanvien_sale,
                    country: data[0].country,
                    product: data[0].product,
                    team: data[0].team, // ⚠️ Field này sẽ được map thành "Chi nhánh"
                    tracking_code: data[0].tracking_code,
                    check_result: data[0].check_result
                });
                console.log('🏢 Teams in first 10 orders:', data.slice(0, 10).map(o => o.team).filter(Boolean));
            }

            // Map data to ensure compatibility with Report logic
            const mappedData = data.map(mapOrderToReportFormat);
            
            // Debug: Log sample mapped data
            if (mappedData.length > 0) {
                console.log('📊 Sample mapped data (first item):', mappedData[0]);
                console.log('📊 Mapped fields check:', {
                    "Ngày lên đơn": mappedData[0]["Ngày lên đơn"],
                    "Tổng tiền VNĐ": mappedData[0]["Tổng tiền VNĐ"],
                    "NV Vận đơn": mappedData[0]["NV Vận đơn"],
                    "Trạng thái giao hàng NB": mappedData[0]["Trạng thái giao hàng NB"],
                    "Trạng thái thu tiền": mappedData[0]["Trạng thái thu tiền"],
                    "khu vực": mappedData[0]["khu vực"],
                    "Mặt hàng": mappedData[0]["Mặt hàng"],
                    "Chi nhánh": mappedData[0]["Chi nhánh"]
                });
            }
            
            setRawData(mappedData);
        } catch (err) {
            console.error("❌ Fetch error:", err);
            setError(err.message || 'Lỗi khi tải dữ liệu từ API');
        } finally {
            setLoading(false);
        }
    };

    // --- QUICK DATE LOGIC ---
    useEffect(() => {
        // Calculate dates locally when dateRange changes
        if (!reportFilters.dateRange) return;

        const now = new Date();
        const year = now.getFullYear();
        let start, end;

        switch (reportFilters.dateRange) {
            case 'last10Days': {
                start = new Date(now);
                start.setDate(now.getDate() - 9); // 10 ngày (bao gồm hôm nay)
                end = new Date(now);
                break;
            }
            case 'last3Days': {
                start = new Date(now);
                start.setDate(now.getDate() - 3);
                end = new Date(now);
                break;
            }
            case 'thisWeek': {
                const day = now.getDay() || 7;
                start = new Date(now);
                start.setDate(now.getDate() - day + 1);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            }
            case 'lastWeek': {
                const day = now.getDay() || 7;
                start = new Date(now);
                start.setDate(now.getDate() - day - 6);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            }
            case 'thisMonth':
                start = new Date(year, now.getMonth(), 1);
                end = new Date(year, now.getMonth() + 1, 0);
                break;
            default:
                if (reportFilters.dateRange.startsWith('month_')) {
                    const m = parseInt(reportFilters.dateRange.split('_')[1]) - 1;
                    start = new Date(year, m, 1);
                    end = new Date(year, m + 1, 0);
                } else if (reportFilters.dateRange.startsWith('quarter_')) {
                    const q = parseInt(reportFilters.dateRange.split('_')[1]);
                    start = new Date(year, (q - 1) * 3, 1);
                    end = new Date(year, (q - 1) * 3 + 3, 0);
                }
        }

        if (start && end) {
            setReportFilters(prev => {
                const newStart = formatDateForInput(start);
                const newEnd = formatDateForInput(end);
                // Only update if changed to avoid loop
                if (prev.startDate !== newStart || prev.endDate !== newEnd) {
                    return { ...prev, startDate: newStart, endDate: newEnd };
                }
                return prev;
            });
        }
    }, [reportFilters.dateRange]);


    // --- FILTER LOGIC: REPORT TAB ---
    // Không filter ở client-side vì đã filter ở API
    // rawData đã được filter bởi API với các filters: dates, product, market, staff
    const filteredReportData = useMemo(() => {
        // API đã filter theo dates, product, market, staff
        // Chỉ trả về rawData vì đã được filter ở server-side
        return rawData;
    }, [rawData]);

    // --- STATISTICS CALCULATION ---
    const reportStats = useMemo(() => {
        const staffStats = {};
        const grandTotal = createEmptyStats();

        console.log(`📊 Calculating statistics for ${filteredReportData.length} filtered orders`);

        filteredReportData.forEach((row, index) => {
            const staffName = row["NV Vận đơn"] || row["NV_Vận_đơn"] || "Chưa có NV";
            const company = row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"] || "Không xác định";

            if (!staffStats[staffName]) staffStats[staffName] = { _total: createEmptyStats(), byCompany: {} };
            if (!staffStats[staffName].byCompany[company]) staffStats[staffName].byCompany[company] = createEmptyStats();

            const targets = [staffStats[staffName].byCompany[company], staffStats[staffName]._total, grandTotal];

            // Parse amount - handle both number and string
            let amount = 0;
            const amountValue = row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || 0;
            if (typeof amountValue === 'number') {
                amount = amountValue;
            } else if (typeof amountValue === 'string') {
                amount = parseFloat(amountValue.replace(/[^\d.-]/g, '')) || 0;
            } else {
                amount = parseFloat(String(amountValue).replace(/[^\d.-]/g, '')) || 0;
            }

            const pStatus = String(row["Trạng thái thu tiền"] || "").trim();
            const dStatus = String(row["Trạng thái giao hàng NB"] || "").trim();

            // Debug first few rows
            if (index < 3) {
                console.log(`📊 Row ${index}:`, {
                    staffName,
                    company,
                    amount,
                    amountValue,
                    pStatus,
                    dStatus,
                    "Tổng tiền VNĐ": row["Tổng tiền VNĐ"],
                    "Trạng thái thu tiền": row["Trạng thái thu tiền"],
                    "Trạng thái giao hàng NB": row["Trạng thái giao hàng NB"]
                });
            }

            targets.forEach(t => {
                // Payment status checks
                if (pStatus.includes("Có bill")) {
                    t["Đã Thanh Toán (có bill)"].count++;
                    t["Đã Thanh Toán (có bill)"].amount += amount;
                } else if (pStatus.includes("Có bill 1 phần")) {
                    t["Bill 1 phần"].count++;
                }

                // Delivery status checks
                if (dStatus.includes("Giao Thành Công")) {
                    t["Giao Thành Công"].count++;
                } else if (dStatus.includes("Đang Giao")) {
                    t["Đang Giao"].count++;
                } else if (dStatus.includes("Chưa Giao")) {
                    t["Chưa Giao"].count++;
                } else if (dStatus.toLowerCase().includes("huỷ") || dStatus.toLowerCase().includes("hủy") || dStatus.toLowerCase().includes("cancel")) {
                    t["Hủy"].count++;
                } else if (dStatus.includes("Hoàn")) {
                    t["Hoàn"].count++;
                } else if (dStatus.includes("chờ check")) {
                    t["chờ check"].count++;
                } else if (!dStatus) {
                    t["Trống trạng thái"].count++;
                }

                // Always count total orders
                t["Tổng đơn lên nội bộ"].count++;
                
                // Count orders eligible for shipping
                if (pStatus.includes("Có bill") || pStatus.includes("Có bill 1 phần")) {
                    t["Tổng đơn đủ đkien đẩy vh"].count++;
                }
                
                // Count orders sent to operations
                if (dStatus && 
                    !dStatus.includes("Chưa Giao") && 
                    !dStatus.includes("chờ check") && 
                    !dStatus.toLowerCase().includes("huỷ") && 
                    !dStatus.toLowerCase().includes("hủy") && 
                    !dStatus.toLowerCase().includes("cancel")) {
                    t["Tổng đơn lên vận hành"].count++;
                }
            });
        });

        // Debug: Log summary
        console.log('📊 Statistics Summary:', {
            totalOrders: grandTotal["Tổng đơn lên nội bộ"].count,
            totalPaid: grandTotal["Đã Thanh Toán (có bill)"].count,
            totalPaidAmount: grandTotal["Đã Thanh Toán (có bill)"].amount,
            totalShipped: grandTotal["Tổng đơn lên vận hành"].count,
            totalSuccess: grandTotal["Giao Thành Công"].count,
            totalReturned: grandTotal["Hoàn"].count,
            totalCanceled: grandTotal["Hủy"].count
        });

        return { staffStats, grandTotal };
    }, [filteredReportData]);

    // --- CHART DATA PREP ---
    const chartsData = useMemo(() => {
        // 1. Status Breakdown
        const statusCounts = { 'Giao Thành Công': 0, 'Hoàn': 0, 'Hủy': 0, 'Đang Giao': 0, 'chờ check': 0, 'Khác': 0 };
        filteredReportData.forEach(r => {
            const s = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            if (s.includes("giao thành công")) statusCounts['Giao Thành Công']++;
            else if (s.includes("hoàn")) statusCounts['Hoàn']++;
            else if (s.includes("huỷ") || s.includes("hủy") || s.includes("cancel")) statusCounts['Hủy']++;
            else if (s.includes("đang giao")) statusCounts['Đang Giao']++;
            else if (s.includes("chờ check")) statusCounts['chờ check']++;
            else if (s) statusCounts['Khác']++;
        });

        const statusChart = {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#2ecc71', '#e74c3c', '#8e44ad', '#3498db', '#f1c40f', '#95a5a6'],
            }]
        };

        // 2. Funnel
        const funnelStats = reportStats.grandTotal;
        const funnelChart = {
            labels: ['Tổng đơn nội bộ', 'Đơn lên vận hành', 'Giao thành công'],
            datasets: [{
                label: 'Số đơn',
                data: [funnelStats["Tổng đơn lên nội bộ"].count, funnelStats["Tổng đơn lên vận hành"].count, funnelStats["Giao Thành Công"].count],
                backgroundColor: ['#3498db', '#f39c12', '#27ae60']
            }]
        };

        // 3. Staff Performance (Top 10 by Vol)
        const staffPerf = Object.entries(reportStats.staffStats).map(([name, data]) => ({
            name,
            success: data._total["Giao Thành Công"].count,
            returned: data._total["Hoàn"].count,
            canceled: data._total["Hủy"].count
        })).sort((a, b) => (b.success + b.returned + b.canceled) - (a.success + a.returned + a.canceled)).slice(0, 10);

        const staffChart = {
            labels: staffPerf.map(s => s.name),
            datasets: [
                { label: 'Thành Công', data: staffPerf.map(s => s.success), backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: staffPerf.map(s => s.returned), backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: staffPerf.map(s => s.canceled), backgroundColor: '#8e44ad' }
            ]
        };

        // 4. Carrier Performance
        const carrierStats = {};
        filteredReportData.forEach(r => {
            const c = r["Đơn vị vận chuyển"] || "Không xác định";
            if (!carrierStats[c]) carrierStats[c] = { success: 0, returned: 0, canceled: 0 };
            const s = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            if (s.includes("giao thành công")) carrierStats[c].success++;
            else if (s.includes("hoàn")) carrierStats[c].returned++;
            else if (s.includes("huỷ") || s.includes("hủy") || s.includes("cancel")) carrierStats[c].canceled++;
        });
        const carrierChart = {
            labels: Object.keys(carrierStats),
            datasets: [
                { label: 'Thành Công', data: Object.values(carrierStats).map(d => d.success), backgroundColor: '#2ecc71' },
                { label: 'Hoàn', data: Object.values(carrierStats).map(d => d.returned), backgroundColor: '#e74c3c' },
                { label: 'Hủy', data: Object.values(carrierStats).map(d => d.canceled), backgroundColor: '#8e44ad' }
            ]
        };

        return { statusChart, funnelChart, staffChart, carrierChart };
    }, [filteredReportData, reportStats]);


    // --- FILTER LOGIC: DETAIL TAB ---
    // Filter ở client-side chỉ cho các filter không có trong API (check_result, delivery_status, payment_status, search)
    // Các filter dates, product, market, staff đã được filter ở API
    const filteredDetailData = useMemo(() => {
        return rawData.filter(row => {
            // Các filter này không có trong API nên filter ở client-side
            if (detailFilters.checkResult && row["Kết quả check"] !== detailFilters.checkResult) return false;
            if (detailFilters.deliveryStatus && row["Trạng thái giao hàng NB"] !== detailFilters.deliveryStatus) return false;
            if (detailFilters.paymentStatus && row["Trạng thái thu tiền"] !== detailFilters.paymentStatus) return false;
            
            // Staff filter trong detail tab (single select)
            if (detailFilters.staff) {
                const rowStaff = row["NV Vận đơn"] || row["NV_Vận_đơn"] || "";
                if (rowStaff !== detailFilters.staff) return false;
            }

            // Search filter (client-side only)
            if (detailFilters.search) {
                const s = detailFilters.search.toLowerCase();
                const name = (row["Name*"] || "").toLowerCase();
                const phone = (row["Phone*"] || "").toString().toLowerCase();
                const code = (row["Mã đơn hàng"] || "").toLowerCase();
                if (!name.includes(s) && !phone.includes(s) && !code.includes(s)) return false;
            }

            return true;
        });
    }, [rawData, detailFilters]);

    // --- EXCEL HANDLERS ---
    const handleExportExcel = () => {
        // Export filteredDetailData
        const dataToExport = filteredDetailData.map(row => ({
            'Ngày lên đơn': row["Ngày lên đơn"] || row["Thời gian lên đơn"],
            'Mã đơn hàng': row["Mã đơn hàng"],
            'NV Vận đơn': row["NV Vận đơn"] || row["NV_Vận_đơn"],
            'Đơn vị vận chuyển': row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"],
            'Sản phẩm': row["Mặt hàng"],
            'Tổng tiền': row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"],
            'Kết quả check': row["Kết quả check"],
            'Trạng thái giao hàng': row["Trạng thái giao hàng NB"],
            'Trạng thái thu tiền': row["Trạng thái thu tiền"],
            'Mã Tracking': row["Mã Tracking"],
            'Ghi chú': row["Ghi chú"]
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "ChiTietVanDon");
        XLSX.writeFile(wb, `ChiTietVanDon_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const handleImportExcel = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!window.confirm("Bạn có chắc chắn muốn nhập dữ liệu? Dữ liệu sẽ update theo 'Mã đơn hàng' (Order Code) nếu tìm thấy.")) return;

        setLoading(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const wb = XLSX.read(arrayBuffer);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(ws);

            if (jsonData.length === 0) {
                alert("File không có dữ liệu!");
                setLoading(false);
                return;
            }

            // Helper
            const parseNum = (v) => {
                if (v === undefined || v === null || String(v).trim() === '') return undefined;
                return parseInt(String(v).replace(/\D/g, '')) || 0;
            };

            const validItems = jsonData.map(item => {
                const orderCode = item['Mã đơn hàng'] || item['Order Code'] || item['order_code'];
                if (!orderCode) return null;

                return {
                    order_code: orderCode,
                    // Allow updating fields relevant to Delivery Report Context
                    tracking_code: item['Mã Tracking'] || item['Tracking Code'] || undefined,
                    delivery_status: item['Trạng thái'] || item['Status'] || item['Trạng thái giao hàng'] || undefined,
                    payment_status: item['Trạng thái thu tiền'] || item['Payment Status'] || undefined,
                    shipping_unit: item['Đơn vị vận chuyển'] || item['Carrier'] || undefined,
                    shipping_fee: parseNum(item['Phí ship']),
                    note: item['Ghi chú'] || item['Note'] || undefined,
                    // Add more if needed
                };
            }).filter(Boolean);

            if (validItems.length === 0) {
                alert("Không tìm thấy mã đơn hàng trong file!");
                setLoading(false);
                return;
            }

            const { error } = await supabase
                .from('orders') // Assuming same table as VanDon
                .upsert(validItems, { onConflict: 'order_code' });

            if (error) throw error;

            alert(`✅ Đã nhập thành công ${validItems.length} dòng!`);
            fetchData(); // Reload data

        } catch (err) {
            console.error("Import Error:", err);
            alert("❌ Lỗi nhập file: " + err.message);
        } finally {
            e.target.value = '';
            setLoading(false);
        }
    };
    // --- END EXCEL HANDLERS ---

    // --- REFUND LIST LOGIC ---
    const refundData = useMemo(() => {
        return filteredReportData.filter(r => {
            const status = (r["Trạng thái giao hàng NB"] || "").toLowerCase();
            return status.includes("hoàn") || status.includes("huỷ") || status.includes("hủy") || status.includes("cancel");
        });
    }, [filteredReportData]);

    const detailTotalAmount = useMemo(() => {
        return filteredDetailData.reduce((sum, r) => sum + (parseFloat(String(r["Tổng tiền VNĐ"] || r["Tổng_tiền_VNĐ"] || 0).replace(/[^\d.-]/g, '')) || 0), 0);
    }, [filteredDetailData]);


    // --- RENDER HELPERS ---
    // --- RENDER HELPERS ---
    const renderSummaryRow = (label, subLabel, data, isTotal = false) => {
        const totalOps = data["Tổng đơn lên nội bộ"].count;
        const totalShipped = data["Tổng đơn lên vận hành"].count;
        const success = data["Giao Thành Công"].count;

        const shipRate = totalOps > 0 ? (totalShipped / totalOps * 100) : 0;
        const payRate = success > 0 ? (data["Đã Thanh Toán (có bill)"].count / success * 100) : 0;
        const feeRate = totalShipped > 0 ? (success / totalShipped * 100) : 0;

        return (
            <tr key={`${label}-${subLabel}`} className={isTotal ? 'bcvd-total-row' : ''}>
                <td>{label}</td>
                <td>{subLabel}</td>
                <td>{data["Đã Thanh Toán (có bill)"].count}</td>
                <td>{formatCurrency(data["Đã Thanh Toán (có bill)"].amount)}</td>
                <td>{data["Bill 1 phần"].count}</td>
                <td>{data["Tổng đơn lên nội bộ"].count}</td>
                <td>{data["Tổng đơn đủ đkien đẩy vh"].count}</td>
                <td>{data["Tổng đơn lên vận hành"].count}</td>
                <td className={shipRate > 70 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{shipRate.toFixed(1)}%</td>
                <td>{success}</td>
                <td>{data["Đang Giao"].count}</td>
                <td>{data["Chưa Giao"].count}</td>
                <td>{data["Hoàn"].count}</td>
                <td>{data["Hủy"].count}</td>
                <td>{data["chờ check"].count}</td>
                <td>{data["Trống trạng thái"].count}</td>
                <td className={payRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{payRate.toFixed(1)}%</td>
                <td className={feeRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{feeRate.toFixed(1)}%</td>
            </tr>
        );
    };

    return (
        <div className="bcvd-container">
            {loading && (
                <div className="bcvd-loading-overlay">
                    <div className="bcvd-loading-spinner"></div>
                    <div style={{ marginTop: '10px' }}>
                        {loadingProgress.message || 'Đang tải dữ liệu...'}
                    </div>
                    {loadingProgress.total > 0 && (
                        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                            Đã tải: {loadingProgress.current.toLocaleString()} / {loadingProgress.total.toLocaleString()} đơn hàng
                        </div>
                    )}
                    {loadingProgress.current > 0 && loadingProgress.total === 0 && (
                        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                            Đã tải: {loadingProgress.current.toLocaleString()} đơn hàng
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50" role="alert">
                    <span className="font-medium">Lỗi!</span> {error}
                </div>
            )}

            <div className="bcvd-tab-container">
                <button
                    className={`bcvd-tab-btn ${activeTab === 'VanDonReport' ? 'active' : ''}`}
                    onClick={() => setActiveTab('VanDonReport')}
                >
                    Báo cáo Tổng kết
                </button>
                <button
                    className={`bcvd-tab-btn ${activeTab === 'DonChiTiet' ? 'active' : ''}`}
                    onClick={() => setActiveTab('DonChiTiet')}
                >
                    Chi tiết Vận đơn
                </button>
                <button
                    className={`bcvd-tab-btn ${activeTab === 'DonHoan' ? 'active' : ''}`}
                    onClick={() => setActiveTab('DonHoan')}
                >
                    Danh sách Hoàn/Hủy
                </button>
            </div>

            {/* TAB 1: BÁO CÁO */}
            {activeTab === 'VanDonReport' && (
                <div className="bcvd-tab-content">
                    <h2 className="bcvd-h2">BÁO CÁO TỔNG KẾT VẬN ĐƠN</h2>

                    <div className="bcvd-controls">
                        <div className="right-controls" style={{ width: '100%', justifyContent: 'flex-start' }}>
                            <label style={{ fontSize: '12px', marginRight: '4px' }}>Chọn nhanh:
                                <select
                                    className="bcvd-filter-select"
                                    value={reportFilters.dateRange}
                                    onChange={(e) => setReportFilters(p => ({ ...p, dateRange: e.target.value }))}
                                    style={{ marginLeft: '4px', fontSize: '12px', padding: '6px 8px' }}
                                >
                                    <option value="">-- Tùy chọn --</option>
                                    <option value="last10Days">10 ngày gần nhất</option>
                                    <option value="last3Days">3 ngày gần nhất</option>
                                    <optgroup label="Tuần">
                                        <option value="lastWeek">Tuần trước</option>
                                        <option value="thisWeek">Tuần này</option>
                                    </optgroup>
                                    <optgroup label="Tháng">
                                        <option value="thisMonth">Tháng này</option>
                                        <option value="month_1">Tháng 1</option>
                                        <option value="month_2">Tháng 2</option>
                                        <option value="month_3">Tháng 3</option>
                                        <option value="month_4">Tháng 4</option>
                                        <option value="month_5">Tháng 5</option>
                                        <option value="month_6">Tháng 6</option>
                                        <option value="month_7">Tháng 7</option>
                                        <option value="month_8">Tháng 8</option>
                                        <option value="month_9">Tháng 9</option>
                                        <option value="month_10">Tháng 10</option>
                                        <option value="month_11">Tháng 11</option>
                                        <option value="month_12">Tháng 12</option>
                                    </optgroup>
                                    <optgroup label="Quý">
                                        <option value="quarter_1">Quý 1</option>
                                        <option value="quarter_2">Quý 2</option>
                                        <option value="quarter_3">Quý 3</option>
                                        <option value="quarter_4">Quý 4</option>
                                    </optgroup>
                                </select>
                            </label>

                            <div className="date-filter" style={{ fontSize: '12px' }}>
                                <span>Từ:</span>
                                <input
                                    type="date"
                                    value={reportFilters.startDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))}
                                    style={{ fontSize: '12px', padding: '6px 8px', width: '130px' }}
                                />
                                <span>Đến:</span>
                                <input
                                    type="date"
                                    value={reportFilters.endDate}
                                    onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))}
                                    style={{ fontSize: '12px', padding: '6px 8px', width: '130px' }}
                                />
                            </div>

                            {/* Chỉ hiển thị dropdown "NV Vận đơn" nếu là Admin */}
                            {isAdmin && (
                                <div className="bcvd-multi-select-container" style={{ position: 'relative', zIndex: 100 }}>
                                    <button 
                                        ref={staffButtonRef}
                                        className="bcvd-btn" 
                                        onClick={() => setShowStaffDropdown(!showStaffDropdown)}
                                        style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                                    >
                                        {reportFilters.staff.length > 0 ? `${reportFilters.staff.length} NV` : 'NV Vận đơn'}
                                    </button>
                                {showStaffDropdown && createPortal(
                                    <div 
                                        ref={staffDropdownRef}
                                        className="fixed bg-white border border-gray-300 rounded shadow-lg max-h-72 overflow-y-auto"
                                        style={{ 
                                            zIndex: 10000,
                                            top: `${staffDropdownPosition.top}px`,
                                            left: `${staffDropdownPosition.left}px`,
                                            width: `${staffDropdownPosition.width || 200}px`,
                                            minWidth: '200px'
                                        }}
                                    >
                                        <div
                                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-100 text-sm"
                                            onClick={() => {
                                                if (reportFilters.staff.length === uniqueStaff.length) setReportFilters(p => ({ ...p, staff: [] }));
                                                else setReportFilters(p => ({ ...p, staff: uniqueStaff }));
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={reportFilters.staff.length === uniqueStaff.length && uniqueStaff.length > 0} 
                                                readOnly 
                                                className="mr-2 h-4 w-4"
                                            />
                                            <span className="font-bold">Chọn tất cả</span>
                                        </div>
                                        {uniqueStaff.map(s => (
                                            <div
                                                key={s}
                                                className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-50 last:border-0 text-sm"
                                                onClick={(e) => { e.stopPropagation(); }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={reportFilters.staff.includes(s)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setReportFilters(p => ({
                                                            ...p,
                                                            staff: checked ? [...p.staff, s] : p.staff.filter(x => x !== s)
                                                        }));
                                                    }}
                                                    className="mr-2 h-4 w-4"
                                                />
                                                <span className="text-gray-700">{s}</span>
                                            </div>
                                        ))}
                                    </div>,
                                    document.body
                                )}
                                </div>
                            )}

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Mặt hàng"
                                    options={uniqueProducts || []}
                                    selected={reportFilters.product || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, product: selected }))}
                                    placeholder="Mặt hàng"
                                    mainFilter={true}
                                />
                            </div>

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Khu vực"
                                    options={uniqueMarkets || []}
                                    selected={reportFilters.market || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, market: selected }))}
                                    placeholder="Khu vực"
                                    mainFilter={true}
                                />
                            </div>

                            <div style={{ minWidth: '140px' }}>
                                <MultiSelect
                                    label="Chi nhánh"
                                    options={uniqueTeams || []}
                                    selected={reportFilters.team || []}
                                    onChange={(selected) => setReportFilters(p => ({ ...p, team: selected }))}
                                    placeholder="Chi nhánh"
                                    mainFilter={true}
                                />
                            </div>

                            <button 
                                className="bcvd-btn" 
                                onClick={() => {
                                    if (reportFilters.startDate && reportFilters.endDate) {
                                        fetchData();
                                    } else {
                                        alert('Vui lòng chọn khoảng thời gian');
                                    }
                                }}
                                disabled={loading || !reportFilters.startDate || !reportFilters.endDate}
                                style={{ 
                                    backgroundColor: loading ? '#ccc' : '#20744a', 
                                    color: 'white',
                                    cursor: loading || !reportFilters.startDate || !reportFilters.endDate ? 'not-allowed' : 'pointer',
                                    fontSize: '12px',
                                    padding: '6px 12px',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {loading ? 'Đang tải...' : '🔍 Tìm'}
                            </button>
                            <button 
                                className="bcvd-btn bcvd-clear-filter-btn" 
                                onClick={() => {
                                    // Xóa tất cả filters
                                    setReportFilters({
                                        dateRange: '', startDate: '', endDate: '', product: [], market: [], staff: [], team: []
                                    });
                                    // Xóa filters khỏi URL
                                    const params = new URLSearchParams(searchParams);
                                    params.delete('from_date');
                                    params.delete('to_date');
                                    setSearchParams(params, { replace: true });
                                    console.log('🗑️ Đã xóa tất cả filters và cập nhật URL');
                                }}
                                style={{ fontSize: '12px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                            >
                                Xóa lọc
                            </button>
                        </div>
                    </div>

                    {/* REFUND / RETURN SECTION */}
                    <div className="bcvd-refund-section">
                        <div className="bcvd-refund-info">
                            Báo cáo Đơn Hoàn / Huỷ: <span style={{ color: '#e74c3c', marginLeft: '8px' }}>
                                {reportStats.grandTotal["Hoàn"].count + reportStats.grandTotal["Hủy"].count} đơn
                            </span>
                            <span className="text-sm text-gray-500 ml-2 font-normal">
                                (Hoàn: {reportStats.grandTotal["Hoàn"].count} | Hủy: {reportStats.grandTotal["Hủy"].count})
                            </span>
                        </div>
                        <button
                            className="bcvd-refund-btn"
                            onClick={() => setActiveTab('DonHoan')}
                        >
                            Xem chi tiết
                        </button>
                    </div>

                    {/* CHART TOGGLE BUTTON */}
                    <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            className="bcvd-btn"
                            onClick={() => setShowCharts(!showCharts)}
                            style={{
                                backgroundColor: showCharts ? '#f39c12' : '#27ae60',
                                fontSize: '14px',
                                padding: '10px 20px'
                            }}
                        >
                            {showCharts ? '📊 Ẩn Biểu Đồ' : '📊 Hiện Biểu Đồ'}
                        </button>
                    </div>

                    {/* CHARTS */}
                    {showCharts && (
                    <div className="bcvd-charts-container">
                        <div className="bcvd-chart-wrapper">
                            <h3>Phân tích Trạng thái Giao hàng</h3>
                            <div className="bcvd-chart-content">
                                <Doughnut data={chartsData.statusChart} options={{ responsive: true, maintainAspectRatio: false }} />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Phân tích Kênh Vận hành</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.funnelChart}
                                    options={{
                                        indexAxis: 'y',
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: { legend: { display: false } }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Hiệu suất theo NV Vận đơn (Top 10)</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.staffChart}
                                    options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }}
                                />
                            </div>
                        </div>
                        <div className="bcvd-chart-wrapper">
                            <h3>Hiệu suất theo Đơn vị Vận chuyển</h3>
                            <div className="bcvd-chart-content">
                                <Bar
                                    data={chartsData.carrierChart}
                                    options={{ responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true } } }}
                                />
                            </div>
                        </div>
                    </div>
                    )}

                    <div className="bcvd-table-wrapper">
                        <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '10px' }}>Báo cáo chi tiết</h3>
                        <table className="bcvd-summary-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2}>NV Vận đơn</th>
                                    <th rowSpan={2}>Đơn vị vận chuyển</th>
                                    <th colSpan={2}>Đã Thanh Toán (có bill)</th>
                                    <th rowSpan={2}>Bill 1 phần</th>
                                    <th rowSpan={2}>Tổng đơn lên nội bộ</th>
                                    <th rowSpan={2}>Tổng đơn đủ đkien đẩy vh</th>
                                    <th rowSpan={2}>Tổng đơn lên vận hành</th>
                                    <th rowSpan={2}>Tỷ lệ đơn lên vận hành</th>
                                    <th rowSpan={2}>Giao Thành Công</th>
                                    <th rowSpan={2}>Đang Giao</th>
                                    <th rowSpan={2}>Chưa Giao</th>
                                    <th rowSpan={2}>Hoàn</th>
                                    <th rowSpan={2}>Hủy</th>
                                    <th rowSpan={2}>chờ check</th>
                                    <th rowSpan={2}>Trống trạng thái</th>
                                    <th rowSpan={2}>Tỷ lệ thu tiền/giao thành công</th>
                                    <th rowSpan={2}>Tỷ lệ đơn tính phí vc</th>
                                </tr>
                                <tr>
                                    <th>Số đơn</th>
                                    <th>Thành Tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Grand Total */}
                                {renderSummaryRow("TỔNG TOÀN BỘ", "Tất cả NV & DVVC", reportStats.grandTotal, true)}

                                {/* Staff Rows - Mỗi nhân viên chỉ 1 dòng */}
                                {Object.keys(reportStats.staffStats).sort().map(staffName => {
                                    const sData = reportStats.staffStats[staffName];
                                    const totalOps = sData._total["Tổng đơn lên nội bộ"].count;
                                    const totalShipped = sData._total["Tổng đơn lên vận hành"].count;
                                    const success = sData._total["Giao Thành Công"].count;
                                    const shipRate = totalOps > 0 ? (totalShipped / totalOps * 100) : 0;
                                    const payRate = success > 0 ? (sData._total["Đã Thanh Toán (có bill)"].count / success * 100) : 0;
                                    const feeRate = totalShipped > 0 ? (success / totalShipped * 100) : 0;
                                    
                                    return (
                                        <tr key={staffName} className="bcvd-summary-staff-total">
                                            <td>{staffName}</td>
                                            <td>Tổng cộng</td>
                                            <td>{sData._total["Đã Thanh Toán (có bill)"].count}</td>
                                            <td>{formatCurrency(sData._total["Đã Thanh Toán (có bill)"].amount)}</td>
                                            <td>{sData._total["Bill 1 phần"].count}</td>
                                            <td>{sData._total["Tổng đơn lên nội bộ"].count}</td>
                                            <td>{sData._total["Tổng đơn đủ đkien đẩy vh"].count}</td>
                                            <td>{sData._total["Tổng đơn lên vận hành"].count}</td>
                                            <td className={shipRate > 70 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{shipRate.toFixed(1)}%</td>
                                            <td>{success}</td>
                                            <td>{sData._total["Đang Giao"].count}</td>
                                            <td>{sData._total["Chưa Giao"].count}</td>
                                            <td>{sData._total["Hoàn"].count}</td>
                                            <td>{sData._total["Hủy"].count}</td>
                                            <td>{sData._total["chờ check"].count}</td>
                                            <td>{sData._total["Trống trạng thái"].count}</td>
                                            <td className={payRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{payRate.toFixed(1)}%</td>
                                            <td className={feeRate > 80 ? 'bcvd-text-positive' : 'bcvd-text-negative'}>{feeRate.toFixed(1)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )
            }

            {/* TAB 2: CHI TIẾT */}
            {
                activeTab === 'DonChiTiet' && (
                    <div className="bcvd-tab-content">
                        <h2 className="bcvd-h2">CHI TIẾT VẬN ĐƠN</h2>

                        <div className="bcvd-controls">
                            <div className="left-controls">
                                <select value={detailFilters.checkResult} onChange={(e) => setDetailFilters(p => ({ ...p, checkResult: e.target.value }))}>
                                    <option value="">Tất cả Kết quả check</option>
                                    {uniqueCheckResults.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.deliveryStatus} onChange={(e) => setDetailFilters(p => ({ ...p, deliveryStatus: e.target.value }))}>
                                    <option value="">Tất cả Trạng thái giao hàng</option>
                                    {uniqueDeliveryStatuses.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.paymentStatus} onChange={(e) => setDetailFilters(p => ({ ...p, paymentStatus: e.target.value }))}>
                                    <option value="">Tất cả Trạng thái thu tiền</option>
                                    {uniquePaymentStatuses.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                                <select value={detailFilters.staff} onChange={(e) => setDetailFilters(p => ({ ...p, staff: e.target.value }))}>
                                    <option value="">Tất cả NV Vận đơn</option>
                                    {uniqueStaff.map(v => <option key={v} value={v}>{v}</option>)}
                                </select>
                            </div>
                            <div className="right-controls">
                                <div className="date-filter">
                                    <span>Từ:</span>
                                    <input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))} />
                                    <span>Đến:</span>
                                    <input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Tìm theo Tên, SĐT, Mã đơn..."
                                    value={detailFilters.search}
                                    onChange={(e) => setDetailFilters(p => ({ ...p, search: e.target.value }))}
                                />
                                <button className="bcvd-btn bcvd-clear-filter-btn" onClick={() => setDetailFilters({
                                    checkResult: '', deliveryStatus: '', paymentStatus: '', staff: '', search: ''
                                })}>Xóa lọc</button>
                            </div>
                        </div>

                        <div className="bcvd-summary-bar">
                            <div className="bcvd-summary-item">
                                <div className="label">Tổng số đơn</div>
                                <div className="value">{filteredDetailData.length}</div>
                            </div>
                            <div className="bcvd-summary-item">
                                <div className="label">Tổng thành tiền</div>
                                <div className="value">{formatCurrency(detailTotalAmount)}</div>
                            </div>
                        </div>

                        {/* Hiển thị tất cả các đơn trong bộ lọc */}
                        <div className="bcvd-table-wrapper">
                            <table className="bcvd-data-table">
                                <thead>
                                    <tr>
                                        <th>Mã đơn</th>
                                        <th>Ngày lên đơn</th>
                                        <th>Mặt hàng</th>
                                        <th>Tổng tiền VNĐ</th>
                                        <th>NV Vận đơn</th>
                                        <th>Đơn vị vận chuyển</th>
                                        <th>Chi nhánh</th>
                                        <th>Trạng thái giao hàng NB</th>
                                        <th>Trạng thái thu tiền</th>
                                        <th>Kết quả check</th>
                                        <th>Mã Tracking</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDetailData.length === 0 ? (
                                        <tr>
                                            <td colSpan="11" style={{ textAlign: 'center', padding: '20px' }}>
                                                Không có dữ liệu phù hợp với bộ lọc
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredDetailData.map((row, idx) => (
                                            <tr key={idx}>
                                                <td>{row["Mã đơn hàng"] || "-"}</td>
                                                <td>{row["Ngày lên đơn"] || row["Thời gian lên đơn"] || "-"}</td>
                                                <td>{row["Mặt hàng"] || "-"}</td>
                                                <td>{formatCurrency(row["Tổng tiền VNĐ"] || row["Tổng_tiền_VNĐ"] || 0)}</td>
                                                <td>{row["NV Vận đơn"] || row["NV_Vận_đơn"] || "-"}</td>
                                                <td>{row["Đơn vị vận chuyển"] || row["Đơn_vị_vận_chuyển"] || "-"}</td>
                                                <td>{row["Chi nhánh"] || row["Team"] || "-"}</td>
                                                <td>{row["Trạng thái giao hàng NB"] || "-"}</td>
                                                <td>{row["Trạng thái thu tiền"] || "-"}</td>
                                                <td>{row["Kết quả check"] || "-"}</td>
                                                <td>{row["Mã Tracking"] || "-"}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            {/* TAB 3: DANH SÁCH HOÀN / HUỶ */}
            {
                activeTab === 'DonHoan' && (
                    <div className="bcvd-tab-content">
                        <h2 className="bcvd-h2">DANH SÁCH ĐƠN HOÀN / HUỶ</h2>

                        <div className="bcvd-controls">
                            <div className="right-controls" style={{ marginLeft: 'auto' }}>
                                <div className="date-filter">
                                    <span>Từ:</span>
                                    <input type="date" value={reportFilters.startDate} onChange={(e) => setReportFilters(p => ({ ...p, startDate: e.target.value }))} />
                                    <span>Đến:</span>
                                    <input type="date" value={reportFilters.endDate} onChange={(e) => setReportFilters(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                        <div className="bcvd-summary-bar">
                            <div className="bcvd-summary-item" style={{ borderColor: '#e74c3c' }}>
                                <div className="label" style={{ color: '#c0392b' }}>Tổng đơn Hoàn/Hủy</div>
                                <div className="value" style={{ color: '#e74c3c' }}>
                                    {refundData.length}
                                </div>
                            </div>
                        </div>

                        <div className="bcvd-table-wrapper">
                            <table className="bcvd-data-table">
                                <thead>
                                    <tr>
                                        <th>Mã đơn</th>
                                        <th>Ngày lên đơn</th>
                                        <th>Mặt hàng</th>
                                        <th>Tổng tiền VNĐ</th>
                                        <th>NV Vận đơn</th>
                                        <th>Đơn vị vận chuyển</th>
                                        <th>Trạng thái giao hàng NB</th>
                                        <th>Lý do / Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {refundData.map((row, idx) => {
                                        const status = (row["Trạng thái giao hàng NB"] || "").toLowerCase();
                                        const isCancel = status.includes("huỷ") || status.includes("hủy") || status.includes("cancel");
                                        const statusColor = isCancel ? '#8e44ad' : '#e74c3c';

                                        // Define columns for refund table, filter out hidden columns
                                        const refundColumns = [
                                            { key: "Mã đơn hàng", label: "Mã đơn" },
                                            { key: "Ngày lên đơn", label: "Ngày lên đơn" },
                                            { key: "Mặt hàng", label: "Mặt hàng" },
                                            { key: "Tổng tiền VNĐ", label: "Tổng tiền VNĐ" },
                                            { key: "NV Vận đơn", label: "NV Vận đơn" },
                                            { key: "Đơn vị vận chuyển", label: "Đơn vị vận chuyển" },
                                            { key: "Trạng thái giao hàng NB", label: "Trạng thái giao hàng NB" },
                                            { key: "Lý do", label: "Lý do / Ghi chú" }
                                        ].filter(col => !HIDDEN_COLUMNS.includes(col.label));

                                        return (
                                            <tr key={idx}>
                                                {refundColumns.map(col => (
                                                    <td key={col.key} style={col.key === "Trạng thái giao hàng NB" ? { color: statusColor, fontWeight: 'bold' } : {}}>
                                                        {col.key === "Tổng tiền VNĐ"
                                                            ? formatCurrency(row[col.key])
                                                            : col.key === "Lý do"
                                                                ? (row["Lý do"] || row["Ghi chú"] || "-")
                                                                : row[col.key] || (col.key === "Ngày lên đơn" ? row["Thời gian lên đơn"] : "-")}
                                                    </td>
                                                ))}
                                            </tr>
                                        );
                                    })}
                                    {refundData.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="bcvd-no-data">Không có đơn hoàn/huỷ trong khoảng thời gian này.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
