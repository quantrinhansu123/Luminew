import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync('test_result.txt', msg + '\n');
};

if (!supabaseUrl || !supabaseAnonKey) {
    log('Missing Supabase env vars!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    log('Testing Supabase connection to change_logs...');
    fs.writeFileSync('test_result.txt', 'Starting test...\n');

    try {
        const { data, error } = await supabase
            .from('change_logs')
            .select('*')
            .limit(5);

        if (error) {
            log('Error fetching change_logs: ' + JSON.stringify(error, null, 2));
        } else {
            log('Success! Data found: ' + data.length + ' records');
            log('Sample: ' + JSON.stringify(data[0] || {}, null, 2));
        }
    } catch (err) {
        log('Exception: ' + err.message);
    }
}

testConnection();
