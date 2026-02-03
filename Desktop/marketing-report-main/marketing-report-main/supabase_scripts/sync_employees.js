
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const EMPLOYEES_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/employees.json";
const DEFAULT_PASSWORD = "123456";

function formatDate(dateStr) {
    if (!dateStr) return null;
    // Handle DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return null; // or keep as is if ISO?
}

function getRoleFromDepartment(item) {
    const dept = item.bo_phan ? item.bo_phan.toLowerCase() : '';
    const pos = item.vi_tri ? item.vi_tri.toLowerCase() : '';

    // Check for Leader/Manager first
    if (pos.includes('leader') || pos.includes('quản lý') || pos.includes('trưởng phòng')) {
        return 'leader';
    }

    // Map Departments to Roles
    if (dept.includes('mkt') || dept.includes('marketing') || dept.includes('content') || dept.includes('media')) return 'marketing';
    if (dept.includes('sale') || dept.includes('kd')) return 'sale';
    if (dept.includes('cskh')) return 'cskh';
    if (dept.includes('vận đơn') || dept.includes('kho')) return 'delivery';
    if (dept.includes('r&d') || dept.includes('rd')) return 'rnd';
    if (dept.includes('kế toán') || dept.includes('tài chính')) return 'finance';
    if (dept.includes('hr') || dept.includes('hcns') || dept.includes('nhân sự')) return 'hr';

    return 'user'; // Default
}

async function syncEmployees() {
    console.log('Fetching employees from Firebase...');
    const response = await fetch(EMPLOYEES_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch employees: ${response.statusText}`);
    }
    const firebaseData = await response.json();

    if (!firebaseData) {
        console.log('No data found in Firebase.');
        return;
    }

    const entries = Object.entries(firebaseData);
    console.log(`Found ${entries.length} employees. Starting sync...`);

    let successCount = 0;
    let failCount = 0;

    for (const [firebaseKey, emp] of entries) {
        const email = emp.email ? emp.email.trim().toLowerCase() : null;
        const name = emp.ho_va_ten || 'Unknown';

        if (!email) {
            console.warn(`Skipping employee ${name}: No email`);
            continue;
        }

        try {
            // 1. Check if user already exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('email', email)
                .single();

            if (existingUser) {
                console.log(`User ${email} already exists. Updating details...`);
            }

            // Generate ID and Hash Password
            // Use existing ID if user exists, otherwise generate new one
            const userId = existingUser ? existingUser.id : `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Only hash password if creating new user
            let hashedPassword;
            if (!existingUser) {
                hashedPassword = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
            }

            // 2. Upsert into 'users' table
            const userData = {
                email: email,
                username: email.split('@')[0],
                name: name,
                name: name,
                // Auto-detect role based on position
                role: getRoleFromDepartment(emp),
                department: emp.bo_phan,
                team: emp.bo_phan, // Mapping bo_phan to Team
                position: emp.vi_tri,
                branch: emp.chi_nhanh,
                shift: emp.ca_lam_viec,

                // New columns
                avatar_url: emp.avatarUrl || emp.avatarDataUrl,
                phone: emp.sđt,
                dob: formatDate(emp.ngay_sinh),
                official_date: formatDate(emp.ngay_lam_chinh_thuc),
                join_date: formatDate(emp.ngay_vao_lam),
                gender: emp.gioi_tinh,
                marital_status: emp.tinh_trang_hon_nhan,
                hometown: emp.que_quan,
                address: emp.dia_chi_thuong_tru,
                cccd: emp.cccd,
                employee_id: emp.employeeId,

                // New columns from image analysis
                identity_issue_date: formatDate(emp.ngay_cap),
                identity_issue_place: emp.noi_cap,
                employment_status: emp.trang_thai,

                created_at: new Date().toISOString(),
                created_by: 'sync_script'
            };

            if (!existingUser) {
                userData.id = userId;
                userData.password = hashedPassword;
            }

            /* 
               Logic: 
               - If user exists, we update metadata but KEEP password.
               - If user doesn't exist, we insert with ID and default password
            */

            if (!existingUser) {
                // Insert new
                const { error: insertError } = await supabase.from('users').insert(userData);
                if (insertError) throw insertError;
            } else {
                // Update existing (excluding password/id)
                const { error: updateError } = await supabase.from('users').update(userData).eq('id', userId);
                if (updateError) throw updateError;
            }

            // 3. Sync finished for this user
            successCount++;

        } catch (err) {
            console.error(`Failed to sync ${name} (${email}):`, err.message);
            failCount++;
        }
    }

    console.log(`Sync completed. Success: ${successCount}, Failed: ${failCount}`);
}

syncEmployees();
