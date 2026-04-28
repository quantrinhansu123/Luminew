import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://gsjhsmxyxjyiqovauyrp.supabase.co";
const supabaseKey = "sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testUpsert() {
  console.log('🧪 Testing manual upsert to mkt_kpi_alerts...\n');

  const testAlerts = [
    {
      alert_id: 'test_01/01/2024|Nguyễn Văn A|ti_le_chot|critical',
      source_page: 'test-manual',
      date_label: '01/01/2024',
      report_date: '2024-01-01',
      employee_name: 'Nguyễn Văn A',
      team: 'MKT - Test',
      severity: 'critical',
      content: 'Tỉ lệ chốt thấp: 3.5%',
      cause: 'Ngưỡng cảnh báo: <= 5%',
      alert_ts_ms: Date.now(),
      last_seen_at: new Date().toISOString(),
    },
    {
      alert_id: 'test_01/01/2024|Trần Thị B|cps|warning',
      source_page: 'test-manual',
      date_label: '01/01/2024',
      report_date: '2024-01-01',
      employee_name: 'Trần Thị B',
      team: 'MKT - Test',
      severity: 'warning',
      content: 'CPS chạm ngưỡng: 850,000 VND',
      cause: 'Ngưỡng CPS vàng theo nhóm thị trường',
      alert_ts_ms: Date.now(),
      last_seen_at: new Date().toISOString(),
    },
  ];

  console.log('📝 Inserting', testAlerts.length, 'test alerts...');
  console.log(JSON.stringify(testAlerts, null, 2));
  console.log('');

  const { data, error } = await supabase
    .from('mkt_kpi_alerts')
    .upsert(testAlerts, { onConflict: 'alert_id' })
    .select();

  if (error) {
    console.error('❌ Error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return;
  }

  console.log('✅ Successfully inserted', data?.length || 0, 'alerts');
  console.log('');

  // Verify
  const { data: verify, error: verifyError } = await supabase
    .from('mkt_kpi_alerts')
    .select('*')
    .eq('source_page', 'test-manual');

  if (verifyError) {
    console.error('❌ Verification error:', verifyError);
    return;
  }

  console.log('🔍 Verification - Found', verify?.length || 0, 'test alerts in database');
  console.log(JSON.stringify(verify, null, 2));
}

testUpsert().catch(console.error);
