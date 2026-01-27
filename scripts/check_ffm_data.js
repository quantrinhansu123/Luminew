
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkFfmData() {
    console.log('Checking FFM data (HCM/Hanoi teams) in Supabase...');

    // Queries based on VanDon.jsx logic
    const { count: hcmCount, error: hcmError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('team', 'HCM');

    const { count: hnCount, error: hnError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('team', 'Hà Nội');

    const { count: mgtCount, error: mgtError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .ilike('delivery_unit', '%MGT%'); // Assuming 'Đơn vị vận chuyển' -> delivery_unit? Need to check mapping

    if (hcmError) console.error('Error checking HCM:', hcmError);
    else console.log(`✅ Orders with team='HCM': ${hcmCount}`);

    if (hnError) console.error('Error checking Hanoi:', hnError);
    else console.log(`✅ Orders with team='Hà Nội': ${hnCount}`);

    // Also check first few rows to see structure
    const { data: sample, error: sampleError } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (sample && sample.length > 0) {
        console.log('Sample row keys:', Object.keys(sample[0]));
    }
}

checkFfmData();
