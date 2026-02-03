<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1NEvkwLm2FAVRubQd7c7xSsdV-jRJhwf5

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Setup

### 1. Cấu hình Supabase

Tạo file `.env.local` và thêm các biến môi trường sau:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Tạo bảng trong Supabase

Chạy file SQL migration trong Supabase SQL Editor:
- Mở Supabase Dashboard → SQL Editor
- Copy nội dung từ `supabase/migrations/001_create_tables.sql`
- Chạy SQL để tạo các bảng

### 3. Tự động thêm dữ liệu vào Supabase

Có 2 cách để thêm dữ liệu:

#### Cách 1: Từ trình duyệt (Browser Console)
1. Mở ứng dụng trong trình duyệt
2. Mở Developer Console (F12)
3. Gọi hàm:
```javascript
// Import và sử dụng
import { seedDatabase } from './utils/seedDatabaseBrowser';
await seedDatabase(); // Thêm dữ liệu mới
// hoặc
await seedDatabase(true); // Xóa dữ liệu cũ và thêm mới
```

#### Cách 2: Từ code React Component
```typescript
import { seedDatabase } from './utils/seedDatabaseBrowser';

// Trong component hoặc function
const handleSeedData = async () => {
  const result = await seedDatabase();
  if (result.success) {
    console.log('Đã thêm dữ liệu thành công!');
  }
};
```

### 4. Các bảng được tạo

- `summary_cards` - Dữ liệu thẻ tổng quan
- `kpi_summary` - Tóm tắt KPI
- `chart_data` - Dữ liệu biểu đồ
- `kpi_performance` - Hiệu suất KPI
- `team_performance` - Hiệu suất team
- `individual_ranking` - Xếp hạng cá nhân
