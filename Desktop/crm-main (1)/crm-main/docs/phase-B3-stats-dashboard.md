# Phase B3: Stats Dashboard

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase B2](./phase-B2-product-groups-assignment.md)

## Parallelization Info
- **Group:** Track B
- **Can run with:** Phase A3
- **Blocks:** Phase 4 (Integration)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Person B
- **Effort:** 20 minutes

Update frontend components for sales management and daily stats (US-06).

## File Ownership (Exclusive)
- `components/HRManagement.tsx` (rename to SalesManagement)
- `components/SalesAllocation.tsx`
- `hooks/useSalesApi.ts` (NEW)

## Implementation Steps

### 1. Create API Hook (`hooks/useSalesApi.ts`)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { SalesEmployee, ProductGroup } from '../types-new';

const API_BASE = 'http://localhost:3001/api';

export function useSalesEmployees() {
  const [employees, setEmployees] = useState<SalesEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = useCallback(async () => {
    const res = await fetch(`${API_BASE}/sales-employees`);
    const data = await res.json();
    setEmployees(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const addEmployee = async (employee: Partial<SalesEmployee>) => {
    const res = await fetch(`${API_BASE}/sales-employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee)
    });
    if (res.ok) fetchEmployees();
    return res.json();
  };

  const updateEmployee = async (id: number, updates: Partial<SalesEmployee>) => {
    const res = await fetch(`${API_BASE}/sales-employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) fetchEmployees();
  };

  const deleteEmployee = async (id: number) => {
    await fetch(`${API_BASE}/sales-employees/${id}`, { method: 'DELETE' });
    fetchEmployees();
  };

  return { employees, loading, addEmployee, updateEmployee, deleteEmployee, refetch: fetchEmployees };
}

export function useProductGroups() {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/product-groups`)
      .then(res => res.json())
      .then(data => {
        setGroups(data);
        setLoading(false);
      });
  }, []);

  return { groups, loading };
}

export function useDailyStats() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    // Use the view from database
    const res = await fetch(`${API_BASE}/assignment/stats`);
    const data = await res.json();
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

export function useAssignment() {
  const assignLead = async (leadId: number, salesId: number) => {
    const res = await fetch(`${API_BASE}/assignment/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, sales_employee_id: salesId })
    });
    return res.json();
  };

  const getNextSales = async (productGroupId?: number) => {
    const url = productGroupId
      ? `${API_BASE}/assignment/next?product_group_id=${productGroupId}`
      : `${API_BASE}/assignment/next`;
    const res = await fetch(url);
    return res.json();
  };

  return { assignLead, getNextSales };
}
```

### 2. Add Stats Endpoint (`server/routes/assignment.ts`)

Add this endpoint to existing assignment.ts:

```typescript
// GET /api/assignment/stats - Daily assignment stats (US-06)
router.get('/stats', async (req, res) => {
  const { data, error } = await supabase
    .from('daily_assignment_stats')
    .select('*');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
```

### 3. Update HRManagement.tsx → SalesManagement

**Key changes:**
1. Use new API hook
2. Display round_robin_order
3. Show daily/total lead counts
4. Add product group assignment

```typescript
// Replace Firebase hooks
import { useSalesEmployees, useProductGroups } from '../hooks/useSalesApi';

const { employees, loading, addEmployee, updateEmployee, deleteEmployee } = useSalesEmployees();
const { groups } = useProductGroups();

// Update table columns
<table>
  <thead>
    <tr>
      <th>Mã NV</th>
      <th>Họ tên</th>
      <th>Email</th>
      <th>SĐT</th>
      <th>Thứ tự RR</th>  {/* NEW: Round-robin order */}
      <th>Leads hôm nay</th>  {/* NEW: US-06 */}
      <th>Tổng leads</th>
      <th>Trạng thái</th>
      <th>Thao tác</th>
    </tr>
  </thead>
  <tbody>
    {employees.map(emp => (
      <tr key={emp.id}>
        <td>{emp.employee_code}</td>
        <td>{emp.full_name}</td>
        <td>{emp.email}</td>
        <td>{emp.phone}</td>
        <td>{emp.round_robin_order}</td>
        <td className="font-bold text-accent">{emp.daily_lead_count}</td>
        <td>{emp.total_lead_count}</td>
        <td>{emp.is_active ? '✓ Hoạt động' : '✗ Ngừng'}</td>
        <td>...</td>
      </tr>
    ))}
  </tbody>
</table>

// Update form data to use new fields
const [formData, setFormData] = useState({
  employee_code: '',
  full_name: '',
  email: '',
  phone: ''
});
```

### 4. Update SalesAllocation.tsx

**Key changes:**
1. Show daily stats chart (US-06)
2. Display assignment config
3. Product group specialization UI

```typescript
import { useSalesEmployees, useDailyStats, useProductGroups } from '../hooks/useSalesApi';

const { employees } = useSalesEmployees();
const { stats } = useDailyStats();
const { groups } = useProductGroups();

// Daily Stats Bar Chart (US-06)
<div className="mb-6">
  <h3 className="text-lg font-semibold mb-4">Thống kê phân bổ hôm nay</h3>
  <div className="flex gap-2 items-end h-40">
    {stats.map(s => {
      const maxLeads = Math.max(...stats.map(x => x.leads_today || 0), 1);
      const height = ((s.leads_today || 0) / maxLeads) * 100;
      return (
        <div key={s.sales_employee_id} className="flex flex-col items-center flex-1">
          <div
            className="w-full bg-accent rounded-t"
            style={{ height: `${height}%` }}
          />
          <span className="text-xs mt-1 truncate">{s.full_name?.split(' ').pop()}</span>
          <span className="text-sm font-bold">{s.leads_today || 0}</span>
        </div>
      );
    })}
  </div>
</div>

// Product Group Assignment UI
<div className="mb-6">
  <h3 className="text-lg font-semibold mb-4">Phân bổ theo nhóm sản phẩm (US-05)</h3>
  <div className="grid grid-cols-2 gap-4">
    {groups.map(group => (
      <div key={group.id} className="border rounded p-4">
        <h4 className="font-medium">{group.name}</h4>
        <p className="text-sm text-gray-500">{group.code}</p>
        {/* Show assigned sales here */}
      </div>
    ))}
  </div>
</div>
```

## Todo List
- [ ] Create `hooks/useSalesApi.ts`
- [ ] Add GET /api/assignment/stats endpoint
- [ ] Update HRManagement.tsx with new hook
- [ ] Add round_robin_order, daily_lead_count columns
- [ ] Update SalesAllocation.tsx with stats chart
- [ ] Add product group display
- [ ] Test daily stats displays correctly

## Success Criteria
- Sales employees CRUD works from new API
- Daily lead counts visible (US-06)
- Round-robin order displayed
- Stats chart shows distribution
- Product groups visible

## Conflict Prevention
- Only Person B modifies these files
- New hook `useSalesApi.ts` - no collision
- Person A works on lead components only

## Next Steps
→ Phase 4: Integration (after Person A completes Track A)
