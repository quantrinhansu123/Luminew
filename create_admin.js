/**
 * Script để tạo user admin vào Supabase
 * Chạy: node create_admin.js
 */

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Lỗi: Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

// Khởi tạo Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Admin user
const adminUser = {
  username: 'admin',
  password: '123456',
  email: 'admin@marketing.com',
  name: 'Administrator',
  role: 'admin',
  department: 'Admin',
  position: 'Admin',
  team: 'Admin',
  shift: 'Ca Ngày',
  branch: 'Hà Nội'
};

async function createAdmin() {
  console.log('='.repeat(60));
  console.log('👑 Tạo User Admin');
  console.log('='.repeat(60));
  console.log();

  try {
    // Hash mật khẩu
    console.log('🔐 Đang hash mật khẩu...');
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(adminUser.password, salt);

    // Kiểm tra nếu admin đã tồn tại
    const { data: existingAdmin } = await supabase
      .from('users')
      .select('id')
      .eq('email', adminUser.email)
      .single();
    
    if (existingAdmin) {
      console.log('⏭️  Admin user đã tồn tại, bỏ qua tạo mới\n');
      await listAdmins();
      process.exit(0);
    }

    // Bước 1: Tạo user record trong users table
    console.log('📝 Đang tạo admin user trong users...');
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          username: adminUser.username,
          password: hashedPassword,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          department: adminUser.department,
          position: adminUser.position,
          team: adminUser.team,
          shift: adminUser.shift,
          branch: adminUser.branch,
          created_at: new Date().toISOString(),
          created_by: 'auto-script'
        }
      ])
      .select();
    
    if (userError) throw userError;
    console.log('✅ Đã tạo record trong users');

    const adminId = newUser[0].id;

    // Bước 2: Tạo user record trong human_resources table
    console.log('📝 Đang tạo admin user trong human_resources...');
    const { error: hrError } = await supabase
      .from('human_resources')
      .insert([
        {
          id: adminId,
          'Họ Và Tên': adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          Ca: adminUser.shift,
          Team: adminUser.team,
          'chi nhánh': adminUser.branch,
          'Bộ phận': adminUser.department,
          'Vị trí': adminUser.position,
          'Ngày vào làm': new Date().toISOString().split('T')[0],
          status: 'active',
          created_at: new Date().toISOString(),
          created_by: 'auto-script'
        }
      ]);
    
    if (hrError) throw hrError;
    console.log('✅ Đã tạo record trong human_resources');

    console.log('\n✅ Đã tạo admin user thành công!\n');
    console.log('📋 Thông tin đăng nhập:');
    console.log('-'.repeat(60));
    console.log(`Username: ${adminUser.username}`);
    console.log(`Password: ${adminUser.password}`);
    console.log(`Email:    ${adminUser.email}`);
    console.log(`Name:     ${adminUser.name}`);
    console.log(`Role:     ${adminUser.role}`);
    console.log('-'.repeat(60));
    console.log('\n⚠️  LƯU Ý: Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu!');

    // Liệt kê tất cả users
    await listAdmins();

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }

  process.exit(0);
}

async function listAdmins() {
  try {
    console.log('\n📋 Danh sách users trong Supabase:');
    console.log('-'.repeat(100));

    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, name, email, role, team')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (users && users.length > 0) {
      console.log('ID         | Username       | Name                | Email                          | Role  | Team');
      console.log('-'.repeat(100));

      for (const user of users) {
        console.log(
          `${(user.id || '').substring(0, 10).padEnd(10)} | ${(user.username || 'N/A').padEnd(14)} | ${(user.name || 'N/A').padEnd(19)} | ${(user.email || 'N/A').padEnd(30)} | ${(user.role || 'user').padEnd(5)} | ${user.team || 'N/A'}`
        );
      }
      console.log('-'.repeat(100));
      console.log(`Tổng số: ${users.length} users`);
    } else {
      console.log('❌ Không có users nào trong database');
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách users:', error.message);
  }
}

// Chạy script
createAdmin();
