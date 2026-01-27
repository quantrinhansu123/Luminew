require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Auto-detect credentials
let supabaseUrl = '';
let supabaseKey = '';

const clientPath = path.join(__dirname, 'src', 'services', 'supabaseClient.js');
try {
    const content = fs.readFileSync(clientPath, 'utf8');
    // Regex to extract VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the file content if hardcoded
    // or if using import.meta.env, we won't find values here usually.
    // For now, let's just print what we find or try to find .env
    const urlMatch = content.match(/VITE_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

    if (urlMatch) supabaseUrl = urlMatch[1];
    if (keyMatch) supabaseKey = keyMatch[1];

} catch (e) { }

if (!supabaseUrl || !supabaseKey) {
    if (fs.existsSync(path.join(__dirname, '.env'))) {
        const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const urlLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_URL'));
        const keyLine = env.split('\n').find(x => x.includes('VITE_SUPABASE_ANON_KEY'));
        if (urlLine) supabaseUrl = urlLine.split('=')[1].trim();
        if (keyLine) supabaseKey = keyLine.split('=')[1].trim();
    }
}

if (!supabaseUrl || !supabaseKey) {
    console.error("No credentials found.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
    console.log("Counting rows in 'sales_reports'...");
    const { count, error } = await supabase
        .from('sales_reports')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log(`Total Rows in Supabase: ${count}`);
    }

    // Check if firebase_id is populated
    const { data: sample, error: err2 } = await supabase
        .from('sales_reports')
        .select('id, firebase_id')
        .not('firebase_id', 'is', null)
        .limit(5);

    if (sample && sample.length > 0) {
        console.log("Confirmed: Some rows have firebase_id.");
    } else {
        console.log("WARNING: No rows have firebase_id found (or RLS hidden).");
    }
})();
