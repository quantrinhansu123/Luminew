import dotenv from 'dotenv';
dotenv.config();

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (!cloudName || !apiKey || !apiSecret) {
  console.error('❌ Thiếu thông tin Cloudinary trong .env');
  console.log('\n📋 Vui lòng tạo Upload Preset thủ công:');
  console.log('   1. Truy cập: https://console.cloudinary.com/settings/upload');
  console.log('   2. Click "Add upload preset"');
  console.log('   3. Đặt tên: attendance_preset');
  console.log('   4. Signing Mode: Unsigned');
  console.log('   5. Save');
  process.exit(1);
}

async function createUploadPreset() {
  try {
    console.log('🔧 Đang tạo Upload Preset trên Cloudinary...\n');

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/upload_presets`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'attendance_preset',
          unsigned: true,
          folder: 'attendance',
          allowed_formats: 'jpg,png,jpeg',
          max_file_size: 5242880, // 5MB
          max_image_width: 1920,
          max_image_height: 1920,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      if (result.error?.message?.includes('already exists')) {
        console.log('✅ Upload preset "attendance_preset" đã tồn tại!');
        console.log('\n📝 Cập nhật file .env:');
        console.log('   VITE_CLOUDINARY_CLOUD_NAME=' + cloudName);
        console.log('   VITE_CLOUDINARY_UPLOAD_PRESET=attendance_preset');
        return;
      }
      throw new Error(result.error?.message || 'Tạo preset thất bại');
    }

    console.log('✅ Tạo Upload Preset thành công!');
    console.log('\n📝 Thông tin:');
    console.log('   Name:', result.name);
    console.log('   Unsigned:', result.unsigned);
    console.log('   Folder:', result.settings?.folder || 'attendance');
    
    console.log('\n📝 Cập nhật file .env:');
    console.log('   VITE_CLOUDINARY_CLOUD_NAME=' + cloudName);
    console.log('   VITE_CLOUDINARY_UPLOAD_PRESET=' + result.name);

    console.log('\n🚀 Tiếp theo:');
    console.log('   1. Thêm 2 biến trên vào file .env');
    console.log('   2. Thêm vào Vercel Environment Variables');
    console.log('   3. Redeploy app');

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.log('\n📋 Vui lòng tạo Upload Preset thủ công:');
    console.log('   1. Truy cập: https://console.cloudinary.com/settings/upload');
    console.log('   2. Click "Add upload preset"');
    console.log('   3. Đặt tên: attendance_preset');
    console.log('   4. Signing Mode: Unsigned');
    console.log('   5. Folder: attendance');
    console.log('   6. Max file size: 5MB');
    console.log('   7. Allowed formats: jpg, png, jpeg');
    console.log('   8. Save');
  }
}

createUploadPreset();
