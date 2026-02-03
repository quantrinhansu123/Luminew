/**
 * Script để thêm cột selected_personnel vào bảng users
 * 
 * Cách chạy:
 * node supabase_scripts/run_add_selected_personnel.js
 * 
 * Hoặc chạy trực tiếp SQL trong Supabase Dashboard:
 * - Vào Supabase Dashboard > SQL Editor
 * - Copy nội dung từ add_selected_personnel_column.sql
 * - Chạy query
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Cần service role key để thực hiện ALTER TABLE
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env');
    console.error('   Cần VITE_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (hoặc VITE_SUPABASE_ANON_KEY)');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('🔄 Đang chạy migration: Thêm cột selected_personnel...\n');

    try {
        // Đọc SQL file
        const sqlPath = resolve(__dirname, 'add_selected_personnel_column.sql');
        const sqlContent = readFileSync(sqlPath, 'utf8');
        
        console.log('📄 SQL Script:');
        console.log('─'.repeat(60));
        console.log(sqlContent);
        console.log('─'.repeat(60));
        console.log('');

        // Supabase JS client không hỗ trợ chạy SQL trực tiếp
        // Cần sử dụng REST API hoặc chạy trong SQL Editor
        console.log('⚠️  Supabase JS client không hỗ trợ chạy ALTER TABLE trực tiếp.');
        console.log('📝 Vui lòng chạy SQL script trong Supabase Dashboard:\n');
        console.log('   1. Vào Supabase Dashboard > SQL Editor');
        console.log('   2. Tạo query mới');
        console.log('   3. Copy và paste nội dung SQL ở trên');
        console.log('   4. Click "Run" để thực thi\n');

        // Thử kiểm tra xem cột đã tồn tại chưa
        console.log('🔍 Đang kiểm tra xem cột đã tồn tại chưa...');
        const { data, error } = await supabase
            .from('users')
            .select('selected_personnel')
            .limit(1);

        if (error) {
            if (error.message.includes('column') && error.message.includes('does not exist')) {
                console.log('❌ Cột selected_personnel chưa tồn tại.');
                console.log('   Vui lòng chạy SQL script trong Supabase Dashboard như hướng dẫn ở trên.\n');
            } else {
                console.error('❌ Lỗi:', error.message);
            }
        } else {
            console.log('✅ Cột selected_personnel đã tồn tại!');
            console.log('   Migration đã được thực hiện trước đó.\n');
        }

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        console.log('\n📝 Vui lòng chạy SQL script trực tiếp trong Supabase Dashboard:\n');
        console.log('   1. Vào Supabase Dashboard > SQL Editor');
        console.log('   2. Copy nội dung từ: supabase_scripts/add_selected_personnel_column.sql');
        console.log('   3. Paste và chạy query\n');
    }
}

runMigration();
