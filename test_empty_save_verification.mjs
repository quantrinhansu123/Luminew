import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Use environment variables or fallbacks from supabaseClient.js
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TEST_ORDER_CODE = 'Kemcfbf4905';

async function verifyEmptySave() {
    console.log('--- Phase 1: Direct Supabase Update with null ---');
    // Testing if null works for goods_amount (numeric) and ngaydonghang (date)
    const { data: update1, error: error1 } = await supabase
        .from('orders')
        .update({ 
            goods_amount: null,
            ngaydonghang: null 
        })
        .eq('order_code', TEST_ORDER_CODE)
        .select();

    if (error1) {
        console.error('❌ Direct null update failed:', error1.message);
    } else {
        console.log('✅ Direct null update succeeded:', update1[0].order_code);
        console.log('   goods_amount:', update1[0].goods_amount);
        console.log('   ngaydonghang:', update1[0].ngaydonghang);
    }

    console.log('\n--- Phase 2: Direct Supabase Update with "" (Empty String) ---');
    // This is what was likely failing before
    const { data: update2, error: error2 } = await supabase
        .from('orders')
        .update({ 
            goods_amount: '',
            ngaydonghang: ''
        })
        .eq('order_code', TEST_ORDER_CODE)
        .select();

    if (error2) {
        console.log('✅ Confirmed: Empty string update failed as expected:', error2.message);
    } else {
        console.log('⚠️ Unexpected: Empty string update succeeded for numeric/date columns.');
    }

    console.log('\n--- Phase 3: Verification complete ---');
}

verifyEmptySave();
