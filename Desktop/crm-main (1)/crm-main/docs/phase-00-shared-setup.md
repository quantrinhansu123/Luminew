# Phase 0: Shared Setup

## Context Links
- Parent: [plan.md](./plan.md)
- Schema: `database/schema.sql`

## Parallelization Info
- **Group:** Sequential (must complete before Track A and Track B)
- **Blocks:** All other phases
- **Duration:** 15 minutes

## Overview
- **Priority:** P1 - Critical Path
- **Status:** Pending
- **Owner:** Either Person A or B (one person)

Setup shared infrastructure: Supabase client, route structure, new TypeScript types.

## Key Insights
- Current server uses Express with raw `pg` Pool
- Need Supabase client for RLS policies to work
- Types need updating from Vietnamese enums to new schema

## Requirements

### Functional
- Supabase client initialized with service role key
- Modular route structure for parallel development
- TypeScript types matching new schema

### Non-Functional
- No breaking changes to existing code (additive only)
- Environment variables for Supabase URL/keys

## Architecture

```
server/
├── index.ts              # Main entry (modify: add route imports)
├── lib/
│   └── supabase.ts       # NEW: Supabase client
├── routes/
│   ├── index.ts          # NEW: Route aggregator
│   ├── lead-sources.ts   # NEW: Person A
│   ├── campaigns.ts      # NEW: Person A
│   ├── leads.ts          # NEW: Person A
│   ├── webhooks.ts       # NEW: Person A
│   ├── sales-employees.ts # NEW: Person B
│   ├── product-groups.ts # NEW: Person B
│   └── assignment.ts     # NEW: Person B
└── .env                  # Add SUPABASE_URL, SUPABASE_SERVICE_KEY
```

## File Ownership
- `server/lib/supabase.ts` - This phase only
- `server/routes/index.ts` - This phase only
- `types-new.ts` - This phase only

## Implementation Steps

### 1. Install Supabase Client
```bash
cd server
npm install @supabase/supabase-js
```

### 2. Create Supabase Service (`server/lib/supabase.ts`)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});
```

### 3. Create Route Aggregator (`server/routes/index.ts`)
```typescript
import { Router } from 'express';
// Person A routes
import leadSourcesRouter from './lead-sources';
import campaignsRouter from './campaigns';
import leadsRouter from './leads';
import webhooksRouter from './webhooks';
// Person B routes
import salesEmployeesRouter from './sales-employees';
import productGroupsRouter from './product-groups';
import assignmentRouter from './assignment';

const router = Router();

// Person A
router.use('/lead-sources', leadSourcesRouter);
router.use('/campaigns', campaignsRouter);
router.use('/leads', leadsRouter);
router.use('/webhooks', webhooksRouter);

// Person B
router.use('/sales-employees', salesEmployeesRouter);
router.use('/product-groups', productGroupsRouter);
router.use('/assignment', assignmentRouter);

export default router;
```

### 4. Update Main Entry (`server/index.ts`)
Add after existing middleware:
```typescript
import apiRoutes from './routes';
app.use('/api', apiRoutes);
```

### 5. Create Placeholder Routes
Create empty router files for each route:
```typescript
// server/routes/lead-sources.ts (and others)
import { Router } from 'express';
const router = Router();
// TODO: Implement
export default router;
```

### 6. Add New Types (`types-new.ts`)
```typescript
// Enums matching schema
export type LeadStatus = 'new' | 'calling' | 'no_answer' | 'closed' | 'rejected';
export type SourceType = 'facebook' | 'zalo' | 'tiktok' | 'website' | 'referral' | 'other';
export type AssignmentMethod = 'round_robin' | 'product_based' | 'manual';

// Interfaces
export interface LeadSource {
  id: number;
  type: SourceType;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface Campaign {
  id: number;
  source_id: number;
  name: string;
  code?: string;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: number;
  full_name: string;
  phone: string;
  email?: string;
  demand?: string;
  source_id?: number;
  campaign_id?: number;
  source_label?: string;
  status: LeadStatus;
  assigned_sales_id?: number;
  is_converted: boolean;
  created_at: string;
}

export interface SalesEmployee {
  id: number;
  employee_code: string;
  full_name: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  round_robin_order: number;
  daily_lead_count: number;
  total_lead_count: number;
}

export interface ProductGroup {
  id: number;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
}
```

### 7. Update Environment
Add to `server/.env`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

## Todo List
- [ ] Install @supabase/supabase-js
- [ ] Create server/lib/supabase.ts
- [ ] Create server/routes/index.ts
- [ ] Create placeholder route files (7 files)
- [ ] Update server/index.ts to use routes
- [ ] Create types-new.ts
- [ ] Update server/.env with Supabase keys
- [ ] Test server starts without errors

## Success Criteria
- Server starts with `npm run dev`
- `/api/lead-sources` returns empty or 404 (placeholder)
- No TypeScript errors
- Supabase client initializes

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing env vars | Server crash | Check on startup, log clear error |
| Type conflicts | Build errors | Use new `types-new.ts`, don't modify `types.ts` |

## Security Considerations
- Use service role key only server-side
- Never expose service key to frontend
- Use anon key for client-side if needed

## Next Steps
After completion:
- Person A → Phase A1 (Lead Sources Backend)
- Person B → Phase B1 (Sales Employees Backend)
