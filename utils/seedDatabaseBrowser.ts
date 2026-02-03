/**
 * Utility để thêm dữ liệu vào Supabase từ trình duyệt
 * Có thể gọi hàm này từ console hoặc từ component React
 */

import { seedAllData } from '../services/supabaseSeeder';

/**
 * Thêm tất cả dữ liệu vào Supabase
 * @param clearExisting - Xóa dữ liệu cũ trước khi thêm mới
 * @returns Promise với kết quả
 */
export async function seedDatabase(clearExisting: boolean = false) {
  try {
    const results = await seedAllData(clearExisting);
    return {
      success: true,
      message: 'Đã thêm dữ liệu thành công vào Supabase',
      results
    };
  } catch (error) {
    console.error('Lỗi khi thêm dữ liệu:', error);
    return {
      success: false,
      message: 'Có lỗi xảy ra khi thêm dữ liệu',
      error
    };
  }
}

// Export để có thể gọi từ console trình duyệt
if (typeof window !== 'undefined') {
  (window as any).seedDatabase = seedDatabase;
}
