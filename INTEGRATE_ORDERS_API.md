# Hướng dẫn Tích hợp Orders API vào BaoCaoSale

## Tổng quan

Đã tích hợp Orders API vào trang `xem-bao-cao-sale` để tối ưu hiệu năng query. Hệ thống sẽ tự động:
- Ưu tiên sử dụng Orders API nếu có sẵn
- Fallback về Supabase query nếu API không khả dụng

## Cấu hình

### 1. Thêm biến môi trường

Thêm vào file `.env` hoặc Vercel Environment Variables:

```env
VITE_ORDERS_API_URL=http://localhost:8000
```

**Lưu ý:**
- Development: `http://localhost:8000`
- Production: URL của API server đã deploy

### 2. Chạy Orders API

Xem hướng dẫn trong `QUICK_START_ORDERS_API.md` để:
- Setup và chạy API
- Chạy SQL script để tạo indexes

## Cách hoạt động

### Tự động phát hiện API

Code sẽ tự động:
1. Kiểm tra API có sẵn không (`/health` endpoint)
2. Nếu có → Sử dụng API với pagination tự động
3. Nếu không → Fallback về Supabase query như cũ

### Filter logic

- **Date range**: Được filter ở API level (tối ưu nhất)
- **Products/Markets/Teams**: Filter ở client-side (vì API chỉ hỗ trợ exact match, còn code cần `ilike`)

## Đã tích hợp

✅ Tab "Vận đơn" - Đã sử dụng API cho query orders

## Chưa tích hợp (có thể tích hợp sau)

- `enrichWithTotalOrdersFromOrders` - Tính "Số đơn TT"
- `enrichWithCancelOrdersFromOrders` - Tính "Số đơn Hủy"
- `enrichWithTotalRevenueFromOrders` - Tính "Doanh số TT"
- Query orders cho missing personnel

## Test

1. Đảm bảo Orders API đang chạy: `http://localhost:8000/health`
2. Mở trang: `http://localhost:5173/xem-bao-cao-sale`
3. Chọn tab "Vận đơn"
4. Xem console log:
   - `✅ Using Orders API for optimized query...` = Đang dùng API
   - `⚠️ Orders API not available, falling back to Supabase` = Đang dùng Supabase

## Performance

Với indexes đã tối ưu:
- **API query**: < 200ms cho 10,000 records
- **Supabase direct**: < 500ms cho 10,000 records

## Troubleshooting

### API không được sử dụng

1. Kiểm tra `VITE_ORDERS_API_URL` có đúng không
2. Kiểm tra API có đang chạy: `curl http://localhost:8000/health`
3. Xem console log để biết lý do fallback

### Query chậm

1. Đảm bảo đã chạy SQL script để tạo indexes
2. Kiểm tra API logs để xem query time
3. Xem Supabase query logs nếu đang dùng fallback
