/**
 * Đồng bộ số đơn / doanh số từ lumidataapi (cùng luồng DanhSachBaoCaoTay — Sale).
 */

export function convertDateToAPIFormat(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

export function normalizeDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

export function normalizeNameForMatch(str) {
    if (!str) return '';
    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function namesMatch(name1, name2) {
    const n1 = normalizeNameForMatch(name1);
    const n2 = normalizeNameForMatch(name2);
    return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

const LUMIDATA_ORDERS_BASE = 'https://lumidataapi.vercel.app/orders';

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabase
 * @param {Array} opts.reports — danh sách bản ghi sales_reports cần xử lý
 * @param {(i: number, total: number) => void} [opts.onProgress]
 * @param {string} [opts.logTag] — tiền tố log
 * @returns {Promise<{ updatedCount: number, errorCount: number }>}
 */
export async function syncReportsFromLumidataApi({ supabase, reports, onProgress, logTag = '[LumidataSync]' }) {
    let updatedCount = 0;
    let errorCount = 0;
    const total = reports.length;

    for (let i = 0; i < total; i++) {
        const report = reports[i];
        onProgress?.(i + 1, total);

        try {
            const reportDate = normalizeDate(report.date);
            if (!reportDate) {
                console.warn(`${logTag} Report ${report.id} has invalid date, skipping`);
                continue;
            }

            const apiDate = convertDateToAPIFormat(reportDate);
            const params = new URLSearchParams();
            params.append('from_date', apiDate);
            params.append('to_date', apiDate);

            const url = `${LUMIDATA_ORDERS_BASE}?${params.toString()}`;
            console.log(`${logTag} Fetching orders for report ${report.id} (date only):`, url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            let matchingOrders = result.data || [];

            const beforeDateFilter = matchingOrders.length;
            matchingOrders = matchingOrders.filter((order) => {
                const orderDate = order.order_date;
                if (!orderDate) return false;

                let normalizedOrderDate = '';
                try {
                    if (orderDate instanceof Date) {
                        normalizedOrderDate = orderDate.toISOString().split('T')[0];
                    } else if (typeof orderDate === 'string') {
                        if (orderDate.includes('/')) {
                            const parts = orderDate.split('/');
                            if (parts.length === 3) {
                                normalizedOrderDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                            }
                        } else if (orderDate.includes('-')) {
                            normalizedOrderDate = orderDate.split('T')[0];
                        } else {
                            const dateObj = new Date(orderDate);
                            if (!isNaN(dateObj.getTime())) {
                                normalizedOrderDate = dateObj.toISOString().split('T')[0];
                            }
                        }
                    } else {
                        const dateObj = new Date(orderDate);
                        if (!isNaN(dateObj.getTime())) {
                            normalizedOrderDate = dateObj.toISOString().split('T')[0];
                        }
                    }
                } catch {
                    return false;
                }

                if (!normalizedOrderDate) return false;
                return normalizedOrderDate === reportDate;
            });

            if (report.name && report.name.trim()) {
                matchingOrders = matchingOrders.filter((order) => {
                    const orderSaleStaff = (order.nhanvien_sale || order.sale_staff || '').trim();
                    if (!orderSaleStaff) return false;
                    return namesMatch(orderSaleStaff, report.name);
                });
            }

            if (report.product && report.product.trim()) {
                matchingOrders = matchingOrders.filter((order) => {
                    const orderProduct = (order.product || '').trim();
                    if (!orderProduct) return false;
                    return orderProduct === report.product.trim();
                });
            }

            if (report.market && report.market.trim()) {
                matchingOrders = matchingOrders.filter((order) => {
                    const orderCountry = (order.country || '').trim();
                    if (!orderCountry) return false;
                    return orderCountry === report.market.trim();
                });
            }

            const orderCount = matchingOrders.length;

            const cancelledOrders = matchingOrders.filter((order) => {
                const checkResult = (order.check_result || '').trim();
                return checkResult === 'Hủy';
            });
            const orderCancelCount = cancelledOrders.length;

            const goOrders = matchingOrders.filter((order) => {
                const trackingCode = (
                    order.tracking_code ||
                    order.trackingCode ||
                    order.tracking ||
                    order.ma_tracking ||
                    order.maTracking ||
                    ''
                ).trim();
                const checkResult = (order.check_result || '').trim();
                return trackingCode !== '' && checkResult !== 'Hủy';
            });
            const orderGoCount = goOrders.length;

            const revenuePart = (order) =>
                parseFloat(
                    order.total_amount_vnd ||
                        order.total_vnd ||
                        order.tongtien ||
                        order.revenue_vnd ||
                        order.total_amount ||
                        order.amount ||
                        0
                );

            const revenueCancelActual = cancelledOrders.reduce((sum, order) => {
                const revenue = revenuePart(order);
                return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
            }, 0);

            const revenueGoActual = goOrders.reduce((sum, order) => {
                const revenue = revenuePart(order);
                return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
            }, 0);

            const totalRevenue = matchingOrders.reduce((sum, order) => {
                const revenue = revenuePart(order);
                return sum + (isNaN(revenue) || !isFinite(revenue) ? 0 : revenue);
            }, 0);

            const validRevenue = isNaN(totalRevenue) || !isFinite(totalRevenue) ? 0 : Number(totalRevenue);
            const validRevenueCancel =
                isNaN(revenueCancelActual) || !isFinite(revenueCancelActual) ? 0 : Number(revenueCancelActual);
            const validRevenueGo = isNaN(revenueGoActual) || !isFinite(revenueGoActual) ? 0 : Number(revenueGoActual);
            const validOrderCount = Number(orderCount) || 0;
            const validOrderCancelCount = Number(orderCancelCount) || 0;
            const validOrderGoCount = Number(orderGoCount) || 0;

            const updateData = {
                order_count: validOrderCount,
                order_cancel_count: validOrderCancelCount,
                order_go: validOrderGoCount,
                revenue_actual: validRevenue,
                revenue_cancel_actual: validRevenueCancel,
                revenue_go_actual: validRevenueGo,
            };

            let { error } = await supabase.from('sales_reports').update(updateData).eq('id', report.id);

            if (error && error.code === 'PGRST204') {
                const { error: retryError } = await supabase
                    .from('sales_reports')
                    .update({
                        order_count: validOrderCount,
                        order_cancel_count: validOrderCancelCount,
                    })
                    .eq('id', report.id);

                if (retryError) {
                    const { error: finalError } = await supabase
                        .from('sales_reports')
                        .update({ order_count: validOrderCount })
                        .eq('id', report.id);

                    if (finalError) {
                        console.error(`${logTag} Error updating report ${report.id}:`, finalError);
                        errorCount++;
                    } else {
                        updatedCount++;
                    }
                } else {
                    await supabase.from('sales_reports').update({ revenue_actual: validRevenue }).eq('id', report.id);
                    await supabase
                        .from('sales_reports')
                        .update({ revenue_cancel_actual: validRevenueCancel })
                        .eq('id', report.id);
                    await supabase
                        .from('sales_reports')
                        .update({ revenue_go_actual: validRevenueGo })
                        .eq('id', report.id);
                    updatedCount++;
                }
            } else if (error) {
                console.error(`${logTag} Error updating report ${report.id}:`, error);
                errorCount++;
            } else {
                updatedCount++;
            }

            if (i % 10 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
     
        } catch (err) {
            console.error(`${logTag} Error processing report ${report.id}:`, err);
            errorCount++;
        }
    }

    return { updatedCount, errorCount };
}

/**
 * Lấy đơn khớp báo cáo từ API (chỉ filter client-side như DanhSachBaoCaoTay).
 */
export async function fetchMatchingOrdersForReport(report, logTag = '[LumidataSync]') {
    const reportDate = normalizeDate(report.date);
    if (!reportDate) {
        return { error: new Error('Báo cáo không có ngày hợp lệ'), orders: [] };
    }

    const apiDate = convertDateToAPIFormat(reportDate);
    const params = new URLSearchParams();
    params.append('from_date', apiDate);
    params.append('to_date', apiDate);

    const url = `${LUMIDATA_ORDERS_BASE}?${params.toString()}`;
    console.log(`${logTag} View orders (date only):`, url);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    let matchingOrders = result.data || [];
    const beforeDateFilter = matchingOrders.length;

    matchingOrders = matchingOrders.filter((order) => {
        const orderDate = order.order_date;
        if (!orderDate) return false;

        let normalizedOrderDate = '';
        try {
            if (orderDate instanceof Date) {
                normalizedOrderDate = orderDate.toISOString().split('T')[0];
            } else if (typeof orderDate === 'string') {
                if (orderDate.includes('/')) {
                    const parts = orderDate.split('/');
                    if (parts.length === 3) {
                        normalizedOrderDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                } else if (orderDate.includes('-')) {
                    normalizedOrderDate = orderDate.split('T')[0];
                } else {
                    const dateObj = new Date(orderDate);
                    if (!isNaN(dateObj.getTime())) {
                        normalizedOrderDate = dateObj.toISOString().split('T')[0];
                    }
                }
            } else {
                const dateObj = new Date(orderDate);
                if (!isNaN(dateObj.getTime())) {
                    normalizedOrderDate = dateObj.toISOString().split('T')[0];
                }
            }
        } catch {
            return false;
        }

        if (!normalizedOrderDate) return false;
        const matches = normalizedOrderDate === reportDate;
        if (!matches && beforeDateFilter <= 10) {
            console.log(
                `${logTag} Order ${order.order_code || order.id}: normalized="${normalizedOrderDate}" vs report="${reportDate}"`
            );
        }
        return matches;
    });

    if (report.name && report.name.trim()) {
        matchingOrders = matchingOrders.filter((order) => {
            const orderSaleStaff = (order.nhanvien_sale || order.sale_staff || '').trim();
            if (!orderSaleStaff) return false;
            return namesMatch(orderSaleStaff, report.name);
        });
    }

    if (report.product && report.product.trim()) {
        matchingOrders = matchingOrders.filter((order) => {
            const orderProduct = (order.product || '').trim();
            if (!orderProduct) return false;
            return orderProduct === report.product.trim();
        });
    }

    if (report.market && report.market.trim()) {
        matchingOrders = matchingOrders.filter((order) => {
            const orderCountry = (order.country || '').trim();
            if (!orderCountry) return false;
            return orderCountry === report.market.trim();
        });
    }

    return { error: null, orders: matchingOrders };
}
