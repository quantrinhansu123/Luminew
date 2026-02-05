require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testLogin(email, password) {
    console.log('\n🔐 Testing login...');
    console.log('Email:', email);
    console.log('Supabase URL:', supabaseUrl);
    console.log('Supabase Key:', supabaseAnonKey ? 'Set' : 'Missing');
    
    try {
        // Query user
        console.log('\n📡 Querying users table...');
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (userError) {
            console.error('❌ Supabase error:', userError);
            if (userError.code === 'PGRST116') {
                console.log('⚠️ User not found with email:', email);
            }
            return;
        }

        if (!user) {
            console.log('⚠️ No user found');
            return;
        }

        console.log('\n✅ User found:');
        console.log('  ID:', user.id);
        console.log('  Email:', user.email);
        console.log('  Username:', user.username);
        console.log('  Name:', user.name);
        console.log('  Role:', user.role);
        console.log('  Has Password:', !!user.password);
        console.log('  Password Length:', user.password ? user.password.length : 0);
        console.log('  Password Preview:', user.password ? user.password.substring(0, 20) + '...' : 'N/A');

        if (!user.password) {
            console.log('\n⚠️ User has no password set!');
            return;
        }

        // Test password
        console.log('\n🔒 Testing password...');
        const passwordMatch = bcrypt.compareSync(password, user.password);
        console.log('Password Match:', passwordMatch);

        if (passwordMatch) {
            console.log('\n✅ Login would be successful!');
        } else {
            console.log('\n❌ Password does not match!');
            console.log('Try checking:');
            console.log('  1. Is the password correct?');
            console.log('  2. Was the password hashed with bcrypt?');
            console.log('  3. Check password in AdminTools -> Quản lý tài khoản mật khẩu');
        }

    } catch (err) {
        console.error('\n❌ Error:', err);
    }
}

// Get email and password from command line
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
    console.log('Usage: node test_login.js <email> <password>');
    console.log('Example: node test_login.js admin@marketing.com password123');
    process.exit(1);
}

testLogin(email, password).then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
