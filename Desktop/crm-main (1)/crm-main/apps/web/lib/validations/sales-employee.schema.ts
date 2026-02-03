import { z } from 'zod';

const EMPLOYEE_CODE_REGEX = /^[A-Z0-9]{3,10}$/;
const VIETNAM_PHONE_REGEX = /^0[0-9]{9,10}$/;

const optionalInt = z
  .union([z.number().int(), z.nan()])
  .transform((v) => (Number.isNaN(v) ? undefined : v))
  .optional();

export const salesEmployeeSchema = z.object({
  // Prefer DB-generated codes; still allow manual override if provided.
  employee_code: z.string()
    .regex(EMPLOYEE_CODE_REGEX, 'Mã NV phải là chữ IN HOA hoặc số (VD: NV001, SALE01)')
    .optional()
    .or(z.literal('')),

  full_name: z.string()
    .min(1, 'Họ tên là bắt buộc')
    .min(2, 'Họ tên phải có ít nhất 2 ký tự')
    .max(100, 'Họ tên tối đa 100 ký tự'),

  email: z.string()
    .min(1, 'Email là bắt buộc')
    .email('Email không hợp lệ'),

  phone: z.string()
    .regex(VIETNAM_PHONE_REGEX, 'Số điện thoại không hợp lệ (VD: 0901234567)')
    .optional()
    .or(z.literal('')),

  is_active: z.boolean(),
  round_robin_order: optionalInt,
  user_id: optionalInt,
});

export type SalesEmployeeFormData = z.infer<typeof salesEmployeeSchema>;
