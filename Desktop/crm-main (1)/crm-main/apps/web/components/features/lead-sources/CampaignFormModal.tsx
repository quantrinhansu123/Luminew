'use client';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { campaignSchema, CampaignFormData } from '@/lib/validations/campaign.schema';
import { FormInput, FormSelect, FormTextarea } from '@/components/ui/form';
import { PlusCircle, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect } from 'react';

interface CampaignFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  defaultValues?: any;
  sources: Array<{ id: number; name: string; type: string }>;
}

export function CampaignFormModal({
  mode, isOpen, onClose, onSubmit, defaultValues, sources
}: CampaignFormModalProps) {
  const methods = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      source_id: sources[0]?.id || 0,
      name: '',
      code: '',
      start_date: '',
      end_date: '',
      budget: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (defaultValues && mode === 'edit') {
      const startDate = defaultValues.start_date
        ? new Date(defaultValues.start_date).toISOString().split('T')[0]
        : '';
      const endDate = defaultValues.end_date
        ? new Date(defaultValues.end_date).toISOString().split('T')[0]
        : '';

      methods.reset({
        source_id: defaultValues.source_id || sources[0]?.id || 0,
        name: defaultValues.name || '',
        code: defaultValues.code || '',
        start_date: startDate,
        end_date: endDate,
        budget: defaultValues.budget || 0,
        is_active: defaultValues.is_active ?? true,
      });
    } else if (mode === 'add') {
      methods.reset({
        source_id: sources[0]?.id || 0,
        name: '',
        code: '',
        start_date: '',
        end_date: '',
        budget: 0,
        is_active: true,
      });
    }
  }, [defaultValues, mode, methods, sources]);

  const handleSubmit = async (data: CampaignFormData) => {
    // Transform data for API
    const payload: any = {
      source_id: data.source_id,
      name: data.name,
    };

    if (data.code && data.code.trim()) payload.code = data.code;
    if (data.start_date && data.start_date.trim()) {
      payload.start_date = new Date(data.start_date).toISOString();
    }
    if (data.end_date && data.end_date.trim()) {
      payload.end_date = new Date(data.end_date).toISOString();
    }
    if (data.budget && data.budget > 0) payload.budget = data.budget;

    const success = await onSubmit(payload);
    if (success) {
      toast.success(mode === 'add' ? 'Đã thêm chiến dịch thành công!' : 'Đã cập nhật chiến dịch thành công!');
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
              <><PlusCircle className="text-accent" /> Thêm chiến dịch mới</>
            ) : (
              <><Edit className="text-accent" /> Chỉnh sửa chiến dịch</>
            )}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <FormSelect
              name="source_id"
              label="Nguồn lead"
              required
              options={sources.map(s => ({
                value: s.id,
                label: `${s.name} (${s.type})`
              }))}
            />

            <FormInput
              name="name"
              label="Tên chiến dịch"
              placeholder="VD: Tết 2024"
              required
            />

            <FormInput
              name="code"
              label="Mã chiến dịch"
              placeholder="TET2024"
            />

            <div className="grid grid-cols-2 gap-4">
              <FormInput
                name="start_date"
                label="Ngày bắt đầu"
                type="date"
              />

              <FormInput
                name="end_date"
                label="Ngày kết thúc"
                type="date"
              />
            </div>

            <FormInput
              name="budget"
              label="Ngân sách (VNĐ)"
              type="number"
              placeholder="0"
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
                {methods.formState.isSubmitting ? 'Đang xử lý...' : (mode === 'add' ? 'Thêm chiến dịch' : 'Lưu thay đổi')}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
