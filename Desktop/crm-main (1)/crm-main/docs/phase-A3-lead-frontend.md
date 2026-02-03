# Phase A3: Lead Frontend Updates

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: [Phase A2](./phase-A2-leads-crud-webhooks.md)

## Parallelization Info
- **Group:** Track A
- **Can run with:** Phase B3
- **Blocks:** Phase 4 (Integration)

## Overview
- **Priority:** P1
- **Status:** Pending
- **Owner:** Person A
- **Effort:** 20 minutes

Update frontend components to use new API and display new schema data.

## File Ownership (Exclusive)
- `components/LeadManagement.tsx`
- `components/LeadSourceManagement.tsx`
- `hooks/useLeadsApi.ts` (NEW)

## Implementation Steps

### 1. Create API Hook (`hooks/useLeadsApi.ts`)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Lead, LeadSource, Campaign, LeadStatus } from '../types-new';

const API_BASE = 'http://localhost:3001/api';

export function useLeadSources() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    const res = await fetch(`${API_BASE}/lead-sources`);
    const data = await res.json();
    setSources(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const addSource = async (source: Partial<LeadSource>) => {
    const res = await fetch(`${API_BASE}/lead-sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source)
    });
    if (res.ok) fetchSources();
  };

  return { sources, loading, addSource, refetch: fetchSources };
}

export function useCampaigns(sourceId?: number) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    const url = sourceId
      ? `${API_BASE}/campaigns?source_id=${sourceId}`
      : `${API_BASE}/campaigns`;
    const res = await fetch(url);
    const data = await res.json();
    setCampaigns(data);
    setLoading(false);
  }, [sourceId]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  return { campaigns, loading, refetch: fetchCampaigns };
}

export function useLeads(filters?: { status?: LeadStatus; source_id?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.source_id) params.set('source_id', String(filters.source_id));

    const res = await fetch(`${API_BASE}/leads?${params}`);
    const { data } = await res.json();
    setLeads(data || []);
    setLoading(false);
  }, [filters?.status, filters?.source_id]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const updateLeadStatus = async (id: number, status: LeadStatus) => {
    await fetch(`${API_BASE}/leads/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchLeads();
  };

  const convertLead = async (id: number) => {
    const res = await fetch(`${API_BASE}/leads/${id}/convert`, { method: 'POST' });
    if (res.ok) fetchLeads();
    return res.json();
  };

  return { leads, loading, updateLeadStatus, convertLead, refetch: fetchLeads };
}
```

### 2. Update LeadManagement.tsx

**Key changes:**
1. Replace `useLeads` Firebase hook with `useLeads` API hook
2. Add status filter chips (US-03)
3. Display `source_label` (US-02)
4. Update data mapping

```typescript
// At top of file, replace import
import { useLeads, useLeadSources } from '../hooks/useLeadsApi';
import { Lead, LeadStatus } from '../types-new';

// Inside component:
const [statusFilter, setStatusFilter] = useState<LeadStatus | undefined>();
const { leads, loading, updateLeadStatus, convertLead } = useLeads({ status: statusFilter });

// Status filter chips (add before table)
const statusOptions: LeadStatus[] = ['new', 'calling', 'no_answer', 'closed', 'rejected'];

<div className="flex gap-2 mb-4">
  <button
    onClick={() => setStatusFilter(undefined)}
    className={`px-3 py-1 rounded-full text-sm ${!statusFilter ? 'bg-accent text-white' : 'bg-gray-100'}`}
  >
    Tất cả
  </button>
  {statusOptions.map(status => (
    <button
      key={status}
      onClick={() => setStatusFilter(status)}
      className={`px-3 py-1 rounded-full text-sm ${statusFilter === status ? 'bg-accent text-white' : 'bg-gray-100'}`}
    >
      {status === 'new' ? 'Mới' :
       status === 'calling' ? 'Đang gọi' :
       status === 'no_answer' ? 'Không nghe máy' :
       status === 'closed' ? 'Đã chốt' : 'Từ chối'}
    </button>
  ))}
</div>

// In table, display source_label
<td>{lead.source_label || '-'}</td>

// Status badge mapping
const statusColors: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  calling: 'bg-yellow-100 text-yellow-800',
  no_answer: 'bg-gray-100 text-gray-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800'
};
```

### 3. Update LeadSourceManagement.tsx

**Key changes:**
1. Add Campaigns tab/section
2. Use new API hooks

```typescript
import { useLeadSources, useCampaigns } from '../hooks/useLeadsApi';

// Add campaigns section
const [activeTab, setActiveTab] = useState<'sources' | 'campaigns'>('sources');
const { sources } = useLeadSources();
const { campaigns } = useCampaigns();

// Tab switcher
<div className="flex gap-4 mb-4">
  <button onClick={() => setActiveTab('sources')} className={activeTab === 'sources' ? 'font-bold' : ''}>
    Nguồn Lead
  </button>
  <button onClick={() => setActiveTab('campaigns')} className={activeTab === 'campaigns' ? 'font-bold' : ''}>
    Chiến dịch
  </button>
</div>

// Campaigns table
{activeTab === 'campaigns' && (
  <table>
    <thead>
      <tr>
        <th>Tên chiến dịch</th>
        <th>Nguồn</th>
        <th>Mã</th>
        <th>Trạng thái</th>
      </tr>
    </thead>
    <tbody>
      {campaigns.map(c => (
        <tr key={c.id}>
          <td>{c.name}</td>
          <td>{c.lead_sources?.name}</td>
          <td>{c.code}</td>
          <td>{c.is_active ? 'Hoạt động' : 'Ngừng'}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}
```

## Todo List
- [ ] Create `hooks/useLeadsApi.ts`
- [ ] Update imports in LeadManagement.tsx
- [ ] Add status filter chips (US-03)
- [ ] Display source_label column (US-02)
- [ ] Update status badge colors for new enum
- [ ] Add campaigns tab to LeadSourceManagement.tsx
- [ ] Test filter buttons work
- [ ] Test lead list loads from API

## Success Criteria
- Lead list loads from new API
- Status filter buttons work (US-03)
- source_label displays correctly (US-02)
- Campaigns visible in LeadSourceManagement

## Conflict Prevention
- Only Person A modifies these files
- New hook file `useLeadsApi.ts` - no collision
- Person B works on different components

## Next Steps
→ Phase 4: Integration (after Person B completes Track B)
