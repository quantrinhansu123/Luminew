# Hướng dẫn Cài đặt Tự động Đẩy Dữ liệu lên Google Drive

## Tổng quan
Hệ thống này tự động đẩy dữ liệu của ngày hôm nay lên Google Drive vào **23h hàng ngày** (giờ Việt Nam).

---

## 1. Cấu hình Biến Môi trường

Thêm biến này vào environment variables của Vercel project:

```bash
# Google Apps Script Web App URL (đã có sẵn)
VITE_GOOGLE_DRIVE_UPLOAD_URL=https://script.google.com/macros/s/AKfycbw-y-vLK1sDH15ski_IgTY31AletNjknER04FcZTtZDql36pHWTg1YsIGQ4Gl72U6ow3Q/exec

# Cron Secret (tạo một chuỗi ngẫu nhiên bảo mật, hoặc dùng lại từ F3 backup)
CRON_SECRET=chuoi-bao-mat-ngau-nhien-cua-ban
```

**Để thêm trong Vercel:**
1. Vào project của bạn trong Vercel Dashboard
2. Settings → Environment Variables
3. Thêm biến `CRON_SECRET` cho Production, Preview và Development
4. Nếu chưa có `VITE_GOOGLE_DRIVE_UPLOAD_URL`, thêm luôn

---

## 2. Deploy lên Vercel

```bash
# Commit và push thay đổi
git add .
git commit -m "Add daily Google Drive upload automation"
git push

# Vercel sẽ tự động deploy với cron job mới
```

**Xác minh Deployment:**
1. Vào Vercel Dashboard → Project của bạn
2. Chuyển đến tab "Cron Jobs"
3. Bạn sẽ thấy: `/api/cron/daily-drive-upload` được lập lịch tại `0 16 * * *` (23h giờ Việt Nam)

---

## 3. Kiểm tra Hệ thống

### Test Thủ công qua UI
1. Đăng nhập với tài khoản admin
2. Vào "Cài đặt hệ thống" → "Upload và Tải về"
3. Click "Chọn bảng để tải về"
4. Click nút **"Đẩy Hôm Nay"** (màu xanh lá)
5. Kiểm tra xem:
   - Thông báo thành công xuất hiện
   - File được tạo trong Google Drive folder

### Test Cron Endpoint (Tùy chọn)
```bash
# Test cron endpoint thủ công
curl -X GET "https://your-app.vercel.app/api/cron/daily-drive-upload" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 4. Xác minh Lịch Cron

Cron job chạy vào:
- **23:00 tối giờ Việt Nam** (16:00 UTC)

Lịch trình: `0 16 * * *` (trong file `vercel.json`)

**Để kiểm tra logs:**
1. Vercel Dashboard → Project của bạn
2. Tab Logs
3. Lọc theo `/api/cron/daily-drive-upload`

---

## 5. Dữ liệu được Đẩy

Hệ thống sẽ tự động đẩy các bảng sau với **dữ liệu của ngày hôm đó**:

1. **Xem báo cáo (Sale)** - `sales_reports` (lọc theo `date`)
2. **Quản lý vận đơn** - `orders` (lọc theo `order_date`, loại trừ team='RD')
3. **Xem báo cáo (MKT)** - `detail_reports` (lọc theo `Ngày`)
4. **Xem báo cáo CSKH** - `orders` (lọc theo `order_date`, loại trừ team='RD')
5. **Quản lý nhân sự (Users)** - `users` (lọc theo `created_at`)

**Lưu ý:**
- Chỉ đẩy dữ liệu của **ngày hôm đó** (không có bộ lọc từ-đến)
- File được đặt tên: `TênBảng_YYYYMMDD_HHMMSS.json`
- Tất cả file được đẩy vào folder Google Drive: `1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5`

---

## Xử lý Sự cố

### Upload thất bại với lỗi "VITE_GOOGLE_DRIVE_UPLOAD_URL is not configured"
- Kiểm tra xem bạn đã thêm biến môi trường trong Vercel chưa
- Redeploy sau khi thêm biến

### 401 Unauthorized trên cron endpoint
- Xác minh `CRON_SECRET` khớp trong:
  - Biến môi trường Vercel
  - Header Authorization khi test

### Không có dữ liệu được upload
- Kiểm tra xem có dữ liệu trong ngày hôm đó không
- Xem logs trong Vercel để biết chi tiết lỗi

### Google Apps Script trả về lỗi
- Kiểm tra logs Apps Script: Script editor → Executions
- Xác minh folder ID đúng: `1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5`
- Đảm bảo Apps Script được deploy dưới dạng Web App với quyền "Anyone"

---

## Files Đã Tạo

- `src/services/dailyDriveUploadService.js` - Logic upload tự động
- `api/cron/daily-drive-upload.js` - Cron endpoint
- `vercel.json` - Cấu hình cron job (đã cập nhật)

---

## Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra deployment logs trong Vercel
2. Kiểm tra execution logs trong Google Apps Script
3. Test manual qua UI để xác định lỗi cụ thể
