/**
 * Script để thêm ORDERS_API_KEY vào file .env
 * Chạy: node api/orders/add-api-key-to-env.js [api-key]
 * Hoặc: node api/orders/add-api-key-to-env.js (sẽ generate mới)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '.env');

// Read existing .env file
let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

// Get API key from command line or generate new
let apiKey = process.argv[2];

if (!apiKey) {
  // Generate new API key
  apiKey = crypto.randomBytes(32).toString('base64');
  console.log('🔑 Generated new API key:');
  console.log(`   ${apiKey}\n`);
} else {
  console.log('🔑 Using provided API key\n');
}

// Check if ORDERS_API_KEY already exists
const ordersApiKeyRegex = /^ORDERS_API_KEY\s*=/m;
const hasOrdersApiKey = ordersApiKeyRegex.test(envContent);

if (hasOrdersApiKey) {
  // Update existing
  envContent = envContent.replace(
    /^ORDERS_API_KEY\s*=.*$/m,
    `ORDERS_API_KEY=${apiKey}`
  );
  console.log('✅ Updated existing ORDERS_API_KEY in .env');
} else {
  // Add new
  if (envContent && !envContent.endsWith('\n')) {
    envContent += '\n';
  }
  envContent += `ORDERS_API_KEY=${apiKey}\n`;
  console.log('✅ Added ORDERS_API_KEY to .env');
}

// Write back to file
fs.writeFileSync(envPath, envContent, 'utf8');

console.log(`\n📝 File updated: ${envPath}`);
console.log(`\n🔑 Your ORDERS_API_KEY: ${apiKey}`);
console.log('\n💡 Next steps:');
console.log('1. Copy this API key to Vercel Dashboard:');
console.log('   Vercel → Project → Settings → Environment Variables');
console.log('   Add: ORDERS_API_KEY = ' + apiKey);
console.log('2. Select: All Environments');
console.log('3. Save and redeploy');
console.log('\n✅ Done!');
