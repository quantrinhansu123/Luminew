/**
 * Script để generate API key mới cho Orders API
 * Chạy: node api/orders/generate-api-key.js
 */

const crypto = require('crypto');

console.log('🔑 Generating new API key for Orders API...\n');

// Generate a secure random API key
// Option 1: Base64 encoded random bytes (32 bytes = 44 chars)
const apiKey1 = crypto.randomBytes(32).toString('base64');

// Option 2: Hex encoded random bytes (32 bytes = 64 chars)
const apiKey2 = crypto.randomBytes(32).toString('hex');

// Option 3: Custom format with prefix
const apiKey3 = `orders_api_${crypto.randomBytes(24).toString('hex')}`;

console.log('='.repeat(60));
console.log('📋 Generated API Keys (choose one):');
console.log('='.repeat(60));

console.log('\n1️⃣ Base64 format (44 characters):');
console.log(`   ${apiKey1}`);

console.log('\n2️⃣ Hex format (64 characters):');
console.log(`   ${apiKey2}`);

console.log('\n3️⃣ Custom format with prefix:');
console.log(`   ${apiKey3}`);

console.log('\n' + '='.repeat(60));
console.log('💡 Recommended: Use option 1 (Base64) or option 2 (Hex)');
console.log('='.repeat(60));

console.log('\n📝 Next steps:');
console.log('1. Copy one of the API keys above');
console.log('2. Add to Vercel Dashboard:');
console.log('   - Go to: Vercel → Project → Settings → Environment Variables');
console.log('   - Add: ORDERS_API_KEY = [paste your chosen key]');
console.log('   - Select: All Environments');
console.log('   - Save and redeploy');
console.log('\n3. (Optional) Add to local .env file for testing:');
console.log(`   ORDERS_API_KEY=${apiKey1}`);
console.log('\n4. Test API:');
console.log('   node api/orders/test-api.js');
