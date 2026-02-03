# Phase 3: Design Tasks Section (Yêu Cầu Thiết Kế)

## Priority: Medium | Status: Done (2026-01-14)

## Overview
Section where employees view orders needing design work and upload results.

## Requirements
- List orders that need design (status: pending, designing)
- Click order → show detail panel
- Upload design results (files saved with `file_category = 'result'`)
- Results visible in both Design Tasks and Orders sections

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Yêu Cầu Thiết Kế                                               │
├─────────────────────────────────────────────────────────────────┤
│ [Search: Tìm theo mã đơn, tên khách hàng...]                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ORD-2026-001 | Nguyễn Văn A | Thiết kế hộp giấy        │   │
│  │ Status: Đang thiết kế | Created: 14/01/2026             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ORD-2026-002 | Trần Thị B | Thiết kế túi giấy          │   │
│  │ Status: Chờ xử lý | Created: 13/01/2026                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

When clicking an order:
┌─────────────────────────────────────────────────────────────────┐
│  Chi tiết đơn: ORD-2026-001                          [X Close]  │
├─────────────────────────────────────────────────────────────────┤
│ Khách hàng: Nguyễn Văn A                                        │
│ SĐT: 0901234567                                                 │
│ Mô tả: Thiết kế hộp giấy carton 20x15x10cm                     │
│                                                                 │
│ === Tài liệu yêu cầu ===                                       │
│ ┌────┐ ┌────┐                                                  │
│ │img1│ │pdf │                                                  │
│ └────┘ └────┘                                                  │
│                                                                 │
│ === Kết quả thiết kế ===                                       │
│ [Upload kết quả thiết kế]                                      │
│ ┌────┐ ┌────┐ ┌────┐                                          │
│ │res1│ │res2│ │res3│  [+Add more]                             │
│ └────┘ └────┘ └────┘                                          │
│                                                                 │
│ [Đánh dấu hoàn thành]                                          │
└─────────────────────────────────────────────────────────────────┘
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/orders?needsDesign=true` | Get orders needing design |
| POST | `/api/orders/:id/design-results` | Upload design result |
| PATCH | `/api/orders/:id/design-status` | Update design status |

## Implementation Steps

### Backend
- [ ] Add query param filter for orders needing design
- [ ] Create endpoint to upload design results
- [ ] Save files with `file_category = 'result'`
- [ ] Link files to order via `design_files` table

### Frontend
- [ ] Repurpose existing `design-tasks` page
- [ ] Create order list with search
- [ ] Create order detail slide-over/modal
- [ ] Show request files (file_category = 'request')
- [ ] Upload area for results (file_category = 'result')
- [ ] Mark complete button

## Related Files
- `apps/web/app/(dashboard)/design-tasks/page.tsx` - main page
- `apps/web/components/features/design-tasks/order-detail-panel.tsx` - new
- `apps/api/src/modules/orders/orders.controller.ts` - add endpoints

## Success Criteria
- [ ] List shows orders needing design
- [ ] Can view order details
- [ ] Can upload design results
- [ ] Results linked to order
- [ ] Results visible in Orders section
