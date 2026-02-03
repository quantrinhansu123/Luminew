# Phase 4: Design Gallery (Kho Thiết Kế)

## Priority: Medium | Status: Done (2026-01-14)

## Overview
Gallery view of all orders with design files. Grid layout with image previews.

## Requirements
- Grid layout showing order thumbnails
- Each card shows: thumbnail, order code, customer name
- Thumbnail = first image from order's design files
- Search by customer name or order code
- Click → view all files for that order
- Remove "Add design" button

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Kho Thiết Kế                                                   │
├─────────────────────────────────────────────────────────────────┤
│ [🔍 Tìm kiếm theo tên khách hàng hoặc mã đơn...]               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │       │
│  │  │ 🖼️ │  │  │  │ 🖼️ │  │  │  │ 🖼️ │  │  │  │ 🖼️ │  │       │
│  │  └────┘  │  │  └────┘  │  │  └────┘  │  │  └────┘  │       │
│  │ORD-001   │  │ORD-002   │  │ORD-003   │  │ORD-004   │       │
│  │Nguyễn A  │  │Trần B    │  │Lê C      │  │Phạm D    │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │  │  ┌────┐  │       │
│  │  │ 🖼️ │  │  │  │ 🖼️ │  │  │  │ 🖼️ │  │  │  │ 🖼️ │  │       │
│  │  └────┘  │  │  └────┘  │  │  └────┘  │  │  └────┘  │       │
│  │ORD-005   │  │ORD-006   │  │ORD-007   │  │ORD-008   │       │
│  │Hoàng E   │  │Vũ F      │  │Đặng G    │  │Bùi H     │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Click on card → Modal:
┌─────────────────────────────────────────────────────────────────┐
│  ORD-2026-001 - Nguyễn Văn A                         [X Close]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  === Tài liệu yêu cầu ===                                      │
│  ┌──────┐ ┌──────┐                                             │
│  │ 🖼️   │ │ 📄   │                                             │
│  │img1  │ │req.pdf│                                            │
│  └──────┘ └──────┘                                             │
│                                                                 │
│  === Kết quả thiết kế ===                                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                          │
│  │ 🖼️   │ │ 🖼️   │ │ 📄   │ │ 📄   │                          │
│  │final │ │v2    │ │.ai   │ │.pdf  │                          │
│  └──────┘ └──────┘ └──────┘ └──────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Thumbnail URL Format
```
https://drive.google.com/thumbnail?id={google_drive_id}&sz=w300
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders/gallery` | Get orders with thumbnails |
| GET | `/api/orders/:id/files` | Get all files for an order |

### Gallery Response
```typescript
{
  orders: [
    {
      id: number;
      order_code: string;
      customer_name: string;
      thumbnail_url: string | null; // First image thumbnail
      file_count: number;
      created_at: string;
    }
  ];
  total: number;
  page: number;
  limit: number;
}
```

## Implementation Steps

### Backend
- [ ] Create `/api/orders/gallery` endpoint
- [ ] Query orders with design_files
- [ ] Get first image file as thumbnail
- [ ] Support search by customer name / order code
- [ ] Pagination

### Frontend
- [ ] Repurpose `kho-thiet-ke` page
- [ ] Remove "Add design" button
- [ ] Create grid layout component
- [ ] Card component with thumbnail + info
- [ ] Search input with debounce
- [ ] Detail modal showing all files
- [ ] Lazy load thumbnails

## Related Files
- `apps/web/app/(dashboard)/kho-thiet-ke/page.tsx` - main page
- `apps/web/components/features/gallery/design-gallery-grid.tsx` - new
- `apps/web/components/features/gallery/design-gallery-card.tsx` - new
- `apps/web/components/features/gallery/design-detail-modal.tsx` - new

## Success Criteria
- [ ] Grid displays order cards with thumbnails
- [ ] Search filters by customer/order code
- [ ] Click opens detail modal
- [ ] Shows both request and result files
- [ ] No "Add design" button
- [ ] Thumbnails load from Google Drive
