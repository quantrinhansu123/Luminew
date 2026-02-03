'use client';

import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, PlusCircle, Edit } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductGroup } from '@/lib/types';
import { materialSchema, MaterialFormData } from '@/lib/validations/materials.schema';
import { FormInput } from '@/components/ui/form';

interface MaterialFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  productGroups: ProductGroup[];
}

export function MaterialFormModal({
  mode, isOpen, onClose, onSubmit, defaultValues, productGroups
}: MaterialFormModalProps) {
  const methods = useForm<MaterialFormData>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      product_group_id: null,
      element_name: '',
      unit: '',
      unit_price: 0,
      total_cost: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'edit' && defaultValues) {
      methods.reset({
        product_group_id: defaultValues.product_group_id ?? null,
        element_name: defaultValues.element_name || '',
        unit: defaultValues.unit || '',
        unit_price: Number(defaultValues.unit_price ?? 0),
        total_cost: Number(defaultValues.total_cost ?? 0),
        is_active: defaultValues.is_active ?? true,
      });
    } else {
      methods.reset({
        product_group_id: null,
        element_name: '',
        unit: '',
        unit_price: 0,
        total_cost: 0,
        is_active: true,
      });
    }
  }, [isOpen, mode, defaultValues, methods]);

  const handleSubmit = async (data: MaterialFormData) => {
    const payload: any = { ...data };
    // If total_cost is 0 but unit_price > 0, default total_cost = unit_price
    if (Number(payload.total_cost || 0) === 0 && Number(payload.unit_price || 0) > 0) {
      payload.total_cost = Number(payload.unit_price || 0);
    }
    const ok = await onSubmit(payload);
    if (ok) {
      toast.success(mode === 'add' ? 'Đã thêm vật liệu!' : 'Đã cập nhật vật liệu!');
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
              <><PlusCircle className="text-accent" /> Thêm vật liệu</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa vật liệu</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nhóm sản phẩm</label>
              <select
                className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white text-sm"
                {...methods.register('product_group_id', { valueAsNumber: true })}
                defaultValue={defaultValues?.product_group_id ?? ''}
              >
                <option value="">-- Chọn nhóm sản phẩm --</option>
                {productGroups.map((pg) => (
                  <option key={pg.id} value={pg.id}>
                    {pg.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput name="element_name" label="Tên phần tử" required placeholder="VD: Giấy Couche 150gsm" />
              <FormInput name="unit" label="Đơn vị" required placeholder="VD: tờ / kg / cuộn" />
              <FormInput name="unit_price" label="Giá" type="number" placeholder="VD: 12000" />
              <FormInput name="total_cost" label="Tổng chi phí" type="number" placeholder="VD: 12000" />
            </div>

            {mode === 'edit' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mat-active"
                  className="w-4 h-4 text-accent border-slate-300 rounded focus:ring-accent"
                  {...methods.register('is_active')}
                />
                <label htmlFor="mat-active" className="text-sm text-slate-700">
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

