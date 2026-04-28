import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function diagnoseStaff() {
    console.log('--- 🔎 CHẨN ĐOÁN DANH SÁCH NHÂN SỰ U1 ---');
    
    // 1. Lấy tất cả nhân sự có trạng thái chứa 'U1'
    const { data: allU1, error } = await supabase
        .from('danh_sach_van_don')
        .select('ho_va_ten, trang_thai_chia, branch')
        .or('trang_thai_chia.ilike.%U1%');

    if (error) {
        console.error('Lỗi khi lấy dữ liệu:', error);
        return;
    }

    console.log(`Tìm thấy tổng cộng: ${allU1.length} người có liên quan đến U1 trong DB.`);
    
    console.log('\n--- CHI TIẾT TỪNG NGƯỜI ---');
    console.log('| Tên (Raw) | Trạng thái (Raw) | Chi nhánh | Phân tích |');
    console.log('|-----------|------------------|-----------|-----------|');
    
    allU1.forEach(p => {
        const name = p.ho_va_ten || '';
        const status = p.trang_thai_chia || '';
        const branch = p.branch || '';
        
        let issue = [];
        if (name.trim() !== name) issue.push('Dư dấu cách ở tên');
        if (status.trim() !== status) issue.push('Dư dấu cách ở trạng thái');
        if (status.toUpperCase() !== 'U1') issue.push(`Trạng thái lạ: "${status}"`);
        if (!branch) issue.push('Thiếu Chi nhánh');
        
        const analysis = issue.length > 0 ? `❌ ${issue.join(', ')}` : '✅ Hợp lệ';
        
        console.log(`| "${name}" | "${status}" | "${branch}" | ${analysis} |`);
    });

    // 2. Kiểm tra theo chi nhánh
    const hn = allU1.filter(p => (p.branch || '').trim().toLowerCase() === 'hà nội' || (p.branch || '').trim().toLowerCase() === 'ha noi');
    const hcm = allU1.filter(p => (p.branch || '').trim().toLowerCase() === 'hcm');
    
    console.log('\n--- THỐNG KÊ THEO CHI NHÁNH ---');
    console.log(`- Hà Nội: ${hn.length} người`);
    console.log(`- HCM: ${hcm.length} người`);
    console.log(`- Không chi nhánh: ${allU1.length - hn.length - hcm.length} người`);
}

diagnoseStaff();
