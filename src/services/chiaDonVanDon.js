import { toast } from 'react-toastify';

export async function runChiaDonVanDon({ supabase, branchFilter, addLog, setNotDividedOrders, setAutoAssignResult }) {
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

        nhanVienU1.forEach(item => {
            const name = String(item.ho_va_ten || '').trim();
            const chiNhanhRaw = item.chi_nhanh || '';
            const normalizedBranch = ultraNormalize(chiNhanhRaw);
            
            // Log chi tiết để debug nếu cần
            console.log(`Checking staff: ${name} | Branch: ${chiNhanhRaw} | Normalized: ${normalizedBranch}`);

            const isHCM = normalizedBranch === 'hcm' || 
                         normalizedBranch === 'tphcm' || 
                         normalizedBranch === 'hochiminh' || 
                         normalizedBranch.includes('hcm');

            const isHanoi = normalizedBranch === 'hanoi' || 
                           normalizedBranch === 'hn' ||
                           normalizedBranch.includes('hanoi');
            
            if (isHCM) {
                nhanVienHCM.push({ name, chi_nhanh: 'HCM' });
            } else if (isHanoi || normalizedBranch === 'hanoi') {
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
                    // Tìm từ sale_staff
                    let foundBranch = null;
                    let foundName = null;
                    const saleStaffName = order.sale_staff?.toString().trim();
                    
                    if (saleStaffName && nameToBranch[saleStaffName]) {
                        foundBranch = nameToBranch[saleStaffName];
                        foundName = saleStaffName;
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
                                } else if (teamLower.includes('hà nội') || teamLower.includes('hanoi') || teamLower.includes('ha noi')) {
                                    foundBranch = 'Hà Nội';
                                    foundName = saleStaffName;
                                } else {
                                    // Team không hợp lệ
                                }
                            } else {
                                // Không tìm thấy đơn khác
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
                                } else {
                                    // Không có team hợp lệ
                                }
                            } else {
                                // Không tìm thấy đơn khác có cùng country
                            }
                        }
                        
                        if (!foundBranch) {
                            // Không tìm thấy branch
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
                            if (notFoundCount <= 5) {
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
                        if (foundCount <= 10) {
                            console.log(`  ✓ [${foundCount}] Điền team "${teamValue}" cho đơn ${order.order_code} (sale_staff: ${foundName}, branch: ${foundBranch})`);
                        }
                    } else {
                        notFoundCount++;
                        if (notFoundCount <= 10) {
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
                            }
                        });
                        console.log(`✅ [Chia đơn vận đơn] Đã reload ${reloadedOrders.length} đơn với team mới`);
                        
                        // Log một vài đơn để kiểm tra
                        reloadedOrders.slice(0, 5).forEach(o => {
                            console.log(`  ✓ Đơn ${o.order_code}: team="${o.team || '(null)'}"`);
                        });
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

            // Debug: Log một vài đơn đầu tiên để kiểm tra
            if (index < 10) {
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
            if (index < 5) {
                console.log(`  🔍 [Đơn ${index + 1}] order_code=${order.order_code}, team="${teamRaw}" -> normalized="${teamNormalized}" -> lower="${teamLower}" -> clean="${teamClean}" -> isHCM=${isHCM}, isHanoi=${isHanoi}`);
            }

            if (isHCM) {
                ordersHCM.push(order);
            } else if (isHanoi) {
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
        const smartDistribute = (staffListWithBranch, pendingOrders, allDBOrders, branchName) => {
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

            // Đếm số đơn đã chia trong ngày hôm nay (chỉ để hiển thị báo cáo cho người dùng)
            const todayStrForReport = new Date().toISOString().slice(0, 10);
            const todayOrderCountByStaff = {};
            staffList.forEach(name => { todayOrderCountByStaff[name] = 0; });
            
            allDBOrders.forEach(o => {
                const ds = o.delivery_staff?.toString().trim();
                const ngay = o.ngay_chia_van_don?.toString().slice(0, 10);
                if (ds && staffSet.has(ds) && ngay === todayStrForReport) {
                    todayOrderCountByStaff[ds]++;
                }
            });
            console.log(`📊 [${branchName}] Thống kê đơn đã nhận trong ngày hôm nay:`, todayOrderCountByStaff);

            const lastAssignedIndex = lastAssignedPerson ? staffList.indexOf(lastAssignedPerson) : -1;
            const startIndex = lastAssignedIndex >= 0 ? (lastAssignedIndex + 1) % staffListWithBranch.length : 0;
            
            const remainingOrders = [...pendingOrders].sort((a, b) => {
                const ta = a.order_date ? new Date(a.order_date).getTime() : 0;
                const tb = b.order_date ? new Date(b.order_date).getTime() : 0;
                if (ta !== tb) return ta - tb;
                return String(a.order_code || '').localeCompare(String(b.order_code || ''));
            });

            const RULE_TRANSPARENCY_SHORT =
                'Vòng NV U1 (khớp team/chi nhánh đơn): mỗi đơn giao cho người đứng đầu hàng trong số được phép nhận; sau đó người đó xuống cuối hàng. Không ép cân bằng tải — team đơn lệch nên có thể người nhiều người ít.';

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
                // ROUND-ROBIN ĐƠN GIẢN: Ai xong xuống cuối hàng, không cân bằng tải
                // ============================================================
                let nextIndex = startIndex;

                console.log(
                    `🔄 [${branchName}] Bắt đầu chia theo round-robin đơn giản (ai xong xuống cuối) từ index ${startIndex} ("${staffListWithBranch[startIndex]?.name}")`
                );

                remainingOrders.forEach((order, orderIdx) => {
                    const orderTeam = order.team?.toString().trim() || '';

                    // Lọc nhân viên phù hợp chi nhánh/team
                    const eligible = [];
                    for (let attempt = 0; attempt < staffListWithBranch.length; attempt++) {
                        const idx = (nextIndex + attempt) % staffListWithBranch.length;
                        const staff = staffListWithBranch[idx];
                        const isMatch = isTeamBranchMatch(orderTeam, staff.chi_nhanh?.toString().trim() || '');
                        if (isMatch) {
                            eligible.push({ idx, staff });
                        }
                    }

                    if (eligible.length === 0) {
                        console.warn(
                            `⚠️ [${branchName}] Bỏ qua đơn ${order.order_code}: không có NV U1 khớp team="${orderTeam}"`
                        );
                        return;
                    }

                    // CHỌN NGƯỜI ĐẦU TIÊN trong danh sách eligible (theo thứ tự vòng)
                    // KHÔNG cân bằng tải - ai đến lượt thì nhận
                    const chosen = eligible[0];
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
                        reason: `NV đầu tiên khớp chi nhánh (${eligible.length} NV khớp: ${eligibleNames})`
                    });

                    // Log cho debugging
                    console.log(
                        `  [Đơn ${orderIdx + 1}/${remainingOrders.length}] ${order.order_code}: ` +
                        `team="${orderTeam}" -> ✅ ${chosenName} (${eligible.length} NV khớp: ${eligibleNames})`
                    );

                    // Sau khi nhận đơn, xuống cuối hàng (xoay vòng)
                    // Di chuyển người vừa chọn xuống cuối danh sách
                    const staffItem = staffListWithBranch.splice(chosen.idx, 1)[0];
                    staffListWithBranch.push(staffItem);
                    
                    // Cập nhật nextIndex để tiếp tục từ vị trí tiếp theo
                    nextIndex = chosen.idx % staffListWithBranch.length;
                });
                console.log(`\n✅ [${branchName}] Đã chia ${result.length}/${remainingOrders.length} đơn theo round-robin đơn giản (ai xong xuống cuối)`);
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
                } = smartDistribute(nhanVienHCM, ordersHCM, allDBOrdersHCM, 'HCM');
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
            } = smartDistribute(nhanVienHaNoi, ordersHaNoi, allDBOrdersHaNoi, 'Hà Nội');
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
                        so_nv: nhanVienHCM.length,
                        nguoi_cuoi: hcmLastPerson || null,
                        nguoi_cuoi_vong_truoc: hcmCarry?.lastAssignedBeforeSession ?? null,
                        bat_dau_phien_tu: hcmCarry?.queueHeadAtSessionStart ?? null,
                        nguoi_cuoi_sau_phien: hcmLastPerson || null,
                        goi_y_nhan_luot_tiep_theo: hcmCarry?.suggestedNextOpening ?? null,
                        thu_tu_u1_co_dinh: hcmCarry?.fixedRosterOrder ?? [],
                        tom_tat_quy_tac_ngan: hcmCarry?.ruleShort ?? '',
                    },
                    hanoi: {
                        so_luong: ordersHaNoi.length,
                        so_nv: nhanVienHaNoi.length,
                        nguoi_cuoi: hanoiLastPerson || null,
                        nguoi_cuoi_vong_truoc: hanoiCarry?.lastAssignedBeforeSession ?? null,
                        bat_dau_phien_tu: hanoiCarry?.queueHeadAtSessionStart ?? null,
                        nguoi_cuoi_sau_phien: hanoiLastPerson || null,
                        goi_y_nhan_luot_tiep_theo: hanoiCarry?.suggestedNextOpening ?? null,
                        thu_tu_u1_co_dinh: hanoiCarry?.fixedRosterOrder ?? [],
                        tom_tat_quy_tac_ngan: hanoiCarry?.ruleShort ?? '',
                    },
                }),
                chi_tiet_chia: JSON.stringify({
                    hcm: hcmDetailedResults,
                    hanoi: hanoiDetailedResults
                })
            };
            
            await supabase.from('history_chia_don').insert([historyRecord]);
            console.log('✅ Đã lưu lịch sử chia đơn vào database');
        } catch (hErr) {
            console.error('❌ Lỗi khi thực hiện lưu lịch sử:', hErr);
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
