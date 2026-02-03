import { useState, useEffect, useCallback } from 'react';
import { Lead, LeadSource, Campaign, lead_status, InteractionLog, interaction_type, ProductGroup, SalesEmployee, SalesAllocationRule, Customer, CompanyProfile, MaterialItem, LaborCost } from './types';
import { supabase } from './supabase';

type CacheEntry<T> = { ts: number; data: T };
const _cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  const entry = _cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry;
}

function setCached<T>(key: string, data: T) {
  _cache.set(key, { ts: Date.now(), data });
}

function invalidateCachePrefix(prefix: string) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

async function logLeadTimelineEvents(
  events: Array<{
    lead_id: number;
    event_type: string;
    title: string;
    description?: string | null;
    meta?: any;
    occurred_at?: string;
  }>
) {
  if (!events || events.length === 0) return;
  try {
    const payload = events.map((e) => ({
      lead_id: e.lead_id,
      event_type: e.event_type,
      title: e.title,
      description: e.description ?? null,
      meta: e.meta ?? {},
      occurred_at: e.occurred_at ?? new Date().toISOString(),
    }));
    const { error } = await supabase.from('lead_timeline_events').insert(payload as any);
    // Best-effort: ignore missing table / RLS / schema cache errors
    if (error) return;
  } catch {
    // ignore
  }
}

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const cacheKey = 'company_profile:v1';
    const cached = getCached<CompanyProfile | null>(cacheKey, 60_000);
    if (cached) {
      setProfile(cached.data);
      setLoading(false);
    }

    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('company_profile')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (err) throw err;

      setProfile((data as any) || null);
      setCached(cacheKey, (data as any) || null);
      setError(null);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (patch: Partial<CompanyProfile>) => {
    try {
      const payload: any = { id: 1, ...patch };
      const { data, error: err } = await supabase
        .from('company_profile')
        .upsert([payload])
        .select('*')
        .single();
      if (err) throw err;

      setProfile((data as any) || null);
      setCached('company_profile:v1', (data as any) || null);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err?.message || String(err));
      return false;
    }
  };

  return { profile, loading, error, updateProfile, refetch: fetchProfile };
}

export function useLeadSources() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    const cacheKey = 'lead_sources:v1';
    const cached = getCached<LeadSource[]>(cacheKey, 60_000);
    if (cached) {
      setSources(cached.data);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('lead_sources')
        .select('id,type,name,description,api_key,webhook_url,is_active,created_at')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setSources(data || []);
      setCached(cacheKey, data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const addSource = async (source: Partial<LeadSource>) => {
    try {
      const { error: err } = await supabase
        .from('lead_sources')
        .insert([source]);
      
      if (err) throw err;
      await fetchSources();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const updateSource = async (id: number, source: Partial<LeadSource>) => {
    try {
      const { error: err } = await supabase
        .from('lead_sources')
        .update(source)
        .eq('id', id);
      
      if (err) throw err;
      await fetchSources();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const deleteSource = async (id: number) => {
    try {
      const { error: err } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
      await fetchSources();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  return { sources, loading, error, addSource, updateSource, deleteSource, refetch: fetchSources };
}

export function useCampaigns(sourceId?: number) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    const cacheKey = `campaigns:v1:source=${sourceId || 'all'}`;
    const cached = getCached<Campaign[]>(cacheKey, 60_000);
    if (cached) {
      setCampaigns(cached.data);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      let query = supabase
        .from('campaigns')
        .select('id,source_id,name,code,description,start_date,end_date,budget,is_active,created_at')
        .order('created_at', { ascending: false });
      
      if (sourceId) {
        query = query.eq('source_id', sourceId);
      }
      
      const { data, error: err } = await query;
      if (err) throw err;
      setCampaigns(data || []);
      setCached(cacheKey, data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const addCampaign = async (campaign: Partial<Campaign>) => {
    try {
      const { error: err } = await supabase
        .from('campaigns')
        .insert([campaign]);
      
      if (err) throw err;
      await fetchCampaigns();
      return true;
    } catch (err: any) {
      console.error('Add campaign error:', err);
      setError(err.message);
      alert(`Lỗi khi tạo chiến dịch: ${err.message}`);
      return false;
    }
  };

  const updateCampaign = async (id: number, campaign: Partial<Campaign>) => {
    try {
      const { error: err } = await supabase
        .from('campaigns')
        .update(campaign)
        .eq('id', id);
      
      if (err) throw err;
      await fetchCampaigns();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const deleteCampaign = async (id: number) => {
    try {
      const { error: err } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
      await fetchCampaigns();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  return { campaigns, loading, error, addCampaign, updateCampaign, deleteCampaign, refetch: fetchCampaigns };
}

export function useLeads(filters?: { status?: lead_status; source_id?: number }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const fetchLeads = useCallback(async () => {
    const cacheKey = `leads:v2:status=${filters?.status || 'all'}:source=${filters?.source_id || 'all'}`;
    const cached = getCached<{ data: Lead[]; count: number }>(cacheKey, 15_000);
    if (cached) {
      setLeads(cached.data.data);
      setCount(cached.data.count);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      let query = supabase
        .from('leads')
        .select(
          `
          id, full_name, phone, email, demand,
          source_id, campaign_id, source_label,
          status, customer_group, interested_product_group_id,
          assigned_sales_id, assigned_at, assignment_method,
          is_converted, converted_at, converted_customer_id,
          submitted_at, last_contacted_at, created_at, updated_at,
          lead_sources:source_id(name,type),
          campaigns:campaign_id(name),
          sales_employees:assigned_sales_id(full_name,employee_code),
          product_groups:interested_product_group_id(name,code)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });
      
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.source_id) {
        query = query.eq('source_id', filters.source_id);
      }
      
      const { data, error: err, count: totalCount } = await query;
      if (err) throw err;
      const normalized = (data || []).map((row: any) => ({
        ...row,
        lead_sources: Array.isArray(row.lead_sources) ? row.lead_sources[0] : row.lead_sources,
        campaigns: Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns,
        sales_employees: Array.isArray(row.sales_employees) ? row.sales_employees[0] : row.sales_employees,
        product_groups: Array.isArray(row.product_groups) ? row.product_groups[0] : row.product_groups,
      })) as Lead[];

      setLeads(normalized);
      setCount(totalCount || 0);
      setCached(cacheKey, { data: normalized, count: totalCount || 0 });
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.source_id]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const updateLeadStatus = async (id: number, status: lead_status) => {
    try {
      // Try to capture old status for timeline
      let prevStatus: string | null = null;
      try {
        const prev = await supabase.from('leads').select('status').eq('id', id).maybeSingle();
        prevStatus = (prev.data as any)?.status ?? null;
      } catch {
        prevStatus = null;
      }

      const { error: err } = await supabase
        .from('leads')
        .update({ status })
        .eq('id', id);
      
      if (err) throw err;

      await logLeadTimelineEvents([
        {
          lead_id: id,
          event_type: 'status_change',
          title: 'Chuyển trạng thái',
          description: prevStatus ? `${prevStatus} → ${status}` : `→ ${status}`,
          meta: { from: prevStatus, to: status },
        },
      ]);

      await fetchLeads();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const convertLead = async (id: number) => {
    try {
      // Get lead first
      const { data: lead, error: leadErr } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();
      
      if (leadErr || !lead) throw new Error('Lead not found');
      
      // Check if customer already exists
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', lead.phone)
        .single();
      
      let customerId: number;
      
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        // Create new customer
        const { data: newCustomer, error: customerErr } = await supabase
          .from('customers')
          .insert([{
            full_name: lead.full_name,
            phone: lead.phone,
            email: lead.email,
            original_lead_id: id,
            account_manager_id: lead.assigned_sales_id,
          }])
          .select()
          .single();
        
        if (customerErr || !newCustomer) throw customerErr || new Error('Failed to create customer');
        customerId = newCustomer.id;
      }
      
      // Update lead
      const { error: updateErr } = await supabase
        .from('leads')
        .update({
          is_converted: true,
          converted_at: new Date().toISOString(),
          converted_customer_id: customerId,
        })
        .eq('id', id);
      
      if (updateErr) throw updateErr;

      await logLeadTimelineEvents([
        {
          lead_id: id,
          event_type: 'converted',
          title: 'Chuyển thành khách hàng',
          description: `Customer #${customerId}`,
          meta: { customer_id: customerId },
        },
      ]);
      
      await fetchLeads();
      return { customerId, customer: existingCustomer || null };
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  const addLead = async (lead: Partial<Lead>) => {
    try {
      const { error: err } = await supabase
        .from('leads')
        .insert([lead]);
      
      if (err) throw err;
      await fetchLeads();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const updateLead = async (id: number, lead: Partial<Lead>) => {
    try {
      const { error: err } = await supabase
        .from('leads')
        .update(lead)
        .eq('id', id);
      
      if (err) throw err;
      await fetchLeads();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const deleteLead = async (id: number) => {
    try {
      const { error: err } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
      await fetchLeads();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const getLeadById = async (id: number): Promise<Lead | null> => {
    try {
      const { data, error: err } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();
      
      if (err) throw err;
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  };

  return {
    leads,
    loading,
    error,
    count,
    updateLeadStatus,
    convertLead,
    addLead,
    updateLead,
    deleteLead,
    getLeadById,
    refetch: fetchLeads
  };
}

export function useProductGroups() {
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductGroups = useCallback(async () => {
    const cacheKey = 'product_groups:v1';
    const cached = getCached<ProductGroup[]>(cacheKey, 60_000);
    if (cached) {
      setProductGroups(cached.data);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('product_groups')
        .select('id,name,code,product_name,unit_price,description,is_active,created_at')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setProductGroups(data || []);
      setCached(cacheKey, data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProductGroups();
  }, [fetchProductGroups]);

  return { productGroups, loading, error, refetch: fetchProductGroups };
}

export function useMaterials() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    const cacheKey = 'materials:v1';
    const cached = getCached<MaterialItem[]>(cacheKey, 30_000);
    if (cached) {
      setMaterials(cached.data);
      setLoading(false);
    }

    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('materials')
        .select('id,product_group_id,element_name,unit,unit_price,total_cost,is_active,created_at,updated_at,product_groups:product_group_id(name)')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setMaterials((data as any) || []);
      setCached(cacheKey, (data as any) || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  return { materials, loading, error, refetch: fetchMaterials };
}

export function useLaborCosts() {
  const [laborCosts, setLaborCosts] = useState<LaborCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLaborCosts = useCallback(async () => {
    const cacheKey = 'labor_costs:v1';
    const cached = getCached<LaborCost[]>(cacheKey, 30_000);
    if (cached) {
      setLaborCosts(cached.data);
      setLoading(false);
    }

    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('labor_costs')
        .select('id,action,product_group_id,material_id,unit_cost,unit,is_active,created_at,updated_at,product_groups:product_group_id(name),materials:material_id(element_name,unit)')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setLaborCosts((data as any) || []);
      setCached(cacheKey, (data as any) || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLaborCosts();
  }, [fetchLaborCosts]);

  return { laborCosts, loading, error, refetch: fetchLaborCosts };
}

export function useInteractionLogs(leadId?: number) {
  const [interactions, setInteractions] = useState<InteractionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInteractions = useCallback(async () => {
    if (!leadId) {
      setInteractions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('interaction_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('occurred_at', { ascending: false })
        .limit(100);
      
      if (err) throw err;
      setInteractions(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);

  const addInteraction = async (interaction: Partial<InteractionLog>) => {
    try {
      const occurredAt = (interaction.occurred_at || new Date().toISOString()) as string;
      const desiredLeadStatus = (interaction as any)?.lead_status as string | undefined;
      const { lead_status: _leadStatus, ...insertPayload } = (interaction as any) || {};
      const { data: newInteraction, error: err } = await supabase
        .from('interaction_logs')
        .insert([{ ...insertPayload, occurred_at: occurredAt }])
        .select()
        .single();
      
      if (err) throw err;
      // Optimistically update state
      setInteractions(prev => [newInteraction, ...prev]);

      // Update lead "last action time" so Leads list shows NOW.
      if (interaction.lead_id) {
        await supabase
          .from('leads')
          .update({ last_contacted_at: occurredAt, status: desiredLeadStatus || 'calling' })
          .eq('id', interaction.lead_id);
        invalidateCachePrefix('leads:v2:');

        await logLeadTimelineEvents([
          {
            lead_id: interaction.lead_id,
            event_type: 'interaction',
            title: 'Thêm tương tác',
            description: (newInteraction as any)?.summary || (newInteraction as any)?.content || null,
            meta: {
              interaction_id: (newInteraction as any)?.id ?? null,
              type: (newInteraction as any)?.type ?? null,
              lead_status: desiredLeadStatus || 'calling',
            },
            occurred_at: occurredAt,
          },
          {
            lead_id: interaction.lead_id,
            event_type: 'status_change',
            title: 'Chuyển trạng thái',
            description: `→ ${desiredLeadStatus || 'calling'}`,
            meta: { to: desiredLeadStatus || 'calling', source: 'interaction' },
            occurred_at: occurredAt,
          },
        ]);
      }
      return true;
    } catch (err: any) {
      setError(err.message);
      console.error('Add interaction error:', err);
      return false;
    }
  };

  return { interactions, loading, error, addInteraction, refetch: fetchInteractions };
}

export function useSalesAllocation() {
  const [allocations, setAllocations] = useState<SalesAllocationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllocations = useCallback(async () => {
    const cacheKey = 'sales_allocation_rules:v1';
    const cached = getCached<SalesAllocationRule[]>(cacheKey, 30_000);
    if (cached) {
      setAllocations(cached.data);
      setLoading(false);
    }
    try {
      if (!cached) setLoading(true);
      const { data, error: err } = await supabase
        .from('sales_allocation_rules')
        .select('id,rule_code,customer_group,product_group_ids,assigned_sales_ids,is_active,created_at,updated_at')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setAllocations(data || []);
      setCached(cacheKey, data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllocations();
  }, [fetchAllocations]);

  const addAllocation = async (allocation: Partial<SalesAllocationRule>) => {
    try {
      const { error: err } = await supabase
        .from('sales_allocation_rules')
        .insert([allocation]);
      
      if (err) throw err;
      await fetchAllocations();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const updateAllocation = async (id: number, allocation: Partial<SalesAllocationRule>) => {
    try {
      const { error: err } = await supabase
        .from('sales_allocation_rules')
        .update(allocation)
        .eq('id', id);
      
      if (err) throw err;
      await fetchAllocations();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const deleteAllocation = async (id: number) => {
    try {
      const { error: err } = await supabase
        .from('sales_allocation_rules')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
      await fetchAllocations();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const autoDistribute = async () => {
    try {
      // 1) Load active rules
      const { data: rules, error: rulesErr } = await supabase
        .from('sales_allocation_rules')
        .select('id,rule_code,customer_group,product_group_ids,assigned_sales_ids,is_active,created_at,updated_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (rulesErr) throw rulesErr;

      // 2) Load active sales employees
      const { data: sales, error: salesErr } = await supabase
        .from('sales_employees')
        .select('id,is_active,round_robin_order,daily_lead_count,total_lead_count,last_assigned_at')
        .eq('is_active', true)
        .order('round_robin_order', { ascending: true, nullsFirst: false });

      if (salesErr) throw salesErr;
      const activeSales = (sales || []).filter((s: any) => s?.id);
      if (activeSales.length === 0) {
        throw new Error('Không có nhân sự Sale đang hoạt động để phân bổ.');
      }

      const salesById = new Map<number, any>(activeSales.map((s: any) => [s.id, s]));
      const loadById = new Map<number, number>(
        activeSales.map((s: any) => [s.id, Number(s.daily_lead_count || 0)])
      );
      const lastAssignedById = new Map<number, number>(
        activeSales.map((s: any) => [
          s.id,
          s.last_assigned_at ? new Date(s.last_assigned_at).getTime() : 0,
        ])
      );

      // 3) Load leads (limit to keep UI responsive), then filter in JS.
      // Avoid complex AND/OR combinations in PostgREST params.
      const { data: leads, error: leadsErr } = await supabase
        .from('leads')
        .select('id,customer_group,interested_product_group_id,assigned_sales_id,is_converted,created_at')
        .order('created_at', { ascending: true })
        .limit(500);

      if (leadsErr) throw leadsErr;

      const unassignedLeads = (leads || []).filter((l: any) => {
        const unassigned = l?.assigned_sales_id == null || Number(l.assigned_sales_id) === 0;
        const notConverted = l?.is_converted == null || l.is_converted === false;
        return Boolean(l?.id) && unassigned && notConverted;
      });
      const totalLeads = unassignedLeads.length;
      if (totalLeads === 0) {
        return { totalLeads: 0, assignedCount: 0, assignedByRule: 0, assignedByRoundRobin: 0 };
      }

      const nowIso = new Date().toISOString();
      const assignmentEvents: Array<any> = [];

      const pickBestSales = (candidateIds: number[]) => {
        const candidates = candidateIds
          .map((id) => salesById.get(id))
          .filter(Boolean);
        if (candidates.length === 0) return null;

        candidates.sort((a: any, b: any) => {
          const la = loadById.get(a.id) ?? 0;
          const lb = loadById.get(b.id) ?? 0;
          if (la !== lb) return la - lb;

          const ta = lastAssignedById.get(a.id) ?? 0;
          const tb = lastAssignedById.get(b.id) ?? 0;
          if (ta !== tb) return ta - tb;

          const ra = a.round_robin_order ?? Number.MAX_SAFE_INTEGER;
          const rb = b.round_robin_order ?? Number.MAX_SAFE_INTEGER;
          if (ra !== rb) return ra - rb;
          return a.id - b.id;
        });

        return candidates[0] as any;
      };

      let assignedCount = 0;
      let assignedByRule = 0;
      let assignedByRoundRobin = 0;

      const increments = new Map<number, number>();

      for (const lead of unassignedLeads) {
        const leadPgId = lead.interested_product_group_id ?? null;
        const leadCg = (lead.customer_group || '').trim();

        // Priority 1: match rules by product group (+ optional customer group)
        let chosenSalesId: number | null = null;
        let method: 'product_based' | 'round_robin' = 'round_robin';

        if (leadPgId) {
          const matchedRule = (rules || []).find((r: any) => {
            if (r?.is_active === false) return false;
            if (!Array.isArray(r.product_group_ids) || r.product_group_ids.length === 0) return false;
            if (!r.product_group_ids.includes(leadPgId)) return false;
            if (r.customer_group && leadCg) return r.customer_group === leadCg;
            if (r.customer_group && !leadCg) return false;
            return true;
          });

          if (matchedRule && Array.isArray(matchedRule.assigned_sales_ids) && matchedRule.assigned_sales_ids.length > 0) {
            const best = pickBestSales(matchedRule.assigned_sales_ids);
            if (best) {
              chosenSalesId = best.id;
              method = 'product_based';
            }
          }
        }

        // Priority 2: round robin among all active sales
        if (!chosenSalesId) {
          const best = pickBestSales(activeSales.map((s: any) => s.id));
          if (best) {
            chosenSalesId = best.id;
            method = 'round_robin';
          }
        }

        if (!chosenSalesId) continue;

        const { error: updErr } = await supabase
          .from('leads')
          .update({
            assigned_sales_id: chosenSalesId,
            assigned_at: nowIso,
            assignment_method: method,
          })
          .eq('id', lead.id);

        if (updErr) throw updErr;

        assignedCount++;
        if (method === 'product_based') assignedByRule++;
        else assignedByRoundRobin++;

        assignmentEvents.push({
          lead_id: lead.id,
          event_type: 'assignment',
          title: 'Phân lead',
          description: `Sale #${chosenSalesId} (${method})`,
          meta: { assigned_sales_id: chosenSalesId, method },
          occurred_at: nowIso,
        });

        // Update local load for better balancing within this run
        loadById.set(chosenSalesId, (loadById.get(chosenSalesId) ?? 0) + 1);
        lastAssignedById.set(chosenSalesId, Date.now());
        increments.set(chosenSalesId, (increments.get(chosenSalesId) ?? 0) + 1);
      }

      // Best-effort: update sales employees counters (ignore failure)
      for (const [salesId, inc] of increments.entries()) {
        const base = salesById.get(salesId);
        const nextDaily = Number(base?.daily_lead_count || 0) + inc;
        const nextTotal = Number(base?.total_lead_count || 0) + inc;
        await supabase
          .from('sales_employees')
          .update({
            daily_lead_count: nextDaily,
            total_lead_count: nextTotal,
            last_assigned_at: nowIso,
          })
          .eq('id', salesId);
      }

      // Invalidate leads cache so the “assigned_today” list shows immediately.
      invalidateCachePrefix('leads:v2:');

      // Best-effort: log timeline events in batch (ignore failure)
      await logLeadTimelineEvents(assignmentEvents);

      return { totalLeads, assignedCount, assignedByRule, assignedByRoundRobin };
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return {
    allocations,
    loading,
    error,
    addAllocation,
    updateAllocation,
    deleteAllocation,
    autoDistribute,
    refetch: fetchAllocations
  };
}

export function useSalesEmployees() {
  const [salesEmployees, setSalesEmployees] = useState<SalesEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSalesEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('sales_employees')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (err) throw err;
      setSalesEmployees(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalesEmployees();
  }, [fetchSalesEmployees]);

  return { salesEmployees, loading, error, refetch: fetchSalesEmployees };
}

export function useCustomers(filters?: { search?: string; account_manager_id?: number }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      
      if (filters?.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,customer_code.ilike.%${filters.search}%`);
      }
      if (filters?.account_manager_id) {
        query = query.eq('account_manager_id', filters.account_manager_id);
      }
      
      const { data, error: err, count: totalCount } = await query;
      if (err) throw err;
      setCustomers(data || []);
      setCount(totalCount || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters?.search, filters?.account_manager_id]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const addCustomer = async (customer: Partial<Customer>) => {
    try {
      const { data: newCustomer, error: err } = await supabase
        .from('customers')
        .insert([customer])
        .select()
        .single();
      
      if (err) throw err;
      await fetchCustomers();
      return newCustomer;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateCustomer = async (id: number, customer: Partial<Customer>) => {
    try {
      const { data: updatedCustomer, error: err } = await supabase
        .from('customers')
        .update(customer)
        .eq('id', id)
        .select()
        .single();
      
      if (err) throw err;
      await fetchCustomers();
      return updatedCustomer;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteCustomer = async (id: number) => {
    try {
      // Prevent FK violation: don't hard-delete customers that already have orders.
      const { count, error: countErr } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', id);

      if (countErr) throw countErr;
      if ((count || 0) > 0) {
        throw new Error(
          `Không thể xóa khách hàng vì đang có ${(count || 0)} đơn hàng liên kết. ` +
          `Hãy xóa/đổi khách hàng trên các đơn trước, hoặc dùng cơ chế ẩn (nếu có).`
        );
      }

      const { error: err } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);
      
      if (err) throw err;
      await fetchCustomers();
      return true;
    } catch (err: any) {
      const code = err?.code;
      // Postgres FK violation
      if (code === '23503') {
        const msg =
          'Không thể xóa khách hàng vì đã có đơn hàng liên kết (ràng buộc dữ liệu). ' +
          'Hãy xóa/đổi khách hàng trên các đơn trước, hoặc dùng cơ chế ẩn (nếu có).';
        setError(msg);
        throw new Error(msg);
      }
      setError(err?.message || 'Không thể xóa khách hàng');
      throw err;
    }
  };

  return {
    customers,
    loading,
    error,
    count,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    refetch: fetchCustomers,
  };
}
