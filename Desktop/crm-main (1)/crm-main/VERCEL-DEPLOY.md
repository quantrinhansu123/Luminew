# Hướng dẫn Deploy lên Vercel

## Cấu hình Vercel

### 1. Kết nối Repository với Vercel

1. Đăng nhập vào [Vercel](https://vercel.com)
2. Chọn "Add New Project"
3. Import repository: `quantrinhansu123/quanlyxuonginnew`
4. Vercel sẽ tự động detect Next.js

### 2. Cấu hình Build Settings

**Framework Preset:** Next.js

**Root Directory:** `apps/web`

**Build Command:** `cd apps/web && pnpm install && pnpm build`

**Output Directory:** `apps/web/.next` (tự động)

**Install Command:** `pnpm install`

### 3. Environment Variables

Thêm các biến môi trường sau trong Vercel Dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Deploy

Sau khi cấu hình xong, click "Deploy" và Vercel sẽ tự động:
- Cài đặt dependencies
- Build project
- Deploy lên production

## Lưu ý

- Vercel sẽ tự động detect Next.js từ `package.json`
- File `vercel.json` đã được cấu hình sẵn
- Repository đã được push lên: https://github.com/quantrinhansu123/quanlyxuonginnew
