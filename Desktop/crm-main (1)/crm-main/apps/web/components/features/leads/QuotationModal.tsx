'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, FileText, Plus, Trash2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateCustomerCode, generateQuotationCode } from '@/lib/codegen';
import type { Lead } from '@/lib/types';
import { useCompanyProfile, useLaborCosts, useMaterials } from '@/lib/api-hooks';
import Link from 'next/link';

type QuoteMaterialLine = {
  id: string;
  material_id: number | null;
  qty_per_product: number; // định mức vật liệu / 1 SP
  factor: number; // hệ số vật liệu
};

type QuoteLaborLine = {
  id: string;
  labor_cost_id: number | null;
  qty_per_product: number; // định mức công đoạn / 1 SP
  factor: number; // hệ số công đoạn
};

type QuoteItem = {
  id: string;
  product_name: string;
  description?: string;
  quantity: number;
  unit: string;
  materials_lines: QuoteMaterialLine[];
  labor_lines: QuoteLaborLine[];
  unit_price: number;
};

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
  onSaved?: () => void;
}

export function QuotationModal({ isOpen, onClose, lead, onSaved }: QuotationModalProps) {
  const [quotationCode, setQuotationCode] = useState('');
  const [companyName, setCompanyName] = useState('CÔNG TY');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerTaxCode, setCustomerTaxCode] = useState('');

  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loggedQuotationId, setLoggedQuotationId] = useState<number | null>(null);

  const { profile: companyProfile, loading: companyProfileLoading, error: companyProfileError } = useCompanyProfile();
  const { materials, error: materialsError } = useMaterials();
  const { laborCosts, error: laborCostsError } = useLaborCosts();

  const computeUnitPrice = (it: QuoteItem) => {
    const materialCostPerProduct = (it.materials_lines || []).reduce((sum, line) => {
      if (!line.material_id) return sum;
      const material = materials.find((m) => m.id === Number(line.material_id || 0));
      const materialUnitPrice = Number(material?.unit_price ?? 0);
      const qty = Math.max(0, Number(line.qty_per_product ?? 0));
      const factor = Math.max(0, Number(line.factor ?? 0));
      return sum + materialUnitPrice * qty * factor;
    }, 0);

    const laborCostPerProduct = (it.labor_lines || []).reduce((sum, line) => {
      if (!line.labor_cost_id) return sum;
      const labor = laborCosts.find((l) => l.id === Number(line.labor_cost_id || 0));
      const laborUnitCost = Number(labor?.unit_cost ?? 0);
      const qty = Math.max(0, Number(line.qty_per_product ?? 0));
      const factor = Math.max(0, Number(line.factor ?? 0));
      return sum + laborUnitCost * qty * factor;
    }, 0);

    const unitPrice = materialCostPerProduct + laborCostPerProduct;
    return Number.isFinite(unitPrice) ? unitPrice : 0;
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!companyProfile) return;

    setCompanyName(companyProfile.company_name || 'CÔNG TY');
    setCompanyAddress(companyProfile.address || '');
    setCompanyPhone(companyProfile.phone || '');
    setCompanyEmail(companyProfile.email || '');

    const url =
      companyProfile.logo_url ||
      (companyProfile.logo_path
        ? (() => {
            const cleaned = String(companyProfile.logo_path).replace(/^\/+/, '');
            const parts = cleaned.split('/');
            const bucket = parts[0] || 'company-assets';
            const objectPath = parts.slice(1).join('/');
            if (!objectPath) return '';
            return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl || '';
          })()
        : '');
    setCompanyLogoUrl(url);
  }, [isOpen, companyProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const code = generateQuotationCode();
    setQuotationCode(code);
    setCustomerName(lead?.full_name || '');
    setCustomerPhone(lead?.phone || '');
    setCustomerEmail(lead?.email || '');
    setCustomerAddress('');
    setCustomerCompany('');
    setCustomerTaxCode('');
    setNotes(lead?.demand || '');
    setItems([
      {
        id: crypto?.randomUUID?.() || String(Date.now()),
        product_name: '',
        description: '',
        quantity: 1,
        unit: 'cái',
        materials_lines: [
          {
            id: crypto?.randomUUID?.() || String(Date.now() + 1),
            material_id: null,
            qty_per_product: 1,
            factor: 1,
          },
        ],
        labor_lines: [
          {
            id: crypto?.randomUUID?.() || String(Date.now() + 2),
            labor_cost_id: null,
            qty_per_product: 1,
            factor: 1,
          },
        ],
        unit_price: 0,
      },
    ]);
  }, [isOpen, lead]);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0),
    [items]
  );

  const handleOpenPrintPreview = async () => {
    if (!customerName.trim()) {
      toast.error('Vui lòng nhập tên khách hàng.');
      return;
    }

    if (isGenerating) return;
    setIsGenerating(true);

    let quotationIdForLink: number | null = loggedQuotationId ?? null;

    const usedItems = items.filter((it) => {
      const hasName = Boolean(String(it.product_name || '').trim());
      const hasMaterial = (it.materials_lines || []).some((l) => l.material_id);
      const hasLabor = (it.labor_lines || []).some((l) => l.labor_cost_id);
      return hasName || hasMaterial || hasLabor;
    });

    for (const it of usedItems) {
      const mats = it.materials_lines || [];
      const labs = it.labor_lines || [];

      if (!mats.length) {
        toast.error(`Thiếu vật liệu cho dòng: "${it.product_name || '(chưa đặt tên)'}".`);
        setIsGenerating(false);
        return;
      }
      if (!labs.length) {
        toast.error(`Thiếu công đoạn cho dòng: "${it.product_name || '(chưa đặt tên)'}".`);
        setIsGenerating(false);
        return;
      }
      if (mats.some((l) => !l.material_id)) {
        toast.error(`Có dòng vật liệu chưa chọn ở: "${it.product_name || '(chưa đặt tên)'}".`);
        setIsGenerating(false);
        return;
      }
      if (labs.some((l) => !l.labor_cost_id)) {
        toast.error(`Có dòng công đoạn chưa chọn ở: "${it.product_name || '(chưa đặt tên)'}".`);
        setIsGenerating(false);
        return;
      }
    }

    const lines = usedItems.map((it) => {
      const quantity = Number(it.quantity || 0);
      const price = Number(it.unit_price || 0);
      const amount = quantity * price;

      const details: string[] = [];
      if (String(it.description || '').trim()) details.push(String(it.description || '').trim());

      for (const ml of it.materials_lines || []) {
        const material = materials.find((m) => m.id === Number(ml.material_id || 0));
        if (!material) continue;
        details.push(
          `Vật liệu: ${material.element_name} | ĐM: ${Number(ml.qty_per_product || 0)} ${material.unit} × HS ${Number(ml.factor || 0)}`
        );
      }

      for (const ll of it.labor_lines || []) {
        const labor = laborCosts.find((l) => l.id === Number(ll.labor_cost_id || 0));
        if (!labor) continue;
        details.push(
          `Công đoạn: ${labor.action} | ĐM: ${Number(ll.qty_per_product || 0)} ${labor.unit || 'lần'} × HS ${Number(ll.factor || 0)}`
        );
      }

      const fallbackName = (() => {
        const firstMaterialId = it.materials_lines?.find((l) => l.material_id)?.material_id;
        const firstLaborId = it.labor_lines?.find((l) => l.labor_cost_id)?.labor_cost_id;
        const m = materials.find((x) => x.id === Number(firstMaterialId || 0));
        const lc = laborCosts.find((x) => x.id === Number(firstLaborId || 0));
        const parts = [m?.element_name, lc?.action].filter(Boolean);
        return parts.length ? parts.join(' - ') : '(Sản phẩm)';
      })();

      const productName = String(it.product_name || '').trim() ? it.product_name : fallbackName;
      const name = details.length ? `${productName}\n${details.join('\n')}` : productName;
      return { name, unit: it.unit || '', quantity, price, amount };
    });
    const subtotalCalc = lines.reduce((s, l) => s + l.amount, 0);

    const data = {
      quotationCode,
      createdDate: new Date().toLocaleDateString('vi-VN'),
      company: {
        name: companyName || 'CÔNG TY',
        representativeName: companyProfile?.representative_name || '',
        representativeTitle: companyProfile?.representative_title || '',
        address: companyAddress || '',
        phone: companyPhone || '',
        email: companyEmail || '',
        taxCode: companyProfile?.tax_code || '',
        website: companyProfile?.website || '',
        logoUrl: companyLogoUrl || '',
      },
      customer: {
        name: customerName,
        phone: customerPhone || '',
        email: customerEmail || '',
        address: customerAddress || '',
        companyName: customerCompany || '',
        taxCode: customerTaxCode || '',
      },
      lines,
      note: notes || '',
      subtotal: subtotalCalc,
      totalAmount: subtotalCalc,
    };

    // Snapshot items to DB (include material/process info for later printing even if prices change)
    const itemsForDb = usedItems.map((it) => {
      const materials_lines = (it.materials_lines || []).map((ml) => {
        const material = materials.find((m) => m.id === Number(ml.material_id || 0));
        return {
          ...ml,
          material_name: material?.element_name || null,
          material_unit: material?.unit || null,
          material_unit_price: material?.unit_price ?? null,
        };
      });

      const labor_lines = (it.labor_lines || []).map((ll) => {
        const labor = laborCosts.find((l) => l.id === Number(ll.labor_cost_id || 0));
        return {
          ...ll,
          labor_action: labor?.action || null,
          labor_unit: labor?.unit || null,
          labor_unit_cost: labor?.unit_cost ?? null,
        };
      });

      return {
        ...it,
        unit_price: Number(it.unit_price || 0),
        materials_lines,
        labor_lines,
      };
    });

    // 1) Log quotation history to DB (no PDF yet). Avoid duplicates per modal session.
    try {
      if (!loggedQuotationId) {
        // Some DB schemas require quotations.customer_id NOT NULL.
        // We derive customer_id from converted lead, or lookup/create a customer by phone.
        let customerId: number | null = (lead as any)?.converted_customer_id ?? null;
        const phone = customerPhone.trim();

        const ensureCustomerId = async () => {
          if (customerId) return customerId;
          if (!phone) throw new Error('Thiếu SĐT khách (không thể tạo customer_id).');

          // 1) Try find existing customer by phone
          const existing = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
          if (existing.error) throw existing.error;
          if ((existing.data as any)?.id) return (existing.data as any).id as number;

          // 2) Create new customer (minimal fields)
          const newCustomerPayload: any = {
            customer_code: generateCustomerCode(),
            full_name: customerName.trim(),
            phone,
            email: customerEmail.trim() || null,
            address: customerAddress.trim() || null,
            company_name: customerCompany.trim() || null,
            tax_code: customerTaxCode.trim() || null,
          };

          const created = await supabase.from('customers').insert([newCustomerPayload]).select('id').single();
          if (created.error) {
            const msg = (created.error.message || '').toLowerCase();
            // If duplicate phone constraint exists, re-select.
            if (msg.includes('duplicate') || msg.includes('unique')) {
              const again = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
              if (again.error) throw again.error;
              if ((again.data as any)?.id) return (again.data as any).id as number;
            }
            throw created.error;
          }
          return (created.data as any).id as number;
        };

        try {
          customerId = await ensureCustomerId();
        } catch (e: any) {
          // If we cannot get customer_id, keep null; insert may fail if DB requires it.
          toast.error(`Không thể lấy customer_id: ${e?.message || String(e)}`);
        }

        const payload: any = {
          quotation_code: quotationCode,
          lead_id: lead?.id ?? null,
          customer_id: customerId ?? null,
          customer_name: customerName.trim(),
          phone: customerPhone.trim() || null,
          email: customerEmail.trim() || null,
          address: customerAddress.trim() || null,
          company_name: customerCompany.trim() || null,
          tax_code: customerTaxCode.trim() || null,
          subtotal: subtotalCalc,
          total_amount: subtotalCalc,
          items: itemsForDb,
          notes: notes.trim() || null,
        };

        const insertQuotationResilient = async (initialPayload: any) => {
          // Some DBs may have an older `quotations` schema (missing columns).
          // PostgREST error example: "Could not find the 'address' column of 'quotations' in the schema cache"
          let current = { ...(initialPayload || {}) };
          let last: any = null;

          for (let i = 0; i < 12; i++) {
            const res = await supabase.from('quotations').insert([current]).select('id').maybeSingle();
            last = res;
            if (!res.error) return { res, payload: current };

            const msg = String(res.error.message || '');
            const m1 = msg.match(/Could not find the '([^']+)' column of 'quotations' in the schema cache/i);
            const m2 = msg.match(/column \"([^\"]+)\".*quotations.*does not exist/i);
            const missingCol = m1?.[1] || m2?.[1];

            if (missingCol && Object.prototype.hasOwnProperty.call(current, missingCol)) {
              delete current[missingCol];
              continue;
            }

            break;
          }

          return { res: last, payload: current };
        };

        // Insert once; if unique conflict, reuse existing row.
        const { res: inserted } = await insertQuotationResilient(payload);
        if (inserted.error) {
          const msg = (inserted.error.message || '').toLowerCase();
          if (msg.includes('duplicate') || msg.includes('unique')) {
            const existing = await supabase
              .from('quotations')
              .select('id')
              .eq('quotation_code', quotationCode)
              .maybeSingle();
            if (existing.data?.id) {
              quotationIdForLink = Number(existing.data.id);
              setLoggedQuotationId(quotationIdForLink);
            } else {
              throw inserted.error;
            }
          } else {
            throw inserted.error;
          }
        } else if ((inserted.data as any)?.id) {
          quotationIdForLink = Number((inserted.data as any).id);
          setLoggedQuotationId(quotationIdForLink);
        }

        // Best-effort: write lead timeline event
        if (lead?.id && quotationIdForLink) {
          await supabase.from('lead_timeline_events').insert([
            {
              lead_id: lead.id,
              event_type: 'quotation_created',
              title: 'Tạo báo giá',
              description: quotationCode,
              meta: { quotation_id: quotationIdForLink, quotation_code: quotationCode, total_amount: subtotalCalc },
              occurred_at: new Date().toISOString(),
            },
          ] as any);
        }

        // Mark lead as "Đã báo giá"
        if (lead?.id) {
          const { error: leadErr } = await supabase
            .from('leads')
            .update({ status: 'quoted' })
            .eq('id', lead.id);

          if (leadErr) {
            const msg = leadErr.message || '';
            if (msg.toLowerCase().includes('invalid input value for enum')) {
              toast.error('DB chưa hỗ trợ trạng thái "quoted". Hãy cập nhật enum/constraint của cột leads.status để thêm giá trị quoted.');
            } else {
              toast.error(`Không thể cập nhật trạng thái lead: ${leadErr.message}`);
            }
          }
        }

        onSaved?.();
        toast.success('Đã ghi lịch sử báo giá.');
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      const lower = String(msg).toLowerCase();

      // PostgREST can be stale right after creating/altering tables/columns
      if (lower.includes('schema cache') && lower.includes('quotations')) {
        toast.error(
          'PostgREST schema cache chưa cập nhật cho bảng quotations. ' +
            "Hãy chạy SQL: `NOTIFY pgrst, 'reload schema';` rồi thử lại."
        );
      } else if (lower.includes('row-level security')) {
        toast.error(
          'Bị chặn RLS khi ghi lịch sử báo giá. Hãy chạy `apps/web/SETUP-QUOTATIONS.sql` để tạo policy cho bảng quotations.'
        );
      } else if (
        lower.includes('relation') &&
        lower.includes('quotations') &&
        lower.includes('does not exist')
      ) {
        toast.error('Chưa có bảng quotations. Hãy chạy `apps/web/SETUP-QUOTATIONS.sql` trong Supabase SQL Editor.');
      } else {
        // Always show the real error so user can act on it
        toast.error(`Không thể ghi lịch sử báo giá: ${msg}`);
      }
      // Still allow printing even if history logging fails.
    }

    // 2) Open print preview page
    try {
      if (quotationIdForLink) {
        const path = `/quotation-print?qid=${encodeURIComponent(String(quotationIdForLink))}`;
        const fullUrl = `${window.location.origin}${path}`;
        window.open(path, '_blank', 'noopener,noreferrer');

        try {
          await navigator.clipboard?.writeText?.(fullUrl);
          toast.success('Đã copy link báo giá.');
        } catch {
          toast.info('Đã mở trang in. (Không thể copy link tự động)');
        }
      } else {
        // Fallback: localStorage payload (not shareable) if DB insert failed
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(`quotation_print:${key}`, JSON.stringify({ ts: Date.now(), data }));
        const path = `/quotation-print?key=${encodeURIComponent(key)}`;
        window.open(path, '_blank', 'noopener,noreferrer');
        try {
          await navigator.clipboard?.writeText?.(`${window.location.origin}${path}`);
          toast.success('Đã copy link (tạm).');
        } catch {
          toast.info('Đã mở trang in.');
        }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Không thể mở trang in.');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateItem = (id: string, patch: Partial<QuoteItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const next: QuoteItem = { ...it, ...patch };

        // Recompute unit price whenever inputs change
        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const updateMaterialLine = (itemId: string, lineId: string, patch: Partial<QuoteMaterialLine>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const next: QuoteItem = {
          ...it,
          materials_lines: (it.materials_lines || []).map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
        };

        // Auto-fill product name from first material + first labor (if empty)
        if (!String(next.product_name || '').trim()) {
          const firstMaterialId = next.materials_lines.find((l) => l.material_id)?.material_id;
          const firstLaborId = next.labor_lines.find((l) => l.labor_cost_id)?.labor_cost_id;
          const m = materials.find((x) => x.id === Number(firstMaterialId || 0));
          const lc = laborCosts.find((x) => x.id === Number(firstLaborId || 0));
          const parts = [m?.element_name, lc?.action].filter(Boolean);
          if (parts.length) next.product_name = parts.join(' - ');
        }

        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const addMaterialLine = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const next: QuoteItem = {
          ...it,
          materials_lines: [
            ...(it.materials_lines || []),
            {
              id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
              material_id: null,
              qty_per_product: 1,
              factor: 1,
            },
          ],
        };
        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const removeMaterialLine = (itemId: string, lineId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const nextLines = (it.materials_lines || []).filter((l) => l.id !== lineId);
        const next: QuoteItem = { ...it, materials_lines: nextLines.length ? nextLines : it.materials_lines };
        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const updateLaborLine = (itemId: string, lineId: string, patch: Partial<QuoteLaborLine>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const next: QuoteItem = {
          ...it,
          labor_lines: (it.labor_lines || []).map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
        };

        // Auto-fill product name from first material + first labor (if empty)
        if (!String(next.product_name || '').trim()) {
          const firstMaterialId = next.materials_lines.find((l) => l.material_id)?.material_id;
          const firstLaborId = next.labor_lines.find((l) => l.labor_cost_id)?.labor_cost_id;
          const m = materials.find((x) => x.id === Number(firstMaterialId || 0));
          const lc = laborCosts.find((x) => x.id === Number(firstLaborId || 0));
          const parts = [m?.element_name, lc?.action].filter(Boolean);
          if (parts.length) next.product_name = parts.join(' - ');
        }

        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const addLaborLine = (itemId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const next: QuoteItem = {
          ...it,
          labor_lines: [
            ...(it.labor_lines || []),
            {
              id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
              labor_cost_id: null,
              qty_per_product: 1,
              factor: 1,
            },
          ],
        };
        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const removeLaborLine = (itemId: string, lineId: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const nextLines = (it.labor_lines || []).filter((l) => l.id !== lineId);
        const next: QuoteItem = { ...it, labor_lines: nextLines.length ? nextLines : it.labor_lines };
        next.unit_price = computeUnitPrice(next);
        return next;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: crypto?.randomUUID?.() || String(Date.now() + Math.random()),
        product_name: '',
        description: '',
        quantity: 1,
        unit: 'cái',
        materials_lines: [
          {
            id: crypto?.randomUUID?.() || String(Date.now() + 1),
            material_id: null,
            qty_per_product: 1,
            factor: 1,
          },
        ],
        labor_lines: [
          {
            id: crypto?.randomUUID?.() || String(Date.now() + 2),
            labor_cost_id: null,
            qty_per_product: 1,
            factor: 1,
          },
        ],
        unit_price: 0,
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[900px] max-w-[95vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <FileText className="text-emerald-600" />
            Tạo báo giá - {lead?.full_name || 'Lead'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-500">Thông tin công ty (tự lấy từ thiết lập)</div>
              <Link
                href="/company-profile"
                className="text-xs font-semibold text-blue-700 underline"
                title="Mở trang Thông tin công ty"
              >
                Sửa thông tin công ty
              </Link>
            </div>

            {companyProfileLoading ? (
              <div className="text-xs text-slate-500">Đang tải thông tin công ty...</div>
            ) : companyProfileError ? (
              <div className="text-xs text-red-600">
                Lỗi tải thông tin công ty: {companyProfileError}. Hãy chạy `apps/web/SETUP-COMPANY-PROFILE.sql`.
              </div>
            ) : !companyProfile ? (
              <div className="text-xs text-amber-700">
                Chưa cấu hình thông tin công ty. Vào “Thông tin công ty” để nhập, rồi quay lại tạo báo giá.
              </div>
            ) : (
              <div className="text-xs text-emerald-700">
                Đang dùng: <span className="font-semibold">{companyProfile.company_name || 'CÔNG TY'}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={companyName}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100 text-slate-700"
                placeholder="Tên công ty"
              />
              <input
                value={companyPhone}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100 text-slate-700"
                placeholder="SĐT công ty"
              />
              <input
                value={companyEmail}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100 text-slate-700"
                placeholder="Email công ty"
              />
              <input
                value={companyAddress}
                disabled
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2 bg-slate-100 text-slate-700"
                placeholder="Địa chỉ công ty"
              />
            </div>
            <div className="text-xs text-slate-500">
              Logo lấy từ “Thông tin công ty” (bucket `company-assets`). Nếu chưa có sẽ fallback `public/logo.jpg`.
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">Thông tin khách</div>
              <div className="text-xs text-slate-500 font-mono">Mã: {quotationCode}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2"
                placeholder="Tên khách hàng"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="SĐT"
              />
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Email"
              />
              <input
                value={customerCompany}
                onChange={(e) => setCustomerCompany(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="Công ty"
              />
              <input
                value={customerTaxCode}
                onChange={(e) => setCustomerTaxCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                placeholder="MST"
              />
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2"
                placeholder="Địa chỉ"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-slate-700">Sản phẩm</div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              <Plus size={14} /> Thêm dòng
            </button>
          </div>

          {(materialsError || laborCostsError) && (
            <div className="mb-3 text-xs text-amber-700">
              {materialsError && (
                <div>
                  Không tải được Kho vật liệu: {materialsError}. Hãy chạy `apps/web/SETUP-MATERIALS.sql`.
                </div>
              )}
              {laborCostsError && (
                <div>
                  Không tải được Bảng giá công: {laborCostsError}. Hãy chạy `apps/web/SETUP-LABOR-COSTS.sql`.
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            {items.map((it) => {
              const selectedMaterialIds = (it.materials_lines || [])
                .map((ml) => Number(ml.material_id || 0))
                .filter((x) => Number.isFinite(x) && x > 0);
              const laborOptions = laborCosts
                .filter((l) => l.is_active !== false)
                .filter((l) => !selectedMaterialIds.length || selectedMaterialIds.includes(Number(l.material_id || 0)));

              return (
                <div key={it.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/40">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-12 md:col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      placeholder="Tên sản phẩm"
                      value={it.product_name}
                      onChange={(e) => updateItem(it.id, { product_name: e.target.value })}
                    />
                    <input
                      className="col-span-12 md:col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      placeholder="Mô tả (tuỳ chọn)"
                      value={it.description || ''}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                    />
                    <input
                      className="col-span-4 md:col-span-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      placeholder="ĐVT"
                      value={it.unit}
                      onChange={(e) => updateItem(it.id, { unit: e.target.value })}
                    />
                    <input
                      className="col-span-4 md:col-span-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      type="number"
                      value={it.quantity}
                      onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value || 0) })}
                      min={0}
                      title="Số lượng SP"
                    />
                    <input
                      className="col-span-4 md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-slate-100 text-slate-700"
                      type="number"
                      value={Number(it.unit_price || 0)}
                      readOnly
                      title="Đơn giá (tự tính)"
                    />
                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Xóa dòng"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-700">Vật liệu (có thể nhiều dòng)</div>
                      <button
                        type="button"
                        onClick={() => addMaterialLine(it.id)}
                        className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        + Thêm vật liệu
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(it.materials_lines || []).map((ml) => {
                        const m = materials.find((x) => x.id === Number(ml.material_id || 0));
                        return (
                          <div key={ml.id} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-12 md:col-span-6">
                              <select
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                value={ml.material_id ?? ''}
                                onChange={(e) => {
                                  const id = e.target.value ? Number(e.target.value) : null;
                                  updateMaterialLine(it.id, ml.id, { material_id: id });
                                }}
                              >
                                <option value="">-- Chọn vật liệu --</option>
                                {materials
                                  .filter((x) => x.is_active !== false)
                                  .map((x) => (
                                    <option key={x.id} value={x.id}>
                                      {(x.product_groups?.name ? `${x.product_groups.name} - ` : '') + x.element_name} ({x.unit}) -{' '}
                                      {formatVND(Number(x.unit_price || 0))}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <input
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                type="number"
                                min={0}
                                step="any"
                                value={Number(ml.qty_per_product || 0)}
                                onChange={(e) => updateMaterialLine(it.id, ml.id, { qty_per_product: Number(e.target.value || 0) })}
                                placeholder={`ĐM${m?.unit ? ` (${m.unit})` : ''}`}
                                title="Định mức vật liệu / 1 SP"
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <input
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                type="number"
                                min={0}
                                step="any"
                                value={Number(ml.factor || 0)}
                                onChange={(e) => updateMaterialLine(it.id, ml.id, { factor: Number(e.target.value || 0) })}
                                placeholder="HS"
                                title="Hệ số vật liệu"
                              />
                            </div>
                            <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2">
                              <div className="text-xs text-slate-600">
                                {formatVND(Number(m?.unit_price || 0) * Number(ml.qty_per_product || 0) * Number(ml.factor || 0))}
                              </div>
                              {(it.materials_lines || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeMaterialLine(it.id, ml.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Xóa vật liệu"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-slate-700">Công đoạn (có thể nhiều dòng)</div>
                      <button
                        type="button"
                        onClick={() => addLaborLine(it.id)}
                        className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        + Thêm công đoạn
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(it.labor_lines || []).map((ll) => {
                        const labor = laborCosts.find((x) => x.id === Number(ll.labor_cost_id || 0));
                        const matName = (() => {
                          const matId = Number(labor?.material_id || 0);
                          if (!matId) return '';
                          const m = materials.find((mm) => mm.id === matId);
                          return m?.element_name ? ` - VL: ${m.element_name}` : '';
                        })();

                        return (
                          <div key={ll.id} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-12 md:col-span-6">
                              <select
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
                                value={ll.labor_cost_id ?? ''}
                                disabled={!selectedMaterialIds.length}
                                onChange={(e) => {
                                  const id = e.target.value ? Number(e.target.value) : null;
                                  updateLaborLine(it.id, ll.id, { labor_cost_id: id });
                                }}
                              >
                                <option value="">
                                  {selectedMaterialIds.length ? '-- Chọn công đoạn --' : 'Chọn ít nhất 1 vật liệu trước...'}
                                </option>
                                {laborOptions.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.action}
                                    {matName} - {formatVND(Number(x.unit_cost || 0))}/{x.unit || 'lần'}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <input
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                type="number"
                                min={0}
                                step="any"
                                value={Number(ll.qty_per_product || 0)}
                                onChange={(e) => updateLaborLine(it.id, ll.id, { qty_per_product: Number(e.target.value || 0) })}
                                placeholder="ĐM"
                                title="Định mức công đoạn / 1 SP"
                              />
                            </div>
                            <div className="col-span-6 md:col-span-2">
                              <input
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                type="number"
                                min={0}
                                step="any"
                                value={Number(ll.factor || 0)}
                                onChange={(e) => updateLaborLine(it.id, ll.id, { factor: Number(e.target.value || 0) })}
                                placeholder="HS"
                                title="Hệ số công đoạn"
                              />
                            </div>
                            <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2">
                              <div className="text-xs text-slate-600">
                                {formatVND(Number(labor?.unit_cost || 0) * Number(ll.qty_per_product || 0) * Number(ll.factor || 0))}
                              </div>
                              {(it.labor_lines || []).length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeLaborLine(it.id, ll.id)}
                                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Xóa công đoạn"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end gap-4 text-xs text-slate-600">
                    <div>
                      Đơn giá: <span className="font-semibold text-slate-900">{formatVND(Number(it.unit_price || 0))}</span>
                    </div>
                    <div>
                      Thành tiền:{' '}
                      <span className="font-semibold text-slate-900">
                        {formatVND(Number(it.unit_price || 0) * Number(it.quantity || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex justify-end text-sm">
            <div className="text-slate-600 mr-2">Tạm tính:</div>
            <div className="font-semibold text-slate-900">{formatVND(subtotal)}</div>
          </div>
        </div>

        <div className="mt-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            rows={3}
            placeholder="Ghi chú / điều khoản..."
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={handleOpenPrintPreview}
            disabled={isGenerating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50"
          >
            <Printer size={16} /> In / Lưu PDF
          </button>
        </div>
      </div>
    </div>
  );
}

