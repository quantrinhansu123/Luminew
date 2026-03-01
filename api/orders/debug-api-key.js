/**
 * Script để debug API key authentication
 * Chạy: node api/orders/debug-api-key.js [API_URL] [API_KEY]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function debugAPIKey(apiUrl, apiKey) {
  console.log('\n🔍 Debugging API Key Authentication...\n');
  console.log('='.repeat(60));
  
  // Check API key format
  console.log('\n📋 API Key Analysis:');
  console.log(`   Length: ${apiKey.length} characters`);
  console.log(`   First 8 chars: ${apiKey.substring(0, 8)}...`);
  console.log(`   Last 8 chars: ...${apiKey.substring(apiKey.length - 8)}`);
  console.log(`   Contains spaces: ${apiKey.includes(' ') ? 'YES ⚠️' : 'NO ✅'}`);
  console.log(`   Contains newlines: ${apiKey.includes('\n') ? 'YES ⚠️' : 'NO ✅'}`);
  
  // Test different methods
  console.log('\n🧪 Testing different authentication methods:\n');
  
  const methods = [
    {
      name: 'X-API-Key header',
      headers: { 'X-API-Key': apiKey }
    },
    {
      name: 'Authorization Bearer header',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    },
    {
      name: 'api_key query parameter',
      url: `${apiUrl}?api_key=${encodeURIComponent(apiKey)}`,
      headers: {}
    }
  ];
  
  for (const method of methods) {
    try {
      const url = method.url || apiUrl;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...method.headers,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ ${method.name}: SUCCESS`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Total records: ${data.total || 0}`);
      } else {
        console.log(`❌ ${method.name}: FAILED`);
        console.log(`   Status: ${response.status}`);
        console.log(`   Error: ${data.error || data.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`❌ ${method.name}: ERROR`);
      console.log(`   ${error.message}`);
    }
    console.log('');
  }
  
  // Check environment variables
  console.log('\n📋 Environment Variables Check:');
  const envApiKey = process.env.ORDERS_API_KEY || process.env.VITE_ORDERS_API_KEY;
  if (envApiKey) {
    console.log(`   ✅ ORDERS_API_KEY found in .env`);
    console.log(`   Length: ${envApiKey.length} characters`);
    console.log(`   Matches provided key: ${envApiKey === apiKey ? 'YES ✅' : 'NO ❌'}`);
    
    if (envApiKey !== apiKey) {
      console.log(`   ⚠️  WARNING: API key in .env doesn't match provided key!`);
      console.log(`   .env key: ${envApiKey.substring(0, 8)}...`);
      console.log(`   Provided key: ${apiKey.substring(0, 8)}...`);
    }
  } else {
    console.log(`   ❌ ORDERS_API_KEY not found in .env`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Troubleshooting Tips:');
  console.log('1. Verify API key in Vercel Dashboard:');
  console.log('   - Go to: Vercel → Project → Settings → Environment Variables');
  console.log('   - Check: ORDERS_API_KEY value');
  console.log('   - Ensure: No extra spaces or newlines');
  console.log('\n2. After updating env vars in Vercel:');
  console.log('   - Save the changes');
  console.log('   - Redeploy the project (or wait for auto-deploy)');
  console.log('\n3. Test with curl:');
  console.log(`   curl -H "X-API-Key: ${apiKey.substring(0, 8)}..." ${apiUrl}`);
  console.log('\n4. Check Vercel logs:');
  console.log('   - Vercel Dashboard → Project → Functions → /api/orders → Logs');
  console.log('   - Look for API key verification messages');
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 API Key Debug Tool');
  console.log('='.repeat(60));

  let apiUrl = process.argv[2];
  let apiKey = process.argv[3];

  if (!apiUrl) {
    const envUrl = process.env.VITE_ORDERS_API_URL || process.env.ORDERS_API_URL;
    if (envUrl) {
      apiUrl = envUrl;
      console.log(`\n📍 Using API URL from .env: ${apiUrl}`);
    } else {
      apiUrl = await question('Enter API URL (e.g., https://your-app.vercel.app/api/orders): ');
    }
  }

  if (!apiKey) {
    const envKey = process.env.VITE_ORDERS_API_KEY || process.env.ORDERS_API_KEY;
    if (envKey) {
      apiKey = envKey;
      console.log(`🔑 Using API Key from .env`);
    } else {
      apiKey = await question('Enter API Key: ');
    }
  }

  if (!apiUrl || !apiKey) {
    console.error('\n❌ API URL and API Key are required!');
    rl.close();
    process.exit(1);
  }

  await debugAPIKey(apiUrl, apiKey.trim());
  rl.close();
}

if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ or install node-fetch');
  process.exit(1);
}

main();
