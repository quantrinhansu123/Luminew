const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { count: ordersCount, error: err1 } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .or('shipping_unit.ilike.%ffm%,shipping_unit.ilike.%mgt%,shipping_unit.ilike.%t&t%');
    
    const { count: logsCount, error: err2 } = await supabase
        .from('ffm_push_logs')
        .select('*', { count: 'exact', head: true });

    const { count: ordersCountHcm, error: err3 } = await supabase
        .from('order_code_hcm')
        .select('*', { count: 'exact', head: true })
        .or('shipping_unit.ilike.%ffm%,shipping_unit.ilike.%mgt%,shipping_unit.ilike.%t&t%');

    const { count: logsCountHcm, error: err4 } = await supabase
        .from('ffm_push_logs_hcm')
        .select('*', { count: 'exact', head: true });

    if (err1) console.error('Error orders:', err1);
    if (err2) console.error('Error logs:', err2);
    if (err3) console.error('Error orders HCM:', err3);
    if (err4) console.error('Error logs HCM:', err4);

    console.log('--- HN ---');
    console.log('Orders (FFM/MGT/T&T):', ordersCount);
    console.log('Push Logs:', logsCount);
    console.log('\n--- HCM ---');
    console.log('Orders HCM (FFM/MGT/T&T):', ordersCountHcm);
    console.log('Push Logs HCM:', logsCountHcm);
}

check();
