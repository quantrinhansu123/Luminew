require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Helper to get supabase client from env or hardcoded logic (since I don't have direct access to env in this context easily without reading files)
// I will try to read from the src/services/supabaseClient.js or just search for the keys in the project to be safe.
// Wait, I can just use the keys if I find them. Let me rely on the user having .env or I can parse the client file.

// Parsing credentials from existing file for the script
const fs = require('fs');
const path = require('path');

const clientPath = path.join(__dirname, 'src', 'services', 'supabaseClient.js');
let supabaseUrl = '';
let supabaseKey = '';

try {
    const content = fs.readFileSync(clientPath, 'utf8');
    const urlMatch = content.match(/VITE_SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = content.match(/VITE_SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/);

    // Also try checking process.env style if the file uses import.meta.env
    // The previous view_file of BaoCaoSale didn't show the client file content fully.

    // Let's assume standard Vite env vars if not found directly in file (usually they are in .env)
    // But since I can't read .env easily (might be gitignored), I will try to "grep" for them in the project OR just ask the Supabase client to error out if needed.
    // Actually, I can allow the script to fail if no keys.

} catch (e) {
    console.log("Could not read client file.");
}

// Fallback: Hardcoded keys from previous context if available? 
// I don't see them in recent history. I'll read src/services/supabaseClient.js first to get keys correctly.
console.log("Reading supabaseClient.js to find keys...");
const clientContent = fs.readFileSync(path.join(__dirname, 'src/services/supabaseClient.js'), 'utf8');

// Simple regex to extract (assuming they are hardcoded or using import.meta.env)
// If they use import.meta.env, I need to check .env file.
if (clientContent.includes('import.meta.env')) {
    try {
        const envPath = path.join(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const urlLine = envContent.split('\n').find(l => l.includes('VITE_SUPABASE_URL'));
            const keyLine = envContent.split('\n').find(l => l.includes('VITE_SUPABASE_ANON_KEY'));
            if (urlLine) supabaseUrl = urlLine.split('=')[1].trim();
            if (keyLine) supabaseKey = keyLine.split('=')[1].trim();
        }
    } catch (e) { console.error("Error reading .env", e); }
}

if (!supabaseUrl || !supabaseKey) {
    console.error("Could not find Supabase credentials. Please set SUPABASE_URL and SUPABASE_KEY env vars or check .env file.");
    // Try one more fallback: check if they are hardcoded
    const urlMatch = clientContent.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
    if (urlMatch) supabaseUrl = urlMatch[1];
}

console.log(`URL: ${supabaseUrl ? 'Found' : 'Missing'}, Key: ${supabaseKey ? 'Found' : 'Missing'}`);

if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    (async () => {
        console.log("Checking 'firebase_id' column in 'sales_reports'...");
        const { data, error } = await supabase
            .from('sales_reports')
            .select('firebase_id')
            .limit(1);

        if (error) {
            console.error("Error querying column:", error.message);
            if (error.code === '42703') {
                console.log("CONCLUSION: Column 'firebase_id' DOES NOT EXIST.");
            } else {
                console.log("CONCLUSION: Other error occurred.");
            }
        } else {
            console.log("CONCLUSION: Column 'firebase_id' EXISTS.");
            console.log("Sample Data:", data);
        }
    })();
}
