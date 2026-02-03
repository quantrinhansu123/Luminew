/**
 * Script để thêm users vào Supabase với mật khẩu đã hash
 * Chạy: node add_users.js
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

// Sample users (mật khẩu sẽ được hash trước khi lưu)
const sampleUsers = [
  {
    username: 'admin',
    password: 'admin123',
    email: 'admin@example.com',
    role: 'admin',
    name: 'Quản trị viên'
  },
  {
    username: 'marketing',
    password: 'mkt123',
    email: 'marketing@example.com',
    role: 'user',
    name: 'Marketing User'
  },
  {
    username: 'demo',
    password: 'demo123',
    email: 'demo@example.com',
    role: 'user',
    name: 'Demo User'
  },
  {
    username: 'test',
    password: 'test123',
    email: 'test@example.com',
    role: 'user',
    name: 'Test User'
  }
];

async function addUsers() {
  console.log('='.repeat(60));
  console.log('🔐 Supabase Users Management Tool');
  console.log('='.repeat(60));
  console.log();

  try {
    console.log('📝 Đang thêm users vào Supabase với mật khẩu đã hash...');
    
    const salt = bcrypt.genSaltSync(10);
    
    for (const user of sampleUsers) {
      const { password, ...userData } = user;
      
      // Hash mật khẩu
      const hashedPassword = bcrypt.hashSync(password, salt);
      
      // Kiểm tra nếu user đã tồn tại
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single();
      
      if (existingUser) {
        console.log(`   ⏭️  Bỏ qua: ${userData.username} (đã tồn tại)`);
        continue;
      }
      
      // Lưu user với password đã hash
      const { error } = await supabase
        .from('users')
        .insert([
          {
            ...userData,
            password: hashedPassword,
            created_at: new Date().toISOString()
          }
        ]);
      
      if (error) {
        console.log(`   ❌ Lỗi thêm: ${userData.username} - ${error.message}`);
      } else {
        console.log(`   ✅ Đã thêm: ${userData.username} (password: ${password} -> hashed)`);
      }
    }

    console.log(`\n✅ Hoàn tất thêm users vào Supabase!\n`);
    console.log('📋 Thông tin đăng nhập (mật khẩu gốc):');
    console.log('-'.repeat(60));
    console.log('Username         | Password   | Role');
    console.log('-'.repeat(60));
    
    for (const user of sampleUsers) {
      console.log(`${user.username.padEnd(16)} | ${user.password.padEnd(10)} | ${user.role}`);
    }
    console.log('-'.repeat(60));

    // Liệt kê users
    await listUsers();

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }

  process.exit(0);
}

async function listUsers() {
  try {
    console.log('\n📋 Danh sách users trong Supabase:');
    console.log('-'.repeat(80));
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, role')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (users && users.length > 0) {
      console.log('ID         | Username         | Email                          | Role');
      console.log('-'.repeat(80));
      
      for (const user of users) {
        console.log(
          `${(user.id || '').substring(0, 10).padEnd(10)} | ${(user.username || '').padEnd(16)} | ${(user.email || 'N/A').padEnd(30)} | ${user.role || 'N/A'}`
        );
      }
      console.log('-'.repeat(80));
      console.log(`Tổng số: ${users.length} users`);
    } else {
      console.log('❌ Không có users nào trong database');
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách users:', error.message);
  }
}

// Chạy script
addUsers();
