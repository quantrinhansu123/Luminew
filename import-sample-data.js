/**
 * Script để import sample data vào Supabase
 * Chạy: node import-sample-data.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Lỗi: Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

// Khởi tạo Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Đọc sample data từ file JSON
const sampleDataPath = path.join(__dirname, 'sample-data.json');

async function importSampleData() {
  console.log('='.repeat(70));
  console.log('📊 Import Sample Data vào Supabase');
  console.log('='.repeat(70));
  console.log();

  try {
    // Đọc file JSON
    const rawData = fs.readFileSync(sampleDataPath, 'utf8');
    const sampleData = JSON.parse(rawData);
    
    console.log('📄 Đã tải file sample-data.json\n');

    // Import users
    await importUsers(sampleData.users);
    
    // Import human_resources
    await importHumanResources(sampleData.human_resources);
    
    // Import detail_reports
    await importDetailReports(sampleData.detail_reports);
    
    // Import reports
    await importReports(sampleData.reports);

    console.log('\n✅ Import dữ liệu thành công!\n');
    
    // Liệt kê tất cả dữ liệu
    await listAllData();

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
  }

  process.exit(0);
}

async function importUsers(users) {
  try {
    console.log('📝 Đang import users...');
    
    for (const user of users) {
      const { error } = await supabase
        .from('users')
        .upsert([user], { onConflict: 'id' });
      
      if (error) {
        console.log(`   ⚠️  Lỗi thêm user ${user.username}: ${error.message}`);
      } else {
        console.log(`   ✅ Đã thêm user: ${user.username} (${user.email})`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi import users:', error.message);
  }
}

async function importHumanResources(hrData) {
  try {
    console.log('\n📝 Đang import human_resources...');
    
    for (const hr of hrData) {
      const { error } = await supabase
        .from('human_resources')
        .upsert([hr], { onConflict: 'id' });
      
      if (error) {
        console.log(`   ⚠️  Lỗi thêm ${hr['Họ Và Tên']}: ${error.message}`);
      } else {
        console.log(`   ✅ Đã thêm: ${hr['Họ Và Tên']} (${hr.Team})`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi import human_resources:', error.message);
  }
}

async function importDetailReports(reports) {
  try {
    console.log('\n📝 Đang import detail_reports...');
    
    for (const report of reports) {
      const { error } = await supabase
        .from('detail_reports')
        .upsert([report], { onConflict: 'id' });
      
      if (error) {
        console.log(`   ⚠️  Lỗi thêm report ${report.id}: ${error.message}`);
      } else {
        console.log(`   ✅ Đã thêm report: ${report.Tên} (${report.Ngày})`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi import detail_reports:', error.message);
  }
}

async function importReports(reports) {
  try {
    console.log('\n📝 Đang import reports...');
    
    for (const report of reports) {
      const { error } = await supabase
        .from('reports')
        .upsert([report], { onConflict: 'id' });
      
      if (error) {
        console.log(`   ⚠️  Lỗi thêm report ${report.id}: ${error.message}`);
      } else {
        console.log(`   ✅ Đã thêm report: ${report.id}`);
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi import reports:', error.message);
  }
}

async function listAllData() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📋 Tổng hợp dữ liệu trong Supabase:');
    console.log('='.repeat(70));

    // Count users
    const { count: usersCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Count human_resources
    const { count: hrCount } = await supabase
      .from('human_resources')
      .select('*', { count: 'exact', head: true });

    // Count detail_reports
    const { count: detailCount } = await supabase
      .from('detail_reports')
      .select('*', { count: 'exact', head: true });

    // Count reports
    const { count: reportsCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Thống kê:`);
    console.log(`   Users: ${usersCount || 0}`);
    console.log(`   Human Resources: ${hrCount || 0}`);
    console.log(`   Detail Reports: ${detailCount || 0}`);
    console.log(`   Reports: ${reportsCount || 0}`);
    console.log();
  } catch (error) {
    console.error('❌ Lỗi khi lấy thống kê:', error.message);
  }
}

// Chạy script
importSampleData();
