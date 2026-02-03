'use client';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadSourceSchema, LeadSourceFormData } from '@/lib/validations/campaign.schema';
import { FormInput, FormSelect, FormTextarea } from '@/components/ui/form';
import { PlusCircle, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect } from 'react';

const sourceTypeOptions = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Giới thiệu' },
  { value: 'other', label: 'Khác' },
];

interface LeadSourceFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
}

export function LeadSourceFormModal({
  mode, isOpen, onClose, onSubmit, defaultValues
}: LeadSourceFormModalProps) {
  const methods = useForm<LeadSourceFormData>({
    resolver: zodResolver(leadSourceSchema),
    defaultValues: {
      type: 'facebook',
      name: '',
      description: '',
      is_active: true,
    },
  });

  useEffect(() => {
    if (defaultValues && mode === 'edit') {
      methods.reset({
        type: defaultValues.type || 'facebook',
        name: defaultValues.name || '',
        description: defaultValues.description || '',
        is_active: defaultValues.is_active ?? true,
      });
    } else if (mode === 'add') {
      methods.reset({
        type: 'facebook',
        name: '',
        description: '',
        is_active: true,
      });
    }
  }, [defaultValues, mode, methods]);

  const handleSubmit = async (data: LeadSourceFormData) => {
    const success = await onSubmit(data);
    if (success) {
      toast.success(mode === 'add' ? 'Đã thêm nguồn lead thành công!' : 'Đã cập nhật nguồn lead thành công!');
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
              <><PlusCircle className="text-accent" /> Thêm nguồn lead mới</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa nguồn lead</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <FormSelect
              name="type"
              label="Loại nguồn"
              required
              options={sourceTypeOptions}
            />

            <FormInput
              name="name"
              label="Tên nguồn"
              placeholder="VD: Facebook Ads Q1"
              required
            />

            <FormTextarea
              name="description"
              label="Mô tả"
              placeholder="Mô tả về nguồn lead này"
              rows={3}
            />

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
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm nguồn' : 'Lưu thay đổi')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
