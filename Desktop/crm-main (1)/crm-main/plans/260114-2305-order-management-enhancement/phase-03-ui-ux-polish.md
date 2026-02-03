# Phase 3: UI/UX Polish & Archive

## Priority: P2 (Nice to have)

## Status: ⏳ Pending

## Description
Polish UI labels theo yêu cầu business, implement archive functionality khi order completed, và các improvements nhỏ khác.

---

## Key Insights
- Yêu cầu rename "Hộp chờ tư vấn" → "Chuẩn bị đơn hàng"
- Khi order hoàn thành + thanh toán xong → lưu archive
- Cần clarify archive format với stakeholder

---

## Requirements

### Functional
- FR1: Rename UI labels theo terminology mới
- FR2: Khi order status = delivered + paid → enable archive action
- FR3: Archive lưu snapshot của order + files + history
- FR4: Archive có thể download hoặc view

### Non-functional
- NFR1: Archive generation < 30s
- NFR2: Archive file size optimized (compress images)
- NFR3: Labels i18n-ready for future

---

## Architecture

### Archive Format Options

**Option A: JSON Export**
```json
{
  "order": { ... },
  "customer": { ... },
  "files": [ ... ],
  "statusHistory": [ ... ],
  "payments": [ ... ],
  "activities": [ ... ],
  "exportedAt": "2026-01-14T23:00:00Z"
}
```
- Pros: Easy to implement, searchable
- Cons: Files stored separately

**Option B: ZIP Package** ✅ Recommended
```
ORD-001-archive.zip
├── order-info.json
├── customer-info.json
├── history.json
├── files/
│   ├── design-v1.png
│   └── final-approved.pdf
└── summary.pdf (optional)
```
- Pros: Self-contained, portable
- Cons: More complex, needs file download from Drive

**Option C: Database Flag Only**
```prisma
orders {
  is_archived  Boolean @default(false)
  archived_at  DateTime?
}
```
- Pros: Simplest
- Cons: No physical backup

### Recommended Approach
- Start với Option C (database flag)
- Add Option A (JSON export) as download feature
- Option B defer to future if needed

---

## Related Code Files

### To Modify
| File | Purpose |
|------|---------|
| `apps/web/app/(dashboard)/leads/page.tsx` | Rename menu/title |
| `apps/web/components/ui/sidebar.tsx` | Update navigation labels |
| `apps/api/prisma/schema.prisma` | Add archive fields |
| `apps/api/src/modules/orders/orders.service.ts` | Add archive method |

### To Create
| File | Purpose |
|------|---------|
| `apps/api/src/modules/orders/order-archive.service.ts` | Archive generation |
| `apps/web/components/features/orders/order-archive-button.tsx` | Archive action UI |

---

## Implementation Steps

### Step 1: UI Label Updates
1. Update sidebar navigation: "Leads" → "Chuẩn bị đơn hàng"
2. Update page titles accordingly
3. Keep URL paths as-is (`/leads`) for compatibility

### Step 2: Database Schema for Archive
```prisma
model orders {
  // ... existing fields
  is_archived    Boolean   @default(false)
  archived_at    DateTime?
  archived_by    Int?
  archive_data   Json?     // Snapshot of order at archive time
}
```

### Step 3: Archive Service
```typescript
@Injectable()
export class OrderArchiveService {
  async canArchive(orderId: number): Promise<boolean> {
    // Check: status = delivered AND fully paid
  }

  async archive(orderId: number, userId: number): Promise<void> {
    // 1. Validate canArchive
    // 2. Generate snapshot JSON
    // 3. Update order: is_archived, archived_at, archive_data
  }

  async getArchiveExport(orderId: number): Promise<OrderArchiveExport> {
    // Return archive_data or generate fresh if null
  }
}
```

### Step 4: Archive API Endpoint
```
POST /orders/:id/archive    # Create archive
GET  /orders/:id/archive    # Download archive JSON
```

### Step 5: Frontend Archive Button
1. Show "Lưu trữ" button when order is completed + paid
2. Confirmation dialog before archive
3. After archive, show "Đã lưu trữ" badge + download option

### Step 6: Status Count Dashboard (Bonus)
1. Add summary cards: "Chờ xử lý: 5", "Đang thiết kế: 3", etc.
2. Cards clickable to filter list

---

## Todo List

- [ ] Rename sidebar navigation labels
- [ ] Rename page titles
- [ ] Add archive fields to schema
- [ ] Run database migration
- [ ] Create OrderArchiveService
- [ ] Add archive API endpoints
- [ ] Create OrderArchiveButton component
- [ ] Add archive confirmation dialog
- [ ] Add "Đã lưu trữ" badge display
- [ ] Add status summary cards (bonus)

---

## Success Criteria
- [ ] Navigation shows "Chuẩn bị đơn hàng"
- [ ] Archive button appears for eligible orders
- [ ] Archive data saved successfully
- [ ] Archived orders have visual indicator
- [ ] Archive can be downloaded as JSON

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Label changes break bookmarks | Keep URL paths unchanged |
| Archive data too large | Limit to essential fields |
| User confusion on new terms | Add tooltip explanations |

---

## Security Considerations
- Only managers can archive orders
- Archive data encrypted at rest (database-level)
- Download requires authentication

---

## Next Steps
→ User acceptance testing
→ Production deployment
