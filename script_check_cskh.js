
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCSKH() {
    console.log("🔍 Checking CSKH data in 'orders' table...");

    // Fetch all CSKH values
    // Note: We scan a large number, e.g. 5000 recent orders or all if possible.
    // Since we are running a script, we can paginate if needed, but let's try a simple fetch first.

    // We want to count distinct stats.
    // Query: select cskh from orders

    // Limits: Max fetch matches in supabase usually 1000 without range.
    // Let's count them.

    const { count: totalOrders, error: countError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error("❌ Error counting orders:", countError);
        return;
    }

    console.log(`📊 Total Orders in DB: ${totalOrders}`);

    // Fetch orders with non-null CSKH
    const { count: cskhOrders, error: cskhError } = await supabase
        .from('orders')
        .select('cskh', { count: 'exact', head: true })
        .not('cskh', 'is', null)
        .neq('cskh', '')
        .neq('cskh', ' ');

    if (cskhError) {
        console.error("❌ Error counting CSKH orders:", cskhError);
        return;
    }

    console.log(`📊 Orders with CSKH data (not null/empty): ${cskhOrders}`);

    // Analyze distribution of top 50 CSKH names
    console.log("🔍 Analyzing distribution (fetching sample)...");

    const { data, error } = await supabase
        .from('orders')
        .select('cskh')
        .not('cskh', 'is', null)
        .neq('cskh', '')
        .limit(2000)
        .order('created_at', { ascending: false }); // Get recent ones

    if (error) {
        console.error("❌ Error fetching sample:", error);
    } else {
        const stats = {};
        let emptyCount = 0;

        data.forEach(r => {
            const val = (r.cskh || '').trim();
            if (!val) {
                emptyCount++;
                return;
            }
            stats[val] = (stats[val] || 0) + 1;
        });

        console.log(`\n📋 Recent Sample Distribution (last ${data.length} records):`);
        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
        sorted.slice(0, 15).forEach(([name, count]) => {
            console.log(`   - "${name}": ${count}`);
        });

        if (sorted.length > 15) console.log(`   ... and ${sorted.length - 15} more names.`);
    }
}

checkCSKH();
