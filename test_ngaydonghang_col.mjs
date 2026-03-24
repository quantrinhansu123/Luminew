import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .update({ ngaydonghang: '2026-03-20' })
    .eq('order_code', 'Kemcfbf4905')
    .select();
    
  if (error) {
      console.error("Update error:", error);
  } else {
      console.log("Update success:", data);
  }
}

run();
