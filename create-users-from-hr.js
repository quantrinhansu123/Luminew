import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Lỗi: Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env');
  process.exit(1);
}

// Khởi tạo Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Mapping position to role
const positionToRole = {
  'NV': 'user',
  'Leader': 'leader',
  'Vận đơn': 'van-don',
  'Kế toán': 'ke-toan'
};

// Hash password function
async function hashPassword(password) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

// Create user account from human_resources data
async function createUserFromHumanResource(hrData) {
  try {
    const role = positionToRole[hrData['Vị trí']] || 'user';

    // Hash the default password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('123456', salt);

    // Create username from email (remove @domain part)
    const username = hrData.email.split('@')[0];

    // Bước 1: Tạo user record trong users table
    console.log(`📝 Đang tạo user trong users cho: ${hrData['Họ Và Tên']}...`);
    
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert([
        {
          branch: hrData['chi nhánh'] || '',
          created_at: new Date().toISOString(),
          created_by: 'auto-script',
          department: hrData['Bộ phận'] || '',
          email: hrData.email,
          name: hrData['Họ Và Tên'] || '',
          password: hashedPassword,
          position: hrData['Vị trí'] || '',
          role: role,
          shift: hrData['Ca'] || '',
          team: hrData['Team'] || '',
          username: username
        }
      ])
      .select();
    
    if (userError) throw userError;
    console.log('✅ Đã tạo record trong users');

    const userId = newUser[0].id;

    // Bước 2: Tạo user record trong human_resources table
    console.log(`📝 Đang tạo user trong human_resources cho: ${hrData['Họ Và Tên']}...`);
    
    const { error: hrError } = await supabase
      .from('human_resources')
      .insert([
        {
          id: userId,
          "Bộ phận": hrData['Bộ phận'] || '',
          "Ca": hrData['Ca'] || '',
          "Họ Và Tên": hrData['Họ Và Tên'] || '',
          "Team": hrData['Team'] || '',
          "Vị trí": hrData['Vị trí'] || '',
          "chi nhánh": hrData['chi nhánh'] || '',
          "email": hrData.email,
          "status": "active",
          "created_at": new Date().toISOString(),
          "created_by": "auto-script"
        }
      ]);
    
    if (hrError) throw hrError;
    console.log('✅ Đã tạo record trong human_resources');

    console.log(`✅ Created user account for: ${hrData['Họ Và Tên']} (${hrData.email}) - Role: ${role}`);
    return newUser[0];

  } catch (error) {
    console.error(`❌ Error creating user for ${hrData.email}:`, error);
    throw error;
  }
}

// Batch create users from human_resources data
async function batchCreateUsers(hrDataArray) {
  console.log(`🚀 Starting batch user creation for ${hrDataArray.length} users...`);
  console.log('='.repeat(60));

  const results = {
    success: [],
    failed: []
  };

  for (const hrData of hrDataArray) {
    try {
      const userData = await createUserFromHumanResource(hrData);
      results.success.push({
        email: hrData.email,
        name: hrData['Họ Và Tên'],
        role: userData.role,
        id: hrData.id
      });
    } catch (error) {
      results.failed.push({
        email: hrData.email,
        name: hrData['Họ Và Tên'],
        error: error.message,
        id: hrData.id
      });
    }
  }

  console.log('\n📊 Batch Creation Summary:');
  console.log('='.repeat(60));
  console.log(`✅ Successfully created: ${results.success.length} users`);
  console.log(`❌ Failed: ${results.failed.length} users`);

  if (results.success.length > 0) {
    console.log('\n✅ Successfully created users:');
    results.success.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ${user.role}`);
    });
  }

  if (results.failed.length > 0) {
    console.log('\n❌ Failed users:');
    results.failed.forEach(user => {
      console.log(`  - ${user.name} (${user.email}): ${user.error}`);
    });
  }

  // List all users after creation
  await listAllUsers();
  await listHumanResources();

  return results;
}

// List all users in the users table
async function listAllUsers() {
  try {
    console.log('\n📋 Danh sách users trong bảng "users":');
    console.log('-'.repeat(100));

    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, name, email, role, team')
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (users && users.length > 0) {
      console.log('ID         | Username       | Name                | Email                          | Role  | Team');
      console.log('-'.repeat(100));

      for (const user of users) {
        console.log(
          `${(user.id || '').substring(0, 10).padEnd(10)} | ${(user.username || 'N/A').padEnd(14)} | ${(user.name || 'N/A').padEnd(19)} | ${(user.email || 'N/A').padEnd(30)} | ${(user.role || 'user').padEnd(5)} | ${user.team || 'N/A'}`
        );
      }
      console.log('-'.repeat(100));
      console.log(`Tổng số: ${users.length} users`);
    } else {
      console.log('❌ Không có users nào trong bảng "users"');
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách users:', error.message);
  }
}

// List all users in the human_resources table
async function listHumanResources() {
  try {
    console.log('\n📋 Danh sách users trong bảng "human_resources":');
    console.log('-'.repeat(80));

    const { data: users, error } = await supabase
      .from('human_resources')
      .select('id, Họ Và Tên, email, Vị trí, Team')
      .order('Họ Và Tên', { ascending: true });

    if (error) throw error;

    if (users && users.length > 0) {
      console.log('ID         | Name                | Email                          | Role  | Team');
      console.log('-'.repeat(80));

      for (const user of users) {
        console.log(
          `${(user.id || '').substring(0, 10).padEnd(10)} | ${(user['Họ Và Tên'] || 'N/A').padEnd(19)} | ${(user.email || 'N/A').padEnd(30)} | ${(user['Vị trí'] || 'N/A').padEnd(5)} | ${user.Team || 'N/A'}`
        );
      }
      console.log('-'.repeat(80));
      console.log(`Tổng số: ${users.length} users`);
    } else {
      console.log('❌ Không có users nào trong bảng "human_resources"');
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy danh sách human_resources:', error.message);
  }
}

// Fetch all human_resources data from Firebase
async function fetchHumanResourcesData() {
  try {
    console.log('🔄 Đang lấy dữ liệu từ human_resources...');

    const hrRef = ref(database, 'human_resources');
    const snapshot = await get(hrRef);

    if (snapshot.exists()) {
      const hrData = snapshot.val();
      const hrArray = Object.entries(hrData).map(([id, data]) => ({
        id,
        ...data
      }));

      console.log(`✅ Đã lấy ${hrArray.length} bản ghi từ human_resources`);
      return hrArray;
    } else {
      console.log('❌ Không có dữ liệu trong human_resources');
      return [];
    }
  } catch (error) {
    console.error('❌ Lỗi khi lấy dữ liệu human_resources:', error.message);
    throw error;
  }
}

// Create users from Firebase human_resources data
async function createUsersFromFirebaseHR() {
  try {
    console.log('='.repeat(60));
    console.log('🔄 TẠO USERS TỪ HUMAN_RESOURCES TRONG FIREBASE');
    console.log('='.repeat(60));

    // Fetch data from human_resources
    const hrDataArray = await fetchHumanResourcesData();

    if (hrDataArray.length === 0) {
      console.log('⚠️  Không có dữ liệu để xử lý');
      return;
    }

    // Filter valid entries (must have email, id, name)
    const validData = hrDataArray.filter(hr => {
      if (!hr.email || !hr.id || !hr['Họ Và Tên']) {
        console.warn(`⚠️  Bỏ qua bản ghi không hợp lệ: ${JSON.stringify(hr)}`);
        return false;
      }
      return true;
    });

    console.log(`📋 Xử lý ${validData.length} bản ghi hợp lệ từ ${hrDataArray.length} bản ghi tổng cộng`);

    // Create users using existing batch function
    const results = await batchCreateUsers(validData);

    console.log('\n🎉 Hoàn thành tạo users từ Firebase!');
    console.log('📋 Thông tin đăng nhập (mật khẩu mặc định: 123456):');
    console.log('-'.repeat(80));

    results.success.forEach(user => {
      console.log(`Username: ${user.email.split('@')[0]}`);
      console.log(`Password: 123456`);
      console.log(`Email:    ${user.email}`);
      console.log(`Name:     ${user.name}`);
      console.log(`Role:     ${user.role}`);
      console.log(`User ID:  ${user.id}`);
      console.log('-'.repeat(80));
    });

    if (results.failed.length > 0) {
      console.log('\n❌ Các user tạo thất bại:');
      results.failed.forEach(user => {
        console.log(`  - ${user.name} (${user.email}): ${user.error}`);
      });
    }

    console.log('\n⚠️  LƯU Ý: Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu!');

    return results;

  } catch (error) {
    console.error('💥 Lỗi khi tạo users từ Firebase:', error);
    throw error;
  }
}

// Main function to process human_resources data
async function processHumanResourcesData(hrDataArray) {
  try {
    console.log('🔄 Processing human resources data...');

    // Validate input data
    if (!Array.isArray(hrDataArray)) {
      throw new Error('Input must be an array of human resources data');
    }

    // Filter out invalid entries
    const validData = hrDataArray.filter(hr => {
      if (!hr.email || !hr.id || !hr['Họ Và Tên']) {
        console.warn(`⚠️  Skipping invalid entry: ${JSON.stringify(hr)}`);
        return false;
      }
      return true;
    });

    console.log(`📋 Found ${validData.length} valid entries out of ${hrDataArray.length} total`);

    // Create users
    const results = await batchCreateUsers(validData);

    return results;

  } catch (error) {
    console.error('💥 Error processing human resources data:', error);
    throw error;
  }
}

// Example usage function
async function exampleUsage() {
  // Example human_resources data
  const sampleHRData = [
    {
      "Bộ phận": "CSKH",
      "Ca": "Ca Ngày",
      "Họ Và Tên": "Phạm Hải Yến",
      "Team": "CSKH- Lý",
      "Vị trí": "NV",
      "chi nhánh": "Hà Nội",
      "email": "pham.h.yen21072001@gmail.com",
      "id": "fgfdgd2"
    },
    {
      "Bộ phận": "Sales",
      "Ca": "Ca Tối",
      "Họ Và Tên": "Nguyễn Văn Leader",
      "Team": "Sales-Team A",
      "Vị trí": "Leader",
      "chi nhánh": "Hồ Chí Minh",
      "email": "leader@example.com",
      "id": "leader123"
    },
    {
      "Bộ phận": "Vận đơn",
      "Ca": "Ca Ngày",
      "Họ Và Tên": "Trần Văn Vận Đơn",
      "Team": "Vận đơn-Team B",
      "Vị trí": "Vận đơn",
      "chi nhánh": "Đà Nẵng",
      "email": "vanddon@example.com",
      "id": "vanddon456"
    }
  ];

  console.log('='.repeat(60));
  console.log('👥 Tạo Users Từ Human Resources');
  console.log('='.repeat(60));
  console.log();

  try {
    const results = await processHumanResourcesData(sampleHRData);

    console.log('\n🎉 Đã tạo users thành công!\n');
    console.log('📋 Thông tin đăng nhập (mật khẩu mặc định: 123456):');
    console.log('-'.repeat(80));

    results.success.forEach(user => {
      console.log(`Username: ${user.email.split('@')[0]}`);
      console.log(`Password: 123456`);
      console.log(`Email:    ${user.email}`);
      console.log(`Name:     ${user.name}`);
      console.log(`Role:     ${user.role}`);
      console.log(`User ID:  ${user.id}`);
      console.log('-'.repeat(80));
    });

    console.log('\n⚠️  LƯU Ý: Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu!');

    return results;
  } catch (error) {
    console.error('💥 Process failed:', error);
    throw error;
  }
}

// Export functions for use in other files
export {
  createUserFromHumanResource,
  batchCreateUsers,
  processHumanResourcesData,
  hashPassword,
  positionToRole,
  exampleUsage,
  listAllUsers,
  listHumanResources,
  fetchHumanResourcesData,
  createUsersFromFirebaseHR
};

// If running this file directly, execute Firebase HR data processing
if (typeof require !== 'undefined' && require.main === module) {
  createUsersFromFirebaseHR()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script failed:', error);
      process.exit(1);
    });
} else if (import.meta.url) {
  // For ES modules, try alternative check
  const url = new URL(import.meta.url);
  const scriptPath = url.pathname.replace(/^\/[A-Za-z]:/, match => match.toUpperCase());
  if (process.argv[1] && process.argv[1].replace(/\\/g, '/').toLowerCase() === scriptPath.toLowerCase()) {
    createUsersFromFirebaseHR()
      .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
      })
      .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
      });
  }
}