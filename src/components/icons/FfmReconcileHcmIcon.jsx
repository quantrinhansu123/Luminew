import { MapPin, Table2 } from 'lucide-react';

/**
 * Icon bảng đối soát đẩy FFM (HCM): lưới + ghim chi nhánh.
 * Dùng `currentColor` — sidebar và thẻ menu.
 */
export default function FfmReconcileHcmIcon({ className = 'w-5 h-5' }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center text-current ${className}`}
      aria-hidden
    >
      <Table2 className="h-[88%] w-[88%]" strokeWidth={2} />
      <MapPin
        className="absolute -bottom-px -right-px h-[46%] w-[46%]"
        strokeWidth={2.5}
      />
    </span>
  );
}
