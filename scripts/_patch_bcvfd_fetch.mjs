import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, '..', 'src', 'pages', 'BaoCaoVanDon.jsx');
let s = fs.readFileSync(p, 'utf8');
const start = s.indexOf('    const fetchData = async () => {');
const end = s.indexOf('    // --- QUICK DATE LOGIC ---');
if (start < 0 || end < 0) throw new Error('markers not found');

const newFetch = `    const fetchData = async () => {
        const fp = deriveFetchParamsFromCriteria(criteriaRows);
        if (!fp) {
            alert('Vui lòng chọn Ngày đầu và Ngày cuối cho ít nhất một dòng trong bảng tiêu chí.');
            return;
        }
        setLoading(true);
        setError(null);
        setLoadingProgress({ current: 0, total: 0, message: 'Đang tải bảng bao_cao_van_don...' });
        try {
            console.log(\`📡 [BaoCaoVanDon] Supabase bao_cao_van_don \${fp.startDate} → \${fp.endDate}\`);
            const { data, error: qErr } = await supabase
                .from('bao_cao_van_don')
                .select(
                    'id, ngay, nhan_vien, san_pham, thi_truong, trang_thai_giao_hang, ket_qua_check, trang_thai_thanh_toan, tien_trang_thai_thanh_toan'
                )
                .gte('ngay', fp.startDate)
                .lte('ngay', fp.endDate)
                .order('ngay', { ascending: false });
            if (qErr) throw qErr;
            let rows = (data || []).map(mapBaoCaoRowToVirtual);
            if (fp.product?.length > 0) {
                const ps = new Set(fp.product);
                rows = rows.filter((r) => ps.has(r['Mặt hàng']));
            }
            if (fp.market?.length > 0) {
                const ms = new Set(fp.market);
                rows = rows.filter((r) => ms.has(r['khu vực']));
            }
            const staffAllow = (() => {
                if (isAdmin) {
                    const parts = [];
                    if (selectedPersonnelNames?.length) parts.push(...selectedPersonnelNames);
                    if (reportFilters.staff?.length) parts.push(...reportFilters.staff);
                    const u = [...new Set(parts)];
                    return u.length ? new Set(u) : null;
                }
                if (selectedPersonnelNames?.length) return new Set(selectedPersonnelNames);
                return null;
            })();
            if (staffAllow) {
                rows = rows.filter((r) => staffAllow.has(r['NV Vận đơn']));
            }
            setLoadingProgress({
                current: rows.length,
                total: rows.length,
                message: 'Hoàn tất'
            });
            if (rows.length === 0) {
                const filterDetails = [];
                if (fp.product?.length) filterDetails.push(\`Mặt hàng: \${fp.product.join(', ')}\`);
                if (fp.market?.length) filterDetails.push(\`Khu vực: \${fp.market.join(', ')}\`);
                if (staffAllow) filterDetails.push('NV Vận đơn (theo tài khoản / lọc)');
                setError(
                    filterDetails.length > 0
                        ? \`Không có dòng tổng hợp phù hợp: \${filterDetails.join('; ')}.\`
                        : 'Không có dữ liệu trong bảng bao_cao_van_don cho khoảng ngày đã chọn.'
                );
            } else {
                setError(null);
            }
            setRawData(rows);
        } catch (err) {
            console.error('❌ [BaoCaoVanDon] Fetch error:', err);
            setError(err.message || 'Lỗi khi tải bao_cao_van_don');
        } finally {
            setLoading(false);
        }
    };
`;

fs.writeFileSync(p, s.slice(0, start) + newFetch + '\n' + s.slice(end));
console.log('ok', start, end);
