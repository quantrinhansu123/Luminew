import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_column_type', { table_name: 'orders', column_name: 'ngaydonghang' });
  
  if (error) {
    // If RPC doesn't exist, try querying information_schema if possible, but usually we can't.
    // Let's try to just insert a string and see the error if any.
    console.log("RPC get_column_type not found or failed. Trying direct query of information_schema via SQL if possible (rare).");
    console.error(error);
  } else {
    console.log(data);
  }
}

async function run2() {
  // alternative to check type: try to describe or just fetch and check typeof
  const { data, error } = await supabase.from('orders').select('ngaydonghang').not('ngaydonghang', 'is', null).limit(1);
  if (data && data[0]) {
      console.log("Sample value:", data[0].ngaydonghang);
      console.log("Typeof:", typeof data[0].ngaydonghang);
  }
}

run2();
