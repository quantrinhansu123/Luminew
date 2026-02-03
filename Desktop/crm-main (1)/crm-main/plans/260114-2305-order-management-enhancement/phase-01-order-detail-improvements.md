# Phase 1: Order Detail Improvements

## Priority: P0 (Critical)

## Status: ⏳ Pending

## Description
Cải thiện trải nghiệm quản lý đơn hàng: redirect sau convert, filter status, inline editing, status change với notes.

---

## Key Insights
- ConvertLeadModal hiện tại không redirect sau khi tạo order
- Orders API đã có filter by status nhưng UI chưa expose rõ ràng
- Order detail hiện là modal, cần chuyển sang full page với tabs

---

## Requirements

### Functional
- FR1: Sau convert lead → redirect đến order detail page
- FR2: Filter orders theo status (tabs hoặc dropdown)
- FR3: Inline edit order form trong detail page
- FR4: Status change với required note
- FR5: Xem lại yêu cầu khách hàng (demand) trong order detail

### Non-functional
- NFR1: Page load < 2s
- NFR2: Optimistic UI updates cho better UX
- NFR3: Form validation trước submit

---

## Architecture

### Data Flow: Status Change
```
UI: Select new status + Enter note
  ↓
API: PATCH /orders/:id/status
  ↓
Service: Validate transition + Create status_history record
  ↓
Response: Updated order + new history entry
```

### Component Structure
```
OrderDetailPage
├── OrderHeader (code, status badge, actions)
├── OrderTabs
│   ├── InfoTab (inline editable form)
│   ├── FilesTab (design files grid)
│   ├── PaymentsTab (payment history)
│   └── HistoryTab (status changes)
├── StatusChangePanel
└── CustomerInfoSidebar (demand, contact info)
```

---

## Related Code Files

### To Modify
| File | Purpose |
|------|---------|
| `apps/api/prisma/schema.prisma` | Add order_status_history table |
| `apps/api/src/modules/orders/orders.service.ts` | Add changeStatus method |
| `apps/api/src/modules/orders/orders.controller.ts` | Add PATCH /status endpoint |
| `apps/api/src/modules/orders/dto/order.dto.ts` | Add ChangeStatusDto |
| `apps/web/components/features/leads/ConvertLeadModal.tsx` | Add redirect logic |
| `apps/web/app/(dashboard)/orders/page.tsx` | Add status filter tabs |

### To Create
| File | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/orders/[id]/page.tsx` | Order detail page |
| `apps/web/components/features/orders/order-detail-header.tsx` | Header component |
| `apps/web/components/features/orders/order-info-form.tsx` | Inline edit form |
| `apps/web/components/features/orders/order-status-change.tsx` | Status change panel |
| `apps/web/components/features/orders/order-files-tab.tsx` | Files display |
| `apps/web/components/features/orders/order-history-tab.tsx` | History display |

---

## Implementation Steps

### Step 1: Database Schema Update
1. Add `order_status_history` table to schema.prisma
2. Run `pnpm db:migrate` to create migration
3. Update Prisma client

```prisma
model order_status_history {
  id           Int           @id @default(autoincrement())
  order_id     Int
  from_status  order_status?
  to_status    order_status
  changed_by   Int
  note         String?
  created_at   DateTime      @default(now())

  orders           orders           @relation(fields: [order_id], references: [id])
  sales_employees  sales_employees  @relation(fields: [changed_by], references: [id])
}
```

### Step 2: Backend API - Status Change
1. Create `ChangeStatusDto` in dto/order.dto.ts
2. Add `changeStatus()` method to orders.service.ts
3. Add `PATCH /orders/:id/status` endpoint
4. Add `GET /orders/:id/status-history` endpoint

### Step 3: Backend API - Orders Filter Enhancement
1. Update `findAll()` to accept status array: `?status=pending,designing`
2. Return status counts for each status (for tab badges)

### Step 4: Frontend - Order Detail Page
1. Create `/orders/[id]/page.tsx` với tabs layout
2. Implement OrderDetailHeader component
3. Implement OrderInfoForm với inline edit mode
4. Implement StatusChangePanel component

### Step 5: Frontend - Orders List Status Filter
1. Add status tabs to orders/page.tsx
2. Connect tabs to API filter
3. Show count badges on each tab

### Step 6: Frontend - Convert Modal Redirect
1. Update ConvertLeadModal to capture new order ID from response
2. Use `router.push(/orders/${orderId})` after success
3. Optional: Add query param to auto-open edit mode

---

## Todo List

- [ ] Add order_status_history table to schema
- [ ] Run database migration
- [ ] Create ChangeStatusDto
- [ ] Implement changeStatus service method
- [ ] Add PATCH /orders/:id/status endpoint
- [ ] Add GET /orders/:id/status-history endpoint
- [ ] Update findAll to support status array filter
- [ ] Create OrderDetailPage
- [ ] Create OrderDetailHeader component
- [ ] Create OrderInfoForm component
- [ ] Create StatusChangePanel component
- [ ] Create OrderFilesTab component
- [ ] Create OrderHistoryTab component
- [ ] Add status filter tabs to orders list
- [ ] Update ConvertLeadModal with redirect

---

## Success Criteria
- [ ] Status change creates history record với note
- [ ] Order detail page loads in < 2s
- [ ] Inline edit saves without page reload
- [ ] Status filter tabs show correct counts
- [ ] Convert redirect opens new order detail

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Migration fails on production | Test migration on staging first |
| Status transition conflicts | Add optimistic locking or version check |
| Slow queries with history joins | Add indexes on order_id, created_at |

---

## Security Considerations
- Validate status transitions server-side (không trust client)
- Check user permissions trước khi cho phép change status
- Audit log all status changes với actor ID

---

## Next Steps
→ Phase 2: Activity Timeline & Change Logs
