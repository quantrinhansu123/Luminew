# Troubleshooting - API Key Authentication

## Lỗi: 401 Unauthorized

Nếu bạn gặp lỗi:
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key..."
}
```

### Bước 1: Kiểm tra API Key trong Vercel

1. Vào **Vercel Dashboard** → **Project** → **Settings** → **Environment Variables**
2. Tìm biến `ORDERS_API_KEY`
3. **Copy chính xác** giá trị (không có khoảng trắng thừa)

### Bước 2: Verify API Key đã được set

Chạy script debug:
```bash
node api/orders/debug-api-key.js [API_URL] [API_KEY]
```

Script sẽ:
- ✅ Kiểm tra format của API key
- ✅ Test 3 cách gửi API key (header, Authorization, query param)
- ✅ So sánh với key trong .env
- ✅ Đưa ra troubleshooting tips

### Bước 3: Kiểm tra cách gửi API Key

#### ✅ Cách 1: X-API-Key Header (Khuyến nghị)
```bash
curl -H "X-API-Key: your-api-key-here" \
  https://your-app.vercel.app/api/orders
```

#### ✅ Cách 2: Authorization Header
```bash
curl -H "Authorization: Bearer your-api-key-here" \
  https://your-app.vercel.app/api/orders
```

#### ✅ Cách 3: Query Parameter
```bash
curl "https://your-app.vercel.app/api/orders?api_key=your-api-key-here"
```

### Bước 4: Redeploy sau khi thêm Environment Variable

**Quan trọng:** Sau khi thêm/sửa environment variable trong Vercel:

1. **Save** changes
2. **Redeploy** project:
   - Vào **Deployments** tab
   - Click **"..."** trên deployment mới nhất
   - Chọn **"Redeploy"**
   - Hoặc push một commit mới để trigger auto-deploy

### Bước 5: Kiểm tra Vercel Logs

1. Vào **Vercel Dashboard** → **Project** → **Functions**
2. Click vào `/api/orders`
3. Xem **Logs** tab
4. Tìm các dòng:
   - `🔐 API Key Verification:`
   - `Received key: ...`
   - `Valid key exists: ...`
   - `Match: ✅ VALID` hoặc `❌ INVALID`

## Các lỗi thường gặp:

### 1. "ORDERS_API_KEY not set in environment variables"

**Nguyên nhân:** Environment variable chưa được set trong Vercel

**Giải pháp:**
- Vào Vercel Dashboard → Settings → Environment Variables
- Thêm `ORDERS_API_KEY` với giá trị của bạn
- Chọn **All Environments**
- **Redeploy** project

### 2. "No API key provided in request"

**Nguyên nhân:** Request không gửi API key

**Giải pháp:**
- Đảm bảo header `X-API-Key` được gửi
- Hoặc dùng `Authorization: Bearer <key>`
- Hoặc thêm `?api_key=<key>` vào URL

### 3. "API key mismatch"

**Nguyên nhân:** API key trong request không khớp với key trong Vercel

**Giải pháp:**
- Copy lại API key từ Vercel Dashboard (không có khoảng trắng thừa)
- Kiểm tra xem có ký tự đặc biệt nào bị encode không
- Đảm bảo không có newline hoặc space ở đầu/cuối

### 4. API key có khoảng trắng thừa

**Nguyên nhân:** Copy/paste có thể thêm space

**Giải pháp:**
- Trim API key: `apiKey.trim()`
- Copy lại từ Vercel Dashboard
- Kiểm tra bằng script debug

## Test nhanh:

```bash
# 1. Lấy API key từ Vercel
API_KEY="your-key-from-vercel"

# 2. Test với curl
curl -H "X-API-Key: $API_KEY" \
  https://your-app.vercel.app/api/orders

# 3. Nếu vẫn lỗi, dùng script debug
node api/orders/debug-api-key.js \
  https://your-app.vercel.app/api/orders \
  $API_KEY
```

## Checklist:

- [ ] API key đã được set trong Vercel Dashboard
- [ ] Đã chọn "All Environments" khi set env var
- [ ] Đã redeploy sau khi thêm/sửa env var
- [ ] API key trong request khớp với key trong Vercel
- [ ] Header `X-API-Key` được gửi đúng
- [ ] Không có khoảng trắng thừa trong API key
- [ ] Đã kiểm tra Vercel logs để xem chi tiết

## Vẫn không được?

1. **Xem logs chi tiết:**
   - Vercel Dashboard → Functions → /api/orders → Logs
   - Tìm dòng `🔐 API Key Verification:` để xem debug info

2. **Tạo API key mới:**
   ```bash
   node api/orders/generate-api-key.js
   ```
   - Copy key mới
   - Update trong Vercel Dashboard
   - Redeploy

3. **Test với script debug:**
   ```bash
   node api/orders/debug-api-key.js
   ```
