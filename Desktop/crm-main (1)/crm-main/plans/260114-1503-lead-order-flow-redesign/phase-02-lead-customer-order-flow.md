# Phase 2: Lead → Customer + Order Flow

## Priority: High | Status: Pending

## Overview
When lead status = "closed", show button to create Customer + Order together.

## Requirements
- Button appears only when lead.status === 'closed'
- Modal/dialog to input Customer + Order info
- Upload files during creation (to Google Drive)
- Create Customer, Order, and upload files in one transaction

## UI Flow

```
Lead Card (status = closed)
    │
    ▼
[Button: "Tạo Khách hàng + Đơn hàng"]
    │
    ▼
┌─────────────────────────────────────┐
│         Modal: Tạo Đơn Hàng         │
├─────────────────────────────────────┤
│ === Thông tin khách hàng ===        │
│ Họ tên: [prefilled from lead]       │
│ SĐT: [prefilled from lead]          │
│ Email: [prefilled from lead]        │
│ Địa chỉ: [_______________]          │
│ Công ty: [_______________]          │
│                                     │
│ === Thông tin đơn hàng ===          │
│ Mô tả: [_______________]            │
│ Tổng tiền: [_______________]        │
│                                     │
│ === Upload tài liệu ===             │
│ [Drop files here or click]          │
│ ┌────┐ ┌────┐ ┌────┐               │
│ │file│ │file│ │file│               │
│ └────┘ └────┘ └────┘               │
│                                     │
│        [Huỷ]  [Tạo đơn hàng]       │
└─────────────────────────────────────┘
```

## API Changes

### New Endpoint
```
POST /api/leads/:id/convert
```

### Request Body
```typescript
{
  customer: {
    full_name: string;
    phone: string;
    email?: string;
    address?: string;
    company_name?: string;
  };
  order: {
    description: string;
    total_amount: number;
  };
  files?: File[]; // Uploaded separately via Google Drive API
}
```

### Response
```typescript
{
  customer: Customer;
  order: Order;
  files: DesignFile[];
}
```

## Implementation Steps

### Backend
- [ ] Create `POST /api/leads/:id/convert` endpoint
- [ ] Validate lead exists and status === 'closed'
- [ ] Transaction: Create Customer → Create Order → Link files
- [ ] Update lead: `is_converted = true`, `converted_customer_id = customer.id`
- [ ] Auto-generate `customer_code` (KH-YYYYMMDD-XXX)
- [ ] Auto-generate `order_code` (ORD-YYYYMMDD-XXX)
- [ ] Create Google Drive folder for order

### Frontend
- [ ] Add "Tạo Khách hàng + Đơn hàng" button to lead card/row
- [ ] Only show when `lead.status === 'closed'`
- [ ] Create `ConvertLeadModal` component
- [ ] Pre-fill customer info from lead
- [ ] File upload with Google Drive integration
- [ ] Handle success: close modal, refresh list, show toast

## Related Files

### Backend
- `apps/api/src/modules/leads/leads.controller.ts` - add convert endpoint
- `apps/api/src/modules/leads/leads.service.ts` - implement convert logic
- `apps/api/src/modules/leads/dto/convert-lead.dto.ts` - new DTO

### Frontend
- `apps/web/app/(dashboard)/leads/page.tsx` - add button
- `apps/web/components/features/leads/convert-lead-modal.tsx` - new component

## Success Criteria
- [ ] Button only shows for closed leads
- [ ] Customer created with correct data
- [ ] Order created linked to customer
- [ ] Files uploaded to Google Drive
- [ ] Lead marked as converted
- [ ] Can't convert same lead twice
