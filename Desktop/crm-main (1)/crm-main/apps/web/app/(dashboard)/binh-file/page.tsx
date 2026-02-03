'use client';

import PrintLayoutCalculator from '@/components/features/print-layout/PrintLayoutCalculator';

export default function BinhFilePage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Bình File - Tính toán bố trí in</h1>
        <p className="text-slate-500 text-sm">
          Công cụ tính toán tối ưu số lượng sản phẩm bố trí trên khổ giấy in
        </p>
      </div>

      <PrintLayoutCalculator />
    </div>
  );
}
