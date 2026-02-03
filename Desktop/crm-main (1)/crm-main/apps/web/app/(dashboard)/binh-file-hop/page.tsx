'use client';

import BoxCalculator from '@/components/features/print-layout/BoxCalculator';

export default function BinhFileHopPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Bình File Hộp - Tính giá hộp giấy</h1>
        <p className="text-slate-500 text-sm">
          Tính toán diện tích bế và chi phí sản xuất hộp carton
        </p>
      </div>

      <BoxCalculator />
    </div>
  );
}
