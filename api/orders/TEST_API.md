# Test Orders API

## Cách 1: Dùng Script Test (Khuyến nghị)

### Bước 1: Lấy thông tin từ Vercel

1. **API URL**: 
   - Vào Vercel Dashboard → Project → Deployments
   - Copy URL của deployment mới nhất
   - Thêm `/api/orders` vào cuối
   - Ví dụ: `https://your-app.vercel.app/api/orders`

2. **API Key**:
   - Vào Vercel Dashboard → Project → Settings → Environment Variables
   - Copy giá trị của `ORDERS_API_KEY`

### Bước 2: Chạy Test Script

```bash
# Cách 1: Truyền tham số trực tiếp
node api/orders/test-api.js https://your-app.vercel.app/api/orders your-api-key-here

# Cách 2: Set trong .env và chạy (script sẽ tự động đọc)
# Thêm vào .env:
# VITE_ORDERS_API_URL=https://your-app.vercel.app/api/orders
# VITE_ORDERS_API_KEY=your-api-key-here
node api/orders/test-api.js

# Cách 3: Script sẽ prompt nếu thiếu thông tin
node api/orders/test-api.js
```

### Kết quả mong đợi:

```
✅ API Response:
   Success: true
   Total Records: 1000
   Data Count: 1000
   Fetched At: 2024-01-15T10:30:00.000Z

✅ API is working correctly!
```

## Cách 2: Dùng curl

```bash
# Thay YOUR_API_KEY và YOUR_DOMAIN bằng giá trị thực tế
curl -H "X-API-Key: YOUR_API_KEY" \
  https://YOUR_DOMAIN.vercel.app/api/orders
```

### Test với filters:

```bash
# Lọc theo date range
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://YOUR_DOMAIN.vercel.app/api/orders?order_date_from=2024-01-01&order_date_to=2024-01-31"

# Lọc theo team
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://YOUR_DOMAIN.vercel.app/api/orders?team=HCM"
```

## Cách 3: Dùng Postman

1. **Method**: `GET`
2. **URL**: `https://your-app.vercel.app/api/orders`
3. **Headers**:
   - Key: `X-API-Key`
   - Value: `your-api-key-here`

## Cách 4: Dùng JavaScript/Frontend

```javascript
const API_URL = 'https://your-app.vercel.app/api/orders';
const API_KEY = 'your-api-key-here';

// Test basic
async function testAPI() {
  try {
    const response = await fetch(API_URL, {
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    const data = await response.json();
    console.log('✅ API Response:', data);
    return data;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Test với filters
async function testAPIWithFilters() {
  const params = new URLSearchParams({
    order_date_from: '2024-01-01',
    order_date_to: '2024-01-31',
    team: 'HCM',
    sort_by: 'order_date',
    sort_order: 'desc'
  });
  
  const response = await fetch(`${API_URL}?${params}`, {
    headers: {
      'X-API-Key': API_KEY
    }
  });
  
  const data = await response.json();
  console.log('✅ Filtered Data:', data);
  return data;
}

// Chạy test
testAPI();
testAPIWithFilters();
```

## Các lỗi thường gặp:

### 401 Unauthorized
```
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key..."
}
```

**Giải pháp:**
- Kiểm tra API key đã đúng chưa
- Kiểm tra header `X-API-Key` đã được gửi chưa
- Verify trong Vercel Dashboard → Environment Variables

### 500 Internal Server Error
```
{
  "success": false,
  "error": "Internal server error",
  "message": "..."
}
```

**Giải pháp:**
- Kiểm tra `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` trong Vercel
- Xem logs trong Vercel Dashboard → Functions → Logs
- Đảm bảo Supabase credentials đúng

### Network Error / Timeout
**Giải pháp:**
- Kiểm tra URL đã đúng chưa
- Kiểm tra network connection
- Đảm bảo API đã được deploy thành công

## Verify trong Vercel Dashboard:

1. **Xem Logs**:
   - Vercel Dashboard → Project → Functions → `/api/orders`
   - Xem logs để debug

2. **Kiểm tra Environment Variables**:
   - Vercel Dashboard → Project → Settings → Environment Variables
   - Verify các biến: `ORDERS_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

3. **Kiểm tra Deployment**:
   - Vercel Dashboard → Project → Deployments
   - Đảm bảo deployment mới nhất đã thành công

## Next Steps:

Sau khi test thành công:
1. ✅ API đã sẵn sàng sử dụng
2. ✅ Có thể tích hợp vào frontend
3. ✅ Có thể sử dụng trong các service khác
