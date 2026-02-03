import { z } from 'zod';

export const productGroupSchema = z.object({
  name: z.string()
    .min(1, 'Tên nhóm là bắt buộc')
    .min(2, 'Tên nhóm phải có ít nhất 2 ký tự')
    .max(100, 'Tên nhóm tối đa 100 ký tự'),

  product_name: z.string()
    .min(1, 'Sản phẩm là bắt buộc')
    .max(200, 'Tên sản phẩm tối đa 200 ký tự'),

  unit_price: z.number().min(0, 'Giá định lượng phải >= 0'),

  description: z.string()
    .max(500, 'Mô tả tối đa 500 ký tự')
    .optional()
    .or(z.literal('')),

  is_active: z.boolean(),
});

export type ProductGroupFormData = z.infer<typeof productGroupSchema>;
