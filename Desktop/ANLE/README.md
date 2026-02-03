# ANLE - Hệ thống Quản lý Form

Hệ thống quản lý các form mẫu của Công ty TNHH ANLE.

## 📋 Danh sách Form

1. **BÁO GIÁ CƯỚC DỊCH VỤ** - Form báo giá cước dịch vụ
2. **BIÊN BẢN BÀN GIAO CHỨNG TỪ** - Biên bản bàn giao chứng từ
3. **BIÊN BẢN GIAO NHẬN HÀNG** - Biên bản giao nhận hàng hóa
4. **ĐỀ NGHỊ THANH TOÁN KHÁCH HÀNG** - Form đề nghị thanh toán khách hàng
5. **ĐỀ NGHỊ THANH TOÁN NỘI BỘ** - Form đề nghị thanh toán nội bộ
6. **PHIẾU TẠM ỨNG** - Phiếu tạm ứng tiền
7. **PHIẾU XUẤT KHO** - Phiếu xuất kho hàng hóa
8. **PURCHASING ORDER** - Đơn đặt hàng mua

## 🌐 Truy cập qua GitHub Pages

Sau khi bật GitHub Pages, truy cập tại:
```
https://quantrinhansu123.github.io/ANLE---SCM/
```

## ⚙️ Cách bật GitHub Pages

1. Vào repository: https://github.com/quantrinhansu123/ANLE---SCM
2. Click vào **Settings** (cài đặt)
3. Trong menu bên trái, chọn **Pages**
4. Ở phần **Source**, chọn:
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Click **Save**
6. Đợi vài phút để GitHub deploy

## 📁 Cấu trúc File

```
ANLE---SCM/
├── index.html                          # Trang chủ
├── .nojekyll                           # File để GitHub Pages không xử lý Jekyll
├── ANLE_FORM_BÁO GIÁ CƯỚC DỊCH VỤ.html
├── ANLE_FORM_BIÊN BẢN BÀN GIAO CHỨNG TỪ.html
├── ANLE_FORM_BIÊN BẢN GIAO NHẬN HÀNG.html
├── ANLE_FORM_ĐỀ NGHỊ THANH TOÁN KHÁCH HÀNG.html
├── ANLE_FORM_ĐỀ NGHỊ THANH TOÁN NỘI BỘ.html
├── ANLE_FORM_Phiếu tạm ứng.html
├── ANLE_FORM_Phiếu Xuất Kho.html
└── ANLE_FORM_Purchasing Order.html
```

## 🔧 Khắc phục lỗi 404

Nếu gặp lỗi 404:

1. **Kiểm tra GitHub Pages đã bật chưa:**
   - Vào Settings > Pages
   - Đảm bảo đã chọn branch `main` và folder `/ (root)`

2. **Đợi deploy:**
   - Sau khi bật, GitHub cần 1-5 phút để deploy
   - Refresh lại trang sau vài phút

3. **Kiểm tra file:**
   - Đảm bảo file `index.html` có trong root của branch `main`
   - File `.nojekyll` đã được tạo

4. **Kiểm tra URL:**
   - URL đúng: `https://quantrinhansu123.github.io/ANLE---SCM/`
   - Lưu ý: tên repository có dấu gạch ngang và chữ in hoa

## 📝 Ghi chú

- Tất cả các form đều sử dụng logo từ AppSheet
- Form được thiết kế để in ấn (print-friendly)
- Responsive design, hỗ trợ mobile
