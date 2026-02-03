
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseKey = 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy'; // Using Anon Key

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log("Checking if table 'system_settings' exists...");

    // Attempt to select from the table
    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error accessing table 'system_settings':");
        console.error(error.message);
        console.error(error);

        if (error.code === '42P01') {
            console.log("VERDICT: Table does NOT exist (42P01 undefined_table).");
        } else {
            console.log("VERDICT: Table MIGHT exist but errors occurred (permissions?).");
        }
    } else {
        console.log("✅ Table 'system_settings' ACCESSIBLE.");
        console.log("Data sample:", data);
        console.log("VERDICT: Table EXISTS.");
    }
}

checkTable();
