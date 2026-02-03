// createAccounts.js
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

async function createUserAccounts() {
    try {
        // Lấy dữ liệu nhân sự
        const personnelData = await fetchData('datasheet/Nhân_sự');
        
        if (!personnelData) {
            console.log('Không có dữ liệu nhân sự');
            return;
        }

        console.log('Dữ liệu nhân sự:', personnelData);

        // Tạo object chứa tài khoản
        const accounts = {};

        // Duyệt qua từng nhân sự
        Object.keys(personnelData).forEach(key => {
            const person = personnelData[key];
            
            console.log('Xử lý nhân sự:', person);

            // Kiểm tra nếu vị trí là "Đã nghỉ" thì bỏ qua
            if (person['Vị trí'] === 'Đã nghỉ') {
                console.log(`Bỏ qua nhân sự đã nghỉ: ${person['Họ Và Tên']}`);
                return;
            }

            // Tạo username từ email
            let username = '';
            if (person.email) {
                username = person.email.split('@')[0];
            } else {
                // Tạo username từ tên nếu không có email
                username = person['Họ Và Tên']
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/\s+/g, '.');
            }

            // Mã hóa mật khẩu mặc định
            const defaultPassword = 'Lumi@123';
            const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

            // Xác định role dựa trên vị trí
            const role = determineRole(person['Vị trí']);

            // Tạo đối tượng tài khoản
            accounts[key] = {
                username: username,
                password: hashedPassword,
                email: person.email || '',
                fullName: person['Họ Và Tên'] || '',
                department: person['Bộ phận'] || '',
                position: person['Vị trí'] || '',
                team: person['Team'] || person['Team Sale_mar'] || '',
                branch: person['chi nhánh'] || '',
                shift: person['Ca'] || '',
                role: role,
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLogin: null
            };
        });

        // Lưu tài khoản lên Firebase
        const result = await saveData('datasheet/Tài_khoản', accounts);

        if (result) {
            console.log('Tạo tài khoản thành công!');
            console.log('Số lượng tài khoản đã tạo:', Object.keys(accounts).length);
            
            // Hiển thị thông tin tài khoản đã tạo
            Object.keys(accounts).forEach(key => {
                const account = accounts[key];
                console.log(`---
Username: ${account.username}
Email: ${account.email}
Mật khẩu: 123456
Họ tên: ${account.fullName}
Bộ phận: ${account.department}
Vị trí: ${account.position}
Vai trò: ${account.role}
Team: ${account.team}
                `);
            });
        } else {
            console.error('Lỗi khi lưu tài khoản');
        }

    } catch (error) {
        console.error('Lỗi khi tạo tài khoản:', error);
    }
}

// Hàm xác định vai trò dựa trên vị trí
function determineRole(position) {
    if (!position) return 'user';
    
    const lowerPosition = position.toLowerCase();
    
    if (lowerPosition.includes('leader')) {
        return 'leader';
    } else if (lowerPosition.includes('manager') || lowerPosition.includes('quản lý')) {
        return 'manager';
    } else if (lowerPosition.includes('admin') || lowerPosition.includes('administrator')) {
        return 'admin';
    }
    
    return 'user'; // Mặc định cho NV và các vị trí khác
}

// Chạy hàm tạo tài khoản
createUserAccounts();