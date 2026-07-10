import React from 'react';

/**
 * Bọc bảng admin: cuộn ngang/dọc trong khung cố định — thanh kéo ngang luôn ở mép dưới vùng nhìn thấy,
 * không cần cuộn xuống cuối trang.
 */
export default function AdminTableViewport({ children, className = '' }) {
  return (
    <div
      className={`overflow-x-auto overflow-y-auto max-h-[min(65vh,720px)] ${className}`}
    >
      {children}
    </div>
  );
}
