# Hướng dẫn Cài đặt Hệ thống Backup F3 Hàng ngày

## Tổng quan
Hệ thống này tự động backup dữ liệu F3 vào Google Sheets lúc 7 giờ sáng và 12 giờ trưa mỗi ngày (giờ Việt Nam).

---

## 1. Deploy Google Apps Script

### Bước 1: Tạo Apps Script Project
1. Truy cập [Google Apps Script](https://script.google.com/)
2. Click "New Project" (Dự án mới)
3. Đặt tên "F3 Backup Handler"

### Bước 2: Thêm Code
1. Mở file `scripts/backup-f3-handler.gs` trong project này
2. Copy toàn bộ code
3. Paste vào Code.gs trong Apps Script
4. **QUAN TRỌNG**: Thay thế `YOUR_SPREADSHEET_ID` bằng ID thực của Google Spreadsheet của bạn
   - Để lấy Spreadsheet ID: Mở Google Sheet → Copy ID từ URL
   - Ví dụ URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`

### Bước 3: Deploy dưới dạng Web App
1. Click "Deploy" → "New deployment" (Triển khai mới)
2. Click biểu tượng bánh răng → Chọn "Web app"
3. Cài đặt:
   - **Description**: F3 Backup Handler
   - **Execute as**: Me (Tôi)
   - **Who has access**: Anyone (Bất kỳ ai)
4. Click "Deploy"
5. **Copy Web App URL** (bạn sẽ cần URL này ở bước tiếp theo)

---

## 2. Cấu hình Biến Môi trường

Thêm các biến này vào environment variables của Vercel project:

```bash
# Google Apps Script Web App URL (từ Bước 1.3)
VITE_APPS_SCRIPT_BACKUP_URL=https://script.google.com/macros/s/.../exec

# Cron Secret (tạo một chuỗi ngẫu nhiên bảo mật)
CRON_SECRET=chuoi-bao-mat-ngau-nhien-cua-ban
```

**Để thêm trong Vercel:**
1. Vào project của bạn trong Vercel Dashboard
2. Settings → Environment Variables
3. Thêm cả 2 biến cho Production, Preview và Development

---

## 3. Chạy Database Migration

Thực thi SQL schema để tạo bảng backup history:

```bash
# Chạy SQL này trong Supabase SQL Editor:
```

```sql
-- Hoặc chạy file trực tiếp
psql -h YOUR_SUPABASE_HOST -U postgres -d postgres -f setup_f3_backups.sql
```

File location: `setup_f3_backups.sql`

---

## 4. Deploy lên Vercel

```bash
# Commit và push thay đổi
git add .
git commit -m "Add F3 daily backup system"
git push

# Vercel sẽ tự động deploy với cron job mới
```

**Xác minh Deployment:**
1. Vào Vercel Dashboard → Project của bạn
2. Chuyển đến tab "Cron Jobs"
3. Bạn sẽ thấy: `/api/cron/daily-backup` được lập lịch tại `0 0,5 * * *`

---

## 5. Kiểm tra Hệ thống Backup

### Test Thủ công qua UI
1. Đăng nhập với tài khoản admin
2. Vào "Cài đặt hệ thống" → "Backup F3 tự động"
3. Click "Chạy backup ngay"
4. Kiểm tra xem:
   - Thông báo thành công xuất hiện
   - Sheet mới được tạo trong Google Sheets (vd: `F3_Backup_2026-01-19`)
   - Bảng history hiển thị bản ghi backup

### Test Cron Endpoint (Tùy chọn)
```bash
# Test cron endpoint thủ công
curl -X GET "https://your-app.vercel.app/api/cron/daily-backup" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 6. Xác minh Lịch Cron

Cron job chạy vào:
- **7:00 sáng giờ Việt Nam** (0:00 UTC)
- **12:00 trưa giờ Việt Nam** (5:00 UTC)

Lịch trình: `0 0,5 * * *`

**Để kiểm tra logs:**
1. Vercel Dashboard → Project của bạn
2. Tab Logs
3. Lọc theo `/api/cron/daily-backup`

---

## Xử lý Sự cố

### Backup thất bại với lỗi "VITE_APPS_SCRIPT_BACKUP_URL is not configured"
- Kiểm tra xem bạn đã thêm biến môi trường trong Vercel chưa
- Redeploy sau khi thêm biến

### 401 Unauthorized trên cron endpoint
- Xác minh `CRON_SECRET` khớp trong:
  - Biến môi trường Vercel
  - Cấu hình cron job

### Không có dữ liệu được backup
- Kiểm tra dữ liệu F3 có trường "Ngày lên đơn" không
- Xác minh định dạng ngày khớp với YYYY-MM-DD

### Apps Script trả về lỗi
- Kiểm tra logs Apps Script: Script editor → Executions
- Xác minh Spreadsheet ID đúng
- Đảm bảo Apps Script được deploy dưới dạng Web App với quyền "Anyone"

---

## Giám sát

### Kiểm tra Lịch sử Backup
1. Vào backup dashboard: `/f3-backups`
2. Xem trạng thái thành công/thất bại
3. Kiểm tra số lượng records

### Truy vấn Database
```sql
SELECT * FROM f3_backup_history 
ORDER BY backup_date DESC 
LIMIT 10;
```

---

## Backup Thủ công

Nếu cần chạy backup ngoài giờ đã lên lịch:
1. Dashboard: `/f3-backups`
2. Click "Chạy backup ngay"

Hoặc qua API:
```javascript
import { performDailyBackup } from './services/f3DailyBackupService';
await performDailyBackup('manual');
```

---

## Files Đã Tạo

- `src/services/f3DailyBackupService.js` - Logic backup
- `src/pages/F3BackupDashboard.jsx` - UI dashboard
- `api/cron/daily-backup.js` - Cron endpoint
- `scripts/backup-f3-handler.gs` - Google Apps Script
- `setup_f3_backups.sql` - Database schema

---

## Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra deployment logs trong Vercel
2. Kiểm tra execution logs trong Google Apps Script
3. Kiểm tra bảng `f3_backup_history` trong Supabase để xem thông báo lỗi
