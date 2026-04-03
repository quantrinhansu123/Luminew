import { ClipboardList, MapPin } from 'lucide-react';

/**
 * Icon FFM MGT HCM: bảng danh sách + ghim chi nhánh.
 * Dùng `currentColor` — sidebar (xám) và thẻ dashboard (trên nền indigo).
 */
export default function FfmMgtHcmIcon({ className = 'w-5 h-5' }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center text-current ${className}`}
      aria-hidden
    >
      <ClipboardList className="h-[88%] w-[88%]" strokeWidth={2} />
      <MapPin
        className="absolute -bottom-px -right-px h-[46%] w-[46%]"
        strokeWidth={2.5}
      />
    </span>
  );
}
