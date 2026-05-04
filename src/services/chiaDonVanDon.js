import { toast } from 'react-toastify';

/** yyyy-MM-dd — lịch Việt Nam (khớp “vòng trong ngày”). */
export function yyyyMmDdVietNam(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);
}

/** Khớp cột branch phiên chia với chi nhánh HCM / Hà Nội. */
function normalizeHistoryBranchForVong(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s.includes('hcm') || s.includes('hồ chí minh') || s.includes('ho chi minh') || s.includes('tp.hcm')) return 'HCM';
    if (s.includes('hà nội') || s.includes('ha noi') || s.includes('hanoi') || s === 'hn') return 'Hà Nội';
    return null;
}

function historyChiaBranchMatchesKey(hbranch, keyUi) {
    const k = keyUi === 'HCM' ? 'HCM' : keyUi === 'Hà Nội' ? 'Hà Nội' : null;
    if (!k) return false;
    return normalizeHistoryBranchForVong(hbranch) === k;
}

/**
 * Đếm số phiên chia đơn trong ngày (YYYY-MM-DD) đã được ghi vào history_chia_don — theo VN (+07).
 * Nếu không truy vấn được → 0 (UI không hiểu nhầm vòng sai).
 */
export async function countHistoryChiaSessionsByBranchNgay(supabase, branchKeyUi, yyyyMmDd) {
    const ymd = String(yyyyMmDd || '').trim();
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(ymd)) return 0;

    const startIso = `${ymd}T00:00:00+07:00`;
    const endIso = `${ymd}T23:59:59.999+07:00`;
    const { data, error } = await supabase
        .from('history_chia_don')
        .select('branch')
        .gte('created_at', startIso)
        .lte('created_at', endIso);

    if (error) {
        console.warn('⚠️ [Chia đơn vận đơn] Không đếm được history trong ngày:', error.message);
        return 0;
    }

    let n = 0;
    for (const row of data || []) {
        if (historyChiaBranchMatchesKey(row?.branch, branchKeyUi)) n += 1;
    }
    return n;
}

/**
 * Phiên `history_chia_don` trong ngày (VN +07) theo chi nhánh — `created_at` tăng dần (= thứ tự Vòng 1, 2, …).
 */
export async function fetchHistorySessionsByBranchNgaySorted(supabase, branchKeyUi, yyyyMmDd) {
    const ymd = String(yyyyMmDd || '').trim();
    if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(ymd)) return [];

    const startIso = `${ymd}T00:00:00+07:00`;
    const endIso = `${ymd}T23:59:59.999+07:00`;
    const { data, error } = await supabase
        .from('history_chia_don')
        .select('id, branch, created_at, staff_stats, total_orders')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true });

    if (error) {
        console.warn('⚠️ [fetchHistorySessionsByBranchNgaySorted]', error.message);
        return [];
    }

    return (data || []).filter((row) => historyChiaBranchMatchesKey(row?.branch, branchKeyUi));
}

/** Phiên chia kế tiếp trong ngày (1-based). */
async function getNextVongChiaThuTrongNgay(supabase, branchKeyUi, yyyyMmDd) {
    const counted = await countHistoryChiaSessionsByBranchNgay(supabase, branchKeyUi, yyyyMmDd);
    return counted + 1;
}

/** dd/mm/yyyy từ YYYY-MM-DD (chuỗi ngày VN nhập qua yyyyMmDdVietNam). */
function yyyyMmDdToDdMmYy(yyyymmdd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyymmdd || '').trim());
    if (!m) return String(yyyymmdd || '').trim();
    return `${m[3]}/${m[2]}/${m[1]}`;
}

export async function runChiaDonVanDon({ supabase, branchFilter, addLog: originalAddLog, setNotDividedOrders, setAutoAssignResult }) {
    const capturedStepLogs = [];
    const addLog = (msg, type) => {
        capturedStepLogs.push({ timestamp: new Date().toLocaleTimeString('vi-VN'), message: msg, type: type || 'info' });
        if (originalAddLog) originalAddLog(msg, type);
    };
    const ordersTable = branchFilter === 'HCM' ? 'order_code_hcm' : 'orders';

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
        const nhanVienU1 = vanDonList.filter(item => {
            const status = String(item.trang_thai_chia || '').trim().toUpperCase();
            return status === 'U1';
        });

        addLog(`👥 Tổng số nhân viên U1 tìm được: ${nhanVienU1.length}`, 'info');
        addLog(`👥 Danh sách nhân viên U1: ${nhanVienU1.map(u => String(u.ho_va_ten || '').trim()).join(', ')}`, 'info');
        console.log(`👥 [Chia đơn vận đơn] Danh sách nhân viên U1:`, nhanVienU1.map(u => String(u.ho_va_ten || '').trim()));

        if (nhanVienU1.length === 0) {
            addLog('❌ Không có nhân viên nào có trạng thái U1', 'error');
            throw new Error('Không có nhân viên nào có trạng thái U1');
        }

        // Bước 3: Phân loại nhân viên theo chi nhánh từ danh_sach_van_don
        // Lưu cả name và chi_nhanh để khớp với team của đơn
        const nhanVienHCM = [];
        const nhanVienHaNoi = [];
        const nhanVienSkipped = [];

        // Helper chuẩn hóa để so khớp chi nhánh (xóa dấu, xóa khoảng trắng, chữ thường)
        const ultraNormalize = (s) => {
            return String(s || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') // Xóa dấu
                .replace(/[.\-_/]/g, ' ')       // Thay ký tự đặc biệt bằng dấu cách
                .replace(/\s+/g, '')            // Xóa mọi khoảng trắng
                .trim();
        };

        /**
         * Chuẩn hoá mọi biến thể chi nhánh/team về 1 key thống nhất.
         * Trả về: 'HCM' | 'Hà Nội' | null
         *
         * Lý do cần hàm chung:
         * - Code hiện có nhiều đoạn normalize khác nhau (staff vs order.team vs matcher)
         * - Dễ sinh mismatch → eligible=0/1 tăng → chia lệch
         */
        const normalizeBranchKey = (raw) => {
            const n = ultraNormalize(raw || '');
            if (!n) return null;
            // HCM
            if (n === 'hcm' || n === 'tphcm' || n === 'hochiminh' || n.includes('hcm')) return 'HCM';
            // Hà Nội
            if (n === 'hanoi' || n === 'hn' || n.includes('hanoi')) return 'Hà Nội';
            return null;
        };

        /** Khớp thứ tự với Danh sách vận đơn (`order ho_va_ten`), không phụ thuộc thứ tự Postgres. */
        const nhanVienU1Sorted = [...nhanVienU1].sort((a, b) =>
            String(a.ho_va_ten || '')
                .trim()
                .localeCompare(String(b.ho_va_ten || '').trim(), 'vi')
        );

        nhanVienU1Sorted.forEach((item) => {
            const name = String(item.ho_va_ten || '').trim();
            const chiNhanhRaw = item.chi_nhanh || '';
            const key = normalizeBranchKey(chiNhanhRaw);
            
            // Log chi tiết để debug nếu cần
            console.log(`Checking staff: ${name} | Branch: ${chiNhanhRaw} | Key: ${key || '(null)'}`);
            
            if (key === 'HCM') {
                nhanVienHCM.push({ name, chi_nhanh: 'HCM' });
            } else if (key === 'Hà Nội') {
                nhanVienHaNoi.push({ name, chi_nhanh: 'Hà Nội' });
            } else {
                nhanVienSkipped.push({ 
                    name, 
                    reason: chiNhanhRaw ? `Chi nhánh "${chiNhanhRaw}" không khớp (Hà Nội/HCM)` : 'Thiếu thông tin Chi nhánh' 
                });
                console.warn(`⚠️ [Chia đơn vận đơn] Nhân viên "${name}" bị bỏ qua: chi_nhanh="${chiNhanhRaw}"`);
            }
        });

        addLog('📋 Bước 2: Phân loại nhân viên theo chi nhánh', 'info');
        addLog(`📍 HCM: ${nhanVienHCM.length} nhân viên`, 'info');
        addLog(`📍 Hà Nội: ${nhanVienHaNoi.length} nhân viên`, 'info');
        
        if (nhanVienSkipped.length > 0) {
            addLog(`⚠️ CẢNH BÁO: Có ${nhanVienSkipped.length} nhân sự U1 bị loại bỏ:`, 'warning');
            nhanVienSkipped.forEach(s => {
                addLog(`   - ${s.name}: ${s.reason}`, 'warning');
            });
        }
        console.log(`📍 [Chia đơn vận đơn] Phân loại nhân viên theo chi nhánh:`);
        console.log(`  - HCM: ${nhanVienHCM.length} nhân viên`, nhanVienHCM.map(s => s.name));
        console.log(`  - Hà Nội: ${nhanVienHaNoi.length} nhân viên`, nhanVienHaNoi.map(s => s.name));

        if (nhanVienHCM.length === 0 && nhanVienHaNoi.length === 0) {
            addLog('❌ Không có nhân viên nào thuộc HCM hoặc Hà Nội', 'error');
            throw new Error('Không có nhân viên nào thuộc HCM hoặc Hà Nội. Vui lòng kiểm tra dữ liệu trong bảng danh_sach_van_don');
        }

        // Bước 3: Lấy TẤT CẢ đơn hàng từ DB (cần dùng cho cả lọc đơn mới và đếm đơn hiện tại)
        addLog('📋 Bước 3: Query đơn hàng từ database', 'info');
        addLog(`🔍 Đang query từ Supabase: bảng ${ordersTable}...`, 'info');
        console.log(`🔍 [Chia đơn vận đơn] Đang query từ Supabase: bảng ${ordersTable}...`);
        console.log(`📡 [Chia đơn vận đơn] Query: SELECT * FROM ${ordersTable}`);
        
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

        // BƯỚC 1: Lấy các đơn cần thiết từ database (có lọc để tối ưu)
        addLog('📋 Bước 3: Query đơn hàng (tối ưu: chỉ lấy đơn trong ngày hoặc chưa chia)...', 'info');
        console.log(`🔍 [Chia đơn vận đơn] Đang query đơn hàng từ Supabase (tối ưu)...`);
        
        const todayStr = yyyyMmDdVietNam();
        let allOrdersArray = [];
        try {
            // Chỉ lấy các cột cần thiết để giảm tải
            // Lọc: 
            // 1. Những đơn chưa có delivery_staff (để chia)
            // 2. HOẶC những đơn đã chia trong ngày hôm nay (để tính thu_tu_chia và carry-over)
            const queryBuilder = supabase
                .from(ordersTable)
                .select('order_code, team, delivery_staff, sale_staff, country, thu_tu_chia, ngay_chia_van_don')
                .or(`delivery_staff.is.null,delivery_staff.eq.,delivery_staff.ilike.null,delivery_staff.ilike.none,delivery_staff.ilike.empty,ngay_chia_van_don.eq.${todayStr}`);

            allOrdersArray = await queryAllOrders(queryBuilder);
            
            addLog(`✅ Đã lấy ${allOrdersArray.length} đơn cần thiết từ database`, 'success');
            console.log(`✅ [Chia đơn vận đơn] Đã lấy ${allOrdersArray.length} đơn từ Supabase (đã lọc bằng pagination)`);
        } catch (allOrdersError) {
            addLog(`❌ Lỗi query đơn hàng: ${allOrdersError.message}`, 'error');
            console.error('❌ [Chia đơn vận đơn] Lỗi query đơn hàng:', allOrdersError);
            throw allOrdersError;
        }

        // BƯỚC 2: Loại trừ đơn Nhật Bản
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

        // BƯỚC 3: Lọc đơn thực sự cần chia (delivery_staff trống)
        addLog('📋 Bước 5: Xác định danh sách đơn cần chia...', 'info');
        let ordersArray = [];
        const deliveryStaffStats = { null: 0, empty: 0, special: 0, assigned: 0 };
        
        ordersAfterJapanFilter.forEach(order => {
            const ds = order.delivery_staff;
            const dsStr = String(ds || '').trim().toUpperCase();
            
            if (!ds || dsStr === '' || dsStr === 'NULL' || dsStr === 'EMPTY' || dsStr === 'NONE') {
                ordersArray.push(order);
                if (!ds) deliveryStaffStats.null++;
                else if (dsStr === '') deliveryStaffStats.empty++;
                else deliveryStaffStats.special++;
            } else {
                deliveryStaffStats.assigned++;
            }
        });
        
        addLog(`📊 Đơn cần chia: ${ordersArray.length} (Trống/Null: ${deliveryStaffStats.null + deliveryStaffStats.empty}, Đặc biệt: ${deliveryStaffStats.special})`, 'info');
        addLog(`📊 Đơn đã có chủ trong ngày (phục vụ carry-over): ${deliveryStaffStats.assigned}`, 'info');

        // --- Bước bổ sung: Điền team cho đơn hàng trống ---
        addLog('📋 Bước 5.1: Điền team tự động cho đơn hàng chưa có team', 'info');
        const ordersNeedTeam = ordersArray.filter((o) => normalizeBranchKey(o.team) == null);

        if (ordersNeedTeam.length > 0) {
            console.log(`🔍 [Chia đơn vận đơn] Có ${ordersNeedTeam.length} đơn cần điền team. Đang tối ưu logic tra cứu...`);

            // 1. Lấy danh sách users để tra cứu branch (Map O(1))
            const { data: allUsers } = await supabase.from('users').select('name, branch');
            const nameToBranchMap = new Map();
            (allUsers || []).forEach(u => {
                if (u.name && u.branch) nameToBranchMap.set(u.name.trim(), u.branch.trim());
            });

            // 2. Tạo Map tra cứu team từ sale_staff và country dựa trên dữ liệu hiện có (Map O(1))
            // Thay vì dùng .filter() bên trong vòng lặp (O(N*M)), ta tạo Map trước (O(N))
            const saleStaffToTeamMap = new Map();
            const countryToTeamMap = new Map();

            allOrdersArray.forEach((o) => {
                const teamKey = normalizeBranchKey(o.team);
                const ss = o.sale_staff?.toString().trim();
                const ct = o.country?.toString().trim();

                if (teamKey) {
                    if (ss && !saleStaffToTeamMap.has(ss)) saleStaffToTeamMap.set(ss, teamKey);
                    if (ct && !countryToTeamMap.has(ct)) countryToTeamMap.set(ct, teamKey);
                }
            });

            const teamUpdates = [];
            let foundCount = 0;
            
            ordersNeedTeam.forEach(order => {
                let foundTeam = null;
                const saleStaffName = order.sale_staff?.toString().trim();
                const countryName = order.country?.toString().trim();
                
                // Ưu tiên 1: Tra từ bảng users
                if (saleStaffName && nameToBranchMap.has(saleStaffName)) {
                    foundTeam = nameToBranchMap.get(saleStaffName);
                } 
                // Ưu tiên 2: Tra từ sale_staff trong các đơn khác (dùng Map)
                else if (saleStaffName && saleStaffToTeamMap.has(saleStaffName)) {
                    foundTeam = saleStaffToTeamMap.get(saleStaffName);
                }
                // Ưu tiên 3: Tra từ country (dùng Map)
                else if (countryName && countryToTeamMap.has(countryName)) {
                    foundTeam = countryToTeamMap.get(countryName);
                }

                if (foundTeam) {
                    const teamValue = normalizeBranchKey(foundTeam);
                    if (!teamValue) return; // Không hợp lệ

                    teamUpdates.push({ order_code: order.order_code, team: teamValue });
                    order.team = teamValue;
                    foundCount++;
                }
            });
            
            addLog(`📊 Tự động tìm được team cho ${foundCount}/${ordersNeedTeam.length} đơn`, 'info');

            if (teamUpdates.length > 0) {
                const CHUNK_SIZE = 50;
                for (let i = 0; i < teamUpdates.length; i += CHUNK_SIZE) {
                    const chunk = teamUpdates.slice(i, i + CHUNK_SIZE);
                    await Promise.all(chunk.map(u =>
                        supabase.from(ordersTable).update({ team: u.team }).eq('order_code', u.order_code)
                    ));
                }
                addLog(`✅ Đã cập nhật team cho ${teamUpdates.length} đơn thành công`, 'success');
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

            // Debug: Log một vài đơn đầu tiên để kiểm tra
            if (index < 10) {
                console.log(`  [Đơn ${index + 1}] order_code: ${order.order_code}, team: "${teamRaw}" (normalized: "${team}"), delivery_staff: "${order.delivery_staff || '(null)'}", sale_staff: "${order.sale_staff || '(null)'}"`);
            }

            // KHÔNG cần kiểm tra Nhật Bản nữa vì đã loại trừ ở bước trước

            const teamKey = normalizeBranchKey(teamRaw);
            
            // Debug log để kiểm tra
            if (index < 5) {
                console.log(
                    `  🔍 [Đơn ${index + 1}] order_code=${order.order_code}, team="${teamRaw}" (normalized="${team}") -> key=${teamKey || '(null)'}`
                );
            }

            if (teamKey === 'HCM') {
                ordersHCM.push(order);
            } else if (teamKey === 'Hà Nội') {
                ordersHaNoi.push(order);
            } else {
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
        // Bước 4: CHIA ĐƠN THEO VÒNG (U1) + RULE LOẠI TRỪ NHẬT BẢN
        //
        // RULE LOẠI TRỪ: Đơn Nhật Bản (đã xử lý ở bước trước).
        //
        // Rule 1: Trong ngày hiện tại, lấy đơn có thu_tu_chia lớn nhất → người đó là “cuối vòng”; bắt đầu chia kế tiếp.
        // Rule 2: Danh sách nhân viên U1 (theo chi nhánh khớp team đơn).
        // Rule 3: Round-robin — bắt đầu từ người kế sau người có STT chia cao nhất trong ngày.
        // STT ghi DB: thu_tu_chia toàn cục trong ngày (bước 8).
        // ============================================================

        // Helper: Hàm chia đơn thông minh cho 1 chi nhánh
        // staffListWithBranch: array of {name, chi_nhanh}
        // pendingOrders: đơn cần chia (đã được lọc theo team)
        // allDBOrders: tất cả đơn trong DB (để đếm đơn hiện tại)
        // branchName: tên chi nhánh (HCM hoặc Hà Nội)
        // notDividedOrdersRef: tham chiếu đến mảng đơn không chia được
        const smartDistribute = (staffListWithBranch, pendingOrders, allDBOrders, branchName, notDividedOrdersRef) => {
            console.log(`\n🔍 [${branchName}] smartDistribute được gọi với:`);
            console.log(`  - Số nhân viên: ${staffListWithBranch.length}`);
            console.log(`  - Số đơn cần chia: ${pendingOrders.length}`);
            console.log(`  - Số đơn trong DB để đếm: ${allDBOrders.length}`);
            
            if (staffListWithBranch.length === 0) {
                console.warn(`⚠️ [${branchName}] Không có nhân viên để chia đơn!`);
                return { result: [], publicStats: [], lastPerson: '', carryTransparency: null };
            }
            if (pendingOrders.length === 0) {
                console.warn(`⚠️ [${branchName}] Không có đơn nào cần chia!`);
                return { result: [], publicStats: [], lastPerson: '', carryTransparency: null };
            }

            // Dùng chung normalizeBranchKey ở scope ngoài để tránh mismatch staff/team.
            const isTeamBranchMatch = (orderTeamRaw, staffChiNhanhRaw) => {
                const ok = normalizeBranchKey(orderTeamRaw) === normalizeBranchKey(staffChiNhanhRaw);
                if (orderTeamRaw && staffChiNhanhRaw) {
                    console.log(
                        `  🔍 [isTeamBranchMatch] orderTeam="${orderTeamRaw}" -> ${normalizeBranchKey(orderTeamRaw) || '(null)'}; ` +
                            `staff="${staffChiNhanhRaw}" -> ${normalizeBranchKey(staffChiNhanhRaw) || '(null)'}; result=${ok}`
                    );
                }
                return ok;
            };

            // Kiểm tra đơn đặc biệt
            const targetOrderInPending = pendingOrders.find(o => o.order_code === 'DEBUG_ORDER_IF_NEEDED');
            if (targetOrderInPending) {
                console.log(`\n✅ [KIỂM TRA ĐƠN DEBUG] Đơn có trong pendingOrders cho ${branchName}`);
                console.log(`  - Đơn có trong pendingOrders cho ${branchName}`);
                console.log(`  - team: "${targetOrderInPending.team}"`);
                console.log(`  - Số nhân viên: ${staffListWithBranch.length}`);
            }

            const result = [];
            const staffList = staffListWithBranch.map((s) => String(s.name || '').trim());
            const staffSet = new Set(staffList);
            /** Thứ tự nhân viên U1 không đổi trong phiên — dùng giải thích lượt kế tiếp; `staffListWithBranch` sẽ bị xoay khi chia. */
            const initialStaffFixedOrder = [...staffList];

            // --- Rule: Tìm người nhận đơn cuối cùng trong lịch sử để tiếp tục vòng (Carry-over) ---
            console.log(`\n🔍 [${branchName}] ========== BẮT ĐẦU PHÂN TÍCH CHIA ĐƠN (CARRY-OVER) ==========`);
            console.log(`👥 Danh sách nhân viên U1: [${staffList.join(', ')}]`);

            // Tìm đơn hàng được chia gần đây nhất trên TOÀN BỘ hệ thống để xác định người cuối vòng
            const globalLastAssigned = allDBOrders
                .filter((o) => {
                    const ds = o.delivery_staff?.toString().trim();
                    return ds && staffSet.has(ds);
                })
                .sort((a, b) => {
                    // Sắp xếp theo ngày chia (giảm dần)
                    const dateA = a.ngay_chia_van_don ? new Date(a.ngay_chia_van_don) : new Date(0);
                    const dateB = b.ngay_chia_van_don ? new Date(b.ngay_chia_van_don) : new Date(0);
                    if (dateB.getTime() !== dateA.getTime()) return dateB.getTime() - dateA.getTime();
                    
                    // Nếu cùng ngày, xếp theo thứ tự chia (giảm dần)
                    const sttA = Number(a.thu_tu_chia) || 0;
                    const sttB = Number(b.thu_tu_chia) || 0;
                    if (sttB !== sttA) return sttB - sttA;
                    
                    // Fallback cuối cùng theo ID
                    return (Number(b.id) || 0) - (Number(a.id) || 0);
                });

            let lastAssignedPerson = null;
            if (globalLastAssigned.length > 0) {
                lastAssignedPerson = globalLastAssigned[0].delivery_staff?.toString().trim() || null;
                console.log(`🔍 [${branchName}] Người nhận đơn cuối cùng gần nhất: "${lastAssignedPerson}" (Ngày: ${globalLastAssigned[0].ngay_chia_van_don}, STT: ${globalLastAssigned[0].thu_tu_chia})`);
            } else {
                console.log(`🔍 [${branchName}] Chưa có lịch sử chia đơn trước đó. Sẽ bắt đầu từ người đầu tiên.`);
            }

            // Đếm số đơn đã chia trong ngày hôm nay (giờ VN) để minh bạch báo cáo (không dùng để phân bổ quota)
            const todayStrVn = yyyyMmDdVietNam();
            const todayOrderCountByStaff = {};
            staffList.forEach((name) => {
                todayOrderCountByStaff[name] = 0;
            });

            allDBOrders.forEach((o) => {
                const ds = o.delivery_staff?.toString().trim();
                const ngay = o.ngay_chia_van_don?.toString().slice(0, 10);
                if (ds && staffSet.has(ds) && ngay === todayStrVn) {
                    todayOrderCountByStaff[ds] += 1;
                }
            });
            console.log(`📊 [${branchName}] Tải nền (đơn đã nhận trong ngày VN ${todayStrVn}):`, todayOrderCountByStaff);

            const lastAssignedIndex = lastAssignedPerson ? staffList.indexOf(lastAssignedPerson) : -1;
            const startIndex = lastAssignedIndex >= 0 ? (lastAssignedIndex + 1) % staffListWithBranch.length : 0;
            
            const remainingOrders = [...pendingOrders].sort((a, b) => {
                const ta = a.order_date ? new Date(a.order_date).getTime() : 0;
                const tb = b.order_date ? new Date(b.order_date).getTime() : 0;
                if (ta !== tb) return ta - tb;
                return String(a.order_code || '').localeCompare(String(b.order_code || ''));
            });

            const RULE_TRANSPARENCY_SHORT =
                'Quota theo phiên (trong chi nhánh): mỗi NV U1 nhận q hoặc q+1 đơn (chênh tối đa 1) nếu đủ điều kiện eligible. Nếu có đơn chỉ có ít người nhận được (eligible lệch), hệ thống sẽ phá quota tối thiểu và log cảnh báo.';

            /** Người đứng đầu hàng lúc bắt đầu phiên (trước khi splice xoay hàng). */
            let queueHeadAtSessionStart = null;
            
            console.log(`\n🔄 [${branchName}] ========== CHUẨN BỊ CHIA ĐƠN ROUND-ROBIN ==========`);
            console.log(`👥 Danh sách nhân viên U1: [${staffList.join(', ')}]`);
            console.log(`📍 Người cuối vòng: "${lastAssignedPerson || '(không có)'}" (index: ${lastAssignedIndex})`);
            console.log(`🎯 Bắt đầu chia từ index: ${startIndex} → "${staffListWithBranch[startIndex]?.name}"`);
            console.log(`📦 Số đơn cần chia: ${remainingOrders.length}`);
            console.log(`${'='.repeat(60)}\n`);

            if (remainingOrders.length > 0) {
                queueHeadAtSessionStart =
                    staffListWithBranch[startIndex]?.name != null
                        ? String(staffListWithBranch[startIndex].name).trim()
                        : null;

                // ============================================================
                // THỐNG KÊ ELIGIBLE STAFF PER ORDER/TEAM (debug lệch do dữ liệu)
                // - eligible=0: đơn chắc chắn không chia được (mismatch team/chi nhánh)
                // - eligible=1: đơn dễ gây "lệch" vì chỉ có 1 người nhận được
                // ============================================================
                const eligibleCountHistogram = {};
                const eligibleByTeamStats = {};
                const eligibleProblems = []; // { order_code, team, eligibleCount, eligibleStaff }

                const normalizeTeamLabel = (raw) => {
                    const t = String(raw || '').trim();
                    const low = t.toLowerCase();
                    if (!t) return '(null/empty)';
                    if (low.includes('hcm') || low.includes('hồ chí minh') || low.includes('ho chi minh')) return 'HCM';
                    if (low.includes('hà nội') || low.includes('hanoi') || low.includes('ha noi') || low === 'hn') return 'Hà Nội';
                    return t;
                };

                remainingOrders.forEach((order) => {
                    const orderTeam = order.team?.toString().trim() || '';
                    const teamLabel = normalizeTeamLabel(orderTeam);

                    const eligibleStaff = [];
                    // Duyệt theo đúng thứ tự vòng để log/tie-break nhất quán
                    for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
                        const idx = (startIndex + attempt) % staffListWithBranch.length;
                        const staff = staffListWithBranch[idx];
                        const isMatch = isTeamBranchMatch(orderTeam, staff.chi_nhanh?.toString().trim() || '');
                        if (isMatch) eligibleStaff.push(String(staff.name || '').trim());
                    }

                    const c = eligibleStaff.length;
                    eligibleCountHistogram[c] = (eligibleCountHistogram[c] || 0) + 1;

                    if (!eligibleByTeamStats[teamLabel]) {
                        eligibleByTeamStats[teamLabel] = { totalOrders: 0, eligible0: 0, eligible1: 0, eligibleMany: 0 };
                    }
                    eligibleByTeamStats[teamLabel].totalOrders += 1;
                    if (c === 0) eligibleByTeamStats[teamLabel].eligible0 += 1;
                    else if (c === 1) eligibleByTeamStats[teamLabel].eligible1 += 1;
                    else eligibleByTeamStats[teamLabel].eligibleMany += 1;

                    if (c <= 1) {
                        eligibleProblems.push({
                            order_code: order.order_code,
                            team: orderTeam || '(null/empty)',
                            teamLabel,
                            eligibleCount: c,
                            eligibleStaff,
                        });
                    }
                });

                console.log(`\n📊 [${branchName}] ========== THỐNG KÊ ELIGIBLE STAFF (THEO ĐƠN/TEAM) ==========`);                
                console.log(`👥 Số nhân viên U1 đang dùng: ${staffListWithBranch.length}`);
                console.log(`📦 Số đơn cần chia: ${remainingOrders.length}`);
                console.log(`📈 Histogram eligibleCount (số NV match / 1 đơn):`, eligibleCountHistogram);
                console.log(`📍 Theo team:`, eligibleByTeamStats);

                const showLimit = 30;
                const problems0 = eligibleProblems.filter((x) => x.eligibleCount === 0);
                const problems1 = eligibleProblems.filter((x) => x.eligibleCount === 1);
                if (problems0.length > 0) {
                    console.warn(`\n❌ [${branchName}] Đơn eligible=0 (KHÔNG chia được): ${problems0.length} đơn. Hiển thị ${Math.min(showLimit, problems0.length)} đơn đầu.`);
                    console.table(
                        problems0.slice(0, showLimit).map((x) => ({
                            order_code: x.order_code,
                            team: x.team,
                            teamLabel: x.teamLabel,
                            eligibleCount: x.eligibleCount,
                            eligibleStaff: x.eligibleStaff.join(', '),
                        }))
                    );
                }
                if (problems1.length > 0) {
                    console.warn(`\n⚠️ [${branchName}] Đơn eligible=1 (dễ gây lệch): ${problems1.length} đơn. Hiển thị ${Math.min(showLimit, problems1.length)} đơn đầu.`);
                    console.table(
                        problems1.slice(0, showLimit).map((x) => ({
                            order_code: x.order_code,
                            team: x.team,
                            teamLabel: x.teamLabel,
                            eligibleCount: x.eligibleCount,
                            eligibleStaff: x.eligibleStaff.join(', '),
                        }))
                    );
                }
                console.log(`${'='.repeat(60)}\n`);

                // ============================================================
                // QUOTA THEO PHIÊN + VÒNG (TRONG CHI NHÁNH):
                // - N đơn, M NV ⇒ q=floor(N/M), r=N%M
                // - r người đầu tiên theo thứ tự vòng (startIndex) được cap=q+1, còn lại cap=q
                // - Với mỗi đơn: chọn người eligible còn cap; nếu không khả thi thì phá quota tối thiểu
                // ============================================================
                let nextIndex = startIndex;

                console.log(
                    `🔄 [${branchName}] Bắt đầu chia theo "quota theo phiên + vòng" từ index ${startIndex} ("${staffListWithBranch[startIndex]?.name}")`
                );

                // Quota phải tính theo số đơn "có thể chia" (eligible>0).
                // Nếu tính theo tổng remainingOrders (bao gồm eligible=0) thì cap sẽ lệch và có thể tạo diff > 1 dù bài toán feasible.
                const effectiveOrders = [];
                let preNotDivided = 0;
                remainingOrders.forEach((order) => {
                    let orderTeam = order.team?.toString().trim() || '';
                    if (!orderTeam) {
                        if (branchName === 'HCM') orderTeam = 'HCM';
                        else if (branchName === 'Hà Nội') orderTeam = 'Hà Nội';
                    }
                    let eligibleCount = 0;
                    for (const staff of staffListWithBranch) {
                        if (isTeamBranchMatch(orderTeam, staff.chi_nhanh?.toString().trim() || '')) eligibleCount += 1;
                    }
                    if (eligibleCount > 0) {
                        effectiveOrders.push(order);
                    } else {
                        preNotDivided += 1;
                        if (notDividedOrdersRef) {
                            notDividedOrdersRef.push({
                                ...order,
                                reason: `Không có NV U1 khớp team="${orderTeam || '(trống)'}"`,
                            });
                        }
                    }
                });

                if (preNotDivided > 0) {
                    console.warn(
                        `⚠️ [${branchName}] Có ${preNotDivided} đơn eligible=0 → loại khỏi quota (không chia được).`
                    );
                }

                const N = effectiveOrders.length;
                const M = staffListWithBranch.length;
                const q = M > 0 ? Math.floor(N / M) : 0;
                const r = M > 0 ? N % M : 0;

                // Thứ tự vòng tại đầu phiên (để phân r suất q+1)
                const rosterAtStart = staffListWithBranch.map((s) => String(s?.name || '').trim());
                const rotatedRoster = [];
                for (let i = 0; i < rosterAtStart.length; i++) {
                    rotatedRoster.push(rosterAtStart[(startIndex + i) % rosterAtStart.length]);
                }

                const capByStaff = {};
                rotatedRoster.forEach((name, idx) => {
                    capByStaff[name] = q + (idx < r ? 1 : 0);
                });

                // Đếm trong phiên để thống kê và phá quota tối thiểu khi không khả thi
                const sessionAssignedByStaff = {};
                staffList.forEach((name) => {
                    sessionAssignedByStaff[name] = 0;
                });
                const overflowByStaff = {};
                staffList.forEach((name) => {
                    overflowByStaff[name] = 0;
                });
                let quotaBrokenCount = 0;

                effectiveOrders.forEach((order, orderIdx) => {
                    let orderTeam = order.team?.toString().trim() || '';
                    
                    // Nếu đơn không có team, thử gán team mặc định dựa trên branchName
                    if (!orderTeam) {
                        if (branchName === 'HCM') {
                            orderTeam = 'HCM';
                            console.log(`  🔍 [${branchName}] Đơn ${order.order_code} không có team, gán mặc định team="HCM"`);
                        } else if (branchName === 'Hà Nội') {
                            orderTeam = 'Hà Nội';
                            console.log(`  🔍 [${branchName}] Đơn ${order.order_code} không có team, gán mặc định team="Hà Nội"`);
                        }
                    }

                    // Lọc nhân viên phù hợp chi nhánh/team
                    const eligible = [];
                    const eligibleDebug = [];
                    for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
                        const idx = (nextIndex + attempt) % staffListWithBranch.length;
                        const staff = staffListWithBranch[idx];
                        const isMatch = isTeamBranchMatch(orderTeam, staff.chi_nhanh?.toString().trim() || '');
                        eligibleDebug.push({ idx, name: staff.name, isMatch });
                        if (isMatch) {
                            eligible.push({ idx, staff });
                        }
                    }
                    
                    // Debug: log danh sách eligible
                    console.log(`  🔍 [${branchName}] Đơn ${orderIdx + 1}: eligibleDebug=`, eligibleDebug.map(e => `${e.name}:${e.isMatch}`).join(', '));
                    console.log(`  🔍 [${branchName}] Đơn ${orderIdx + 1}: eligible=`, eligible.map(e => e.staff.name).join(', '));

                    // eligible=0 đã được loại khỏi effectiveOrders ở bước pre-pass

                    // Chụp lại trạng thái hàng đợi hiện tại trước khi chia đơn này
                    const queueBefore = staffListWithBranch.map(s => String(s.name || '').trim());

                    // Ưu tiên chọn người eligible còn quota (cap>0), theo đúng thứ tự vòng (eligible đã theo nextIndex)
                    let chosen = eligible.find((cand) => {
                        const name = String(cand.staff?.name || '').trim();
                        return (capByStaff[name] || 0) > 0;
                    });

                    // Nếu không còn ai eligible có cap ⇒ quota không khả thi cho đơn này (do eligibility lệch)
                    if (!chosen) {
                        quotaBrokenCount += 1;
                        // Phá quota tối thiểu: chọn người có overflow nhỏ nhất; hoà thì theo thứ tự vòng
                        let best = null;
                        let bestOv = Infinity;
                        eligible.forEach((cand) => {
                            const name = String(cand.staff?.name || '').trim();
                            const ov = overflowByStaff[name] || 0;
                            if (ov < bestOv) {
                                bestOv = ov;
                                best = cand;
                            }
                        });
                        chosen = best || eligible[0];
                    }
                    const chosenName = String(chosen.staff.name || '').trim();
                    const chosenChiNhanh = chosen.staff.chi_nhanh || '';

                    // Lưu chi tiết để hiển thị công khai
                    const eligibleNames = eligible.map(e => e.staff.name).join(', ');
                    
                    result.push({
                        order_code: order.order_code,
                        delivery_staff: chosenName,
                        // Thông tin để giải thích tại sao chia như vậy
                        order_team: orderTeam,
                        staff_chi_nhanh: chosenChiNhanh,
                        eligible_staff: eligibleNames,
                        queue_before: queueBefore, // Thêm trạng thái hàng đợi vào lịch sử
                        reason:
                            (capByStaff[chosenName] || 0) > 0
                                ? `Quota phiên: còn suất (cap) → chọn theo vòng (eligible=${eligible.length}: ${eligibleNames})`
                                : `Quota KHÔNG khả thi (eligible lệch) → phá quota tối thiểu (eligible=${eligible.length}: ${eligibleNames})`,
                    });

                    // Log cho debugging
                    console.log(
                        `  [Đơn ${orderIdx + 1}/${remainingOrders.length}] ${order.order_code}: ` +
                        `team="${orderTeam}" -> ✅ ${chosenName} (cap=${capByStaff[chosenName] || 0}; assigned=${sessionAssignedByStaff[chosenName] || 0}; eligible=${eligible.length}: ${eligibleNames})`
                    );

                    if ((capByStaff[chosenName] || 0) > 0) capByStaff[chosenName] -= 1;
                    else overflowByStaff[chosenName] = (overflowByStaff[chosenName] || 0) + 1;
                    sessionAssignedByStaff[chosenName] = (sessionAssignedByStaff[chosenName] || 0) + 1;

                    // Sau khi nhận đơn, xuống cuối hàng (xoay vòng)
                    // Di chuyển người vừa chọn xuống cuối danh sách
                    const staffItem = staffListWithBranch.splice(chosen.idx, 1)[0];
                    staffListWithBranch.push(staffItem);
                    
                    // Cập nhật nextIndex để tiếp tục từ vị trí tiếp theo
                    // Nếu chosen.idx >= staffListWithBranch.length (sau khi splice), 
                    // thì bắt đầu từ đầu danh sách
                    nextIndex = chosen.idx % staffListWithBranch.length;
                    
                    // Debug: log trạng thái hàng đợi sau khi xoay
                    console.log(`  🔄 [${branchName}] Sau khi xoay: ${staffListWithBranch.map(s => s.name).join(' → ')}`);
                    console.log(`  🔄 [${branchName}] nextIndex mới: ${nextIndex} (${staffListWithBranch[nextIndex]?.name})`);
                });
                if (quotaBrokenCount > 0) {
                    console.warn(
                        `⚠️ [${branchName}] Quota bị phá ở ${quotaBrokenCount} đơn do eligibility lệch (eligible=0/1 hoặc mismatch team/chi_nhanh).`
                    );
                }
                console.log(`\n✅ [${branchName}] Đã chia ${result.length}/${N} đơn theo quota phiên + vòng`);
            }

            const lastPerson =
                result.length > 0
                    ? String(result[result.length - 1].delivery_staff || '').trim()
                    : '';
            const ixLast =
                lastPerson !== '' ? initialStaffFixedOrder.indexOf(lastPerson) : -1;
            const suggestedNextOpening =
                ixLast >= 0 && initialStaffFixedOrder.length > 0
                    ? String(
                          initialStaffFixedOrder[
                              (ixLast + 1) % initialStaffFixedOrder.length
                          ] || ''
                      ).trim() || null
                    : queueHeadAtSessionStart;

            const carryTransparency = {
                branchName,
                lastAssignedBeforeSession: lastAssignedPerson,
                queueHeadAtSessionStart,
                fixedRosterOrder: initialStaffFixedOrder,
                lastAssignedThisSession: lastPerson || null,
                suggestedNextOpening:
                    suggestedNextOpening ||
                    queueHeadAtSessionStart ||
                    null,
                ruleShort: RULE_TRANSPARENCY_SHORT,
            };

            // Log tổng kết chi tiết (CÔNG KHAI để nhân viên thấy)
            const finalCount = {};
            staffList.forEach(name => { finalCount[name] = 0; });
            result.forEach(u => { finalCount[u.delivery_staff]++; });
            
            console.log(`\n📊 [${branchName}] ========== KẾT QUẢ CHIA ĐƠN (CÔNG KHAI) ==========`);
            console.log(`✅ Tổng số đơn đã chia: ${result.length}/${pendingOrders.length}`);
            console.log(`📋 PHÂN BỔ CHO TỪNG NHÂN VIÊN (trong lần chia này):`);
            staffList.forEach((name, idx) => {
                const count = finalCount[name] || 0;
                console.log(`  ${idx + 1}. ${name}: +${count} đơn`);
            });
            console.log(`${'='.repeat(60)}\n`);
            
            // Trả về thêm thông tin để hiển thị công khai
            const publicStats = staffList.map(name => ({
                name,
                count: finalCount[name] || 0
            }));
            
            if (result.length === 0 && pendingOrders.length > 0) {
                console.warn(`⚠️ [${branchName}] CẢNH BÁO: Có ${pendingOrders.length} đơn cần chia nhưng không chia được!`);
                console.warn(`  - Có thể do không khớp chi_nhanh giữa đơn và nhân viên`);
                console.warn(`  - Sample đơn đầu tiên:`, pendingOrders[0] ? {
                    order_code: pendingOrders[0].order_code,
                    team: pendingOrders[0].team,
                    staff_chi_nhanh: staffListWithBranch.map(s => s.chi_nhanh)
                } : 'N/A');
            }

            return {
                result,
                publicStats,
                lastPerson,
                carryTransparency,
            };
        };

        // Bước 5: Thực hiện chia đơn
        const updates = [];
        let hcmPublicStats = [];
        let hanoiPublicStats = [];
        let hcmDetailedResults = []; // Chi tiết từng đơn cho HCM
        let hanoiDetailedResults = []; // Chi tiết từng đơn cho Hà Nội
        let hcmLastPerson = ''; // Người cuối được chia ở HCM
        let hanoiLastPerson = ''; // Người cuối được chia ở Hà Nội
        let hcmCarry = null; // Minh bạch carry-over / lượt kế tiếp (HCM)
        let hanoiCarry = null; // Minh bạch (Hà Nội)
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // Lọc allDBOrders theo team cho mỗi chi nhánh (dùng để đếm đơn hiện tại)
        const allDBOrdersHCM = allOrdersArray.filter((o) => normalizeBranchKey(o.team) === 'HCM');
        const allDBOrdersHaNoi = allOrdersArray.filter((o) => normalizeBranchKey(o.team) === 'Hà Nội');

        // Chia đơn HCM
        addLog('📋 Bước 7: Chia đơn round-robin đơn giản (ai xong xuống cuối, không cân bằng tải)', 'info');
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
                const {
                    result: hcmResult,
                    publicStats: hcmStats,
                    lastPerson: hcmLast,
                    carryTransparency: hCmTrans,
                } = smartDistribute(nhanVienHCM, ordersHCM, allDBOrdersHCM, 'HCM', allNotDividedOrders);
                hcmCarry = hCmTrans;
                addLog(
                    `[HCM] Minh bạch — Trước phiên (đơn gần nhất): ${hCmTrans.lastAssignedBeforeSession || '—'} | Bắt đầu từ: ${hCmTrans.queueHeadAtSessionStart || '—'} | Sau phiên: ${hCmTrans.lastAssignedThisSession || '—'} | Gợi ý lượt mở: ${hCmTrans.suggestedNextOpening || '—'}`,
                    'info'
                );
                addLog(`✅ HCM - Kết quả: ${hcmResult.length} đơn được chia`, 'success');
                console.log(`✅ [Chia đơn vận đơn] HCM - Kết quả: ${hcmResult.length} đơn được chia`);
                if (hcmResult.length > 0) {
                    console.log(`📋 [Chia đơn vận đơn] HCM - Chi tiết đơn được chia:`);
                    hcmResult.forEach((u, idx) => {
                        console.log(`  ${idx + 1}. ${u.order_code} -> ${u.delivery_staff} (Lý do: ${u.reason})`);
                    });
                }
                // Lọc chỉ lấy order_code và delivery_staff để update
                const hcmUpdates = hcmResult.map(u => ({ order_code: u.order_code, delivery_staff: u.delivery_staff }));
                updates.push(...hcmUpdates);
                hcmPublicStats = hcmStats;
                hcmDetailedResults = hcmResult;
                hcmLastPerson = hcmLast;
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
        
        if (ordersHaNoi.length > 0 && ordersHaNoi.length <= 10) {
            ordersHaNoi.forEach((o, idx) => {
                console.log(`  ${idx + 1}. ${o.order_code}: team="${o.team || '(null)'}"`);
            });
        }
        
        if (nhanVienHaNoi.length > 0 && ordersHaNoi.length > 0) {
            const {
                result: hanoiResult,
                publicStats: hanoiStats,
                lastPerson: hanoiLast,
                carryTransparency: hnTrans,
            } = smartDistribute(nhanVienHaNoi, ordersHaNoi, allDBOrdersHaNoi, 'Hà Nội', allNotDividedOrders);
            hanoiCarry = hnTrans;
            addLog(
                `[HN] Minh bạch — Trước phiên (đơn gần nhất): ${hnTrans.lastAssignedBeforeSession || '—'} | Bắt đầu từ: ${hnTrans.queueHeadAtSessionStart || '—'} | Sau phiên: ${hnTrans.lastAssignedThisSession || '—'} | Gợi ý lượt mở: ${hnTrans.suggestedNextOpening || '—'}`,
                'info'
            );
            addLog(`✅ Hà Nội - Kết quả: ${hanoiResult.length} đơn được chia`, 'success');
            console.log(`✅ [Chia đơn vận đơn] Hà Nội - Kết quả: ${hanoiResult.length} đơn được chia`);
            
            if (hanoiResult.length > 0) {
                console.log(`📋 [Chia đơn vận đơn] Hà Nội - Chi tiết đơn được chia:`);
                hanoiResult.forEach((u, idx) => {
                    console.log(`  ${idx + 1}. ${u.order_code} -> ${u.delivery_staff} (Lý do: ${u.reason})`);
                });
            }
            // Lọc chỉ lấy order_code và delivery_staff để update
            const hanoiUpdates = hanoiResult.map(u => ({ order_code: u.order_code, delivery_staff: u.delivery_staff }));
            updates.push(...hanoiUpdates);
            hanoiPublicStats = hanoiStats;
            hanoiDetailedResults = hanoiResult;
            hanoiLastPerson = hanoiLast;
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

        // Bước 8: Cập nhật database
        if (updates.length > 0) {
            const chiTietByOrderCode = new Map();
            for (const r of hcmDetailedResults || []) {
                const code = String(r?.order_code ?? '').trim();
                if (code) chiTietByOrderCode.set(code, { ...r, branch: 'HCM' });
            }
            for (const r of hanoiDetailedResults || []) {
                const code = String(r?.order_code ?? '').trim();
                if (code) chiTietByOrderCode.set(code, { ...r, branch: 'Hà Nội' });
            }

            // Ngày chia (VN) — dùng chung ngay_chia_van_don, thu_tu_chia trong ngày, và số vòng trong ngày.
            const todayStr = yyyyMmDdVietNam();

            const dateViDdMm = yyyyMmDdToDdMmYy(todayStr);
            const [vNextHcm, vNextHanoi] = await Promise.all([
                getNextVongChiaThuTrongNgay(supabase, 'HCM', todayStr),
                getNextVongChiaThuTrongNgay(supabase, 'Hà Nội', todayStr),
            ]);

            const makeTenVong = (branchLabel) => {
                const b =
                    branchLabel ||
                    (branchFilter === 'HCM' ? 'HCM' : branchFilter === 'Hà Nội' ? 'Hà Nội' : null);
                let vDay =
                    b === 'HCM'
                        ? vNextHcm
                        : b === 'Hà Nội'
                          ? vNextHanoi
                          : Math.max(vNextHcm || 1, vNextHanoi || 1);
                if (!Number.isFinite(vDay) || vDay < 1) vDay = 1;
                return `Vòng ${vDay}`;
            };

            addLog(
                `📌 Vòng trong ngày ${dateViDdMm}: HCM=Vòng ${vNextHcm} · Hà Nội=Vòng ${vNextHanoi} · Phiên chia này: ${branchFilter || '(mặc định)'}`,
                'info'
            );

            // TÌM THỨ TỰ CHIA LỚN NHẤT TRONG NGÀY TỪ DỮ LIỆU ĐÃ CÓ (Tối ưu: không query lại)
            let globalOrderIndex = 0;
            allOrdersArray.forEach((row) => {
                if (row.ngay_chia_van_don === todayStr) {
                    const idx = Number(row.thu_tu_chia) || 0;
                    if (idx > globalOrderIndex) globalOrderIndex = idx;
                }
            });

            addLog(`📋 Bước 8: Cập nhật database cho ${updates.length} đơn hàng`, 'info');
            addLog(`🔄 Bắt đầu cập nhật ${updates.length} đơn hàng (Vòng ${vNextHcm}/${vNextHanoi})...`, 'info');
            
            const CHUNK_SIZE = 20; // Giảm xuống 20 để an toàn hơn cho network
            successCount = 0;
            errorCount = 0;
            errors.length = 0;

            for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
                const chunk = updates.slice(i, i + CHUNK_SIZE);
                const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
                const totalChunks = Math.ceil(updates.length / CHUNK_SIZE);
                
                // Chuẩn bị dữ liệu cập nhật cho cả chunk
                const updatePromises = chunk.map(async (update) => {
                    try {
                        globalOrderIndex += 1;
                        const nextOrderIndex = globalOrderIndex;
                        const detail = chiTietByOrderCode.get(String(update.order_code || '').trim());
                        
                        const chi_tiet_chia = {
                            ten_vong: makeTenVong(detail?.branch || (branchFilter === 'HCM' || branchFilter === 'Hà Nội' ? branchFilter : null)),
                            thu_tu_chia: nextOrderIndex,
                            ngay_chia_van_don: todayStr,
                            staff_chi_nhanh: detail?.staff_chi_nhanh,
                            eligible_staff: detail?.eligible_staff,
                            queue_before: detail?.queue_before,
                            reason: detail?.reason,
                        };

                        // Tối ưu: KHÔNG dùng .select() để tăng tốc độ ghi
                        const { error } = await supabase
                            .from(ordersTable)
                            .update({
                                delivery_staff: update.delivery_staff,
                                ngay_chia_van_don: todayStr,
                                thu_tu_chia: nextOrderIndex,
                                chi_tiet_chia,
                            })
                            .eq('order_code', update.order_code);

                        if (error) {
                            console.error(`❌ Lỗi update đơn ${update.order_code}:`, error);
                            errors.push({ order_code: update.order_code, error: error.message });
                            errorCount++;
                            return { success: false };
                        }

                        successCount++;
                        return { success: true };
                    } catch (err) {
                        console.error(`❌ Exception update đơn ${update.order_code}:`, err);
                        errorCount++;
                        return { success: false };
                    }
                });

                // Sử dụng allSettled để đảm bảo không bị kẹt nếu 1 request treo
                await Promise.allSettled(updatePromises);
                addLog(`📦 Chunk ${chunkNum}/${totalChunks} hoàn tất`, 'info');
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
        
        // Tạo thông tin công khai cho nhân viên
        let publicStatsText = '';
        
        // Header Báo cáo Phân bổ Đơn hàng
        publicStatsText += '\n╔═══════════════════════════════════════════════════╗\n';
        publicStatsText += '║       📊 BÁO CÁO PHÂN BỔ ĐƠN HÀNG              ║\n';
        publicStatsText += '╠═══════════════════════════════════════════════════╣\n';
        
        // Danh sách U1 được chia theo từng phiên
        publicStatsText += '\n📌 DANH SÁCH NHÂN VIÊN U1 ĐƯỢC CHIA:\n';
        
        // Phiên HCM
        if (nhanVienHCM.length > 0) {
            publicStatsText += '────────────────────────────────────────────\n';
            publicStatsText += `🏭 PHIÊN HCM (${nhanVienHCM.length} NV):\n`;
            publicStatsText += '   ';
            publicStatsText += nhanVienHCM.map(nv => nv.name).join(', ');
            if (hcmCarry) {
                publicStatsText +=
                    `\n   ➤ Trước phiên — đơn gần nhất giao: ${hcmCarry.lastAssignedBeforeSession || '(chưa có)'}`;
                publicStatsText += `\n   ➤ Phiên này — bắt đầu luân phiên từ: ${hcmCarry.queueHeadAtSessionStart || '—'}`;
                if (hcmLastPerson) {
                    publicStatsText += `\n   ➤ Cuối phiên — đơn cuối giao cho: ${hcmLastPerson}`;
                }
                publicStatsText +=
                    `\n   ➤ Gợi ý mở đầu phiên kế (thứ tự U1 cố định): ${hcmCarry.suggestedNextOpening || '—'}`;
            } else if (hcmLastPerson && hcmPublicStats.length > 0) {
                publicStatsText += `\n   ➤ Đơn cuối phiên: ${hcmLastPerson}`;
            }
        }
        
        // Phiên Hà Nội  
        if (nhanVienHaNoi.length > 0) {
            publicStatsText += '\n────────────────────────────────────────────\n';
            publicStatsText += `🏢 PHIÊN HÀ NỘI (${nhanVienHaNoi.length} NV):\n`;
            publicStatsText += '   ';
            publicStatsText += nhanVienHaNoi.map(nv => nv.name).join(', ');
            if (hanoiCarry) {
                publicStatsText +=
                    `\n   ➤ Trước phiên — đơn gần nhất giao: ${hanoiCarry.lastAssignedBeforeSession || '(chưa có)'}`;
                publicStatsText +=
                    `\n   ➤ Phiên này — bắt đầu luân phiên từ: ${hanoiCarry.queueHeadAtSessionStart || '—'}`;
                if (hanoiLastPerson) {
                    publicStatsText +=
                        `\n   ➤ Cuối phiên — đơn cuối giao cho: ${hanoiLastPerson}`;
                }
                publicStatsText +=
                    `\n   ➤ Gợi ý mở đầu phiên kế (thứ tự U1 cố định): ${hanoiCarry.suggestedNextOpening || '—'}`;
            } else if (hanoiLastPerson && hanoiPublicStats.length > 0) {
                publicStatsText += `\n   ➤ Đơn cuối phiên: ${hanoiLastPerson}`;
            }
        }
        
        // Kết quả phân bổ
        publicStatsText += '\n────────────────────────────────────────────\n';
        publicStatsText += '📋 KẾT QUẢ PHÂN BỔ:\n';
        
        if (hcmPublicStats.length > 0) {
            publicStatsText += '\n🏭 HCM:\n';
            hcmPublicStats.forEach(s => {
                publicStatsText += `   - ${s.name}: ${s.count} đơn\n`;
            });
        }
        
        if (hanoiPublicStats.length > 0) {
            publicStatsText += '\n🏢 Hà Nội:\n';
            hanoiPublicStats.forEach(s => {
                publicStatsText += `   - ${s.name}: ${s.count} đơn\n`;
            });
        }
        
        publicStatsText += '╚═══════════════════════════════════════════════════╝';
        
        let message = `✅ Chia đơn vận đơn ${updates.length > 0 ? 'đã hoàn tất' : 'không có đơn để chia'}!\n\n` +
            `- Nhân viên HCM (U1): ${nhanVienHCM.length} người\n` +
            `- Nhân viên Hà Nội (U1): ${nhanVienHaNoi.length} người\n` +
            `- Đơn HCM cần chia: ${ordersHCM.length} đơn\n` +
            `- Đơn Hà Nội cần chia: ${ordersHaNoi.length} đơn\n` +
            `- Tổng đơn cần chia: ${updates.length} đơn\n` +
            (updates.length > 0 ? `- Đơn đã cập nhật thành công: ${successCount || updates.length}\n` : '') +
            (errorCount > 0 ? `- Đơn bị lỗi khi cập nhật: ${errorCount}\n` : '') +
            publicStatsText +
            `\n📊 Thống kê chi tiết:\n` +
            `- Tổng đơn có delivery_staff trống/null: ${ordersWithEmptyDeliveryStaff}\n` +
            `- Đơn bị loại trừ do Nhật Bản: ${ordersExcluded.filter(o => o.reason?.includes('Nhật Bản')).length}\n` +
            `- Đơn không có team/team khác: ${ordersWithoutTeam.length}\n`;
        
        // Thêm chi tiết từng đơn được chia để hiển thị công khai (SHOW LOGIC)
        let detailedResultsText = '';
        
        // Chi tiết HCM
        if (hcmDetailedResults.length > 0) {
            detailedResultsText += '\n🏭 CHI TIẾT CHIA ĐƠN HCM:\n';
            detailedResultsText += '────────────────────────────────────────────\n';
            hcmDetailedResults.forEach((item, idx) => {
                detailedResultsText += `${idx + 1}. ${item.order_code}\n`;
                detailedResultsText += `   → Giao cho: ${item.delivery_staff}\n`;
                detailedResultsText += `   → Lý do: ${item.reason}\n`;
            });
        }
        
        // Chi tiết Hà Nội
        if (hanoiDetailedResults.length > 0) {
            detailedResultsText += '\n🏢 CHI TIẾT CHIA ĐƠN HÀ NỘI:\n';
            detailedResultsText += '────────────────────────────────────────────\n';
            hanoiDetailedResults.forEach((item, idx) => {
                detailedResultsText += `${idx + 1}. ${item.order_code}\n`;
                detailedResultsText += `   → Giao cho: ${item.delivery_staff}\n`;
                detailedResultsText += `   → Lý do: ${item.reason}\n`;
            });
        }
        
        message += (ordersNotDivided > 0 ? `\n⚠️ CẢNH BÁO: Có ${ordersNotDivided} đơn có delivery_staff trống nhưng không được chia!\n` +
                `   (Có thể do: không có team, team khác HCM/Hà Nội, hoặc country = Nhật Bản)\n` : '') +
            (errorCount > 0 ? `\n⚠️ LỖI: Có ${errorCount} đơn không thể cập nhật. Vui lòng kiểm tra Console để xem chi tiết.\n` : '') +
            detailedResultsText;

        const isSuccess = updates.length > 0 && errorCount === 0;

        // --- Bước bổ sung: Lưu lịch sử vào bảng history_chia_don ---
        try {
            const staffStats = {};
            updates.forEach(u => {
                staffStats[u.delivery_staff] = (staffStats[u.delivery_staff] || 0) + 1;
            });
            const performer = localStorage.getItem('user_name') || 'Admin';
            
            // Tạo object lưu chi tiết hơn cho bảng lịch sử
            const historyRecord = {
                performed_by: performer,
                branch: branchFilter || 'Tất cả',
                total_orders: updates.length,
                staff_stats: staffStats,
                status: isSuccess ? 'success' : (errorCount > 0 ? 'warning' : 'success'),
                logs: `Chia thành công ${successCount}/${updates.length} đơn. Bị bỏ qua (loại trừ/không team): ${allNotDividedOrders.length} đơn.`,
                // Thông tin bổ sung cho báo cáo
                danh_sach_u1: JSON.stringify({
                    hcm: nhanVienHCM.map(nv => nv.name),
                    hanoi: nhanVienHaNoi.map(nv => nv.name)
                }),
                phien_chia: JSON.stringify({
                    hcm: {
                        so_luong: ordersHCM.length,
                        /** Số đơn thực sự được gán NV trong phiên (khớp “vòng đó chia bao nhiêu đơn”). */
                        so_don_da_xu_ly: (hcmDetailedResults || []).length,
                        so_nv: nhanVienHCM.length,
                        nguoi_cuoi: hcmLastPerson || null,
                        nguoi_cuoi_vong_truoc: hcmCarry?.lastAssignedBeforeSession ?? null,
                        bat_dau_phien_tu: hcmCarry?.queueHeadAtSessionStart ?? null,
                        ket_thuc_oi: hcmLastPerson || null,
                        nguoi_cuoi_sau_phien: hcmLastPerson || null,
                        goi_y_nhan_luot_tiep_theo: hcmCarry?.suggestedNextOpening ?? null,
                        thu_tu_u1_co_dinh: hcmCarry?.fixedRosterOrder ?? [],
                        tom_tat_quy_tac_ngan: hcmCarry?.ruleShort ?? '',
                    },
                    hanoi: {
                        so_luong: ordersHaNoi.length,
                        so_don_da_xu_ly: (hanoiDetailedResults || []).length,
                        so_nv: nhanVienHaNoi.length,
                        nguoi_cuoi: hanoiLastPerson || null,
                        nguoi_cuoi_vong_truoc: hanoiCarry?.lastAssignedBeforeSession ?? null,
                        bat_dau_phien_tu: hanoiCarry?.queueHeadAtSessionStart ?? null,
                        ket_thuc_oi: hanoiLastPerson || null,
                        nguoi_cuoi_sau_phien: hanoiLastPerson || null,
                        goi_y_nhan_luot_tiep_theo: hanoiCarry?.suggestedNextOpening ?? null,
                        thu_tu_u1_co_dinh: hanoiCarry?.fixedRosterOrder ?? [],
                        tom_tat_quy_tac_ngan: hanoiCarry?.ruleShort ?? '',
                    },
                }),
                chi_tiet_chia: JSON.stringify({
                    hcm: hcmDetailedResults,
                    hanoi: hanoiDetailedResults,
                    stepLogs: capturedStepLogs
                })
            };
            
            console.log('🔄 Đang lưu lịch sử vào history_chia_don...');
            console.log('📝 History record to insert:', JSON.stringify(historyRecord, null, 2));
            
            // Thử 1: Insert với tất cả cột (bao gồm cột mới)
            const { data: insertData, error: insertError } = await supabase
                .from('history_chia_don')
                .insert([historyRecord])
                .select();
                
            if (insertError) {
                console.error('❌ LỖI INSERT vào history_chia_don (với tất cả cột):', insertError.message);
                console.error('❌ Có thể do thiếu cột trong schema');
                
                // Thử 2: Insert chỉ với cột cơ bản (có trong schema)
                const basicRecord = {
                    performed_by: historyRecord.performed_by,
                    branch: historyRecord.branch,
                    total_orders: historyRecord.total_orders,
                    staff_stats: historyRecord.staff_stats,
                    status: historyRecord.status,
                    logs: historyRecord.logs
                    // Bỏ qua: danh_sach_u1, phien_chia, chi_tiet_chia
                };
                
                console.log('🔄 Thử insert với chỉ cột cơ bản:', basicRecord);
                
                const { data: basicData, error: basicError } = await supabase
                    .from('history_chia_don')
                    .insert([basicRecord])
                    .select();
                    
                if (basicError) {
                    console.error('❌ LỖI ngay cả với record cơ bản:', basicError.message);
                    console.error('❌ Kiểm tra: 1) Schema bảng, 2) Quyền INSERT, 3) RLS policies');
                } else {
                    console.log('✅ Đã lưu lịch sử (chỉ cột cơ bản) vào database');
                    console.log('✅ Inserted basic record:', basicData);
                }
            } else {
                console.log('✅ Đã lưu lịch sử (với tất cả cột) vào database');
                console.log('✅ Inserted full record:', insertData);
            }
        } catch (hErr) {
            console.error('❌ Lỗi khi thực hiện lưu lịch sử:', hErr);
            console.error('❌ History record (try-catch):', JSON.stringify(historyRecord, null, 2));
        }
        
        setAutoAssignResult({ success: isSuccess, message });

        if (updates.length === 0) {
            toast.warning('Không có đơn nào để chia vận đơn!');
        } else if (errorCount > 0) {
            toast.warning(`Đã chia ${successCount} đơn, nhưng có ${errorCount} đơn bị lỗi!`);
        } else {
            toast.success(`Đã chia ${updates.length} đơn vận đơn thành công!`);
        }

}
