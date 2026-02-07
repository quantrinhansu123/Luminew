
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Hardcoded for debug - replace with actual if needed or rely on user env if possible.
// Finding env vars in vite config or .env
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Wait, I shouldn't guess.

// Let's assume the user has a .env file and I can parse it 
// OR just use the previous script approach but WRITE to file.

const script = `
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

try {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
} catch (e) {
    console.log("No .env found");
}

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    try {
        const { data, error } = await supabase.from('orders').select('*').limit(1);
        if (error) {
            fs.writeFileSync('debug_output.txt', 'Error: ' + JSON.stringify(error));
        } else {
            if (data.length > 0) {
                fs.writeFileSync('debug_output.txt', JSON.stringify(Object.keys(data[0]), null, 2));
            } else {
                fs.writeFileSync('debug_output.txt', 'No orders found');
            }
        }
    } catch (e) {
        fs.writeFileSync('debug_output.txt', 'Exception: ' + e.message);
    }
}
run();
`;

fs.writeFileSync('debug_columns_v2.js', script);
