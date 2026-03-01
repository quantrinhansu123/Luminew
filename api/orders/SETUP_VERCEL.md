# Hướng dẫn Setup Orders API cho Vercel

## Bước 1: Kiểm tra Environment Variables

Nếu bạn đã có file `.env` với các giá trị:
- `ORDERS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Chạy script kiểm tra:

```bash
node api/orders/check-env.js
```

Script này sẽ:
- ✅ Kiểm tra tất cả required environment variables
- ✅ Hiển thị giá trị đã được set (masked cho bảo mật)
- ✅ Đưa ra ví dụ request với API key của bạn

**Nếu chưa có file .env**, tạo file `.env` trong root project với nội dung:

```env
ORDERS_API_KEY=your-secret-api-key-here
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

**Tạo API Key mạnh** (nếu chưa có):

```bash
# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Hoặc dùng online: https://randomkeygen.com/
# Chọn "CodeIgniter Encryption Keys" hoặc tạo random string 32-64 ký tự
```

Ví dụ: `sk_live_abc123xyz789...` hoặc `orders_api_key_2024_secure_random_string`

## Bước 2: Cấu hình Environment Variables trong Vercel

**Quan trọng:** Vercel serverless functions cần environment variables được set trong Vercel Dashboard, không đọc từ file `.env` local.

1. Vào Vercel Dashboard → Project → Settings → Environment Variables
2. Thêm các biến sau (copy từ file `.env` của bạn):

| Variable Name | Value (từ .env của bạn) | Mô tả |
|--------------|------------------------|-------|
| `ORDERS_API_KEY` | Giá trị từ `.env` | API key để bảo vệ endpoint |
| `SUPABASE_URL` | Giá trị từ `.env` | URL Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | Giá trị từ `.env` | Service role key từ Supabase |

**Lưu ý:** 
- Chọn **All Environments** (Production, Preview, Development)
- Copy chính xác giá trị từ file `.env` của bạn
- Sau khi thêm, cần **redeploy** để áp dụng

**Quick check:** Sau khi set trong Vercel, có thể verify bằng cách xem logs khi gọi API

## Bước 3: Deploy

API sẽ tự động deploy khi bạn push code. Hoặc deploy thủ công:

```bash
vercel --prod
```

## Bước 4: Test API

**Lấy API key từ file .env của bạn** (hoặc từ Vercel Dashboard):

### Test với curl:
```bash
# Thay YOUR_API_KEY bằng giá trị ORDERS_API_KEY từ file .env
curl -H "X-API-Key: YOUR_API_KEY" \
  https://your-domain.vercel.app/api/orders
```

**Hoặc dùng script tự động** (sau khi chạy `node api/orders/check-env.js`, script sẽ hiển thị ví dụ request với API key của bạn)

### Test với JavaScript:
```javascript
const response = await fetch('https://your-domain.vercel.app/api/orders', {
  headers: {
    'X-API-Key': 'your-api-key-here'
  }
});

const data = await response.json();
console.log(data);
```

### Test với Postman:
1. Method: `GET`
2. URL: `https://your-domain.vercel.app/api/orders`
3. Headers: `X-API-Key: your-api-key-here`

## Bước 5: Sử dụng trong Frontend

Thêm vào `.env` hoặc `.env.local`:

```env
VITE_ORDERS_API_URL=https://your-domain.vercel.app/api/orders
VITE_ORDERS_API_KEY=your-api-key-here
```

Sau đó trong code:

```javascript
const response = await fetch(
  `${import.meta.env.VITE_ORDERS_API_URL}?order_date_from=2024-01-01`,
  {
    headers: {
      'X-API-Key': import.meta.env.VITE_ORDERS_API_KEY
    }
  }
);
```

## Troubleshooting

### Lỗi 401 Unauthorized
- Kiểm tra API key đã đúng chưa
- Kiểm tra environment variable `ORDERS_API_KEY` đã set trong Vercel chưa
- Đảm bảo đã redeploy sau khi thêm environment variable

### Lỗi 500 Internal Server Error
- Kiểm tra `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` đã đúng chưa
- Xem logs trong Vercel Dashboard → Functions → Logs

### API không hoạt động
- Kiểm tra file `api/orders/index.js` đã tồn tại chưa
- Kiểm tra `vercel.json` có cấu hình đúng không
- Xem logs trong Vercel Dashboard

## URL Endpoint

Sau khi deploy, endpoint sẽ có dạng:
```
https://your-project-name.vercel.app/api/orders
```

Hoặc custom domain nếu bạn đã setup:
```
https://api.yourdomain.com/orders
```
