# Phase 2: History & Timeline

## Priority: P1 (Important)

## Status: ⏳ Pending

## Description
Implement audit logging cho order changes và activity timeline UI để track toàn bộ lịch sử hoạt động của đơn hàng.

---

## Key Insights
- Phase 1 đã tạo `order_status_history` cho status changes
- Cần thêm `order_change_logs` cho field-level changes
- Cần unified `order_activities` view để hiển thị timeline

---

## Requirements

### Functional
- FR1: Track mọi thay đổi field của order (description, amount, etc.)
- FR2: Lưu old_value và new_value cho mỗi change
- FR3: Hiển thị activity timeline trong order detail
- FR4: Timeline bao gồm: status changes, field edits, file uploads, payments
- FR5: Support filter timeline theo activity type

### Non-functional
- NFR1: Change logs không được DELETE (audit compliance)
- NFR2: Timeline load incremental (pagination)
- NFR3: Changes được capture tự động (không manual)

---

## Architecture

### Audit Strategy: Change Data Capture

**Option A: Application-level tracking** ✅ Recommended
- Service layer compare old vs new values
- Explicit INSERT vào change_logs table
- Pros: Full control, easy to implement
- Cons: Must remember to log in every update

**Option B: Database triggers**
- PostgreSQL triggers on UPDATE
- Pros: Can't be bypassed
- Cons: Complex, harder to debug

### Data Model

```prisma
model order_change_logs {
  id          Int      @id @default(autoincrement())
  order_id    Int
  field_name  String   // 'description', 'total_amount', 'quantity'
  old_value   String?
  new_value   String?
  changed_by  Int
  created_at  DateTime @default(now())

  orders           orders           @relation(...)
  sales_employees  sales_employees  @relation(...)

  @@index([order_id, created_at])
}

model order_activities {
  id          Int           @id @default(autoincrement())
  order_id    Int
  type        activity_type
  title       String
  description String?
  metadata    Json?         // { fileId, paymentId, etc. }
  actor_id    Int
  created_at  DateTime      @default(now())

  orders           orders           @relation(...)
  sales_employees  sales_employees  @relation(...)

  @@index([order_id, created_at])
}

enum activity_type {
  order_created
  status_changed
  field_updated
  file_uploaded
  file_removed
  payment_added
  note_added
}
```

### Activity Timeline Aggregation
```
Timeline = merge(
  order_activities,
  order_status_history (mapped to activity format),
  order_change_logs (grouped by timestamp)
) ORDER BY created_at DESC
```

---

## Related Code Files

### To Modify
| File | Purpose |
|------|---------|
| `apps/api/prisma/schema.prisma` | Add change_logs, activities tables |
| `apps/api/src/modules/orders/orders.service.ts` | Add change tracking logic |

### To Create
| File | Purpose |
|------|---------|
| `apps/api/src/modules/orders/order-audit.service.ts` | Dedicated audit service |
| `apps/api/src/modules/orders/dto/activity.dto.ts` | Activity DTOs |
| `apps/web/components/features/orders/order-activity-timeline.tsx` | Timeline UI |
| `apps/web/components/features/orders/activity-item.tsx` | Single activity item |

---

## Implementation Steps

### Step 1: Database Schema
1. Add `order_change_logs` table
2. Add `order_activities` table
3. Add `activity_type` enum
4. Run migration

### Step 2: Create OrderAuditService
```typescript
@Injectable()
export class OrderAuditService {
  constructor(private prisma: PrismaService) {}

  async logFieldChange(
    orderId: number,
    field: string,
    oldValue: any,
    newValue: any,
    changedBy: number
  ): Promise<void>

  async logActivity(
    orderId: number,
    type: ActivityType,
    title: string,
    actorId: number,
    metadata?: Record<string, any>
  ): Promise<void>

  async getTimeline(
    orderId: number,
    limit: number,
    cursor?: Date
  ): Promise<ActivityItem[]>
}
```

### Step 3: Integrate Audit into OrdersService
1. Update `update()` method to compare and log changes
2. Hook audit logging into status change
3. Hook into file upload/remove
4. Hook into payment creation

### Step 4: Create Timeline API Endpoints
```
GET /orders/:id/activities
  ?limit=20
  &cursor=2026-01-14T10:00:00Z
  &type=status_changed,file_uploaded
```

### Step 5: Frontend Timeline Component
1. Create OrderActivityTimeline component
2. Create ActivityItem component với icons per type
3. Add to OrderDetailPage HistoryTab
4. Implement infinite scroll pagination

---

## Todo List

- [ ] Add order_change_logs table
- [ ] Add order_activities table
- [ ] Add activity_type enum
- [ ] Run database migration
- [ ] Create OrderAuditService
- [ ] Integrate audit into OrdersService.update()
- [ ] Add activity logging to status change
- [ ] Add activity logging to file operations
- [ ] Add activity logging to payments
- [ ] Create GET /orders/:id/activities endpoint
- [ ] Create OrderActivityTimeline component
- [ ] Create ActivityItem component
- [ ] Add timeline to OrderDetailPage
- [ ] Implement infinite scroll

---

## Success Criteria
- [ ] Every order update creates change log entries
- [ ] Timeline shows all activity types với icons
- [ ] Pagination works smoothly
- [ ] Actor name displayed correctly
- [ ] Timestamps formatted properly (relative + absolute)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| High volume of change logs | Implement retention policy (archive after 1 year) |
| Missing audit entries | Add integration tests for each operation |
| Timeline query slow | Add composite indexes, pagination |

---

## Security Considerations
- Change logs table: INSERT only, no UPDATE/DELETE permissions
- Activity metadata sanitized (no PII in JSON)
- Actor ID must be validated authenticated user

---

## Next Steps
→ Phase 3: UI/UX Polish & Archive
