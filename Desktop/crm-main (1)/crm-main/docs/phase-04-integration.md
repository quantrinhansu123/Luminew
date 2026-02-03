# Phase 4: Integration

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase A3](./phase-A3-lead-frontend.md), [Phase B3](./phase-B3-stats-dashboard.md)

## Parallelization Info
- **Group:** Sequential (final phase)
- **Must wait for:** All Track A and Track B phases
- **Blocks:** None (final)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Both Person A and B
- **Effort:** 15 minutes

Final integration testing and fixes.

## Prerequisites Checklist
Before starting this phase, verify:

### Person A completed:
- [ ] Lead Sources CRUD working
- [ ] Campaigns CRUD working
- [ ] Leads CRUD with filters working
- [ ] Manual lead entry working
- [ ] Frontend displaying leads with source_label

### Person B completed:
- [ ] Sales Employees CRUD working
- [ ] Product Groups CRUD working
- [ ] Assignment endpoints working
- [ ] Stats dashboard showing data

## Integration Test Plan

### Test 1: End-to-End Lead Flow
```
1. POST /api/leads with test data (manual entry)
2. Verify lead created with source_label
3. Verify auto-assigned to sales employee
4. Check assignment_logs has entry
5. Verify sales employee's daily_lead_count incremented
6. Check frontend shows new lead
```

### Test 2: Round-Robin Assignment
```
1. Create 3 sales employees (A, B, C with order 1, 2, 3)
2. POST 3 leads manually via /api/leads
3. Verify: Lead1 → Sales A, Lead2 → Sales B, Lead3 → Sales C
4. POST 4th lead
5. Verify: Lead4 → Sales A (wrapped around)
```

### Test 3: Product-Based Assignment
```
1. Create sales employee specialized in "In hộp giấy"
2. POST lead with interested_product_group_id matching
3. Verify assigned to specialized sales (not round-robin)
```

### Test 4: Status Filter
```
1. Create leads with different statuses
2. GET /api/leads?status=new
3. Verify only 'new' leads returned
4. Test frontend filter buttons
```

### Test 5: Daily Stats
```
1. Open SalesAllocation page
2. Verify stats chart shows today's leads per sales
3. Check numbers match actual assignments
```

## Common Issues & Fixes

### Issue: source_label not generated
**Fix:** Verify database trigger `trigger_lead_source_label` exists

### Issue: Auto-assignment not working
**Fix:** Check `auto_assign_lead` function exists in database

### Issue: Stats not showing
**Fix:** Verify `daily_assignment_stats` view exists

### Issue: CORS errors
**Fix:** Ensure server has CORS enabled for frontend origin

## Sync Points

### During Integration:
1. **Both test**: End-to-end flow works
2. **Person A verifies**: Leads assigned correctly
3. **Person B verifies**: Stats update correctly
4. **Both fix**: Any cross-boundary issues

## Final Validation

Run this curl script to validate:

```bash
# Create a test lead manually
curl -X POST http://localhost:3001/api/leads \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","phone":"0901234567","email":"test@example.com","demand":"In hộp giấy","source_id":1}'

# Check lead was created and assigned
curl http://localhost:3001/api/leads?limit=1

# Check stats updated
curl http://localhost:3001/api/assignment/stats
```

## Todo List
- [ ] Verify all Phase A todos complete
- [ ] Verify all Phase B todos complete
- [ ] Run Test 1: E2E Lead Flow
- [ ] Run Test 2: Round-Robin Assignment
- [ ] Run Test 3: Product-Based Assignment
- [ ] Run Test 4: Status Filter
- [ ] Run Test 5: Daily Stats
- [ ] Fix any cross-boundary issues
- [ ] Test frontend end-to-end

## Success Criteria
- Lead created manually appears in frontend
- Auto-assignment working
- Stats dashboard accurate
- No console errors
- All user stories satisfied:
  - [x] US-02: Source label tracking
  - [x] US-03: Status filtering and manual entry
  - [x] US-04: Round-robin assignment
  - [x] US-05: Product-based assignment
  - [x] US-06: Daily stats view

## Post-Integration

After successful integration:
1. Commit all changes
2. Update documentation
3. Deploy to staging
4. Notify stakeholders
