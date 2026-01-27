const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY || envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyPermissions() {
    console.log('--- Applying Hierarchical Data Permissions ---');

    try {
        // Read the SQL file
        const sqlPath = path.resolve(__dirname, 'enforce_matrix_permissions.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL script...');
        console.log('Note: This script creates RLS functions and policies.');
        console.log('You may need to run this directly in Supabase SQL Editor if service role key is not available.\n');

        // Split by statement and execute (basic approach)
        // Note: Supabase JS doesn't support multi-statement execution directly
        // We'll need to use the SQL editor or a direct postgres client

        console.log('IMPORTANT: Please execute the following file in your Supabase SQL Editor:');
        console.log(`File: ${sqlPath}`);
        console.log('\nSteps:');
        console.log('1. Go to your Supabase Dashboard > SQL Editor');
        console.log('2. Create a new query');
        console.log('3. Copy and paste the contents of enforce_matrix_permissions.sql');
        console.log('4. Click "Run" to execute');
        console.log('\nThis will create the hierarchical permission functions and update all RLS policies.');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

applyPermissions();
