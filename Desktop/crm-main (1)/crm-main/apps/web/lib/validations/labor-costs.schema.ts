import { z } from 'zod';

export const laborCostSchema = z.object({
  action: z.string().min(1, 'Hành động là bắt buộc').max(200, 'Tối đa 200 ký tự'),
  product_group_id: z.number().min(1, 'Vui lòng chọn nhóm sản phẩm'),
  material_id: z.number().min(1, 'Vui lòng chọn loại vật liệu'),
  unit_cost: z.number().min(0, 'Chi phí phải >= 0'),
  unit: z.string().max(50, 'Tối đa 50 ký tự').optional().or(z.literal('')),
  is_active: z.boolean().optional(),
});

export type LaborCostFormData = z.infer<typeof laborCostSchema>;

