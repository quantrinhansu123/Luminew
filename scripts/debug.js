import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env explicitly to match migration script logic
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

console.log('Node version:', process.version);
console.log('Supabase URL defined:', !!process.env.VITE_SUPABASE_URL);
console.log('Fetch available:', typeof fetch);
if (typeof fetch !== 'undefined') {
    try {
        console.log('Testing fetch...');
        const res = await fetch('https://n-api-gamma.vercel.app/report/generate?tableName=Báo cáo MKT');
        console.log('Fetch status:', res.status);
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}
