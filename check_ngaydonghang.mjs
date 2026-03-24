import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('order_code, created_at, ngaydonghang')
    .limit(10);
    
  if (error) {
      console.error(error);
  } else {
      console.log(JSON.stringify(data, null, 2));
  }
}

run();
