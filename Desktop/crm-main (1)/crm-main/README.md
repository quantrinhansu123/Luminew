# CRM System - Quản lý xưởng in

Hệ thống quản lý CRM cho xưởng in, bao gồm quản lý leads, đơn hàng, khách hàng, thiết kế và báo cáo.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Package Manager**: pnpm
- **Build Tool**: Turbo (Monorepo)

## Cấu trúc dự án

```
crm-main/
├── apps/
│   ├── web/          # Next.js web application
│   └── api/          # Backend API (NestJS)
└── packages/         # Shared packages
```

## Cài đặt

```bash
# Cài đặt dependencies
pnpm install

# Chạy development server
pnpm dev:web

# Build cho production
pnpm build
```

## Deploy lên Vercel

1. Kết nối repository với Vercel
2. Vercel sẽ tự động detect Next.js và build
3. Đảm bảo đã set các environment variables cần thiết:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Environment Variables

Tạo file `.env.local` trong `apps/web/`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Features

- ✅ Quản lý Leads (Hộp chờ tư vấn)
- ✅ Quản lý Đơn hàng
- ✅ Quản lý Khách hàng
- ✅ Quản lý Thiết kế (Yêu cầu & Kho thiết kế)
- ✅ Báo cáo MKT
- ✅ Quản lý KPIs
- ✅ Dashboard & Analytics
- ✅ Lịch sử giao dịch

## License

Private
