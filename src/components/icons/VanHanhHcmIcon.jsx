import { Activity, MapPin } from 'lucide-react';

/**
 * Icon Báo cáo vận hành HCM: biểu đồ hoạt động + ghim chi nhánh.
 * Dùng `currentColor` — sidebar và thẻ dashboard.
 */
export default function VanHanhHcmIcon({ className = 'w-5 h-5' }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center text-current ${className}`}
      aria-hidden
    >
      <Activity className="h-[88%] w-[88%]" strokeWidth={2} />
      <MapPin
        className="absolute -bottom-px -right-px h-[46%] w-[46%]"
        strokeWidth={2.5}
      />
    </span>
  );
}

