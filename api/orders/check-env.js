/**
 * Script để kiểm tra các environment variables cần thiết cho Orders API
 * Chạy: node api/orders/check-env.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const requiredEnvVars = [
  'ORDERS_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const optionalEnvVars = [
  'VITE_ORDERS_API_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_SERVICE_ROLE_KEY'
];

console.log('🔍 Kiểm tra Environment Variables...\n');

let allGood = true;

// Check required vars
console.log('📋 Required Variables:');
requiredEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive values
    const masked = varName.includes('KEY') 
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}` 
      : value;
    console.log(`  ✅ ${varName}: ${masked}`);
  } else {
    console.log(`  ❌ ${varName}: NOT SET`);
    allGood = false;
  }
});

console.log('\n📋 Optional Variables:');
optionalEnvVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const masked = varName.includes('KEY') 
      ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}` 
      : value;
    console.log(`  ✅ ${varName}: ${masked}`);
  } else {
    console.log(`  ⚠️  ${varName}: NOT SET (optional)`);
  }
});

console.log('\n' + '='.repeat(60));

if (allGood) {
  console.log('✅ Tất cả required environment variables đã được set!');
  console.log('\n💡 Để sử dụng API:');
  console.log(`   API Key: ${process.env.ORDERS_API_KEY?.substring(0, 8)}...`);
  console.log(`   Supabase URL: ${process.env.SUPABASE_URL}`);
  console.log('\n📝 Ví dụ request:');
  console.log(`   curl -H "X-API-Key: ${process.env.ORDERS_API_KEY}" \\`);
  console.log(`     ${process.env.SUPABASE_URL?.replace('supabase.co', 'vercel.app') || 'https://your-domain.vercel.app'}/api/orders`);
} else {
  console.log('❌ Thiếu một số required environment variables!');
  console.log('\n💡 Hãy thêm vào file .env:');
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      console.log(`   ${varName}=your-value-here`);
    }
  });
  console.log('\n📝 Sau đó chạy lại: node api/orders/check-env.js');
  process.exit(1);
}

console.log('='.repeat(60));
