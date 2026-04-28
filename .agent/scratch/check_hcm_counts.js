const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: ordersCount, error: err1 } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: hcmCount, error: err2 } = await supabase.from('order_code_hcm').select('*', { count: 'exact', head: true });
  
  console.log('Orders count:', ordersCount);
  console.log('HCM count:', hcmCount);
  if (err1) console.error('Error orders:', err1);
  if (err2) console.error('Error hcm:', err2);
}

check();
