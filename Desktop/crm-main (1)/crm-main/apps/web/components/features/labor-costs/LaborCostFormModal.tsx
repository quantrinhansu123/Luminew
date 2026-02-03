'use client';

import { useEffect, useMemo } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, PlusCircle, Edit } from 'lucide-react';
import { toast } from 'sonner';
import type { MaterialItem, ProductGroup } from '@/lib/types';
import { laborCostSchema, LaborCostFormData } from '@/lib/validations/labor-costs.schema';
import { FormInput } from '@/components/ui/form';

interface LaborCostFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  productGroups: ProductGroup[];
  materials: MaterialItem[];
}

export function LaborCostFormModal({
  mode, isOpen, onClose, onSubmit, defaultValues, productGroups, materials
}: LaborCostFormModalProps) {
  const methods = useForm<LaborCostFormData>({
    resolver: zodResolver(laborCostSchema),
    defaultValues: {
      action: '',
      product_group_id: undefined as any,
      material_id: undefined as any,
      unit_cost: 0,
      unit: '',
      is_active: true,
    },
  });

  const selectedGroupId = methods.watch('product_group_id');
  const materialOptions = useMemo(() => {
    const gid = Number(selectedGroupId || 0);
    if (!gid) return [];
    return (materials || []).filter((m) => Number(m.product_group_id || 0) === gid && m.is_active !== false);
  }, [materials, selectedGroupId]);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && defaultValues) {
      methods.reset({
        action: defaultValues.action || '',
        product_group_id: Number(defaultValues.product_group_id || 0) || (undefined as any),
        material_id: Number(defaultValues.material_id || 0) || (undefined as any),
        unit_cost: Number(defaultValues.unit_cost ?? 0),
        unit: defaultValues.unit || '',
        is_active: defaultValues.is_active ?? true,
      });
    } else {
      methods.reset({
        action: '',
        product_group_id: undefined as any,
        material_id: undefined as any,
        unit_cost: 0,
        unit: '',
        is_active: true,
      });
    }
  }, [isOpen, mode, defaultValues, methods]);

  const handleSubmit = async (data: LaborCostFormData) => {
    const payload: any = { ...data };
    const ok = await onSubmit(payload);
    if (ok) {
      toast.success(mode === 'add' ? 'Đã thêm giá công!' : 'Đã cập nhật giá công!');
      onClose();
    } else {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[720px] max-w-[95vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            {mode === 'add' ? (
              <><PlusCircle className="text-accent" /> Thêm giá công</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa giá công</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <FormInput name="action" label="Hành động" required placeholder="VD: Cắt / Bế / In..." />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nhóm sản phẩm <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white text-sm"
                {...methods.register('product_group_id', { valueAsNumber: true })}
                defaultValue={defaultValues?.product_group_id ?? ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  methods.setValue('product_group_id', val as any, { shouldValidate: true, shouldDirty: true });
                  // Reset material when changing group
                  methods.setValue('material_id', undefined as any, { shouldValidate: true, shouldDirty: true });
                }}
              >
                <option value="">-- Chọn loại vật liệu / nhóm SP --</option>
                {productGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Loại vật liệu <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white text-sm"
                disabled={!selectedGroupId}
                {...methods.register('material_id', { valueAsNumber: true })}
                defaultValue={defaultValues?.material_id ?? ''}
              >
                <option value="">
                  {selectedGroupId ? '-- Chọn vật liệu trong nhóm --' : 'Chọn nhóm sản phẩm trước...'}
                </option>
                {materialOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.element_name} ({m.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput name="unit_cost" label="Chi phí" type="number" placeholder="VD: 5000" />
              <FormInput name="unit" label="Đơn vị" placeholder="VD: lần / m2 / cái" />
            </div>

            {mode === 'edit' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lc-active"
                  className="w-4 h-4 text-accent border-slate-300 rounded focus:ring-accent"
                  {...methods.register('is_active')}
                />
                <label htmlFor="lc-active" className="text-sm text-slate-700">
                  Đang hoạt động
                </label>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={methods.formState.isSubmitting}
                className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm' : 'Lưu')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}

