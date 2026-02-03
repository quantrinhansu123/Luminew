# Phase A1: Lead Sources Backend

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase 0](./phase-00-shared-setup.md)

## Parallelization Info
- **Group:** Track A (runs parallel with Track B)
- **Can run with:** Phase B1, B2, B3
- **Blocks:** Phase A2

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Person A
- **Effort:** 15 minutes

Implement Lead Sources and Campaigns CRUD endpoints for manual tracking.

## File Ownership (Exclusive)
- `server/routes/lead-sources.ts`
- `server/routes/campaigns.ts`

**NO OTHER PHASE touches these files.**

## Implementation Steps

### 1. Lead Sources CRUD (`server/routes/lead-sources.ts`)

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/lead-sources
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('lead_sources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/lead-sources/:id
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('lead_sources')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// POST /api/lead-sources
router.post('/', async (req, res) => {
  const { type, name, description } = req.body;

  const { data, error } = await supabase
    .from('lead_sources')
    .insert({ type, name, description })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/lead-sources/:id
router.put('/:id', async (req, res) => {
  const { type, name, description, is_active } = req.body;

  const { data, error } = await supabase
    .from('lead_sources')
    .update({ type, name, description, is_active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/lead-sources/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('lead_sources')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
```

### 2. Campaigns CRUD (`server/routes/campaigns.ts`)

```typescript
import { Router } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/campaigns
router.get('/', async (req, res) => {
  const { source_id } = req.query;

  let query = supabase
    .from('campaigns')
    .select('*, lead_sources(name, type)')
    .order('created_at', { ascending: false });

  if (source_id) {
    query = query.eq('source_id', source_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  const { source_id, name, code, description, start_date, end_date, budget } = req.body;

  const { data, error } = await supabase
    .from('campaigns')
    .insert({ source_id, name, code, description, start_date, end_date, budget })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /api/campaigns/:id
router.put('/:id', async (req, res) => {
  const { source_id, name, code, description, start_date, end_date, budget, is_active } = req.body;

  const { data, error } = await supabase
    .from('campaigns')
    .update({ source_id, name, code, description, start_date, end_date, budget, is_active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
});

export default router;
```

## Todo List
- [ ] Create `server/routes/lead-sources.ts` with full CRUD
- [ ] Create `server/routes/campaigns.ts` with full CRUD
- [ ] Test GET /api/lead-sources
- [ ] Test POST /api/lead-sources with valid data
- [ ] Test GET /api/campaigns?source_id=X filter
- [ ] Test POST /api/campaigns

## Success Criteria
- All CRUD endpoints return correct HTTP status codes
- Campaigns filter by source_id works
- Join query returns lead_sources info with campaigns

## Conflict Prevention
- Only Person A modifies these files
- No shared state with Phase B routes
- Uses separate database tables

## Next Steps
→ Phase A2: Leads CRUD + Webhooks
