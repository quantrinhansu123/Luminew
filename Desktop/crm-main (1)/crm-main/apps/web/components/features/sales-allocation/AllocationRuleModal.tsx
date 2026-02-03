'use client';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { salesAllocationSchema, SalesAllocationFormData } from '@/lib/validations/sales-allocation.schema';
import { FormInput } from '@/components/ui/form';
import { PlusCircle, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface AllocationRuleModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  productGroups: Array<{ id: number; name: string }>;
  salesEmployees: Array<{ id: number; full_name: string; employee_code: string }>;
}

export function AllocationRuleModal({
  mode, isOpen, onClose, onSubmit, defaultValues, productGroups, salesEmployees
}: AllocationRuleModalProps) {
  const methods = useForm<SalesAllocationFormData>({
    resolver: zodResolver(salesAllocationSchema),
    defaultValues: {
      customer_group: '',
      product_group_ids: [],
      assigned_sales_ids: [],
    },
  });

  useEffect(() => {
    if (defaultValues && mode === 'edit') {
      methods.reset({
        customer_group: defaultValues.customer_group || '',
        product_group_ids: defaultValues.product_group_ids || [],
        assigned_sales_ids: defaultValues.assigned_sales_ids || [],
      });
    } else if (mode === 'add') {
      methods.reset({
        customer_group: '',
        product_group_ids: [],
        assigned_sales_ids: [],
      });
    }
  }, [defaultValues, mode, methods]);

  const handleSubmit = async (data: SalesAllocationFormData) => {
    const success = await onSubmit(data);
    if (success) {
      toast.success(mode === 'add' ? 'Đã thêm quy tắc phân bổ thành công!' : 'Đã cập nhật quy tắc phân bổ thành công!');
      methods.reset();
      onClose();
    } else {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[700px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            {mode === 'add' ? (
              <><PlusCircle className="text-accent" /> Thêm quy tắc phân bổ mới</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa quy tắc phân bổ</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <FormInput
              name="customer_group"
              label="Nhóm khách hàng"
              placeholder="VD: Khách hàng VIP, Khách hàng mới..."
              required
            />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nhóm sản phẩm <span className="text-red-500">*</span>
              </label>
              <Controller
                name="product_group_ids"
                control={methods.control}
                render={({ field, fieldState }) => (
                  <div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-3">
                      {productGroups.map(pg => (
                        <label key={pg.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={pg.id}
                            checked={field.value.includes(pg.id)}
                            onChange={(e) => {
                              const updatedValue = e.target.checked
                                ? [...field.value, pg.id]
                                : field.value.filter(id => id !== pg.id);
                              field.onChange(updatedValue);
                            }}
                            className="w-4 h-4 text-accent border-slate-300 rounded focus:ring-accent"
                          />
                          <span className="text-sm text-slate-700">{pg.name}</span>
                        </label>
                      ))}
                    </div>
                    {fieldState.error && (
                      <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>
                    )}
                  </div>
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nhân viên sale phụ trách <span className="text-red-500">*</span>
              </label>
              <Controller
                name="assigned_sales_ids"
                control={methods.control}
                render={({ field, fieldState }) => (
                  <div>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-3">
                      {salesEmployees.map(se => (
                        <label key={se.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            value={se.id}
                            checked={field.value.includes(se.id)}
                            onChange={(e) => {
                              const updatedValue = e.target.checked
                                ? [...field.value, se.id]
                                : field.value.filter(id => id !== se.id);
                              field.onChange(updatedValue);
                            }}
                            className="w-4 h-4 text-accent border-slate-300 rounded focus:ring-accent"
                          />
                          <span className="text-sm text-slate-700">
                            {se.employee_code} - {se.full_name}
                          </span>
                        </label>
                      ))}
                    </div>
                    {fieldState.error && (
                      <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>
                    )}
                  </div>
                )}
              />
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
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm quy tắc' : 'Lưu thay đổi')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
