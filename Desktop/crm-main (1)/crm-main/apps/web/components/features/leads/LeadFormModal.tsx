'use client';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadFormSchema, LeadFormData } from '@/lib/validations/lead.schema';
import { FormInput, FormSelect, FormTextarea } from '@/components/ui/form';
import { CUSTOMER_GROUPS } from '@/lib/types';
import { PlusCircle, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generateProductGroupCode } from '@/lib/codegen';
import type { SalesEmployee, source_type } from '@/lib/types';

interface LeadFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  sources: Array<{ id: number; name: string; type: string }>;
  campaigns: Array<{ id: number; name: string }>;
  productGroups: Array<{ id: number; name: string }>;
  salesEmployees?: SalesEmployee[];
  onRefreshSources?: () => void | Promise<void>;
  onRefreshCampaigns?: () => void | Promise<void>;
  onRefreshProductGroups?: () => void | Promise<void>;
}

export function LeadFormModal({
  mode,
  isOpen,
  onClose,
  onSubmit,
  defaultValues,
  sources,
  campaigns,
  productGroups,
  salesEmployees = [],
  onRefreshSources,
  onRefreshCampaigns,
  onRefreshProductGroups,
}: LeadFormModalProps) {
  const ADD_SENTINEL = -1;

  const methods = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      full_name: '',
      phone: '',
      email: '',
      demand: '',
      source_id: sources[0]?.id || 0,
      campaign_id: undefined,
      customer_group: '',
      interested_product_group_id: undefined,
      assigned_sales_id: undefined,
    },
  });

  const sourceId = methods.watch('source_id');
  const campaignId = methods.watch('campaign_id');
  const interestedProductGroupId = methods.watch('interested_product_group_id');

  const prevSourceIdRef = useRef<number>(sources[0]?.id || 0);
  const prevCampaignIdRef = useRef<number | undefined>(undefined);
  const prevProductGroupIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof sourceId === 'number' && sourceId !== ADD_SENTINEL) {
      prevSourceIdRef.current = sourceId;
    }
  }, [sourceId]);

  useEffect(() => {
    if (typeof campaignId === 'number' && campaignId !== ADD_SENTINEL) {
      prevCampaignIdRef.current = campaignId;
    }
    if (campaignId === undefined) {
      prevCampaignIdRef.current = undefined;
    }
  }, [campaignId]);

  useEffect(() => {
    if (typeof interestedProductGroupId === 'number' && interestedProductGroupId !== ADD_SENTINEL) {
      prevProductGroupIdRef.current = interestedProductGroupId;
    }
    if (interestedProductGroupId === undefined) {
      prevProductGroupIdRef.current = undefined;
    }
  }, [interestedProductGroupId]);

  // Quick-add modals (create directly in linked tables)
  const [isAddSourceOpen, setIsAddSourceOpen] = useState(false);
  const [isAddCampaignOpen, setIsAddCampaignOpen] = useState(false);
  const [isAddProductGroupOpen, setIsAddProductGroupOpen] = useState(false);

  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceType, setNewSourceType] = useState<source_type>('facebook' as source_type);

  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignCode, setNewCampaignCode] = useState('');

  const [newProductGroupName, setNewProductGroupName] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnitPrice, setNewProductUnitPrice] = useState<number>(0);

  const sourceOptions = useMemo(
    () => [
      ...sources.map((s) => ({ value: s.id, label: `${s.name} (${s.type})` })),
      { value: ADD_SENTINEL, label: '➕ Thêm nguồn mới...' },
    ],
    [sources]
  );

  const campaignOptions = useMemo(
    () => [
      ...campaigns.map((c) => ({ value: c.id, label: c.name })),
      { value: ADD_SENTINEL, label: '➕ Thêm chiến dịch mới...' },
    ],
    [campaigns]
  );

  const productGroupOptions = useMemo(
    () => [
      ...productGroups.map((g) => ({ value: g.id, label: g.name })),
      { value: ADD_SENTINEL, label: '➕ Thêm nhóm sản phẩm mới...' },
    ],
    [productGroups]
  );

  const salesEmployeeOptions = useMemo(
    () =>
      (salesEmployees || [])
        .filter((e) => e.is_active !== false)
        .map((e) => ({
          value: e.id,
          label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}`,
        })),
    [salesEmployees]
  );

  useEffect(() => {
    if (defaultValues && mode === 'edit') {
      methods.reset({
        full_name: defaultValues.full_name || '',
        phone: defaultValues.phone || '',
        email: defaultValues.email || '',
        demand: defaultValues.demand || '',
        source_id: defaultValues.source_id || sources[0]?.id || 0,
        campaign_id: defaultValues.campaign_id,
        customer_group: defaultValues.customer_group || '',
        interested_product_group_id: defaultValues.interested_product_group_id,
        assigned_sales_id: defaultValues.assigned_sales_id,
      });
    } else if (mode === 'add') {
      methods.reset({
        full_name: '',
        phone: '',
        email: '',
        demand: '',
        source_id: sources[0]?.id || 0,
        campaign_id: undefined,
        customer_group: '',
        interested_product_group_id: undefined,
        assigned_sales_id: undefined,
      });
    }
  }, [defaultValues, mode, methods, sources]);

  const createLeadSource = async () => {
    const name = newSourceName.trim();
    if (!name) {
      toast.error('Vui lòng nhập tên nguồn.');
      return;
    }

    const { data, error } = await supabase
      .from('lead_sources')
      .insert([{ name, type: newSourceType, is_active: true }])
      .select('id')
      .single();

    if (error || !data?.id) {
      toast.error(error?.message || 'Không thể thêm nguồn. Vui lòng thử lại.');
      return;
    }

    await onRefreshSources?.();
    methods.setValue('source_id', data.id, { shouldValidate: true, shouldDirty: true });
    methods.clearErrors('source_id');
    setNewSourceName('');
    setIsAddSourceOpen(false);
    toast.success('Đã thêm nguồn mới.');
  };

  const createCampaign = async () => {
    const name = newCampaignName.trim();
    if (!name) {
      toast.error('Vui lòng nhập tên chiến dịch.');
      return;
    }

    const currentSourceId = methods.getValues('source_id');
    const payload: any = {
      name,
      is_active: true,
      source_id: typeof currentSourceId === 'number' && currentSourceId > 0 ? currentSourceId : undefined,
      code: newCampaignCode.trim() || undefined,
    };

    const { data, error } = await supabase
      .from('campaigns')
      .insert([payload])
      .select('id')
      .single();

    if (error || !data?.id) {
      toast.error(error?.message || 'Không thể thêm chiến dịch. Vui lòng thử lại.');
      return;
    }

    await onRefreshCampaigns?.();
    methods.setValue('campaign_id', data.id, { shouldValidate: true, shouldDirty: true });
    methods.clearErrors('campaign_id');
    setNewCampaignName('');
    setNewCampaignCode('');
    setIsAddCampaignOpen(false);
    toast.success('Đã thêm chiến dịch mới.');
  };

  const createProductGroup = async () => {
    const name = newProductGroupName.trim();
    if (!name) {
      toast.error('Vui lòng nhập tên nhóm sản phẩm.');
      return;
    }

    const payload: any = {
      name,
      is_active: true,
      code: generateProductGroupCode(),
      product_name: newProductName.trim() || name,
      unit_price: Number(newProductUnitPrice || 0),
    };

    const { data, error } = await supabase
      .from('product_groups')
      .insert([payload])
      .select('id')
      .single();

    if (error || !data?.id) {
      toast.error(error?.message || 'Không thể thêm nhóm sản phẩm. Vui lòng thử lại.');
      return;
    }

    await onRefreshProductGroups?.();
    methods.setValue('interested_product_group_id', data.id, { shouldValidate: true, shouldDirty: true });
    methods.clearErrors('interested_product_group_id');
    setNewProductGroupName('');
    setNewProductName('');
    setNewProductUnitPrice(0);
    setIsAddProductGroupOpen(false);
    toast.success('Đã thêm nhóm sản phẩm mới.');
  };

  const handleSubmit = async (data: LeadFormData) => {
    const success = await onSubmit(data);
    if (success) {
      toast.success(mode === 'add' ? 'Đã thêm lead thành công!' : 'Đã cập nhật lead thành công!');
      methods.reset();
      onClose();
    } else {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[760px] max-w-[95vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            {mode === 'add' ? (
              <><PlusCircle className="text-accent" /> Thêm khách hàng tiềm năng mới</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa thông tin Lead</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                name="full_name"
                label="Họ và tên"
                placeholder="Nhập họ và tên"
                required
              />

              <FormInput
                name="phone"
                label="Số điện thoại"
                type="tel"
                placeholder="0901234567"
                required
              />

              <FormInput
                name="email"
                label="Email"
                type="email"
                placeholder="example@email.com"
              />

              <FormSelect
                name="source_id"
                label="Nguồn"
                required
                options={sourceOptions}
                onValueChange={(raw) => {
                  if (raw === String(ADD_SENTINEL)) {
                    methods.setValue('source_id', prevSourceIdRef.current, { shouldValidate: true });
                    methods.clearErrors('source_id');
                    setIsAddSourceOpen(true);
                  }
                }}
              />

              <FormSelect
                name="campaign_id"
                label="Chiến dịch"
                options={campaignOptions}
                emptyOption="-- Chọn chiến dịch --"
                onValueChange={(raw) => {
                  if (raw === String(ADD_SENTINEL)) {
                    methods.setValue('campaign_id', prevCampaignIdRef.current, { shouldValidate: true });
                    methods.clearErrors('campaign_id');
                    setIsAddCampaignOpen(true);
                  }
                }}
              />

              <FormSelect
                name="customer_group"
                label="Nhóm khách hàng"
                options={CUSTOMER_GROUPS.map((g) => ({ value: g, label: g }))}
                emptyOption="-- Chọn nhóm KH --"
              />

              <FormSelect
                name="interested_product_group_id"
                label="Nhóm sản phẩm quan tâm"
                options={productGroupOptions}
                emptyOption="-- Chọn nhóm SP --"
                onValueChange={(raw) => {
                  if (raw === String(ADD_SENTINEL)) {
                    methods.setValue('interested_product_group_id', prevProductGroupIdRef.current, { shouldValidate: true });
                    methods.clearErrors('interested_product_group_id');
                    setIsAddProductGroupOpen(true);
                  }
                }}
              />

              <FormSelect
                name="assigned_sales_id"
                label="NV Sale"
                options={salesEmployeeOptions}
                emptyOption="-- Chưa phân bổ --"
                disabled={salesEmployeeOptions.length === 0}
              />

              <div className="md:col-span-2">
                <FormTextarea
                  name="demand"
                  label="Nhu cầu"
                  placeholder="Nhập nhu cầu của khách hàng"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={methods.formState.isSubmitting}
                className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm mới' : 'Lưu thay đổi')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>

      {/* Quick add: Lead source */}
      {isAddSourceOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[95vw] p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold">Thêm nguồn mới</h4>
              <button
                type="button"
                onClick={() => setIsAddSourceOpen(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên nguồn</label>
                <input
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: bxcnxbcxc"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kênh</label>
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value as source_type)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                >
                  <option value="facebook">facebook</option>
                  <option value="zalo">zalo</option>
                  <option value="tiktok">tiktok</option>
                  <option value="website">website</option>
                  <option value="referral">referral</option>
                  <option value="other">other</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSourceOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={createLeadSource}
                  className="px-3 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick add: Campaign */}
      {isAddCampaignOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[95vw] p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold">Thêm chiến dịch mới</h4>
              <button
                type="button"
                onClick={() => setIsAddCampaignOpen(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên chiến dịch</label>
                <input
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: Sale Tết 2026"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mã (tuỳ chọn)</label>
                <input
                  value={newCampaignCode}
                  onChange={(e) => setNewCampaignCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: TET2026"
                />
              </div>

              <p className="text-xs text-slate-500">
                Chiến dịch sẽ được gắn với nguồn đang chọn (nếu có).
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddCampaignOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={createCampaign}
                  className="px-3 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick add: Product group */}
      {isAddProductGroupOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[520px] max-w-[95vw] p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-lg font-semibold">Thêm nhóm sản phẩm mới</h4>
              <button
                type="button"
                onClick={() => setIsAddProductGroupOpen(false)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tên nhóm</label>
                <input
                  value={newProductGroupName}
                  onChange={(e) => setNewProductGroupName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: In decal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sản phẩm</label>
                <input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: Decal giấy"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Giá định lượng</label>
                <input
                  type="number"
                  value={newProductUnitPrice}
                  onChange={(e) => setNewProductUnitPrice(Number(e.target.value || 0))}
                  className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
                  placeholder="VD: 150000"
                  min={0}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductGroupOpen(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={createProductGroup}
                  className="px-3 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Thêm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
