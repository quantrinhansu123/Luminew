import { z } from 'zod';

const VIETNAM_PHONE_REGEX = /^0[0-9]{9,10}$/;

export const leadFormSchema = z.object({
  full_name: z.string()
    .min(1, 'Họ tên là bắt buộc')
    .min(2, 'Họ tên phải có ít nhất 2 ký tự')
    .max(100, 'Họ tên tối đa 100 ký tự'),

  phone: z.string()
    .min(1, 'Số điện thoại là bắt buộc')
    .regex(VIETNAM_PHONE_REGEX, 'Số điện thoại không hợp lệ (VD: 0901234567)'),

  email: z.string()
    .email('Email không hợp lệ')
    .optional()
    .or(z.literal('')),

  demand: z.string().max(500, 'Nhu cầu tối đa 500 ký tự').optional().or(z.literal('')),
  source_id: z.number().min(1, 'Vui lòng chọn nguồn'),
  campaign_id: z.number().optional(),
  customer_group: z.string().optional().or(z.literal('')),
  interested_product_group_id: z.number().optional(),
  assigned_sales_id: z.number().optional(),
});

export const interactionLogSchema = z.object({
  type: z.enum(['message', 'call', 'email', 'meeting', 'note']),
  lead_status: z.enum(['new', 'calling', 'no_answer', 'quoted', 'closed', 'rejected']).optional(),
  content: z.string()
    .min(1, 'Nội dung không được để trống')
    .max(2000, 'Nội dung tối đa 2000 ký tự'),
  summary: z.string().max(200, 'Tóm tắt tối đa 200 ký tự').optional().or(z.literal('')),
  duration_seconds: z.number().min(0, 'Thời lượng phải >= 0').optional(),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;
export type InteractionLogFormData = z.infer<typeof interactionLogSchema>;
