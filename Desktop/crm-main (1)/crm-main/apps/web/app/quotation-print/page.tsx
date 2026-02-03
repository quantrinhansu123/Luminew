'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QuotationPdfData, QuotationTemplate } from '@/components/features/leads/QuotationTemplate';
import { supabase } from '@/lib/supabase';

export default function QuotationPrintPage() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key') || '';
  const qidRaw = searchParams.get('qid') || '';
  const qid = qidRaw ? Number(qidRaw) : null;

  const [data, setData] = useState<QuotationPdfData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const deriveLogoUrl = (logoPath: string) => {
      const cleaned = logoPath.replace(/^\/+/, '');
      const parts = cleaned.split('/');
      const bucket = parts[0] || 'company-assets';
      const objectPath = parts.slice(1).join('/');
      if (!objectPath) return '';
      return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl || '';
    };

    const run = async () => {
      try {
        // Prefer DB-based print link (shareable)
        if (qid && Number.isFinite(qid)) {
          const [qRes, cRes] = await Promise.all([
            supabase.from('quotations').select('*').eq('id', qid).maybeSingle(),
            supabase.from('company_profile').select('*').eq('id', 1).maybeSingle(),
          ]);

          if (qRes.error) throw qRes.error;
          if (!qRes.data) throw new Error('Không tìm thấy báo giá trong DB.');

          const q: any = qRes.data;
          const cp: any = cRes.data || null;

          const rawItems = q.items;
          let items: any[] = [];
          if (Array.isArray(rawItems)) items = rawItems;
          else if (typeof rawItems === 'string') {
            try { items = JSON.parse(rawItems) || []; } catch { items = []; }
          } else items = [];

          const lines = items
            .filter((it) => String(it?.product_name || it?.name || '').trim())
            .map((it) => {
              const productName = it.product_name ?? it.name ?? '';
              const description = it.description ?? '';

              const details: string[] = [];
              if (String(description || '').trim()) details.push(String(description || '').trim());

              // New schema: multiple materials / multiple labors
              if (Array.isArray(it.materials_lines) && it.materials_lines.length) {
                for (const ml of it.materials_lines) {
                  if (!ml) continue;
                  const name = ml.material_name || '';
                  const qty = Number(ml.qty_per_product ?? 0);
                  const hs = Number(ml.factor ?? 0);
                  const unit = ml.material_unit || '';
                  if (String(name).trim()) details.push(`Vật liệu: ${name} | ĐM: ${qty} ${unit} × HS ${hs}`);
                }
              } else if (it.material_name) {
                // Backward compat: single material
                const qty = Number(it.material_qty_per_product ?? 0);
                const hs = Number(it.material_factor ?? 0);
                const unit = it.material_unit || '';
                details.push(`Vật liệu: ${it.material_name} | ĐM: ${qty} ${unit} × HS ${hs}`);
              }

              if (Array.isArray(it.labor_lines) && it.labor_lines.length) {
                for (const ll of it.labor_lines) {
                  if (!ll) continue;
                  const action = ll.labor_action || '';
                  const qty = Number(ll.qty_per_product ?? 0);
                  const hs = Number(ll.factor ?? 0);
                  const unit = ll.labor_unit || 'lần';
                  if (String(action).trim()) details.push(`Công đoạn: ${action} | ĐM: ${qty} ${unit} × HS ${hs}`);
                }
              } else if (it.labor_action) {
                // Backward compat: single labor
                const qty = Number(it.labor_qty_per_product ?? 0);
                const hs = Number(it.labor_factor ?? 0);
                const unit = it.labor_unit || 'lần';
                details.push(`Công đoạn: ${it.labor_action} | ĐM: ${qty} ${unit} × HS ${hs}`);
              }

              const name = details.length ? `${productName}\n${details.join('\n')}` : String(productName);

              const quantity = Number(it.quantity || 0);
              const price = Number(it.unit_price ?? it.price ?? 0);
              const amount = quantity * price;
              const unit = it.unit || '';
              return { name, unit, quantity, price, amount };
            });

          const subtotal = Number(q.subtotal ?? lines.reduce((s, l) => s + Number(l.amount || 0), 0));
          const totalAmount = Number(q.total_amount ?? subtotal);

          const logoUrl = (cp?.logo_url as string) || (cp?.logo_path ? deriveLogoUrl(String(cp.logo_path)) : '');

          const payload: QuotationPdfData = {
            quotationCode: String(q.quotation_code || `#${q.id}`),
            createdDate: q.created_at ? new Date(q.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN'),
            company: {
              name: String(cp?.company_name || 'CÔNG TY'),
              representativeName: cp?.representative_name || '',
              representativeTitle: cp?.representative_title || '',
              address: cp?.address || '',
              phone: cp?.phone || '',
              email: cp?.email || '',
              taxCode: cp?.tax_code || '',
              website: cp?.website || '',
              logoUrl,
            },
            customer: {
              name: String(q.customer_name || ''),
              phone: q.phone || '',
              email: q.email || '',
              address: q.address || '',
              companyName: q.company_name || '',
              taxCode: q.tax_code || '',
            },
            lines,
            note: q.notes || '',
            subtotal,
            totalAmount,
          };

          if (!cancelled) {
            setData(payload);
            setError(null);
          }
          return;
        }

        // Fallback: localStorage payload (NOT shareable across devices/users)
        if (!key) {
          throw new Error('Thiếu qid/key dữ liệu.');
        }

        const raw = localStorage.getItem(`quotation_print:${key}`);
        if (!raw) {
          throw new Error('Không tìm thấy dữ liệu in (localStorage).');
        }
        const parsed = JSON.parse(raw);
        const payload = parsed?.data ? parsed.data : parsed;

        // Optional TTL cleanup (2 hours)
        const ts = Number(parsed?.ts || 0);
        if (ts && Date.now() - ts > 2 * 60 * 60 * 1000) {
          localStorage.removeItem(`quotation_print:${key}`);
          throw new Error('Dữ liệu in đã hết hạn. Vui lòng mở lại từ màn Báo giá.');
        }

        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setData(null);
          setError(e?.message || 'Không thể đọc dữ liệu in.');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [key, qid]);

  const canPrint = useMemo(() => Boolean(data && !error), [data, error]);

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center print:bg-white print:p-0 print:block">
      {/* Control Bar */}
      <div className="w-full max-w-[210mm] mb-6 flex justify-between items-center print:hidden">
        <h1 className="text-xl font-bold text-gray-700">Xem trước bản in</h1>
        <button
          onClick={() => window.print()}
          disabled={!canPrint}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2 px-6 rounded shadow flex items-center gap-2 transition-colors cursor-pointer"
        >
          In / Lưu PDF
        </button>
      </div>

      {error && (
        <div className="w-full max-w-[210mm] bg-red-50 border border-red-200 text-red-700 p-4 rounded print:hidden">
          Lỗi: {error}
        </div>
      )}

      {/* Print Area Preview */}
      <div
        id="print-area"
        className="overflow-auto max-w-full shadow-2xl print:shadow-none print:w-full print:max-w-none print:overflow-visible"
      >
        <div className="print-content bg-white" style={{ width: '210mm', minHeight: '297mm' }}>
          {data ? <QuotationTemplate data={data} /> : <div className="p-10 text-gray-500">Đang tải...</div>}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .min-h-screen { background: white !important; height: auto !important; display: block !important; }
        }
      `}</style>
    </div>
  );
}

