// Quick test script to verify Supabase connection
// Run: node apps/web/test-supabase.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing env. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local');
  process.exit(1);
}

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey.substring(0, 12) + '...' + supabaseKey.substring(supabaseKey.length - 6));

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  try {
    // Test query
    const { data, error } = await supabase
      .from('lead_sources')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error:', error.message);
      console.error('Details:', error);
      if (error.message.includes('RLS') || error.message.includes('policy')) {
        console.error('\n⚠️  RLS is enabled! You need to disable RLS or create policies.');
        console.error('Run the SQL in apps/web/disable-rls.sql in Supabase SQL Editor');
      }
    } else {
      console.log('✅ Connection successful!');
      console.log('Data:', data);
    }
  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

test();
