# Phase B1: Sales Employees Backend

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase 0](./phase-00-shared-setup.md)
- Schema: `database/schema.sql` - sales_employees table

## Parallelization Info
- **Group:** Track B (runs parallel with Track A)
- **Can run with:** Phase A1, A2, A3
- **Blocks:** Phase B2

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Person B
- **Effort:** 20 minutes

Implement Sales Employees CRUD endpoints (US-04).

## File Ownership (Exclusive)
- `server/routes/sales-employees.ts`

**NO OTHER PHASE touches this file.**

## Implementation Steps

### 1. Sales Employees CRUD (`server/routes/sales-employees.ts`)

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/sales-employees
router.get('/', async (req, res) => {
  const { is_active } = req.query;

  let query = supabase
    .from('sales_employees')
    .select('*')
    .order('round_robin_order', { ascending: true });

  if (is_active !== undefined) {
    query = query.eq('is_active', is_active === 'true');
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/sales-employees/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('sales_employees')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// POST /api/sales-employees
router.post('/', async (req, res) => {
  const { employee_code, full_name, email, phone } = req.body;

  // Get next round_robin_order
  const { data: maxOrder } = await supabase
    .from('sales_employees')
    .select('round_robin_order')
    .order('round_robin_order', { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrder?.round_robin_order || 0) + 1;

  const { data, error } = await supabase
    .from('sales_employees')
    .insert({
      employee_code,
      full_name,
      email,
      phone,
      round_robin_order: nextOrder,
      is_active: true,
      daily_lead_count: 0,
      total_lead_count: 0
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/sales-employees/:id
router.put('/:id', async (req, res) => {
  const { full_name, email, phone, is_active, round_robin_order } = req.body;

  const updates: any = {};
  if (full_name) updates.full_name = full_name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (is_active !== undefined) updates.is_active = is_active;
  if (round_robin_order !== undefined) updates.round_robin_order = round_robin_order;

  const { data, error } = await supabase
    .from('sales_employees')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/sales-employees/:id/reorder - Update round-robin order
router.put('/:id/reorder', async (req, res) => {
  const { new_order } = req.body;

  const { data, error } = await supabase
    .from('sales_employees')
    .update({ round_robin_order: new_order })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/sales-employees/:id
router.delete('/:id', async (req, res) => {
  // Soft delete - set is_active to false
  const { error } = await supabase
    .from('sales_employees')
    .update({ is_active: false })
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

// POST /api/sales-employees/reset-daily - Reset daily counts (called by cron)
router.post('/reset-daily', async (req, res) => {
  const { error } = await supabase
    .from('sales_employees')
    .update({ daily_lead_count: 0 })
    .gte('id', 0); // Update all

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Daily counts reset' });
});

export default router;
```

## Key Features
- **Auto round_robin_order**: New employees get next order number
- **Soft delete**: Sets is_active=false instead of hard delete
- **Reset daily counts**: Endpoint for cron job to reset daily_lead_count
- **Reorder**: Change round-robin position

## Todo List
- [ ] Create `server/routes/sales-employees.ts`
- [ ] Test GET /api/sales-employees
- [ ] Test POST with auto round_robin_order
- [ ] Test PUT /api/sales-employees/:id/reorder
- [ ] Test DELETE (soft delete)
- [ ] Test POST /api/sales-employees/reset-daily

## Success Criteria
- CRUD endpoints work correctly
- New employees get auto-incremented round_robin_order
- Soft delete preserves data
- Reset daily counts works

## Conflict Prevention
- Only Person B modifies this file
- No direct FK dependency from Person A code
- Person A's webhook calls DB function, not this API

## Next Steps
→ Phase B2: Product Groups + Assignment
