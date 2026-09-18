/**
 * Nạp JSON backup → orders_backup_2025 + order_code_hcm_backup_2025.
 * Không ghi đè bảng live orders / order_code_hcm.
 *
 * Trước khi chạy: chạy SQL supabase/manual/create_orders_backup_2025.sql trên Supabase.
 *
 *   node scripts/import-orders-backup-2025.mjs
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const EXTRACT_DIR = path.resolve(__dirname, '../backup_20260413_104222_extracted');
const BATCH_SIZE = 50;

const JOBS = [
  {
    table: 'orders_backup_2025',
    file: 'orders_20260413_104222.json',
    onConflict: 'id',
  },
  {
    table: 'order_code_hcm_backup_2025',
    file: 'order_code_hcm_20260413_104222.json',
    onConflict: 'id',
  },
];

async function ensureTableExists(table) {
  const { error } = await supabase.from(table).select('id').limit(1);
  if (error) {
    console.error(
      `Bảng ${table} chưa sẵn sàng: ${error.message}\n` +
        '→ Chạy SQL supabase/manual/create_orders_backup_2025.sql trên Supabase SQL Editor trước.'
    );
    return false;
  }
  return true;
}

async function importFile({ table, file, onConflict }) {
  const fullPath = path.join(EXTRACT_DIR, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Không thấy file: ${fullPath}`);
  }
  console.log(`\n📖 ${file} → ${table}`);
  const rows = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file} không phải JSON array`);
  console.log(`   ${rows.length} dòng`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) {
      fail += batch.length;
      console.error(`   ❌ lô ${i}-${i + batch.length}: ${error.message}`);
    } else {
      ok += batch.length;
      if ((i / BATCH_SIZE) % 20 === 0 || i + BATCH_SIZE >= rows.length) {
        console.log(`   … ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
      }
    }
  }
  console.log(`   xong: ok=${ok}, fail=${fail}`);
  return { ok, fail };
}

async function main() {
  for (const job of JOBS) {
    const ready = await ensureTableExists(job.table);
    if (!ready) process.exit(1);
  }
  for (const job of JOBS) {
    await importFile(job);
  }
  console.log('\nHoàn tất nạp backup orders + order_code_hcm.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
