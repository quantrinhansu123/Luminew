import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing Supabase URL or Key in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createAdmin() {
    const email = 'admin@marketing.com';
    const password = '123456';
    const hashedPassword = bcrypt.hashSync(password, 10);

    console.log(`Creating admin account: ${email}`);

    const userData = {
        id: `admin-${Date.now()}`,
        email: email,
        password: hashedPassword,
        role: 'admin',
        name: 'Admin Marketing',
        username: 'admin',
        team: 'MARKETING',
        department: 'Ban Giám Đốc',
        position: 'Quản trị viên',
        created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select();

    if (error) {
        console.error('Error creating admin:', error);
    } else {
        console.log('Successfully created admin account!');
        console.log('Email: admin@marketing.com');
        console.log('Password: 123456');
    }
}

createAdmin();
