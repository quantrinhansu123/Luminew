import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-detect credentials
let supabaseUrl = '';
let supabaseKey = '';

const clientPath = path.join(__dirname, 'src', 'services', 'supabaseClient.js');
try {
    const content = fs.readFileSync(clientPath, 'utf8');
    const urlMatch = content.match(/VITE_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

    if (urlMatch) supabaseUrl = urlMatch[1];
    if (keyMatch) supabaseKey = keyMatch[1];
} catch (e) { }

if (!supabaseUrl || !supabaseKey) {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const urlLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_URL'));
        const keyLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_ANON_KEY'));
        
        if (urlLine) supabaseUrl = urlLine.split('=')[1].trim();
        if (keyLine) supabaseKey = keyLine.split('=')[1].trim();
    }
}

if (!supabaseUrl) {
    supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
}
if (!supabaseKey) {
    supabaseKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    console.log('🔍 Kiểm tra điều kiện chia đơn tự động...\n');
    
    try {
        // 1. Kiểm tra nhân viên U1
        console.log('1️⃣ Kiểm tra nhân viên U1 trong danh_sach_van_don:');
        console.log('─'.repeat(80));
        
        const { data: vanDonList, error: vanDonError } = await supabase
            .from('danh_sach_van_don')
            .select('ho_va_ten, chi_nhanh, trang_thai_chia');

        if (vanDonError) {
            console.error('❌ Lỗi:', vanDonError.message);
        } else {
            console.log(`   Tổng số nhân viên: ${vanDonList?.length || 0}`);
            
            const nhanVienU1 = vanDonList?.filter(item => item.trang_thai_chia === 'U1') || [];
            console.log(`   Nhân viên có trạng thái U1: ${nhanVienU1.length}`);
            
            if (nhanVienU1.length === 0) {
                console.log('   ⚠️  KHÔNG CÓ nhân viên U1! Đây có thể là nguyên nhân.');
                console.log('   💡 Giải pháp: Cập nhật trang_thai_chia = "U1" cho nhân viên trong bảng danh_sach_van_don');
            } else {
                console.log('   ✅ Có nhân viên U1:');
                nhanVienU1.forEach((nv, idx) => {
                    console.log(`      ${idx + 1}. ${nv.ho_va_ten} - Chi nhánh: ${nv.chi_nhanh || '(null)'}`);
                });
                
                // Phân loại theo chi nhánh
                const nhanVienHCM = nhanVienU1.filter(nv => {
                    const cn = (nv.chi_nhanh || '').toLowerCase();
                    return cn === 'hcm' || cn.includes('hcm') || cn.includes('hồ chí minh');
                });
                const nhanVienHaNoi = nhanVienU1.filter(nv => {
                    const cn = (nv.chi_nhanh || '').toLowerCase();
                    return cn === 'hà nội' || cn === 'ha noi' || cn === 'hanoi' || cn.includes('hà nội');
                });
                
                console.log(`\n   📍 Phân loại:`);
                console.log(`      - HCM: ${nhanVienHCM.length} nhân viên`);
                console.log(`      - Hà Nội: ${nhanVienHaNoi.length} nhân viên`);
            }
        }

        // 2. Kiểm tra đơn có delivery_staff trống
        console.log('\n2️⃣ Kiểm tra đơn có delivery_staff trống/null:');
        console.log('─'.repeat(80));
        
        const { data: ordersNull, error: ordersNullError } = await supabase
            .from('orders')
            .select('order_code, delivery_staff, team, country', { count: 'exact' })
            .is('delivery_staff', null)
            .limit(100);

        const { data: ordersEmpty, error: ordersEmptyError } = await supabase
            .from('orders')
            .select('order_code, delivery_staff, team, country', { count: 'exact' })
            .eq('delivery_staff', '')
            .limit(100);

        if (ordersNullError || ordersEmptyError) {
            console.error('❌ Lỗi:', ordersNullError?.message || ordersEmptyError?.message);
        } else {
            const totalNull = ordersNull?.length || 0;
            const totalEmpty = ordersEmpty?.length || 0;
            console.log(`   Đơn có delivery_staff = NULL: ${totalNull}`);
            console.log(`   Đơn có delivery_staff = '': ${totalEmpty}`);
            console.log(`   Tổng đơn có thể chia: ${totalNull + totalEmpty}`);
            
            if (totalNull + totalEmpty === 0) {
                console.log('   ⚠️  KHÔNG CÓ đơn nào có delivery_staff trống! Đây có thể là nguyên nhân.');
                console.log('   💡 Tất cả đơn đã được chia hoặc đã có delivery_staff.');
            } else {
                // Kiểm tra đơn bị loại trừ
                const allEligible = [...(ordersNull || []), ...(ordersEmpty || [])];
                const japanOrders = allEligible.filter(o => {
                    const country = (o.country || '').toLowerCase();
                    return country.includes('nhật bản') || country.includes('nhat ban') || country.includes('japan');
                });
                const withoutTeam = allEligible.filter(o => {
                    const team = (o.team || '').toLowerCase();
                    const isHCM = team === 'hcm' || team.includes('hcm') || team.includes('hồ chí minh');
                    const isHanoi = team === 'hà nội' || team === 'ha noi' || team === 'hanoi' || team.includes('hà nội');
                    return !isHCM && !isHanoi;
                });
                
                console.log(`\n   📊 Phân tích:`);
                console.log(`      - Đơn bị loại trừ (Nhật Bản): ${japanOrders.length}`);
                console.log(`      - Đơn không có team/team khác: ${withoutTeam.length}`);
                console.log(`      - Đơn có thể chia: ${allEligible.length - japanOrders.length - withoutTeam.length}`);
                
                if (withoutTeam.length > 0 && withoutTeam.length <= 10) {
                    console.log(`\n   ⚠️  Đơn không có team (${withoutTeam.length} đơn):`);
                    withoutTeam.slice(0, 10).forEach((o, idx) => {
                        console.log(`      ${idx + 1}. ${o.order_code} - team: "${o.team || '(null)'}"`);
                    });
                }
            }
        }

        // 3. Kiểm tra tổng số đơn
        console.log('\n3️⃣ Thống kê tổng quan:');
        console.log('─'.repeat(80));
        
        const { count: totalOrders, error: countError } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('❌ Lỗi:', countError.message);
        } else {
            console.log(`   Tổng số đơn trong bảng orders: ${totalOrders || 0}`);
        }

        // 4. Kết luận
        console.log('\n📊 KẾT LUẬN:');
        console.log('─'.repeat(80));
        
        const nhanVienU1 = vanDonList?.filter(item => item.trang_thai_chia === 'U1') || [];
        const hasU1 = nhanVienU1.length > 0;
        const hasEligibleOrders = (ordersNull?.length || 0) + (ordersEmpty?.length || 0) > 0;
        
        if (!hasU1) {
            console.log('❌ Vấn đề: Không có nhân viên U1');
            console.log('   → Cần cập nhật trang_thai_chia = "U1" cho nhân viên trong bảng danh_sach_van_don');
        }
        
        if (!hasEligibleOrders) {
            console.log('❌ Vấn đề: Không có đơn nào có delivery_staff trống');
            console.log('   → Tất cả đơn đã được chia hoặc đã có delivery_staff');
        }
        
        if (hasU1 && hasEligibleOrders) {
            console.log('✅ Điều kiện đủ để chia đơn!');
            console.log('   → Nếu vẫn không chia được, kiểm tra:');
            console.log('      - Đơn có bị loại trừ do country = Nhật Bản không?');
            console.log('      - Đơn có team = HCM hoặc Hà Nội không?');
            console.log('      - Có lỗi khi update database không? (xem Console trong browser)');
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.error('Chi tiết:', error);
        process.exit(1);
    }
})();
