// src/components/filter-panel/Icon.jsx
export default function Icon({ children, className = "" }) {
  return (
    <div
      className={`w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}