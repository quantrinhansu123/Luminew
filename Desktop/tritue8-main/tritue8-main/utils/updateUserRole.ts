// Script để cập nhật role admin cho user
// Chạy script này để fix vấn đề admin không thấy data

import { DATABASE_URL_BASE as URL_BASE } from "@/firebase";

const DATABASE_URL_BASE = URL_BASE + '/datasheet';

// Email admin cần cập nhật
const ADMIN_EMAILS_TO_UPDATE = [
    'mrliemkhiet@gmail.com',
    'htdat2711@gmail.com',
    'tskiet2811@gmail.com'
];

// Hàm cập nhật role admin
export const updateAdminRoles = async () => {
    try {
        console.log('🔄 Đang cập nhật role admin...');

        // 1. Lấy danh sách giáo viên
        const teachersResponse = await fetch(`${DATABASE_URL_BASE}/Gi%C3%A1o_vi%C3%AAn.json`);
        const teachersData = await teachersResponse.json();

        if (!teachersData) {
            console.error('❌ Không thể lấy dữ liệu giáo viên');
            return;
        }

        // 2. Tìm và cập nhật các giáo viên admin
        for (const [teacherId, teacherData] of Object.entries(teachersData)) {
            const teacher = teacherData as any;
            const email = teacher.Email?.toLowerCase();

            if (ADMIN_EMAILS_TO_UPDATE.includes(email)) {
                console.log(`🔧 Cập nhật admin cho: ${email}`);

                // Cập nhật field "Vị trí" thành "Admin"
                const updateUrl = `${DATABASE_URL_BASE}/Gi%C3%A1o_vi%C3%AAn/${teacherId}.json`;

                const updatedTeacher = {
                    ...teacher,
                    "Vị trí": "Admin" // ← Đây là key quan trọng
                };

                const response = await fetch(updateUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedTeacher)
                });

                if (response.ok) {
                    console.log(`✅ Đã cập nhật admin cho: ${email}`);
                } else {
                    console.error(`❌ Lỗi cập nhật admin cho: ${email}`);
                }
            }
        }

        console.log('🎉 Hoàn tất cập nhật role admin!');
        console.log('🔄 Vui lòng refresh lại trang để thấy thay đổi');

    } catch (error) {
        console.error('❌ Lỗi khi cập nhật admin roles:', error);
    }
};

// Chạy hàm khi import
// updateAdminRoles();
