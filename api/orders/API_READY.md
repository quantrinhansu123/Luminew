# ✅ Orders API - Đã Sẵn Sàng!

## 🎉 Hoàn thành Setup

- ✅ Environment variables đã được set trong Vercel Dashboard
- ✅ API endpoint: `/api/orders`
- ✅ API key authentication: `ORDERS_API_KEY`
- ✅ Supabase connection: Đã cấu hình

## 🚀 Sử dụng API

### 1. Lấy thông tin cần thiết:

**API URL:**
- Vào Vercel Dashboard → Deployments
- Copy URL của deployment mới nhất
- Thêm `/api/orders` vào cuối
- Ví dụ: `https://your-project.vercel.app/api/orders`

**API Key:**
- Đã set trong Vercel Dashboard → Environment Variables
- Key name: `ORDERS_API_KEY`
- Hoặc lấy từ file `api/orders/.env` (cho local testing)

### 2. Test API:

#### Cách 1: Dùng Script Test
```bash
# Nếu đã set trong .env
node api/orders/test-api.js

# Hoặc truyền tham số
node api/orders/test-api.js https://your-app.vercel.app/api/orders your-api-key
```

#### Cách 2: Dùng curl
```bash
curl -H "X-API-Key: your-api-key" \
  https://your-app.vercel.app/api/orders
```

#### Cách 3: Dùng JavaScript
```javascript
const response = await fetch('https://your-app.vercel.app/api/orders', {
  headers: {
    'X-API-Key': 'your-api-key'
  }
});

const data = await response.json();
console.log(data);
```

### 3. Ví dụ với Filters:

```bash
# Lọc theo date range
curl -H "X-API-Key: your-api-key" \
  "https://your-app.vercel.app/api/orders?order_date_from=2024-01-01&order_date_to=2024-01-31"

# Lọc theo team
curl -H "X-API-Key: your-api-key" \
  "https://your-app.vercel.app/api/orders?team=HCM"

# Lọc và sort
curl -H "X-API-Key: your-api-key" \
  "https://your-app.vercel.app/api/orders?order_date_from=2024-01-01&sort_by=total_amount_vnd&sort_order=desc"
```

## 📋 Query Parameters

### Filters:
- `order_date_from` - Ngày bắt đầu (YYYY-MM-DD)
- `order_date_to` - Ngày kết thúc (YYYY-MM-DD)
- `total_amount_vnd_min` - Số tiền tối thiểu
- `total_amount_vnd_max` - Số tiền tối đa
- `country` - Lọc theo quốc gia
- `product` - Lọc theo sản phẩm
- `tracking_code` - Lọc theo mã tracking
- `marketing_staff` - Lọc theo nhân viên marketing
- `sale_staff` - Lọc theo nhân viên sale
- `team` - Lọc theo team

### Sorting:
- `sort_by` - Cột để sort (mặc định: `order_date`)
- `sort_order` - `asc` hoặc `desc` (mặc định: `desc`)

## 📤 Response Format

```json
{
  "success": true,
  "data": [
    {
      "order_date": "2024-01-15",
      "total_amount_vnd": "1000000",
      "country": "US",
      "product": "Product A",
      // ... tất cả các cột khác
    }
  ],
  "total": 1000,
  "fetched_at": "2024-01-15T10:30:00.000Z"
}
```

## 🔐 Authentication

API key có thể được cung cấp theo 3 cách:

1. **Header (Khuyến nghị):**
   ```
   X-API-Key: your-api-key
   ```

2. **Authorization Header:**
   ```
   Authorization: Bearer your-api-key
   ```

3. **Query Parameter:**
   ```
   ?api_key=your-api-key
   ```

## 🐛 Troubleshooting

### 401 Unauthorized
- Kiểm tra API key đã đúng chưa
- Verify trong Vercel Dashboard → Environment Variables
- Đảm bảo đã redeploy sau khi thêm env vars

### 500 Internal Server Error
- Kiểm tra `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong Vercel
- Xem logs trong Vercel Dashboard → Functions → Logs

### API không trả về data
- Kiểm tra Supabase connection
- Verify bảng `orders` có dữ liệu
- Xem logs để debug

## 📚 Tài liệu tham khảo

- `README_VERCEL.md` - Tài liệu đầy đủ về API
- `SETUP_VERCEL.md` - Hướng dẫn setup chi tiết
- `TEST_API.md` - Hướng dẫn test API
- `QUICK_START.md` - Hướng dẫn nhanh

## ✅ Checklist

- [x] Environment variables set trong Vercel
- [x] API endpoint đã deploy
- [x] API key đã được tạo và set
- [ ] API đã được test thành công
- [ ] Đã tích hợp vào frontend (nếu cần)

## 🎯 Next Steps

1. Test API với script hoặc curl
2. Verify response data
3. Tích hợp vào frontend nếu cần
4. Monitor logs trong Vercel Dashboard

---

**API đã sẵn sàng sử dụng! 🚀**
