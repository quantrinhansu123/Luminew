# Implementation Plan: Order Management Enhancement

## Overview
Nâng cấp hệ thống quản lý đơn hàng thiết kế và in ấn theo yêu cầu từ `docs/dinhhuong14th1.txt`.

**Approach:** Incremental Enhancement (3 phases)

## Current State
- ✅ Lead → Customer + Order conversion flow
- ✅ Google Drive integration cho files
- ✅ Basic order CRUD operations
- ❌ Order detail inline editing
- ❌ Status change history với notes
- ❌ Activity timeline
- ❌ Status filter UI

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| [Phase 1](phase-01-order-detail-improvements.md) | Order Detail Improvements | ⏳ Pending |
| [Phase 2](phase-02-history-timeline.md) | History & Timeline | ⏳ Pending |
| [Phase 3](phase-03-ui-ux-polish.md) | UI/UX Polish & Archive | ⏳ Pending |

## Key Dependencies
- Prisma ORM for database migrations
- NestJS backend API
- Next.js 15 + React 19 frontend
- Supabase PostgreSQL database

## Files to Modify

### Backend
- `apps/api/prisma/schema.prisma` - New tables
- `apps/api/src/modules/orders/orders.service.ts` - Enhanced methods
- `apps/api/src/modules/orders/orders.controller.ts` - New endpoints
- `apps/api/src/modules/orders/dto/order.dto.ts` - New DTOs

### Frontend
- `apps/web/app/(dashboard)/orders/page.tsx` - Status filter tabs
- `apps/web/app/(dashboard)/orders/[id]/page.tsx` - Detail page (new)
- `apps/web/components/features/orders/` - New components
- `apps/web/components/features/leads/ConvertLeadModal.tsx` - Redirect logic

## Success Criteria
1. Order status can be changed with notes
2. Status history is tracked and displayed
3. Order detail page supports inline editing
4. Activity timeline shows all order events
5. Orders can be filtered by status
6. Redirect to order detail after conversion

## Unresolved Questions
1. Archive format: PDF report vs ZIP vs DB flag only?
2. Status transition rules: Need confirmation on allowed transitions
3. Edit permissions: Assigned sales only or all sales?
