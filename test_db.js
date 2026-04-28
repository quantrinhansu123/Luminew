import { supabase } from './src/supabaseClient.js'; async function check() { const { data } = await supabase.from('orders').select('team').limit(10); console.log(data); }; check();
