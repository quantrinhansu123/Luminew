import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.log("Missing URL or Key in .env");
    process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('order_code, created_at, thoigiangiaohangffm, accounting_check_date, order_date')
    .not('created_at', 'is', null)
    .limit(5);
    
  if (error) {
      console.error(error);
  } else {
      console.log(JSON.stringify(data, null, 2));
  }
}

run();
