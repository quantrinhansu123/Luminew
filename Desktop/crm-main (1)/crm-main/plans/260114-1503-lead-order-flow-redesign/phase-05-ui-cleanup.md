# Phase 5: UI Cleanup & Polish

## Priority: Low | Status: Done (2026-01-14)

## Overview
Remove create buttons from Customers and Orders sections. Polish UI.

## Requirements
- Remove "Tạo mới" button from Customers page
- Remove "Tạo mới" button from Orders page
- Add link to view design results in Order detail
- Ensure consistent styling across sections

## Changes

### Customers Page
```diff
- <Button onClick={() => setShowCreateModal(true)}>
-   <Plus /> Tạo khách hàng
- </Button>
```

### Orders Page
```diff
- <Button onClick={() => setShowCreateModal(true)}>
-   <Plus /> Tạo đơn hàng
- </Button>
```

### Order Detail
Add section to show design results:
```tsx
{order.design_files?.filter(f => f.file_category === 'result').length > 0 && (
  <div>
    <h4>Kết quả thiết kế</h4>
    <FileGrid files={order.design_files.filter(f => f.file_category === 'result')} />
  </div>
)}
```

## Implementation Steps

### Frontend
- [ ] Remove create button from Customers page
- [ ] Remove create button from Orders page
- [ ] Remove related create modal imports/components
- [ ] Add design results section to Order detail
- [ ] Test all flows work correctly
- [ ] Verify can still create via Lead conversion

## Related Files
- `apps/web/app/(dashboard)/customers/page.tsx`
- `apps/web/app/(dashboard)/orders/page.tsx`
- `apps/web/components/features/orders/order-detail.tsx`

## Success Criteria
- [ ] No create buttons on Customers page
- [ ] No create buttons on Orders page
- [ ] Can still create via Lead conversion
- [ ] Order detail shows design results
- [ ] UI consistent and polished
