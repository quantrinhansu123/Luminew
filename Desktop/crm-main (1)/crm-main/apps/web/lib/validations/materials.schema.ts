import { z } from 'zod';

export const materialSchema = z.object({
  product_group_id: z.number().optional().nullable(),
  element_name: z.string().min(1, 'Tên phần tử là bắt buộc').max(200, 'Tối đa 200 ký tự'),
  unit: z.string().min(1, 'Đơn vị là bắt buộc').max(50, 'Tối đa 50 ký tự'),
  unit_price: z.number().min(0, 'Giá phải >= 0'),
  total_cost: z.number().min(0, 'Tổng chi phí phải >= 0'),
  is_active: z.boolean().optional(),
});

export type MaterialFormData = z.infer<typeof materialSchema>;

