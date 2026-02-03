# Backend API cho Van Don - Vercel Serverless Functions

## Tổng quan
Backend được xây dựng theo chuẩn **Vercel Serverless Functions**, sử dụng thư mục `api/` để chứa các API routes.

## Cấu trúc

```
api/
  ├── van-don.js    # GET /api/van-don
  └── health.js     # GET /api/health
```

## API Endpoints

### GET /api/van-don
Lấy danh sách vận đơn với các query parameters:

- `page` (default: 1): Số trang
- `limit` (default: 100): Số items mỗi trang
- `team`: Lọc theo team (ví dụ: "HCM", "Hà Nội")
- `status`: Lọc theo trạng thái giao hàng
- `market`: Lọc theo khu vực (có thể là string hoặc array)
- `product`: Lọc theo mặt hàng (có thể là string hoặc array)

**Ví dụ:**
```
GET /api/van-don?page=1&limit=50&team=HCM
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2,
  "rows": [...]
}
```

### GET /api/health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "production"
}
```

## Development

### Local Development với Vercel CLI

1. Cài đặt Vercel CLI (nếu chưa có):
```bash
npm i -g vercel
```

2. Chạy development server:
```bash
npm run vercel-dev
```

Server sẽ chạy trên `http://localhost:3000` và tự động detect các API routes trong thư mục `api/`.

### Local Development với Vite (chỉ frontend)

Nếu chỉ cần chạy frontend:
```bash
npm run dev
```

Frontend sẽ chạy trên `http://localhost:3000` nhưng API routes sẽ không hoạt động (cần deploy lên Vercel hoặc dùng `vercel dev`).

## Deployment lên Vercel

### Cách 1: Deploy tự động qua Vercel Dashboard
1. Push code lên GitHub/GitLab/Bitbucket
2. Kết nối repository với Vercel
3. Vercel sẽ tự động detect và deploy

### Cách 2: Deploy bằng Vercel CLI
```bash
# Login vào Vercel
vercel login

# Deploy
vercel

# Deploy production
vercel --prod
```

## Cấu hình Vercel

File `vercel.json` đã được cấu hình để:
- Build static files từ `dist/` directory
- Route `/api/*` đến serverless functions trong `api/`
- Serve static files từ root

## Data Source

Backend sẽ:
1. Thử fetch dữ liệu từ API thực tế: `https://n-api-gamma.vercel.app/sheet/F3/data`
2. Nếu API lỗi, sẽ sử dụng mock data fallback

## CORS

Tất cả API endpoints đã được cấu hình CORS để cho phép requests từ bất kỳ origin nào. Trong production, bạn có thể giới hạn CORS bằng cách cập nhật headers trong các file API.

## Troubleshooting

### API không hoạt động trong local development
- Đảm bảo bạn đang dùng `vercel dev` thay vì chỉ `vite`
- Kiểm tra xem file API có đúng format Vercel serverless function không

### Lỗi khi deploy lên Vercel
- Kiểm tra `vercel.json` có đúng cấu hình không
- Đảm bảo `package.json` có script `build`
- Kiểm tra logs trong Vercel Dashboard

### CORS errors
- Kiểm tra CORS headers trong file API
- Đảm bảo frontend đang gọi đúng endpoint (`/api/van-don`)

## Notes

- Serverless functions trong Vercel có timeout mặc định là 10 giây (Hobby plan) hoặc 60 giây (Pro plan)
- Mỗi function sẽ được deploy riêng biệt và scale tự động
- Functions sẽ "cold start" lần đầu tiên được gọi, sau đó sẽ được cache
