# Phase B2: Product Groups + Assignment

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase B1](./phase-B1-sales-employees-backend.md)
- Schema: `database/schema.sql` - product_groups, sales_product_specializations, assignment_config

## Parallelization Info
- **Group:** Track B
- **Can run with:** Phase A2, A3
- **Blocks:** Phase B3

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Person B
- **Effort:** 25 minutes

Implement Product Groups CRUD, Sales Specializations, and Assignment logic (US-04, US-05).

## File Ownership (Exclusive)
- `server/routes/product-groups.ts`
- `server/routes/assignment.ts`

## Implementation Steps

### 1. Product Groups CRUD (`server/routes/product-groups.ts`)

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/product-groups
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('product_groups')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/product-groups
router.post('/', async (req, res) => {
  const { name, code, description } = req.body;

  const { data, error } = await supabase
    .from('product_groups')
    .insert({ name, code, description })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/product-groups/:id
router.put('/:id', async (req, res) => {
  const { name, code, description, is_active } = req.body;

  const { data, error } = await supabase
    .from('product_groups')
    .update({ name, code, description, is_active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/product-groups/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('product_groups')
    .update({ is_active: false })
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

// === Sales Specializations ===

// GET /api/product-groups/:id/sales - Get sales specialized in this product
router.get('/:id/sales', async (req, res) => {
  const { data, error } = await supabase
    .from('sales_product_specializations')
    .select('*, sales_employees(*)')
    .eq('product_group_id', req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/product-groups/:id/sales - Assign sales to product group (US-05)
router.post('/:id/sales', async (req, res) => {
  const { sales_employee_id, is_primary } = req.body;

  const { data, error } = await supabase
    .from('sales_product_specializations')
    .insert({
      product_group_id: Number(req.params.id),
      sales_employee_id,
      is_primary: is_primary || false
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// DELETE /api/product-groups/:id/sales/:salesId - Remove specialization
router.delete('/:id/sales/:salesId', async (req, res) => {
  const { error } = await supabase
    .from('sales_product_specializations')
    .delete()
    .eq('product_group_id', req.params.id)
    .eq('sales_employee_id', req.params.salesId);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
```

### 2. Assignment Logic (`server/routes/assignment.ts`)

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/assignment/config - Get current assignment config
router.get('/config', async (req, res) => {
  const { data, error } = await supabase
    .from('assignment_config')
    .select('*')
    .eq('is_active', true)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/assignment/config - Update assignment method (US-04, US-05)
router.put('/config', async (req, res) => {
  const { method, settings } = req.body;

  const { data, error } = await supabase
    .from('assignment_config')
    .update({ method, settings })
    .eq('is_active', true)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/assignment/assign - Manual assign lead to sales
router.post('/assign', async (req, res) => {
  const { lead_id, sales_employee_id } = req.body;

  // Update lead
  const { error: leadError } = await supabase
    .from('leads')
    .update({
      assigned_sales_id: sales_employee_id,
      assigned_at: new Date().toISOString(),
      assignment_method: 'manual'
    })
    .eq('id', lead_id);

  if (leadError) return res.status(400).json({ error: leadError.message });

  // Log assignment
  await supabase.from('assignment_logs').insert({
    lead_id,
    sales_employee_id,
    method: 'manual',
    reason: 'Manually assigned by admin'
  });

  // Update sales employee stats
  await supabase.rpc('raw', {
    query: `UPDATE sales_employees
            SET daily_lead_count = daily_lead_count + 1,
                total_lead_count = total_lead_count + 1,
                last_assigned_at = NOW()
            WHERE id = ${sales_employee_id}`
  });

  res.json({ success: true });
});

// POST /api/assignment/auto - Trigger auto-assignment for a lead (US-04, US-05)
router.post('/auto', async (req, res) => {
  const { lead_id } = req.body;

  // Call database function for round-robin or product-based assignment
  const { data, error } = await supabase
    .rpc('auto_assign_lead', { p_lead_id: lead_id });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ assigned_sales_id: data });
});

// GET /api/assignment/next - Get next sales in round-robin (US-04)
router.get('/next', async (req, res) => {
  const { product_group_id } = req.query;

  const { data, error } = await supabase
    .rpc('get_next_round_robin_sales', {
      p_product_group_id: product_group_id ? Number(product_group_id) : null
    });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ next_sales_id: data });
});

// GET /api/assignment/logs - Get assignment history
router.get('/logs', async (req, res) => {
  const { sales_employee_id, limit = 50 } = req.query;

  let query = supabase
    .from('assignment_logs')
    .select('*, leads(full_name, phone), sales_employees(full_name)')
    .order('assigned_at', { ascending: false })
    .limit(Number(limit));

  if (sales_employee_id) {
    query = query.eq('sales_employee_id', sales_employee_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
```

## Key Features
- **Product Groups CRUD**: Basic management
- **Sales Specializations**: Link sales to product groups (US-05)
- **Assignment Config**: Switch between round_robin and product_based
- **Auto-Assignment**: Uses database functions
- **Manual Override**: Admin can manually assign leads

## Todo List
- [ ] Create `server/routes/product-groups.ts`
- [ ] Create `server/routes/assignment.ts`
- [ ] Test GET /api/product-groups
- [ ] Test POST /api/product-groups/:id/sales (specialization)
- [ ] Test GET /api/assignment/config
- [ ] Test POST /api/assignment/auto
- [ ] Test GET /api/assignment/next

## Success Criteria
- Product groups CRUD works
- Sales can be specialized to products (US-05)
- Auto-assignment calls database function
- Manual assignment logs correctly

## Conflict Prevention
- Only Person B modifies these files
- Assignment logic uses DB functions (shared with webhooks safely)
- No direct modification of leads table structure

## Next Steps
→ Phase B3: Stats Dashboard
