# Quick Start - Orders API

## ✅ Nếu bạn đã set environment variables trong Vercel Dashboard:

API sẽ tự động sử dụng các giá trị từ Vercel. Không cần file `.env` local cho production.

**Để test local**, tạo file `.env` trong root project với các giá trị tương tự:

```env
ORDERS_API_KEY=your-secret-api-key-here
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

Sau đó chạy:
```bash
node api/orders/check-env.js
```

## 🚀 Sử dụng API ngay:

### 1. Lấy API key từ Vercel Dashboard:
- Vào Vercel Dashboard → Project → Settings → Environment Variables
- Copy giá trị của `ORDERS_API_KEY`

### 2. Test API:

```bash
# Thay YOUR_API_KEY và YOUR_DOMAIN bằng giá trị thực tế
curl -H "X-API-Key: YOUR_API_KEY" \
  https://YOUR_DOMAIN.vercel.app/api/orders
```

### 3. Hoặc trong JavaScript:

```javascript
const API_KEY = 'your-api-key-from-vercel';
const API_URL = 'https://your-domain.vercel.app/api/orders';

const response = await fetch(API_URL, {
  headers: {
    'X-API-Key': API_KEY
  }
});

const data = await response.json();
console.log(data);
```

## 📝 Các giá trị bạn đã set:

Dựa trên thông tin bạn cung cấp:
- ✅ `ORDERS_API_KEY` = `your-secret-api-key-here`
- ✅ `SUPABASE_URL` = `https://xxx.supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbG...`

**Lưu ý:** Thay `xxx` và `eyJhbG...` bằng giá trị thực tế từ Supabase Dashboard của bạn.

## 🔍 Verify trong Vercel:

1. Vào Vercel Dashboard → Project → Settings → Environment Variables
2. Kiểm tra các biến sau đã có và đúng giá trị:
   - `ORDERS_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. Nếu chưa có, thêm vào và **redeploy**

## 🧪 Test nhanh:

Sau khi deploy, test endpoint:

```bash
# Health check (không cần API key)
curl https://your-domain.vercel.app/api/orders

# Sẽ trả về 401 nếu thiếu API key (đúng như mong đợi)
# Thêm header X-API-Key để test thành công
```

## ⚡ Next Steps:

1. ✅ Set environment variables trong Vercel (đã làm)
2. ✅ Deploy code lên Vercel
3. ✅ Test API với API key
4. ✅ Sử dụng trong frontend với `VITE_ORDERS_API_KEY`
