import { runChiaDonVanDon } from './src/services/chiaDonVanDon.js';
import { supabase } from './src/supabase/config.js';

async function test() {
    console.log('Starting...');
    const addLog = (msg, type) => console.log(`[${type}] ${msg}`);
    try {
        await runChiaDonVanDon({
            supabase,
            branchFilter: 'HCM',
            addLog,
            setNotDividedOrders: () => {},
            setAutoAssignResult: (res) => console.log('Result:', res)
        });
        console.log('Done.');
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

test();
