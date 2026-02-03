# Phong Live Manager

Hệ thống quản lý Live và báo cáo cho Phong Live.

## Tính năng

- 📊 **Quản lý Live**: Theo dõi và báo cáo các phiên Live
- 👥 **Quản lý Nhân sự**: Quản lý thông tin nhân viên, lương và KPIs
- 🏪 **Quản lý Cửa hàng**: Quản lý danh sách cửa hàng và xem chi tiết
- 📈 **Báo cáo**: Tổng hợp báo cáo theo nhân viên, cửa hàng và thời gian
- 📹 **Video Metrics**: Theo dõi hiệu quả video

## Công nghệ

- React 19
- TypeScript
- Vite
- React Router
- Recharts (biểu đồ)
- Tailwind CSS

## Cài đặt

1. Cài đặt dependencies:
```bash
npm install
```

2. Chạy ứng dụng:
```bash
npm run dev
```

3. Build cho production:
```bash
npm run build
```

## Cấu trúc dự án

```
phong-live-manager/
├── components/       # Các component tái sử dụng
├── pages/          # Các trang chính
├── services/       # API và data service
├── types.ts        # TypeScript types
└── App.tsx         # Component chính
```

## Push lên GitHub

Repo đã được khởi tạo. Để push lên GitHub:

1. Tạo repository mới trên GitHub:
   - Vào https://github.com/new
   - Đặt tên repository (ví dụ: `phong-live-manager`)
   - Không khởi tạo README, .gitignore, hoặc license (đã có sẵn)

2. Kết nối với remote và push:
```bash
git remote add origin https://github.com/YOUR_USERNAME/phong-live-manager.git
git push -u origin main
```

Hoặc nếu dùng SSH:
```bash
git remote add origin git@github.com:YOUR_USERNAME/phong-live-manager.git
git push -u origin main
```

## Deploy lên Vercel

### Cách 1: Deploy qua Vercel Dashboard (Khuyến nghị)

1. Đăng nhập vào [Vercel](https://vercel.com)
2. Click "Add New Project"
3. Import repository từ GitHub: `quantrinhansu123/phong-live-manager`
4. Vercel sẽ tự động detect Vite project
5. Click "Deploy"
6. Sau khi deploy xong, bạn sẽ có link như: `https://phong-live-manager.vercel.app`

### Cách 2: Deploy qua Vercel CLI

1. Cài đặt Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

3. Làm theo hướng dẫn trong terminal để đăng nhập và deploy

### Link Vercel

🌐 **Live URL**: [https://phong-live-manager.vercel.app](https://phong-live-manager.vercel.app)

- Production: `https://phong-live-manager.vercel.app`
- Direct URL: `https://phong-live-manager-5c8g209ze-congs-projects-f25af77d.vercel.app`

**Lưu ý**: File `vercel.json` đã được cấu hình sẵn cho SPA routing.

## License

Private project
