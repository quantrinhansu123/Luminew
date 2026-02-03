import { z } from 'zod';

export const salesAllocationSchema = z.object({
  customer_group: z.string().min(1, 'Nhóm khách hàng là bắt buộc'),
  product_group_ids: z.array(z.number()).min(1, 'Phải chọn ít nhất 1 nhóm sản phẩm'),
  assigned_sales_ids: z.array(z.number()).min(1, 'Phải chọn ít nhất 1 nhân viên sale'),
});

export type SalesAllocationFormData = z.infer<typeof salesAllocationSchema>;
