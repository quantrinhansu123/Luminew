import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumn() {
  console.log('Attempting to add column "tracking_check_date" to table "orders"...');

  // Note: Standard Supabase client (Anon Key) usually CANNOT run DDL like ALTER TABLE.
  // We try using rpc if available, or just tell the user if it fails.
  // Usually, SQL must be run in the Supabase Dashboard.

  const { error } = await supabase.rpc('exec_sql', {
    sql: 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_check_date DATE;'
  });

  if (error) {
    console.error('Failed to add column via RPC (likely missing exec_sql function):', error.message);
    console.log('\n--- ACTION REQUIRED ---');
    console.log('Please go to Supabase Dashboard > SQL Editor and run:');
    console.log('ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_check_date DATE;');
    console.log('------------------------\n');
  } else {
    console.log('Successfully added column "tracking_check_date"!');
  }
}

addColumn();
