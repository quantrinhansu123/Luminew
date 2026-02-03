const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function checkUsersSchema() {
    console.log('--- Checking Users Table Schema ---\n');

    try {
        // Get one user to see available columns
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error fetching users:', error);
            return;
        }

        if (data && data.length > 0) {
            console.log('Available columns in users table:');
            console.log(Object.keys(data[0]).join(', '));
            console.log('\nSample user data:');
            console.log(JSON.stringify(data[0], null, 2));
        } else {
            console.log('No users found in table');
        }

    } catch (err) {
        console.error('Error:', err);
    }
}

checkUsersSchema();
