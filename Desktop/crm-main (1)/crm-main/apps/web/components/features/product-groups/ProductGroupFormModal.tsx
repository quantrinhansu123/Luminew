'use client';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productGroupSchema, ProductGroupFormData } from '@/lib/validations/product-group.schema';
import { FormInput, FormTextarea } from '@/components/ui/form';
import { PlusCircle, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo } from 'react';
import type { ProductGroup } from '@/lib/types';

interface ProductGroupFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  productGroups?: ProductGroup[];
}

export function ProductGroupFormModal({
  mode, isOpen, onClose, onSubmit, defaultValues, productGroups = []
}: ProductGroupFormModalProps) {
  const methods = useForm<ProductGroupFormData>({
    resolver: zodResolver(productGroupSchema),
    defaultValues: {
      name: '',
      product_name: '',
      unit_price: 0,
      description: '',
      is_active: true,
    },
  });

  const watchedGroupName = methods.watch('name');

  const groupNameSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const pg of productGroups || []) {
      const n = String(pg?.name || '').trim();
      if (n) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [productGroups]);

  const productSuggestionsForGroup = useMemo(() => {
    const g = String(watchedGroupName || '').trim();
    const set = new Set<string>();
    for (const pg of productGroups || []) {
      if (String(pg?.name || '').trim() !== g) continue;
      const p = String((pg as any)?.product_name || '').trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [productGroups, watchedGroupName]);

  useEffect(() => {
    if (defaultValues && mode === 'edit') {
      methods.reset({
        name: defaultValues.name || '',
        product_name: defaultValues.product_name || '',
        unit_price: Number(defaultValues.unit_price ?? 0),
        description: defaultValues.description || '',
        is_active: defaultValues.is_active ?? true,
      });
    } else if (mode === 'add') {
      methods.reset({
        name: '',
        product_name: '',
        unit_price: 0,
        description: '',
        is_active: true,
      });
    }
  }, [defaultValues, mode, methods]);

  const handleSubmit = async (data: ProductGroupFormData) => {
    const success = await onSubmit(data);
    if (success) {
      toast.success(mode === 'add' ? 'Đã thêm nhóm sản phẩm thành công!' : 'Đã cập nhật nhóm sản phẩm thành công!');
      methods.reset();
      onClose();
    } else {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            {mode === 'add' ? (
              <><PlusCircle className="text-accent" /> Thêm nhóm sản phẩm mới</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa nhóm sản phẩm</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tên nhóm <span className="text-red-500">*</span>
              </label>
              <input
                {...methods.register('name')}
                list="pg-group-names"
                placeholder="Chọn hoặc gõ thêm nhóm mới..."
                className="w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent bg-white"
              />
              <datalist id="pg-group-names">
                {groupNameSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              {methods.formState.errors?.name && (
                <p className="mt-1 text-sm text-red-600">{methods.formState.errors.name.message as string}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Sản phẩm <span className="text-red-500">*</span>
              </label>
              <input
                {...methods.register('product_name')}
                list="pg-products"
                placeholder={watchedGroupName ? 'Chọn sản phẩm trong nhóm hoặc gõ thêm...' : 'Chọn nhóm trước...'}
                disabled={!String(watchedGroupName || '').trim()}
                className={`w-full px-3 py-2 border rounded-lg outline-none transition-colors border-slate-300 focus:ring-2 focus:ring-accent ${
                  String(watchedGroupName || '').trim() ? 'bg-white' : 'bg-slate-100 cursor-not-allowed'
                }`}
              />
              <datalist id="pg-products">
                {productSuggestionsForGroup.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {methods.formState.errors?.product_name && (
                <p className="mt-1 text-sm text-red-600">{methods.formState.errors.product_name.message as string}</p>
              )}
            </div>

            <FormInput
              name="unit_price"
              label="Giá định lượng"
              placeholder="VD: 150000"
              type="number"
            />

            <FormTextarea
              name="description"
              label="Mô tả"
              placeholder="Mô tả về nhóm sản phẩm này"
              rows={3}
            />

            {mode === 'edit' && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-active"
                  className="w-4 h-4 text-accent border-slate-300 rounded focus:ring-accent"
                  {...methods.register('is_active')}
                />
                <label htmlFor="is-active" className="text-sm text-slate-700">
                  Nhóm đang hoạt động
                </label>
              </div>
            )}

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
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm nhóm SP' : 'Lưu thay đổi')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
