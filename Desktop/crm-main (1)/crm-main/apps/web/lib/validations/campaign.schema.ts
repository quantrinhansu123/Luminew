import { z } from 'zod';

export const leadSourceSchema = z.object({
  type: z.enum(['facebook', 'zalo', 'tiktok', 'website', 'referral', 'other']),
  name: z.string()
    .min(1, 'Tên nguồn là bắt buộc')
    .max(100, 'Tên nguồn tối đa 100 ký tự'),
  description: z.string()
    .max(500, 'Mô tả tối đa 500 ký tự')
    .optional()
    .or(z.literal('')),
  is_active: z.boolean(),
});

export const campaignSchema = z.object({
  source_id: z.number().min(1, 'Vui lòng chọn nguồn lead'),
  name: z.string()
    .min(1, 'Tên chiến dịch là bắt buộc')
    .max(200, 'Tên chiến dịch tối đa 200 ký tự'),
  code: z.string()
    .max(50, 'Mã chiến dịch tối đa 50 ký tự')
    .optional()
    .or(z.literal('')),
  description: z.string()
    .max(1000, 'Mô tả tối đa 1000 ký tự')
    .optional()
    .or(z.literal('')),
  start_date: z.string().optional().or(z.literal('')),
  end_date: z.string().optional().or(z.literal('')),
  budget: z.number().min(0, 'Ngân sách phải >= 0').optional(),
  is_active: z.boolean(),
}).refine((data) => {
  if (data.start_date && data.end_date && data.start_date !== '' && data.end_date !== '') {
    return new Date(data.start_date) < new Date(data.end_date);
  }
  return true;
}, {
  message: 'Ngày kết thúc phải sau ngày bắt đầu',
  path: ['end_date'],
});

export type LeadSourceFormData = z.infer<typeof leadSourceSchema>;
export type CampaignFormData = z.infer<typeof campaignSchema>;
