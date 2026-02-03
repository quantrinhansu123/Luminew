'use client';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { interactionLogSchema, InteractionLogFormData } from '@/lib/validations/lead.schema';
import { FormInput, FormSelect, FormTextarea } from '@/components/ui/form';
import { PhoneCall, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useRef } from 'react';
import type { Lead, lead_status } from '@/lib/types';

interface InteractionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean>;
  lead?: Lead | null;
}

const interactionTypes = [
  { value: 'call', label: 'Cuộc gọi' },
  { value: 'message', label: 'Tin nhắn' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Họp' },
  { value: 'note', label: 'Ghi chú' },
];

export function InteractionFormModal({
  isOpen, onClose, onSubmit, lead
}: InteractionFormModalProps) {
  const openedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (isOpen) openedAtRef.current = Date.now();
  }, [isOpen]);

  const statusOptions: Array<{ value: lead_status; label: string }> = useMemo(
    () => [
      { value: 'new', label: 'Mới' },
      { value: 'calling', label: 'Đang gọi' },
      { value: 'no_answer', label: 'Không nghe máy' },
      { value: 'quoted', label: 'Đã báo giá' },
      { value: 'closed', label: 'Đã chốt' },
      { value: 'rejected', label: 'Từ chối' },
    ],
    []
  );

  const methods = useForm<InteractionLogFormData>({
    resolver: zodResolver(interactionLogSchema),
    defaultValues: {
      type: 'call',
      lead_status: 'calling',
      content: '',
      summary: '',
      duration_seconds: undefined,
    },
  });

  useEffect(() => {
    if (isOpen) {
      methods.reset({
        type: 'call',
        lead_status: 'calling',
        content: '',
        summary: '',
        duration_seconds: undefined,
      });
    }
  }, [isOpen, methods]);

  const handleSubmit = async (data: InteractionLogFormData) => {
    // Clean up NaN values for duration_seconds
    const started = openedAtRef.current;
    const elapsedSeconds = started ? Math.max(0, Math.round((Date.now() - started) / 1000)) : undefined;

    const cleanedData: any = {
      ...data,
      // Hide duration input: auto measure from open -> save (only for calls)
      duration_seconds:
        data.type === 'call'
          ? elapsedSeconds
          : (Number.isNaN(data.duration_seconds) ? undefined : data.duration_seconds),
    };
    const success = await onSubmit(cleanedData);
    if (success) {
      toast.success('Đã thêm tương tác thành công!');
      methods.reset();
      onClose();
    } else {
      toast.error('Có lỗi xảy ra. Vui lòng thử lại!');
    }
  };

  const watchType = methods.watch('type');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <PhoneCall className="text-purple-600" />
            Thêm tương tác cho Lead: {lead?.full_name || '-'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X size={20} />
          </button>
        </div>

        {lead && (
          <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">SĐT</span>
                <span className="font-medium text-slate-800">{lead.phone}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-800">{lead.email || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Nguồn</span>
                <span className="font-medium text-slate-800">
                  {lead.lead_sources?.name ? `${lead.lead_sources.name} (${lead.lead_sources.type})` : '-'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Chiến dịch</span>
                <span className="font-medium text-slate-800">{lead.campaigns?.name || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Nhãn nguồn</span>
                <span className="font-medium text-slate-800">{lead.source_label || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">NV Sale</span>
                <span className="font-medium text-slate-800">{lead.sales_employees?.full_name || '-'}</span>
              </div>
            </div>
          </div>
        )}

        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-4">
            <FormSelect
              name="lead_status"
              label="Trạng thái"
              options={statusOptions}
              emptyOption="-- Chọn trạng thái --"
            />

            <FormSelect
              name="type"
              label="Loại tương tác"
              required
              options={interactionTypes}
            />

            <FormInput
              name="summary"
              label="Tóm tắt"
              placeholder="Tóm tắt ngắn gọn"
            />

            <FormTextarea
              name="content"
              label="Nội dung chi tiết"
              placeholder="Ghi chú chi tiết về cuộc tương tác..."
              rows={4}
              required
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
                className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {methods.formState.isSubmitting ? 'Đang xử lý...' : 'Thêm tương tác'}
              </button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
