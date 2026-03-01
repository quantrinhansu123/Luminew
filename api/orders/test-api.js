/**
 * Script để test Orders API
 * Sử dụng: node api/orders/test-api.js [API_URL] [API_KEY]
 * 
 * Ví dụ:
 *   node api/orders/test-api.js https://your-app.vercel.app/api/orders your-api-key
 *   node api/orders/test-api.js  # Sẽ dùng giá trị từ .env hoặc prompt
 */

const readline = require('readline');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function testAPI(apiUrl, apiKey) {
  console.log('\n🧪 Testing Orders API...\n');
  console.log(`📍 URL: ${apiUrl}`);
  console.log(`🔑 API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT PROVIDED'}`);
  console.log('');

  try {
    const startTime = Date.now();
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`📊 Response Status: ${response.status} ${response.statusText}`);
    console.log(`⏱️  Response Time: ${duration}ms`);
    console.log('');

    const data = await response.json();

    if (response.ok) {
      console.log('✅ API Response:');
      console.log(`   Success: ${data.success}`);
      console.log(`   Total Records: ${data.total || 0}`);
      console.log(`   Data Count: ${data.data?.length || 0}`);
      console.log(`   Fetched At: ${data.fetched_at || 'N/A'}`);
      console.log('');
      
      if (data.data && data.data.length > 0) {
        console.log('📋 Sample Data (first record):');
        console.log(JSON.stringify(data.data[0], null, 2));
      }
      
      console.log('\n✅ API is working correctly!');
      return true;
    } else {
      console.log('❌ API Error Response:');
      console.log(JSON.stringify(data, null, 2));
      
      if (response.status === 401) {
        console.log('\n💡 Tip: Check your API key in Vercel Dashboard');
        console.log('   Vercel → Project → Settings → Environment Variables → ORDERS_API_KEY');
      }
      
      return false;
    }
  } catch (error) {
    console.error('❌ Error testing API:');
    console.error(`   ${error.message}`);
    
    if (error.message.includes('fetch')) {
      console.log('\n💡 Tip: Make sure:');
      console.log('   1. API is deployed to Vercel');
      console.log('   2. URL is correct');
      console.log('   3. Network connection is working');
    }
    
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 Orders API Test Script');
  console.log('='.repeat(60));

  // Get API URL
  let apiUrl = process.argv[2];
  if (!apiUrl) {
    const envUrl = process.env.VITE_ORDERS_API_URL || process.env.ORDERS_API_URL;
    if (envUrl) {
      apiUrl = envUrl;
      console.log(`\n📍 Using API URL from .env: ${apiUrl}`);
    } else {
      apiUrl = await question('Enter API URL (e.g., https://your-app.vercel.app/api/orders): ');
    }
  }

  // Get API Key
  let apiKey = process.argv[3];
  if (!apiKey) {
    const envKey = process.env.VITE_ORDERS_API_KEY || process.env.ORDERS_API_KEY;
    if (envKey) {
      apiKey = envKey;
      console.log(`🔑 Using API Key from .env`);
    } else {
      apiKey = await question('Enter API Key (or get from Vercel Dashboard): ');
    }
  }

  if (!apiUrl || !apiKey) {
    console.error('\n❌ API URL and API Key are required!');
    console.log('\n💡 Usage:');
    console.log('   node api/orders/test-api.js [API_URL] [API_KEY]');
    console.log('\n💡 Or set in .env:');
    console.log('   VITE_ORDERS_API_URL=https://your-app.vercel.app/api/orders');
    console.log('   VITE_ORDERS_API_KEY=your-api-key');
    rl.close();
    process.exit(1);
  }

  const success = await testAPI(apiUrl, apiKey);

  rl.close();
  process.exit(success ? 0 : 1);
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ or install node-fetch');
  console.log('💡 Install: npm install node-fetch@2');
  process.exit(1);
}

main();
