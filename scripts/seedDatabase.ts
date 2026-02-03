/**
 * Script để tự động thêm dữ liệu vào Supabase
 * Chạy script này bằng: npx tsx scripts/seedDatabase.ts
 * hoặc: node --loader ts-node/esm scripts/seedDatabase.ts
 */

import { seedAllData } from '../services/supabaseSeeder.js';

async function main() {
  console.log('========================================');
  console.log('   SUPABASE DATABASE SEEDER');
  console.log('========================================\n');

  try {
    // Thêm tất cả dữ liệu vào Supabase
    // Thay đổi clearExisting thành true nếu muốn xóa dữ liệu cũ trước
    await seedAllData(false);

    console.log('\n✅ Hoàn thành thêm dữ liệu vào Supabase!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi thêm dữ liệu:', error);
    process.exit(1);
  }
}

main();
