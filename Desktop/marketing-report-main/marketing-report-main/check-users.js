import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Lỗi: Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUsers() {
  try {
    console.log('='.repeat(60));
    console.log('📋 Kiểm tra danh sách users trong Supabase');
    console.log('='.repeat(60));
    console.log();

    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, email, password, role')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (users && users.length > 0) {
      let count = 0;
      let noPassword = 0;
      let admins = 0;
      let leaders = 0;

      console.log('ID         | Username         | Email                          | Role  | Password');
      console.log('-'.repeat(100));

      for (const user of users) {
        count++;
        const hasPassword = user.password ? '✅ Có' : '❌ Không';
        
        if (!user.password) noPassword++;
        if (user.role === 'admin') admins++;
        if (user.role === 'leader') leaders++;

        console.log(
          `${(user.id || '').substring(0, 10).padEnd(10)} | ${(user.username || 'N/A').padEnd(16)} | ${(user.email || 'N/A').padEnd(30)} | ${(user.role || 'user').padEnd(5)} | ${hasPassword}`
        );
      }
      console.log('-'.repeat(100));
      console.log();
      console.log(`📊 Thống kê:`);
      console.log(`   - Tổng users: ${count}`);
      console.log(`   - Admin: ${admins}`);
      console.log(`   - Leader: ${leaders}`);
      console.log(`   - Users không có mật khẩu: ${noPassword}`);
    } else {
      console.log('❌ Không có users nào trong database');
    }
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }

  process.exit(0);
}

checkUsers();