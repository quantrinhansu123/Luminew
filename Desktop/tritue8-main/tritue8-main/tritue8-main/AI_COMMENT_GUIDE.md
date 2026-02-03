# Hướng dẫn Tính năng Tạo Nhận xét AI

## Tổng quan
Tính năng "Tạo nhận xét AI" sử dụng Google Gemini AI để tự động tạo nhận xét chi tiết về học sinh dựa trên dữ liệu học tập thực tế.

## Cách sử dụng

### 1. Mở Báo cáo Học sinh
- Vào trang **Quản lý học sinh** (`/workspace/students`)
- Nhấn nút **"Báo cáo"** của học sinh cần tạo nhận xét
- Modal báo cáo sẽ hiện ra

### 2. Tạo Nhận xét AI
- Nhấn nút **"Tạo nhận xét AI"** (màu xanh lá, icon robot) ở footer modal
- Hệ thống sẽ:
  - Thu thập dữ liệu học tập của học sinh
  - Gửi đến Gemini AI để phân tích
  - Hiển thị nhận xét chi tiết trong vài giây

### 3. Xem Nhận xét
Nhận xét AI bao gồm:
- ✅ **Đánh giá chuyên cần**: Tỷ lệ tham gia, thái độ đi học
- 📊 **Kết quả học tập**: Điểm số, bài tập, tiến bộ
- 🌟 **Điểm mạnh**: Những gì học sinh làm tốt
- ⚠️ **Cần cải thiện**: Những điểm cần phát triển
- 💡 **Lời khuyên**: Gợi ý cụ thể cho học sinh và phụ huynh
- 🎯 **Động viên**: Lời khích lệ tích cực

## Dữ liệu được phân tích

AI sẽ phân tích:
- Tổng số buổi học và giờ học
- Số buổi có mặt / vắng
- Tỷ lệ tham gia (%)
- Điểm trung bình
- Lịch sử 10 buổi học gần nhất
- Trạng thái điểm danh (có mặt, vắng, đi muộn)
- Điểm số từng buổi
- Bài tập hoàn thành
- Ghi chú của giáo viên

## Chế độ Fallback (Dự phòng)

### Khi nào sử dụng?
Nếu API Gemini không khả dụng (vượt quota, lỗi mạng), hệ thống tự động chuyển sang **Chế độ cơ bản**.

### Nhận xét cơ bản bao gồm:
- Đánh giá chuyên cần dựa trên tỷ lệ tham gia
- Đánh giá kết quả học tập dựa trên điểm trung bình
- Lời khuyên chung
- Động viên

### Phân biệt:
- 🤖 **Nhận xét từ AI**: Được tạo bởi Gemini AI (chi tiết, cá nhân hóa)
- 📝 **Nhận xét tự động (Chế độ cơ bản)**: Được tạo bởi thuật toán (cơ bản, dựa trên quy tắc)

## Xử lý Lỗi

### Lỗi 429 - Vượt Quota
**Nguyên nhân**: API key miễn phí có giới hạn:
- 15 requests/phút
- 1 triệu tokens/ngày

**Giải pháp**:
1. ⏰ Đợi 1-2 phút rồi thử lại
2. 🔄 Hệ thống tự động dùng nhận xét cơ bản
3. 📧 Liên hệ quản trị viên để nâng cấp API key

### Lỗi API Key không hợp lệ
**Nguyên nhân**: API key sai hoặc hết hạn

**Giải pháp**:
1. Kiểm tra file `.env.local`
2. Đảm bảo có `VITE_GEMINI_API_KEY=your_key_here`
3. Lấy API key mới tại: https://aistudio.google.com/apikey

### Lỗi mạng
**Nguyên nhân**: Không kết nối được với Gemini API

**Giải pháp**:
1. Kiểm tra kết nối internet
2. Thử lại sau vài giây
3. Sử dụng nhận xét cơ bản

## Cấu hình Kỹ thuật

### API Key
File: `.env.local`
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Model sử dụng
- **Model**: `gemini-1.5-flash`
- **Temperature**: 0.7 (cân bằng giữa sáng tạo và chính xác)
- **Max Output Tokens**: 500 (đủ cho nhận xét 150-200 từ)

### Files liên quan
- `utils/geminiService.ts`: Service gọi Gemini API
- `components/StudentReport.tsx`: Component hiển thị báo cáo
- `vite-env.d.ts`: TypeScript definitions cho env variables

## Nâng cấp API Key

### Để tăng quota:
1. Truy cập: https://console.cloud.google.com/
2. Tạo project mới hoặc chọn project hiện tại
3. Enable Gemini API
4. Thiết lập billing (thanh toán)
5. Quota sẽ tăng lên:
   - 1000 requests/phút
   - 4 triệu tokens/ngày

### Chi phí (tham khảo):
- **Gemini 1.5 Flash**: $0.075 / 1M input tokens, $0.30 / 1M output tokens
- Mỗi nhận xét: ~500 tokens input + 200 tokens output
- Chi phí ước tính: ~$0.0001 / nhận xét (rất rẻ!)

## Best Practices

### Khi nào nên tạo nhận xét AI?
✅ Cuối tháng/học kỳ để tổng kết
✅ Trước họp phụ huynh
✅ Khi cần đánh giá chi tiết
✅ Để gửi báo cáo cho phụ huynh

### Khi nào dùng nhận xét cơ bản?
✅ Khi API không khả dụng
✅ Khi cần nhanh chóng
✅ Khi quota đã hết
✅ Để tiết kiệm chi phí

### Tips
- 💡 Tạo nhận xét cho nhiều học sinh cùng lúc? Đợi 4-5 giây giữa mỗi lần để tránh vượt quota
- 💡 Nhận xét AI có thể chỉnh sửa trước khi gửi cho phụ huynh
- 💡 Lưu nhận xét vào database để tái sử dụng (tính năng tương lai)

## Troubleshooting

### Nhận xét không chính xác?
- Kiểm tra dữ liệu điểm danh đã đầy đủ chưa
- Đảm bảo điểm số đã được nhập
- Xem lại ghi chú của giáo viên

### Nhận xét quá ngắn/dài?
- Điều chỉnh `maxOutputTokens` trong `geminiService.ts`
- Thay đổi prompt để yêu cầu độ dài cụ thể

### Muốn thay đổi phong cách nhận xét?
- Chỉnh sửa prompt trong `geminiService.ts`
- Thêm yêu cầu cụ thể về tone, style

## Tính năng Tương lai

- [ ] Lưu nhận xét vào database
- [ ] Lịch sử nhận xét theo thời gian
- [ ] So sánh nhận xét giữa các kỳ
- [ ] Tùy chỉnh template nhận xét
- [ ] Xuất nhận xét ra PDF/Word
- [ ] Gửi nhận xét qua email tự động
- [ ] Đa ngôn ngữ (English, Vietnamese)
- [ ] Tích hợp voice-to-text cho nhận xét nói

## Liên hệ

Nếu gặp vấn đề hoặc cần hỗ trợ:
- 📧 Email: admin@tritue8plus.com
- 📱 Hotline: [số điện thoại]
- 💬 Chat: Trong hệ thống

---

**Lưu ý**: Nhận xét AI là công cụ hỗ trợ. Giáo viên nên xem xét và điều chỉnh nhận xét cho phù hợp với từng học sinh cụ thể.
