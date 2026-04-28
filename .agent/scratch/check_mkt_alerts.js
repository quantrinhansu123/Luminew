import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gsjhsmxyxjyiqovauyrp.supabase.co";
const supabaseKey = "sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count, error } = await supabase
    .from('mkt_kpi_alerts')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error fetching count:', error);
  } else {
    console.log('Total records in mkt_kpi_alerts:', count);
  }

  const { data: samples, error: err2 } = await supabase
    .from('mkt_kpi_alerts')
    .select('*')
    .limit(3);
  
  if (err2) {
    console.error('Error fetching samples:', err2);
  } else {
    console.log('Sample records:', JSON.stringify(samples, null, 2));
  }
}

check();
