'use client';

import dynamic from 'next/dynamic';

const DesignLibrary = dynamic(
  () => import('@/components/features/design-library/DesignLibrary'),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-slate-500">Đang tải...</div>
      </div>
    )
  }
);

export default function DesignLibraryPage() {
  return (
    <div className="p-6">
      <DesignLibrary />
    </div>
  );
}
