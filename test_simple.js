import fs from 'fs';
import path from 'path';

console.log('Starting simple test...');
try {
    fs.writeFileSync('simple_log.txt', 'Started\n');

    const envPath = path.resolve('.env');
    if (fs.existsSync(envPath)) {
        fs.appendFileSync('simple_log.txt', '.env found\n');
        const content = fs.readFileSync(envPath, 'utf-8');
        const hasUrl = content.includes('VITE_SUPABASE_URL');
        const hasKey = content.includes('VITE_SUPABASE_ANON_KEY');

        fs.appendFileSync('simple_log.txt', `VITE_SUPABASE_URL found: ${hasUrl}\n`);
        fs.appendFileSync('simple_log.txt', `VITE_SUPABASE_ANON_KEY found: ${hasKey}\n`);
    } else {
        fs.appendFileSync('simple_log.txt', '.env NOT found\n');
    }
} catch (err) {
    console.error(err);
}
