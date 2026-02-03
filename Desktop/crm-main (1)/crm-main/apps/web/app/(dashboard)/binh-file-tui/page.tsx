'use client';

import PaperBagCalculator from '@/components/features/print-layout/PaperBagCalculator';

export default function BinhFileTuiPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Bình File Túi - Tính giá túi giấy</h1>
        <p className="text-slate-500 text-sm">
          Tính toán diện tích bế và chi phí sản xuất túi giấy kraft
        </p>
      </div>

      <PaperBagCalculator />
    </div>
  );
}
