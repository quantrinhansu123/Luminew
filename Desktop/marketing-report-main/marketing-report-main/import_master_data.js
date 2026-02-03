// createAdminAccount.js
import bcrypt from 'bcryptjs';

const FIREBASE_URL = 'https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app';

async function fetchData(path) {
    try {
        const response = await fetch(`${FIREBASE_URL}/${path}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

async function saveData(path, data) {
    try {
        const response = await fetch(`${FIREBASE_URL}/${path}.json`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error saving data:', error);
        return null;
    }
}

async function createAdminAccount() {
    try {
        // Lấy dữ liệu tài khoản hiện có để không ghi đè
        const existingAccounts = await fetchData('datasheet/Tài_khoản');
        
        // Tạo ID duy nhất cho admin
        const adminId = 'admin_' + Date.now();

        // Thông tin tài khoản admin
        const adminAccount = {
            username: 'admin',
            password: bcrypt.hashSync('123456', 10),
            email: 'admin@lumi.com',
            fullName: 'Quản Trị Viên Hệ Thống',
            department: 'IT',
            position: 'Quản trị viên',
            team: 'Quản lý hệ thống',
            branch: 'HCM',
            shift: 'Ca Ngày',
            role: 'admin',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            permissions: ['all'] // Quyền toàn hệ thống
        };

        // Thêm admin vào danh sách tài khoản hiện có
        const updatedAccounts = {
            ...existingAccounts,
            [adminId]: adminAccount
        };

        // Lưu lên Firebase
        const result = await saveData('datasheet/Tài_khoản', updatedAccounts);

        if (result) {
            console.log('✅ Tạo tài khoản admin thành công!');
            console.log(`
Thông tin tài khoản admin:
------------------------
Username: admin
Email: admin@lumi.com
Mật khẩu: Admin@123
Họ tên: Quản Trị Viên Hệ Thống
Vai trò: admin
Quyền: Toàn quyền hệ thống
------------------------
Lưu ý: Đổi mật khẩu sau lần đăng nhập đầu tiên!
            `);
        } else {
            console.error('❌ Lỗi khi tạo tài khoản admin');
        }

    } catch (error) {
        console.error('Lỗi khi tạo tài khoản admin:', error);
    }
}

// Chạy hàm tạo tài khoản admin
createAdminAccount();