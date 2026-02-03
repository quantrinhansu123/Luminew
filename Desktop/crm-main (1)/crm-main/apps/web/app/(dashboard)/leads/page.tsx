'use client';

import { useState, useMemo, useRef, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Download,
  Upload,
  Save,
  PhoneCall,
  Edit,
  Trash2,
  Eye,
  PlusCircle,
  CheckCircle,
  FileDown,
  X,
  MessageSquare,
  Mail,
  Users,
  StickyNote,
  ShoppingCart,
  FileText,
} from 'lucide-react';
import { useLeads, useLeadSources, useProductGroups, useInteractionLogs, useCampaigns, useSalesEmployees } from '@/lib/api-hooks';
import { lead_status, Lead, interaction_type } from '@/lib/types';
import { exportLeadsToExcel, parseExcelToLeads, downloadLeadTemplate } from '@/lib/excel-utils';
import { LeadFormModal } from '@/components/features/leads/LeadFormModal';
import { InteractionFormModal } from '@/components/features/leads/InteractionFormModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateCustomerCode, generateOrderCode } from '@/lib/codegen';
import { QuotationModal } from '@/components/features/leads/QuotationModal';

// Status labels in Vietnamese
const statusLabels: Record<lead_status, string> = {
  new: 'Mới',
  calling: 'Đang gọi',
  no_answer: 'Không nghe máy',
  quoted: 'Đã báo giá',
  closed: 'Đã chốt',
  rejected: 'Từ chối',
};

const statusColors: Record<lead_status, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  calling: 'bg-amber-50 text-amber-700 border-amber-200',
  no_answer: 'bg-slate-50 text-slate-700 border-slate-200',
  quoted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
};

const interactionTypeLabels: Record<interaction_type, string> = {
  message: 'Tin nhắn',
  call: 'Cuộc gọi',
  email: 'Email',
  meeting: 'Họp',
  note: 'Ghi chú',
};

const interactionTypeIcons: Record<interaction_type, any> = {
  message: MessageSquare,
  call: PhoneCall,
  email: Mail,
  meeting: Users,
  note: StickyNote,
};

const statusOptions: lead_status[] = ['new', 'calling', 'no_answer', 'quoted', 'closed', 'rejected'];

type TimePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'month_1'
  | 'month_2'
  | 'month_3'
  | 'month_4'
  | 'month_5'
  | 'month_6'
  | 'month_7'
  | 'month_8'
  | 'month_9'
  | 'month_10'
  | 'month_11'
  | 'month_12'
  | 'custom';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  const d = new Date(y, mo - 1, da);
  // Validate round-trip to avoid invalid dates like 2026-02-31
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return d;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Monday=0
  x.setDate(x.getDate() - diff);
  return x;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function LeadsPageContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAssignedToday, setShowAssignedToday] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { leads, loading, error, count, updateLeadStatus, convertLead, addLead, updateLead, deleteLead, refetch } = useLeads();
  const { sources, refetch: refetchSources } = useLeadSources();
  const { productGroups, refetch: refetchProductGroups } = useProductGroups();
  const { campaigns, refetch: refetchCampaigns } = useCampaigns();
  const { salesEmployees } = useSalesEmployees();

  // Dropdown filters (multi-select)
  const [filterSalesIds, setFilterSalesIds] = useState<number[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<lead_status[]>([]);
  const [filterSourceLabels, setFilterSourceLabels] = useState<string[]>([]);
  const [filterCampaignIds, setFilterCampaignIds] = useState<number[]>([]);
  const [filterSourceIds, setFilterSourceIds] = useState<number[]>([]);

  // Time filter
  const [timePreset, setTimePreset] = useState<TimePreset>('all');
  const [fromDate, setFromDate] = useState<string>(''); // yyyy-mm-dd
  const [toDate, setToDate] = useState<string>(''); // yyyy-mm-dd

  // Check for filter from URL params
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter === 'assigned_today') {
      setShowAssignedToday(true);
    }
  }, [searchParams]);

  const salesFilterOptions = useMemo(
    () =>
      salesEmployees
        .filter((e) => e.is_active !== false)
        .map((e) => ({
          value: e.id,
          label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}`,
        })),
    [salesEmployees]
  );

  const statusFilterOptions = useMemo(
    () => statusOptions.map((s) => ({ value: s, label: statusLabels[s] })),
    []
  );

  const sourceLabelFilterOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        (leads || [])
          .map((l) => (l.source_label || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return labels.map((v) => ({ value: v, label: v }));
  }, [leads]);

  const campaignFilterOptions = useMemo(
    () => campaigns.map((c) => ({ value: c.id, label: c.name })),
    [campaigns]
  );

  const sourceFilterOptions = useMemo(
    () => sources.map((s) => ({ value: s.id, label: `${s.name} (${s.type})` })),
    [sources]
  );

  const clearAllFilters = () => {
    setFilterSalesIds([]);
    setFilterStatuses([]);
    setFilterSourceLabels([]);
    setFilterCampaignIds([]);
    setFilterSourceIds([]);
    setShowAssignedToday(false);
    setTimePreset('all');
    setFromDate('');
    setToDate('');
  };

  const applyTimePreset = (preset: TimePreset) => {
    setTimePreset(preset);
    const now = new Date();

    if (preset === 'all') {
      setFromDate('');
      setToDate('');
      return;
    }

    if (preset === 'custom') return;

    if (preset === 'today') {
      const d = startOfDay(now);
      setFromDate(toDateInputValue(d));
      setToDate(toDateInputValue(d));
      return;
    }

    if (preset === 'yesterday') {
      const d = startOfDay(now);
      d.setDate(d.getDate() - 1);
      setFromDate(toDateInputValue(d));
      setToDate(toDateInputValue(d));
      return;
    }

    if (preset === 'this_week') {
      const s = startOfWeekMonday(now);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      setFromDate(toDateInputValue(s));
      setToDate(toDateInputValue(e));
      return;
    }

    if (preset === 'last_week') {
      const s = startOfWeekMonday(now);
      s.setDate(s.getDate() - 7);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      setFromDate(toDateInputValue(s));
      setToDate(toDateInputValue(e));
      return;
    }

    if (preset === 'this_month') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const s = new Date(y, m, 1);
      const e = new Date(y, m + 1, 0);
      setFromDate(toDateInputValue(s));
      setToDate(toDateInputValue(e));
      return;
    }

    const mm = /^month_(\d{1,2})$/.exec(preset);
    if (mm) {
      const month = Number(mm[1]); // 1..12
      const y = now.getFullYear();
      const s = new Date(y, month - 1, 1);
      const e = new Date(y, month, 0);
      setFromDate(toDateInputValue(s));
      setToDate(toDateInputValue(e));
    }
  };

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState(false);
  const [selectedQuotationLead, setSelectedQuotationLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Partial<Lead>>({});
  const [orderFormData, setOrderFormData] = useState({
    description: '',
    quantity: 1,
    unit: 'cái',
    unitPrice: 0,
    totalAmount: 0,
    finalAmount: 0,
  });
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Confirm modal states
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Pending import data
  const [pendingImport, setPendingImport] = useState<any[]>([]);

  // Only fetch interactions when detail modal is open
  const { interactions, addInteraction, refetch: refetchInteractions } = useInteractionLogs(
    isDetailModalOpen && selectedLead?.id ? selectedLead.id : undefined
  );

  // Quotation history (fetch when viewing details)
  const [quotationHistory, setQuotationHistory] = useState<Array<{
    id: number;
    quotation_code: string;
    total_amount: number | null;
    created_at: string | null;
    pdf_path: string | null;
    notes?: string | null;
    items?: any;
  }>>([]);
  const [quotationHistoryError, setQuotationHistoryError] = useState<string | null>(null);
  const [uploadingQuotationId, setUploadingQuotationId] = useState<number | null>(null);
  const [quotationNoteDrafts, setQuotationNoteDrafts] = useState<Record<number, string>>({});
  const [savingQuotationNoteId, setSavingQuotationNoteId] = useState<number | null>(null);

  // Timeline events (DB)
  const [timelineDbEvents, setTimelineDbEvents] = useState<Array<{
    id: number;
    lead_id: number;
    event_type: string;
    title: string;
    description: string | null;
    meta: any;
    occurred_at: string;
  }>>([]);
  const [timelineDbError, setTimelineDbError] = useState<string | null>(null);
  const [isUpdatingDetailStatus, setIsUpdatingDetailStatus] = useState(false);

  useEffect(() => {
    if (!isDetailModalOpen || !selectedLead?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setQuotationHistoryError(null);
        const runSelect = async (withNotes: boolean) => {
          const sel = withNotes
            ? 'id, quotation_code, total_amount, created_at, pdf_path, notes, items'
            : 'id, quotation_code, total_amount, created_at, pdf_path, items';
          return await supabase
            .from('quotations')
            // NOTE: some DBs may not have quotations.pdf_url; always fetch pdf_path and derive public URL.
            .select(sel)
            .eq('lead_id', selectedLead.id)
            .order('created_at', { ascending: false })
            .limit(50);
        };

        let { data, error } = await runSelect(true);
        if (error) {
          const msg = String(error.message || '').toLowerCase();
          const missingNotes =
            (msg.includes('could not find') && msg.includes("'notes'") && msg.includes('schema cache')) ||
            (msg.includes('column') && msg.includes('notes') && msg.includes('does not exist'));
          if (missingNotes) {
            const retry = await runSelect(false);
            data = retry.data as any;
            error = retry.error as any;
          }
        }

        if (error) throw error;
        if (!cancelled) {
          const rows = ((data as any) || []) as any[];
          setQuotationHistory(rows);
          setQuotationNoteDrafts(
            Object.fromEntries(rows.map((r) => [Number(r.id), String(r.notes ?? '')]))
          );
        }
      } catch (e: any) {
        if (!cancelled) {
          setQuotationHistory([]);
          setQuotationHistoryError(e?.message || 'Không thể tải lịch sử báo giá');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDetailModalOpen, selectedLead?.id]);

  const fetchTimelineDbEvents = useCallback(async (leadId: number) => {
    try {
      setTimelineDbError(null);
      const { data, error } = await supabase
        .from('lead_timeline_events')
        .select('id,lead_id,event_type,title,description,meta,occurred_at')
        .eq('lead_id', leadId)
        .order('occurred_at', { ascending: false })
        .limit(200);

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        const missingTable =
          (msg.includes('relation') && msg.includes('lead_timeline_events') && msg.includes('does not exist')) ||
          (msg.includes('schema cache') && msg.includes('lead_timeline_events'));
        if (missingTable) {
          setTimelineDbEvents([]);
          return;
        }
        throw error;
      }

      setTimelineDbEvents((data as any) || []);
    } catch (e: any) {
      setTimelineDbEvents([]);
      setTimelineDbError(e?.message || 'Không thể tải timeline');
    }
  }, []);

  useEffect(() => {
    if (!isDetailModalOpen || !selectedLead?.id) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchTimelineDbEvents(selectedLead.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDetailModalOpen, selectedLead?.id, fetchTimelineDbEvents]);

  const handleDetailStatusChange = async (newStatus: lead_status) => {
    if (!selectedLead) return;
    if (isUpdatingDetailStatus) return;
    const leadId = selectedLead.id;

    setIsUpdatingDetailStatus(true);
    try {
      const ok = await updateLeadStatus(leadId, newStatus);
      if (ok) {
        setSelectedLead((prev) => (prev ? { ...prev, status: newStatus } : prev));
        // Refresh timeline so the new status change event appears (if timeline table enabled)
        await fetchTimelineDbEvents(leadId);
        toast.success('Đã cập nhật trạng thái.');
      } else {
        toast.error('Không thể cập nhật trạng thái.');
      }
    } catch (e: any) {
      toast.error(`Lỗi cập nhật trạng thái: ${e?.message || String(e)}`);
    } finally {
      setIsUpdatingDetailStatus(false);
    }
  };

  const timelineItems = useMemo(() => {
    const items: Array<{
      key: string;
      ts: string;
      title: string;
      description?: string | null;
    }> = [];

    const push = (key: string, ts: string | null | undefined, title: string, description?: string | null) => {
      if (!ts) return;
      items.push({ key, ts, title, description: description ?? null });
    };

    // Derived from lead columns
    push('lead:created', selectedLead?.created_at, 'Tạo lead');
    push(
      'lead:assigned',
      selectedLead?.assigned_at,
      'Phân lead',
      selectedLead?.assigned_sales_id
        ? `NV Sale: ${selectedLead.sales_employees?.full_name || `#${selectedLead.assigned_sales_id}`}\nCách: ${selectedLead.assignment_method || '-'}`
        : null
    );
    push(
      'lead:converted',
      selectedLead?.converted_at,
      'Chuyển thành khách hàng',
      selectedLead?.converted_customer_id ? `Customer #${selectedLead.converted_customer_id}` : null
    );

    // Quotations
    for (const q of quotationHistory || []) {
      push(
        `quotation:${q.id}`,
        q.created_at || undefined,
        `Báo giá: ${q.quotation_code || `#${q.id}`}`,
        q.total_amount != null ? `Tổng: ${formatCurrency(Number(q.total_amount || 0))}` : null
      );
    }

    // Interactions
    for (const it of interactions || []) {
      push(
        `interaction:${it.id}`,
        it.occurred_at || it.created_at,
        `Tương tác: ${interactionTypeLabels[it.type] || it.type}`,
        (it.summary || it.content) ? `${it.summary || ''}${it.summary && it.content ? '\n' : ''}${it.content || ''}` : null
      );
    }

    // DB events (new logging, best fidelity)
    for (const ev of timelineDbEvents || []) {
      push(`db:${ev.id}`, ev.occurred_at, ev.title, ev.description);
    }

    // De-dup by (title+ts)
    const seen = new Set<string>();
    const deduped = items.filter((i) => {
      const k = `${i.title}|${i.ts}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    deduped.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    return deduped;
  }, [selectedLead, quotationHistory, interactions, timelineDbEvents]);

  const handleSaveQuotationNote = async (quotationId: number) => {
    if (savingQuotationNoteId) return;
    setSavingQuotationNoteId(quotationId);
    try {
      const note = (quotationNoteDrafts[quotationId] ?? '').trim();
      const { error } = await supabase
        .from('quotations')
        .update({ notes: note || null } as any)
        .eq('id', quotationId);

      if (error) {
        const msg = String(error.message || '');
        const lower = msg.toLowerCase();
        const missingNotes =
          (lower.includes('could not find') && lower.includes("'notes'") && lower.includes('schema cache')) ||
          (lower.includes('column') && lower.includes('notes') && lower.includes('does not exist'));

        if (missingNotes) {
          toast.error("Bảng quotations chưa có cột notes hoặc schema cache chưa reload. Hãy chạy `NOTIFY pgrst, 'reload schema';`.");
        } else {
          throw error;
        }
      } else {
        setQuotationHistory((prev) =>
          prev.map((q) => (q.id === quotationId ? { ...q, notes: note || null } : q))
        );
        toast.success('Đã lưu ghi chú báo giá.');
      }
    } catch (e: any) {
      toast.error(`Lưu ghi chú lỗi: ${e?.message || String(e)}`);
    } finally {
      setSavingQuotationNoteId(null);
    }
  };

  const handleUploadQuotationPdf = async (q: { id: number; quotation_code: string }, file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Chỉ chấp nhận file PDF.');
      return;
    }

    setUploadingQuotationId(q.id);
    try {
      const bucket = 'quotations';
      const safeCode = (q.quotation_code || `quotation-${q.id}`).replace(/[^\w\-]/g, '_');
      const storagePath = `${safeCode}.pdf`;

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, file, { upsert: true, contentType: 'application/pdf' });
      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      const pdfUrl = publicUrlData.publicUrl;
      const pdfPath = `${bucket}/${storagePath}`;

      // Update quotation row (be resilient if older table is missing columns).
      let updErr: any = null;
      {
        const res = await supabase.from('quotations').update({ pdf_path: pdfPath, pdf_url: pdfUrl } as any).eq('id', q.id);
        updErr = res.error;
      }
      if (updErr) {
        const msg = (updErr.message || String(updErr)).toLowerCase();
        const isMissingPdfUrl = msg.includes('column') && msg.includes('pdf_url') && msg.includes('does not exist');
        const isMissingPdfPath = msg.includes('column') && msg.includes('pdf_path') && msg.includes('does not exist');

        const retryPayload: any = { pdf_path: pdfPath, pdf_url: pdfUrl };
        if (isMissingPdfUrl) delete retryPayload.pdf_url;
        if (isMissingPdfPath) delete retryPayload.pdf_path;

        const retry = await supabase.from('quotations').update(retryPayload).eq('id', q.id);
        if (retry.error) throw retry.error;
      }

      setQuotationHistory((prev) =>
        prev.map((it) => (it.id === q.id ? { ...it, pdf_path: pdfPath } : it))
      );

      // Best-effort: log timeline event
      if (selectedLead?.id) {
        await supabase.from('lead_timeline_events').insert([
          {
            lead_id: selectedLead.id,
            event_type: 'quotation_pdf_uploaded',
            title: 'Upload PDF báo giá',
            description: q.quotation_code || `#${q.id}`,
            meta: { quotation_id: q.id, quotation_code: q.quotation_code, pdf_path: pdfPath },
            occurred_at: new Date().toISOString(),
          },
        ] as any);
      }
      try {
        await navigator.clipboard?.writeText?.(pdfUrl);
        toast.success('Đã upload PDF & copy link.');
      } catch {
        toast.success('Đã upload PDF.');
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      const lower = String(msg).toLowerCase();
      if (lower.includes('bucket not found')) {
        toast.error('Chưa có Storage bucket "quotations". Hãy chạy `apps/web/SETUP-QUOTATIONS.sql` hoặc tạo bucket tên: quotations.');
      } else if (lower.includes('row-level security')) {
        toast.error('Bị chặn RLS khi upload. Hãy chạy `apps/web/SETUP-QUOTATIONS.sql` để tạo policy cho bucket quotations.');
      } else {
        toast.error(`Upload PDF lỗi: ${msg}`);
      }
    } finally {
      setUploadingQuotationId(null);
    }
  };

  const handleStatusChange = async (leadId: number, newStatus: lead_status) => {
    await updateLeadStatus(leadId, newStatus);
  };

  const handleSourceChange = async (leadId: number, newSourceId: number) => {
    const success = await updateLead(leadId, { source_id: newSourceId });
    if (success) {
      toast.success('Đã đổi kênh thành công!');
    } else {
      toast.error('Có lỗi xảy ra khi đổi kênh');
    }
  };

  const handleConvert = (leadId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Chuyển thành khách hàng',
      message: 'Bạn có chắc muốn chuyển lead này thành khách hàng?',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const result = await convertLead(leadId);
        if (result) {
          toast.success(
            <div>
              <p>Đã chuyển thành khách hàng thành công!</p>
              <a href="/customers" className="text-emerald-600 underline font-medium">
                → Xem danh sách khách hàng
              </a>
            </div>,
            { duration: 5000 }
          );
        }
      },
    });
  };

  const handleAddLead = async (data: any) => {
    const payload: any = { ...data };
    if (typeof payload.assigned_sales_id === 'number' && payload.assigned_sales_id > 0) {
      payload.assigned_at = new Date().toISOString();
      payload.assignment_method = 'manual';
    }
    const success = await addLead(payload);
    return success;
  };

  const handleEditLead = async (data: any) => {
    if (!selectedLead) return false;
    const payload: any = { ...data };
    const prev = selectedLead.assigned_sales_id;
    const next = payload.assigned_sales_id;

    // If user changes assigned sales, record time now and mark as manual assignment.
    if (next !== prev) {
      if (typeof next === 'number' && next > 0) {
        payload.assigned_at = new Date().toISOString();
        payload.assignment_method = 'manual';
      } else if (prev) {
        // Unassign
        payload.assigned_sales_id = null;
        payload.assigned_at = null;
        payload.assignment_method = null;
      }
    }

    const success = await updateLead(selectedLead.id, payload);
    if (success) {
      // Best-effort: log assignment change
      if (next !== prev) {
        try {
          await supabase.from('lead_timeline_events').insert([
            {
              lead_id: selectedLead.id,
              event_type: 'assignment',
              title: 'Cập nhật NV phụ trách',
              description:
                typeof next === 'number' && next > 0
                  ? `Sale #${next} (manual)`
                  : 'Bỏ phân công',
              meta: { from: prev ?? null, to: (typeof next === 'number' ? next : null), method: 'manual' },
              occurred_at: new Date().toISOString(),
            },
          ] as any);
        } catch {
          // ignore
        }
      }
      setSelectedLead(null);
      setEditLead({});
    }
    return success;
  };

  const handleDeleteLead = (leadId: number, leadName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa Lead',
      message: `Bạn có chắc muốn xóa lead "${leadName}"?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const success = await deleteLead(leadId);
        if (success) {
          toast.success('Đã xóa lead thành công!');
        }
      },
    });
  };

  const handleViewDetails = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDetailModalOpen(true);
  };

  const handleEditClick = (lead: Lead) => {
    setSelectedLead(lead);
    setEditLead(lead);
    setIsEditModalOpen(true);
  };

  const handleAddInteractionClick = (lead: Lead) => {
    setSelectedLead(lead);
    setIsInteractionModalOpen(true);
  };

  // Open convert modal for closed leads

  const handleAddInteraction = async (data: any) => {
    if (!selectedLead) return false;
    const success = await addInteraction({
      lead_id: selectedLead.id,
      ...data,
      occurred_at: new Date().toISOString(),
    });
    // Update Leads list immediately (last_contacted_at)
    if (success) {
      await refetch();
    }
    return success;
  };

  // Order creation handlers
  const handleOpenOrderModal = (lead: Lead) => {
    setSelectedLead(lead);
    setOrderFormData({
      description: lead.demand || '',
      quantity: 1,
      unit: 'cái',
      unitPrice: 0,
      totalAmount: 0,
      finalAmount: 0,
    });
    setIsOrderModalOpen(true);
  };

  const handleOpenOrderModalFromQuotation = (lead: Lead, quotation: { id: number; quotation_code: string; total_amount: number | null; items?: any }) => {
    if (!selectedLead) return;
    const quotationAmount = Number(quotation.total_amount || 0);
    setSelectedLead(lead);
    // Lưu items vào một biến tạm để dùng khi tạo đơn hàng
    (window as any).__currentQuotationItems = quotation.items || null;
    setOrderFormData({
      description: lead.demand || `Đơn hàng từ báo giá ${quotation.quotation_code || `#${quotation.id}`}`,
      quantity: 1,
      unit: 'cái',
      unitPrice: quotationAmount, // Điền giá từ báo giá
      totalAmount: quotationAmount,
      finalAmount: quotationAmount,
    });
    setIsOrderModalOpen(true);
  };

  const handleOpenQuotationModal = (lead: Lead) => {
    setSelectedQuotationLead(lead);
    setIsQuotationModalOpen(true);
  };

  const handleOrderFormChange = (field: string, value: any) => {
    setOrderFormData(prev => {
      const newData = { ...prev, [field]: value };
      // Auto-calculate total
      if (field === 'quantity' || field === 'unitPrice') {
        const quantity = field === 'quantity' ? value : prev.quantity;
        const unitPrice = field === 'unitPrice' ? value : prev.unitPrice;
        newData.totalAmount = quantity * unitPrice;
        newData.finalAmount = quantity * unitPrice;
      }
      return newData;
    });
  };

  const handleCreateOrder = async () => {
    if (!selectedLead) return;
    if (!orderFormData.description) {
      toast.error('Vui lòng nhập mô tả đơn hàng!');
      return;
    }
    if (orderFormData.quantity <= 0 || orderFormData.unitPrice <= 0) {
      toast.error('Vui lòng nhập số lượng và đơn giá hợp lệ!');
      return;
    }

    setIsCreatingOrder(true);
    try {
      // 1) Load lead (fresh from DB)
      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .select(
          'id, full_name, phone, email, interested_product_group_id, assigned_sales_id, status, is_converted'
        )
        .eq('id', selectedLead.id)
        .single();

      if (leadErr) throw leadErr;
      if (!leadRow) throw new Error('Lead not found');

      // 2) Find or create customer by phone (vừa điền vào khách hàng)
      const { data: existingCustomer, error: findCustomerErr } = await supabase
        .from('customers')
        .select('id, customer_code, full_name, email, original_lead_id, account_manager_id')
        .eq('phone', leadRow.phone)
        .maybeSingle();

      if (findCustomerErr) throw findCustomerErr;

      let customer = existingCustomer;
      if (!customer) {
        // Tạo khách hàng mới với thông tin từ lead
        const { data: newCustomer, error: createCustomerErr } = await supabase
          .from('customers')
          .insert([
            {
              customer_code: generateCustomerCode(),
              full_name: leadRow.full_name,
              phone: leadRow.phone,
              email: leadRow.email || null,
              original_lead_id: leadRow.id,
              account_manager_id: leadRow.assigned_sales_id ?? null,
            },
          ])
          .select('id, customer_code')
          .single();

        if (createCustomerErr) throw createCustomerErr;
        customer = newCustomer;
      } else {
        // Cập nhật thông tin khách hàng nếu đã tồn tại (điền từ lead)
        const updateData: any = {};
        if (leadRow.full_name && leadRow.full_name !== existingCustomer.full_name) {
          updateData.full_name = leadRow.full_name;
        }
        if (leadRow.email && leadRow.email !== existingCustomer.email) {
          updateData.email = leadRow.email;
        }
        if (leadRow.assigned_sales_id && leadRow.assigned_sales_id !== existingCustomer.account_manager_id) {
          updateData.account_manager_id = leadRow.assigned_sales_id;
        }
        if (!existingCustomer.original_lead_id && leadRow.id) {
          updateData.original_lead_id = leadRow.id;
        }
        
        if (Object.keys(updateData).length > 0) {
          const { error: updateCustomerErr } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', customer.id);
          
          if (updateCustomerErr) {
            console.warn('Failed to update customer:', updateCustomerErr);
            // Không throw error, tiếp tục với customer hiện tại
          }
        }
      }

      // 3) Create order
      // Lấy items từ quotation nếu có (khi tạo từ báo giá)
      const quotationItems = (window as any).__currentQuotationItems;
      const orderPayload: any = {
        order_code: generateOrderCode(),
        customer_id: customer.id,
        product_group_id: leadRow.interested_product_group_id ?? null,
        description: orderFormData.description,
        quantity: orderFormData.quantity,
        unit: orderFormData.unit || 'cái',
        unit_price: Number(orderFormData.unitPrice),
        total_amount: Number(orderFormData.totalAmount),
        final_amount: Number(orderFormData.finalAmount),
        status: 'pending',
        sales_employee_id: leadRow.assigned_sales_id ?? null,
      };
      
      // Lưu items vào specifications nếu có
      if (quotationItems && Array.isArray(quotationItems) && quotationItems.length > 0) {
        orderPayload.specifications = { items: quotationItems };
      }
      
      // Xóa biến tạm
      delete (window as any).__currentQuotationItems;
      
      const { data: order, error: createOrderErr } = await supabase
        .from('orders')
        .insert([orderPayload])
        .select('id, order_code')
        .single();

      if (createOrderErr) throw createOrderErr;

      // 4) Mark lead as converted (match previous BE behavior)
      const { error: updateLeadErr } = await supabase
        .from('leads')
        .update({
          is_converted: true,
          status: 'closed',
          converted_at: new Date().toISOString(),
          converted_customer_id: customer.id,
        })
        .eq('id', leadRow.id);

      if (updateLeadErr) throw updateLeadErr;

      toast.success(`Đã tạo đơn hàng ${order.order_code || `#${order.id}`} thành công!`);
      setIsOrderModalOpen(false);
      setSelectedLead(null);
      refetch();
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(error?.message || 'Có lỗi xảy ra khi tạo đơn hàng!');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    const filename = `leads_${new Date().toISOString().split('T')[0]}.xlsx`;
    exportLeadsToExcel(filteredLeads, filename);
  };

  // Excel Import
  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsedLeads = await parseExcelToLeads(file);

      if (parsedLeads.length === 0) {
        toast.error('File Excel không có dữ liệu hợp lệ!');
        return;
      }

      setPendingImport(parsedLeads);
      setConfirmModal({
        isOpen: true,
        title: 'Import Leads',
        message: `Tìm thấy ${parsedLeads.length} lead. Bạn có muốn import tất cả?`,
        variant: 'info',
        onConfirm: async () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));

          const defaultSourceId = sources[0]?.id || 0;
          if (!defaultSourceId) {
            toast.error('Vui lòng tạo ít nhất 1 nguồn lead trước khi import!');
            setPendingImport([]);
            return;
          }

          let successCount = 0;
          for (const lead of parsedLeads) {
            const success = await addLead({
              ...lead,
              source_id: defaultSourceId,
            });
            if (success) successCount++;
          }

          toast.success(`Đã import thành công ${successCount}/${parsedLeads.length} lead!`);
          setPendingImport([]);
          refetch();
        },
      });
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Có lỗi xảy ra khi import file Excel!');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtered leads by search + dropdown filters + assigned today
  const filteredLeads = useMemo(() => {
    let result = leads;

    // Filter by created_at time range
    if (fromDate || toDate) {
      const from = fromDate ? parseDateInput(fromDate) : null;
      const to = toDate ? parseDateInput(toDate) : null;
      const fromMs = from ? startOfDay(from).getTime() : null;
      const toMs = to ? endOfDay(to).getTime() : null;

      result = result.filter((lead) => {
        const t = lead.created_at ? new Date(lead.created_at).getTime() : NaN;
        if (!Number.isFinite(t)) return false;
        if (fromMs != null && t < fromMs) return false;
        if (toMs != null && t > toMs) return false;
        return true;
      });
    }

    // Filter by global search query (search across all visible fields)
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((lead) => {
        const haystack = [
          lead.id,
          lead.full_name,
          lead.phone,
          lead.email,
          lead.demand,
          lead.source_label,
          lead.status,
          statusLabels[lead.status],
          lead.lead_sources?.name,
          lead.lead_sources?.type,
          lead.campaigns?.name,
          lead.product_groups?.name,
          lead.product_groups?.code,
          lead.sales_employees?.full_name,
          lead.sales_employees?.employee_code,
          lead.assigned_sales_id,
          lead.source_id,
          lead.campaign_id,
        ]
          .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
          .map((v) => String(v))
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      });
    }

    if (filterSalesIds.length) {
      result = result.filter((lead) =>
        typeof lead.assigned_sales_id === 'number' && filterSalesIds.includes(lead.assigned_sales_id)
      );
    }

    if (filterStatuses.length) {
      result = result.filter((lead) => filterStatuses.includes(lead.status));
    }

    if (filterSourceLabels.length) {
      result = result.filter((lead) => {
        const label = (lead.source_label || '').trim();
        return label && filterSourceLabels.includes(label);
      });
    }

    if (filterCampaignIds.length) {
      result = result.filter((lead) =>
        typeof lead.campaign_id === 'number' && filterCampaignIds.includes(lead.campaign_id)
      );
    }

    if (filterSourceIds.length) {
      result = result.filter((lead) =>
        typeof lead.source_id === 'number' && filterSourceIds.includes(lead.source_id)
      );
    }

    // Filter by assigned today
    if (showAssignedToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      result = result.filter(lead => {
        if (!lead.assigned_at) return false;
        const assignedDate = new Date(lead.assigned_at);
        assignedDate.setHours(0, 0, 0, 0);
        return assignedDate.getTime() === today.getTime();
      });
    }

    return result;
  }, [
    leads,
    fromDate,
    toDate,
    searchQuery,
    showAssignedToday,
    filterSalesIds,
    filterStatuses,
    filterSourceLabels,
    filterCampaignIds,
    filterSourceIds,
  ]);

  const metrics = useMemo(() => ({
    guests: filteredLeads.length,
    orders: filteredLeads.filter(l => l.is_converted).length,
    revenue: filteredLeads.filter(l => l.is_converted).length * 500000,
  }), [filteredLeads]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const formatDateShort = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('vi-VN');
  };

  const isAssignedToday = (assignedAt?: string) => {
    if (!assignedAt) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const assignedDate = new Date(assignedAt);
    assignedDate.setHours(0, 0, 0, 0);
    return assignedDate.getTime() === today.getTime();
  };

  if (loading) {
    return (
      <div className="p-6 h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-slate-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Lỗi: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-screen overflow-y-auto flex flex-col">
      {/* Control Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 space-y-4">
        {/* Row 1: Global search + actions */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="min-w-[180px]">
            <div className="text-lg font-bold text-slate-800 leading-6">Hộp chờ tư vấn</div>
            <div className="text-xs text-slate-500">Danh sách lead</div>
          </div>

          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Tìm kiếm tổng (tất cả giá trị trong bảng...)"
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-accent outline-none text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Download size={16} /> Xuất Excel
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Upload size={16} /> Nhập Excel
            </button>

            <button
              onClick={downloadLeadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
              title="Tải file mẫu Excel"
            >
              <FileDown size={16} /> Mẫu Excel
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-accent text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <PlusCircle size={16} /> Thêm mới
            </button>
          </div>
        </div>

        {/* Row 2: Time filter + field filters */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <div className="text-xs font-semibold text-slate-500 mb-2">Lọc thời gian (ngày tạo)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={timePreset}
                onChange={(e) => applyTimePreset(e.target.value as TimePreset)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="all">Tất cả</option>
                <option value="today">Hôm nay</option>
                <option value="yesterday">Hôm qua</option>
                <option value="this_week">Tuần này</option>
                <option value="last_week">Tuần trước</option>
                <option value="this_month">Tháng này</option>
                <option value="month_1">Tháng 1</option>
                <option value="month_2">Tháng 2</option>
                <option value="month_3">Tháng 3</option>
                <option value="month_4">Tháng 4</option>
                <option value="month_5">Tháng 5</option>
                <option value="month_6">Tháng 6</option>
                <option value="month_7">Tháng 7</option>
                <option value="month_8">Tháng 8</option>
                <option value="month_9">Tháng 9</option>
                <option value="month_10">Tháng 10</option>
                <option value="month_11">Tháng 11</option>
                <option value="month_12">Tháng 12</option>
                <option value="custom">Tùy chọn</option>
              </select>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setTimePreset('custom');
                  setFromDate(e.target.value);
                }}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none focus:ring-2 focus:ring-accent"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setTimePreset('custom');
                  setToDate(e.target.value);
                }}
                className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-xs outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Từ ngày / Tới ngày (dd/mm sẽ tự đổi sang chuẩn date).
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            <MultiSelectDropdown
              label="NV Sale"
              options={salesFilterOptions}
              values={filterSalesIds}
              onChange={(v) => setFilterSalesIds(v as number[])}
              placeholder="Tất cả"
              searchPlaceholder="Gõ tên sale..."
              disabled={salesFilterOptions.length === 0}
            />
            <MultiSelectDropdown
              label="Trạng thái"
              options={statusFilterOptions}
              values={filterStatuses}
              onChange={(v) => setFilterStatuses(v as lead_status[])}
              placeholder="Tất cả"
              searchPlaceholder="Gõ trạng thái..."
            />
            <MultiSelectDropdown
              label="Nhãn nguồn"
              options={sourceLabelFilterOptions}
              values={filterSourceLabels}
              onChange={(v) => setFilterSourceLabels(v as string[])}
              placeholder="Tất cả"
              searchPlaceholder="Gõ nhãn nguồn..."
              disabled={sourceLabelFilterOptions.length === 0}
            />
            <MultiSelectDropdown
              label="Chiến dịch"
              options={campaignFilterOptions}
              values={filterCampaignIds}
              onChange={(v) => setFilterCampaignIds(v as number[])}
              placeholder="Tất cả"
              searchPlaceholder="Gõ chiến dịch..."
              disabled={campaignFilterOptions.length === 0}
            />
            <MultiSelectDropdown
              label="Nguồn"
              options={sourceFilterOptions}
              values={filterSourceIds}
              onChange={(v) => setFilterSourceIds(v as number[])}
              placeholder="Tất cả"
              searchPlaceholder="Gõ nguồn..."
              disabled={sourceFilterOptions.length === 0}
            />

            <button
              type="button"
              onClick={clearAllFilters}
              className="justify-self-start w-fit px-2 py-1 border border-slate-300 rounded-lg bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              title="Xóa tất cả bộ lọc"
            >
              Xóa bộ lọc
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Assigned Today Filter Badge */}
          {showAssignedToday && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 border border-green-300 rounded-full text-sm font-medium">
              <span>Vừa phân bổ hôm nay</span>
              <button
                onClick={() => setShowAssignedToday(false)}
                className="hover:bg-green-200 rounded-full p-0.5 transition-colors"
                title="Xóa bộ lọc"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Row 3: Counters */}
        <div className="flex gap-6 border-t border-slate-100 pt-4">
          <div className="flex flex-col">
            <span className="text-xs text-slate-500 uppercase font-semibold">Khách hàng</span>
            <span className="text-xl font-bold text-slate-800">{metrics.guests}</span>
          </div>
          <div className="flex flex-col border-l pl-6 border-slate-100">
            <span className="text-xs text-slate-500 uppercase font-semibold">Đơn hàng</span>
            <span className="text-xl font-bold text-accent">{metrics.orders}</span>
          </div>
          <div className="flex flex-col border-l pl-6 border-slate-100">
            <span className="text-xs text-slate-500 uppercase font-semibold">Doanh số (tạm tính)</span>
            <span className="text-xl font-bold text-green-600">{formatCurrency(metrics.revenue)}</span>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase font-semibold whitespace-nowrap">
                <th className="p-4 w-24">Mã KH</th>
                <th className="p-4">Họ và tên</th>
                <th className="p-4">SĐT</th>
                <th className="p-4">Email</th>
                <th className="p-4">Nguồn</th>
                <th className="p-4">Chiến dịch</th>
                <th className="p-4">Nhãn nguồn</th>
                <th className="p-4">Nhóm SP</th>
                <th className="p-4">Trạng thái</th>
                <th className="p-4">NV Sale</th>
                <th className="p-4">Liên hệ cuối</th>
                <th className="p-4 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`transition-colors text-sm ${
                      isAssignedToday(lead.assigned_at)
                        ? 'bg-yellow-50 hover:bg-yellow-100'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-4 font-medium text-slate-700">#{lead.id}</td>
                    <td className="p-4 font-medium text-slate-900">{lead.full_name}</td>
                    <td className="p-4 text-slate-600">{lead.phone}</td>
                    <td className="p-4 text-slate-500">{lead.email || '-'}</td>
                    <td className="p-4">
                      <select
                        value={lead.source_id || ''}
                        onChange={(e) => handleSourceChange(lead.id, Number(e.target.value))}
                        className="px-2 py-1 rounded text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[120px]"
                        title="Đổi kênh"
                      >
                        {sources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name} ({source.type})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4 text-slate-600 text-xs">{lead.campaigns?.name || '-'}</td>
                    <td className="p-4 text-slate-500 text-xs">{lead.source_label || '-'}</td>
                    <td className="p-4 text-slate-600 text-xs">{lead.product_groups?.name || '-'}</td>
                    <td className="p-4">
                      <select
                        value={lead.status}
                        onChange={(e) => handleStatusChange(lead.id, e.target.value as lead_status)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[lead.status]}`}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-4 text-slate-600 text-xs">
                      {lead.sales_employees?.full_name || (lead.assigned_sales_id ? `ID:${lead.assigned_sales_id}` : '-') }
                    </td>
                    <td className="p-4 text-slate-500 text-xs">{formatDateShort(lead.last_contacted_at)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleViewDetails(lead)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Xem chi tiết"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleEditClick(lead)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                          title="Chỉnh sửa"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleAddInteractionClick(lead)}
                          className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"
                          title="Thêm tương tác"
                        >
                          <PhoneCall size={16} />
                        </button>
                        <button
                          onClick={() => handleOpenQuotationModal(lead)}
                          className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                          title="Báo giá"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead.id, lead.full_name)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Xóa"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500">
                    Không tìm thấy dữ liệu phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lead Form Modal (Add/Edit) */}
      <LeadFormModal
        mode={isEditModalOpen ? 'edit' : 'add'}
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedLead(null);
          setEditLead({});
        }}
        onSubmit={isEditModalOpen ? handleEditLead : handleAddLead}
        defaultValues={isEditModalOpen ? editLead : undefined}
        sources={sources}
        campaigns={campaigns}
        productGroups={productGroups}
        salesEmployees={salesEmployees}
        onRefreshSources={refetchSources}
        onRefreshCampaigns={refetchCampaigns}
        onRefreshProductGroups={refetchProductGroups}
      />

      {/* Interaction Form Modal */}
      <InteractionFormModal
        isOpen={isInteractionModalOpen}
        onClose={() => {
          setIsInteractionModalOpen(false);
          setSelectedLead(null);
        }}
        onSubmit={handleAddInteraction}
        lead={selectedLead}
      />

      <QuotationModal
        isOpen={isQuotationModalOpen}
        onClose={() => {
          setIsQuotationModalOpen(false);
          setSelectedQuotationLead(null);
        }}
        lead={selectedQuotationLead}
        onSaved={() => {
          refetch();
        }}
      />


      {/* View Detail Modal */}
      {isDetailModalOpen && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[800px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Eye className="text-accent" />
                Chi tiết Lead #{selectedLead.id}
              </h3>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedLead(null);
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3">Thông tin cơ bản</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <span className="text-xs text-slate-500">Họ và tên</span>
                    <p className="font-medium">{selectedLead.full_name}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Số điện thoại</span>
                    <p className="font-medium">{selectedLead.phone}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Email</span>
                    <p className="font-medium">{selectedLead.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Trạng thái</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedLead.status}
                        disabled={isUpdatingDetailStatus}
                        onChange={(e) => handleDetailStatusChange(e.target.value as lead_status)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border outline-none ${statusColors[selectedLead.status]} ${
                          isUpdatingDetailStatus ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                        title="Đổi trạng thái lead"
                      >
                        {statusOptions.map((s) => (
                          <option key={s} value={s}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Nguồn</span>
                    <p className="font-medium">{selectedLead.lead_sources?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Chiến dịch</span>
                    <p className="font-medium">{selectedLead.campaigns?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">Nhóm sản phẩm</span>
                    <p className="font-medium">{selectedLead.product_groups?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500">NV phụ trách</span>
                    <p className="font-medium">{selectedLead.sales_employees?.full_name || '-'}</p>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <span className="text-xs text-slate-500">Nhu cầu</span>
                    <p className="font-medium">{selectedLead.demand || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Timeline Info */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3">Timeline</h4>
                {timelineDbError && (
                  <div className="text-xs text-red-600 mb-2">
                    Lỗi tải timeline: {timelineDbError}
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {timelineItems.length > 0 ? (
                    timelineItems.map((ev) => (
                      <div key={ev.key} className="bg-white rounded-lg p-3 border border-blue-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold text-sm text-slate-800">{ev.title}</div>
                          <div className="text-xs text-slate-500 whitespace-nowrap">{formatDate(ev.ts)}</div>
                        </div>
                        {ev.description ? (
                          <div className="text-xs text-slate-600 mt-1 whitespace-pre-line">{ev.description}</div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500 text-center py-4">
                      Chưa có lịch sử timeline.
                    </div>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">
                  Gợi ý: để ghi đầy đủ lịch sử thao tác, chạy `apps/web/SETUP-LEAD-TIMELINE.sql` trong Supabase SQL Editor.
                </div>
              </div>

              {/* Quotation history */}
              <div className="bg-emerald-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3">
                  Lịch sử báo giá ({quotationHistory.length})
                </h4>
                {quotationHistoryError && (
                  <div className="text-sm text-red-600 mb-2">
                    Lỗi: {quotationHistoryError}
                  </div>
                )}
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {quotationHistory.length > 0 ? (
                    quotationHistory.map((q) => (
                      (() => {
                        const rawPath = (q as any)?.pdf_path as string | null | undefined;
                        const bucketFromPath =
                          rawPath && rawPath.includes('/') ? rawPath.replace(/^\/+/, '').split('/')[0] : 'quotations';
                        const objectPath =
                          rawPath && rawPath.includes('/')
                            ? rawPath.replace(/^\/+/, '').split('/').slice(1).join('/')
                            : (rawPath || null);

                        const pdfUrl =
                          objectPath
                            ? supabase.storage.from(bucketFromPath).getPublicUrl(objectPath).data.publicUrl
                            : null;

                        return (
                      <div key={q.id} className="bg-white rounded-lg p-3 border border-emerald-200">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800">
                              {q.quotation_code || `#${q.id}`}
                            </div>
                            <div className="text-xs text-slate-500">
                              {formatDate(q.created_at || undefined)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-sm font-bold text-emerald-700">
                                {formatCurrency(Number(q.total_amount || 0))}
                              </div>
                              {pdfUrl ? (
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-emerald-700 underline"
                                >
                                  Mở PDF
                                </a>
                              ) : (
                                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg px-2 py-1 bg-white hover:bg-slate-50 cursor-pointer">
                                  <Upload size={14} />
                                  {uploadingQuotationId === q.id ? 'Đang tải...' : 'Tải file lên'}
                                  <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    className="hidden"
                                    disabled={uploadingQuotationId === q.id}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadQuotationPdf({ id: q.id, quotation_code: q.quotation_code }, file);
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                            {selectedLead && (
                              <button
                                onClick={() => handleOpenOrderModalFromQuotation(selectedLead, q)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                                title="Lên đơn hàng từ báo giá này"
                              >
                                <ShoppingCart size={16} />
                                Lên đơn hàng
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="text-xs font-semibold text-slate-500 mb-1">Ghi chú</div>
                          <div className="flex gap-2 items-start">
                            <textarea
                              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                              rows={2}
                              placeholder="Nhập ghi chú cho báo giá này..."
                              value={quotationNoteDrafts[q.id] ?? String((q as any)?.notes ?? '')}
                              onChange={(e) =>
                                setQuotationNoteDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveQuotationNote(q.id)}
                              disabled={savingQuotationNoteId === q.id}
                              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60"
                              title="Lưu ghi chú"
                            >
                              <Save size={14} />
                              {savingQuotationNoteId === q.id ? 'Đang lưu...' : 'Lưu'}
                            </button>
                          </div>
                        </div>
                      </div>
                        );
                      })()
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">Chưa có báo giá nào</p>
                  )}
                </div>
              </div>

              {/* Interactions */}
              <div className="bg-purple-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3">Lịch sử tương tác ({interactions.length})</h4>
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {interactions.length > 0 ? (
                    interactions.map((interaction) => {
                      const Icon = interactionTypeIcons[interaction.type];
                      return (
                        <div key={interaction.id} className="bg-white rounded-lg p-3 border border-purple-200">
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg">
                              <Icon size={16} className="text-purple-600" />
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-1">
                                <span className="font-medium text-sm">{interactionTypeLabels[interaction.type]}</span>
                                <span className="text-xs text-slate-500">{formatDate(interaction.occurred_at)}</span>
                              </div>
                              {interaction.summary && (
                                <p className="text-sm text-slate-600 mb-1">{interaction.summary}</p>
                              )}
                              {interaction.content && (
                                <p className="text-xs text-slate-500">{interaction.content}</p>
                              )}
                              {interaction.duration_seconds && (
                                <p className="text-xs text-slate-400 mt-1">
                                  Thời lượng: {Math.floor(interaction.duration_seconds / 60)} phút
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">Chưa có tương tác nào</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleAddInteractionClick(selectedLead);
                }}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Thêm tương tác
              </button>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setSelectedLead(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Creation Modal */}
      {isOrderModalOpen && selectedLead && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <ShoppingCart className="text-emerald-600" />
                  Lên đơn hàng
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Tạo đơn hàng từ lead: <span className="font-medium text-slate-700">{selectedLead.full_name}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsOrderModalOpen(false);
                  setSelectedLead(null);
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Lead Info Summary */}
            <div className="bg-slate-50 rounded-lg p-4 mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">Thông tin khách hàng</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500">Họ và tên</span>
                  <p className="font-medium">{selectedLead.full_name}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Số điện thoại</span>
                  <p className="font-medium">{selectedLead.phone}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Nhóm sản phẩm quan tâm</span>
                  <p className="font-medium">{selectedLead.product_groups?.name || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">NV Sale phụ trách</span>
                  <p className="font-medium">{selectedLead.sales_employees?.full_name || '-'}</p>
                </div>
              </div>
            </div>

            {/* Order Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mô tả đơn hàng *</label>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  rows={3}
                  value={orderFormData.description}
                  onChange={(e) => handleOrderFormChange('description', e.target.value)}
                  placeholder="Mô tả sản phẩm / yêu cầu của khách..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Số lượng *</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={orderFormData.quantity}
                    onChange={(e) => handleOrderFormChange('quantity', parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Đơn vị</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={orderFormData.unit}
                    onChange={(e) => handleOrderFormChange('unit', e.target.value)}
                    placeholder="cái, bộ, hộp..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Đơn giá (VNĐ) *</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={orderFormData.unitPrice}
                    onChange={(e) => handleOrderFormChange('unitPrice', parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 font-medium">Tổng tiền:</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(orderFormData.finalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsOrderModalOpen(false);
                  setSelectedLead(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={isCreatingOrder || !orderFormData.description || orderFormData.unitPrice <= 0}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isCreatingOrder ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <ShoppingCart size={18} />
                    Tạo đơn hàng
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={
      <div className="p-6 h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-slate-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    }>
      <LeadsPageContent />
    </Suspense>
  );
}
