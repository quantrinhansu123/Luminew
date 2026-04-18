import { toast } from 'react-toastify';

export async function runChiaDonVanDon({ supabase, branchFilter, addLog, setNotDividedOrders, setAutoAssignResult }) {
    const TARGET_ORDER_CODE = 'Kemce7fc5bf';
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
        addLog(`🔍 Đang query từ Supabase: bảng ${ordersTable}...`, 'info');
        console.log(`🔍 [Chia đơn vận đơn] Đang query từ Supabase: bảng ${ordersTable}...`);
        console.log(`📡 [Chia đơn vận đơn] Query: SELECT * FROM ${ordersTable}`);
        
        // Query trực tiếp đơn cần kiểm tra trước
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 [KIỂM TRA CHI TIẾT ĐƠN ${TARGET_ORDER_CODE}]`);
        console.log(`${'='.repeat(60)}`);
        console.log(`Đang query trực tiếp từ bảng ${ordersTable}...`);
        
        const { data: targetOrderData, error: targetOrderError } = await supabase
            .from(ordersTable)
            .select('*')
            .eq('order_code', TARGET_ORDER_CODE)
            .maybeSingle();
        
        if (targetOrderError) {
            console.error(`❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Lỗi query:`, targetOrderError);
            console.error(`❌ Chi tiết lỗi:`, JSON.stringify(targetOrderError, null, 2));
        } else if (targetOrderData) {
            console.log(`✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn TỒN TẠI trong bảng ${ordersTable}`);
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
            console.log(`❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG TỒN TẠI trong bảng ${ordersTable}!`);
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
            const allOrdersQuery = supabase.from(ordersTable).select('*');
            allOrdersArray = await queryAllOrders(allOrdersQuery);
            addLog(`✅ Đã lấy ${allOrdersArray.length} đơn từ database (tất cả)`, 'success');
            console.log(`✅ [Chia đơn vận đơn] Đã lấy ${allOrdersArray.length} đơn từ Supabase (bảng ${ordersTable})`);
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
        console.log(`✅ [Chia đơn vận đơn] Đã lấy ${allOrdersArray.length} đơn từ Supabase (bảng ${ordersTable})`);
        
        // Kiểm tra đơn đặc biệt trong dữ liệu lấy về
        const targetInAllOrders = allOrdersArray.find(o => o.order_code === TARGET_ORDER_CODE);
        if (targetInAllOrders) {
            console.log(`\n✅ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn có trong dữ liệu từ bảng ${ordersTable}`);
            console.log(`  - delivery_staff: "${targetInAllOrders.delivery_staff || '(null)'}"`);
            console.log(`  - team: "${targetInAllOrders.team || '(null)'}"`);
            console.log(`  - country: "${targetInAllOrders.country || '(null)'}"`);
            console.log(`  - sale_staff: "${targetInAllOrders.sale_staff || '(null)'}"`);
        } else {
            console.log(`\n❌ [KIỂM TRA ĐƠN ${TARGET_ORDER_CODE}] Đơn KHÔNG có trong dữ liệu từ bảng ${ordersTable}!`);
            console.log(`  - Đơn không tồn tại trong database hoặc có lỗi khi query`);
            console.log(`  - Vui lòng kiểm tra xem đơn có tồn tại trong bảng ${ordersTable} không`);
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
                                .from(ordersTable)
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
                        .from(ordersTable)
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
            const staffList = staffListWithBranch.map((s) => s.name);
            const staffSet = new Set(staffList);

            // --- Rule 1: Trong ngày hiện tại — người có đơn mang thu_tu_chia cao nhất (cuối vòng) ---
            // QUAN TRỌNG: Chỉ đếm đơn trong NGÀY HIỆN TẠI để cân bằng, không đếm tổng đơn từ trước đến nay
            const todayStrForRound = new Date().toISOString().slice(0, 10);
            
            console.log(`\n🔍 [${branchName}] ========== BẮT ĐẦU PHÂN TÍCH CHIA ĐƠN ==========`);
            console.log(`📅 Ngày hiện tại: ${todayStrForRound}`);
            console.log(`👥 Danh sách nhân viên U1: [${staffList.join(', ')}]`);

            // Lọc các đơn đã được chia trong NGÀY HIỆN TẠI cho nhóm nhân viên này
            const todayAssignedByStt = allDBOrders
                .filter((o) => {
                    const ds = o.delivery_staff?.toString().trim();
                    const ngayChia = o.ngay_chia_van_don?.toString().slice(0, 10);
                    const thuTu = o.thu_tu_chia;
                    return (
                        ds &&
                        staffSet.has(ds) &&
                        ngayChia === todayStrForRound &&
                        thuTu !== null &&
                        thuTu !== undefined &&
                        Number(thuTu) > 0
                    );
                })
                .sort((a, b) => {
                    const aVal = Number(a.thu_tu_chia) || 0;
                    const bVal = Number(b.thu_tu_chia) || 0;
                    if (bVal !== aVal) return bVal - aVal;
                    if (a.id != null && b.id != null) return b.id - a.id;
                    return String(b.order_code || '').localeCompare(String(a.order_code || ''));
                });

            // Đếm số đơn của từng nhân viên TRONG NGÀY HIỆN TẠI
            const todayOrderCountByStaff = {};
            staffList.forEach(name => { todayOrderCountByStaff[name] = 0; });
            
            todayAssignedByStt.forEach(order => {
                const staffName = order.delivery_staff?.toString().trim();
                if (staffName && todayOrderCountByStaff.hasOwnProperty(staffName)) {
                    todayOrderCountByStaff[staffName]++;
                }
            });
            
            console.log(`📊 [${branchName}] Số đơn đã chia TRONG NGÀY ${todayStrForRound}:`, todayOrderCountByStaff);
            console.log(`📋 [${branchName}] Tổng đơn đã chia trong ngày: ${todayAssignedByStt.length}`);

            let lastAssignedPerson = null;
            if (todayAssignedByStt.length > 0) {
                lastAssignedPerson = todayAssignedByStt[0].delivery_staff?.toString().trim() || null;
                const maxStt = todayAssignedByStt[0].thu_tu_chia;
                console.log(
                    `🔍 [${branchName}] Rule 1 — Trong ngày ${todayStrForRound}, STT chia cao nhất=${maxStt} → NV cuối vòng: "${lastAssignedPerson}"`
                );
                console.log(`   → Bắt đầu chia từ người tiếp theo sau "${lastAssignedPerson}"`);
            } else {
                // Nếu chưa có đơn nào được chia trong ngày (ví dụ: phiên chia đầu tiên lúc 1:00 sáng)
                // thì TẤT CẢ nhân viên đều bắt đầu từ 0 đơn
                console.log(
                    `🔍 [${branchName}] Rule 1 — Chưa có đơn nào được chia trong ngày ${todayStrForRound}`
                );
                console.log(`   → Đây là phiên chia đầu tiên trong ngày`);
                console.log(`   → TẤT CẢ nhân viên đều bắt đầu từ 0 đơn (cân bằng hoàn toàn)`);
                
                // Fallback: Tìm người được chia gần nhất (từ các ngày trước) để tiếp tục vòng
                const assignedOrders = allDBOrders
                    .filter((o) => o.delivery_staff && staffSet.has(String(o.delivery_staff).trim()))
                    .sort((a, b) => {
                        if (a.id != null && b.id != null) return b.id - a.id;
                        const dateA = a.order_date ? new Date(a.order_date) : new Date(0);
                        const dateB = b.order_date ? new Date(b.order_date) : new Date(0);
                        return dateB - dateA;
                    });
                lastAssignedPerson =
                    assignedOrders.length > 0 ? String(assignedOrders[0].delivery_staff).trim() : null;
                console.log(
                    `   → Fallback: Tìm NV được chia gần nhất (từ các ngày trước): "${lastAssignedPerson || '(không có)'}"`
                );
                console.log(`   → Sẽ bắt đầu chia từ người tiếp theo sau "${lastAssignedPerson || 'người đầu tiên'}"`);
            }

            const lastAssignedIndex = lastAssignedPerson ? staffList.indexOf(lastAssignedPerson) : -1;
            const startIndex = lastAssignedIndex >= 0 ? (lastAssignedIndex + 1) % staffListWithBranch.length : 0;
            
            console.log(`\n🔄 [${branchName}] ========== CHUẨN BỊ CHIA ĐƠN ROUND-ROBIN ==========`);
            console.log(`👥 Danh sách nhân viên U1: [${staffList.join(', ')}]`);
            console.log(`📍 Người cuối vòng: "${lastAssignedPerson || '(không có)'}" (index: ${lastAssignedIndex})`);
            console.log(`🎯 Bắt đầu chia từ index: ${startIndex} → "${staffListWithBranch[startIndex]?.name}"`);
            console.log(`📦 Số đơn cần chia: ${remainingOrders.length}`);
            console.log(`${'='.repeat(60)}\n`);

            const remainingOrders = [...pendingOrders].sort((a, b) => {
                const ta = a.order_date ? new Date(a.order_date).getTime() : 0;
                const tb = b.order_date ? new Date(b.order_date).getTime() : 0;
                if (ta !== tb) return ta - tb;
                return String(a.order_code || '').localeCompare(String(b.order_code || ''));
            });

            if (remainingOrders.length > 0) {
                let startIndex =
                    lastAssignedIndex >= 0 ? (lastAssignedIndex + 1) % staffListWithBranch.length : 0;
                let nextIndex = startIndex;

                console.log(
                    `🔄 [${branchName}] Bắt đầu round-robin ${remainingOrders.length} đơn từ index ${startIndex} ("${staffListWithBranch[startIndex]?.name}")`
                );

                remainingOrders.forEach((order, orderIdx) => {
                    let assigned = false;
                    for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
                        const idx = (nextIndex + attempt) % staffListWithBranch.length;
                        const staff = staffListWithBranch[idx];
                        const orderTeam = order.team?.toString().trim() || '';
                        const isMatch = isTeamBranchMatch(orderTeam, staff.chi_nhanh?.toString().trim() || '');

                        // Log chi tiết cho 5 đơn đầu hoặc đơn đặc biệt
                        if (orderIdx < 5 || order.order_code === TARGET_ORDER_CODE) {
                            console.log(
                                `  [Đơn ${orderIdx + 1}/${remainingOrders.length}] ${order.order_code}: ` +
                                `team="${orderTeam}", thử NV[${idx}]="${staff.name}" (chi_nhanh="${staff.chi_nhanh}"), ` +
                                `match=${isMatch}`
                            );
                        }

                        if (order.order_code === TARGET_ORDER_CODE) {
                            console.log(
                                `\n🔍 [${TARGET_ORDER_CODE}] Chi tiết chia đơn:` +
                                `\n  - orderIdx=${orderIdx}, nextIndex=${nextIndex}, attempt=${attempt}, idx=${idx}` +
                                `\n  - staff="${staff.name}", chi_nhanh="${staff.chi_nhanh}"` +
                                `\n  - orderTeam="${orderTeam}", isMatch=${isMatch}`
                            );
                        }

                        if (!isMatch) continue;

                        result.push({
                            order_code: order.order_code,
                            delivery_staff: staff.name,
                        });
                        
                        // Log khi chia thành công
                        if (orderIdx < 5 || order.order_code === TARGET_ORDER_CODE) {
                            console.log(`    ✅ Chia cho: ${staff.name}`);
                        }
                        
                        nextIndex = (idx + 1) % staffListWithBranch.length;
                        assigned = true;
                        break;
                    }

                    if (!assigned) {
                        const orderTeam = order.team?.toString().trim() || '';
                        console.warn(
                            `⚠️ [${branchName}] Bỏ qua đơn ${order.order_code}: không có NV U1 khớp team="${orderTeam}"`
                        );
                    }
                });
                console.log(`\n✅ [${branchName}] Đã chia ${result.length}/${remainingOrders.length} đơn theo vòng (round-robin U1)`);
            }

            // Log tổng kết chi tiết
            const finalCount = {};
            staffList.forEach(name => { finalCount[name] = 0; });
            result.forEach(u => { finalCount[u.delivery_staff]++; });
            
            console.log(`\n📊 [${branchName}] ========== KẾT QUẢ CHIA ĐƠN ==========`);
            console.log(`✅ Tổng số đơn đã chia: ${result.length}/${pendingOrders.length}`);
            console.log(`📋 Phân bổ đơn cho từng nhân viên (trong lần chia này):`);
            staffList.forEach((name, idx) => {
                const count = finalCount[name] || 0;
                const todayTotal = todayOrderCountByStaff[name] || 0;
                const newTotal = todayTotal + count;
                console.log(`  ${idx + 1}. ${name}: +${count} đơn (tổng trong ngày: ${todayTotal} → ${newTotal})`);
            });
            console.log(`${'='.repeat(60)}\n`);
            
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
        addLog('📋 Bước 7: Chia đơn theo vòng (U1) — round-robin', 'info');
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
                    .from(ordersTable)
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
                            .from(ordersTable)
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
                    `Đơn ${TARGET_ORDER_CODE} không tìm thấy trong bảng ${ordersTable}!\n` +
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

}
