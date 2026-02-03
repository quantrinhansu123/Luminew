'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

type Option = { value: string | number; label: string };

interface MultiSelectDropdownProps {
  label: string;
  options: Option[];
  values: Array<string | number>;
  onChange: (next: Array<string | number>) => void;
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
}

export function MultiSelectDropdown({
  label,
  options,
  values,
  onChange,
  placeholder = 'Tất cả',
  disabled,
  searchPlaceholder = 'Gõ để tìm...',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(el)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const selectedSet = useMemo(() => new Set(values.map((v) => String(v))), [values]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options;
    return options.filter((o) => o.label.toLowerCase().includes(qq));
  }, [options, q]);

  const selectedText = useMemo(() => {
    if (!values.length) return placeholder;
    if (values.length === 1) {
      const v = String(values[0]);
      const found = options.find((o) => String(o.value) === v);
      return found?.label || placeholder;
    }
    return `Đã chọn ${values.length}`;
  }, [options, placeholder, values]);

  const toggleValue = (v: string | number) => {
    const key = String(v);
    const next = selectedSet.has(key)
      ? values.filter((x) => String(x) !== key)
      : [...values, v];
    onChange(next);
  };

  const clear = () => onChange([]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 border rounded-lg text-xs transition-colors
          ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white hover:border-slate-400'}
          border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent`}
      >
        <span className="truncate">
          <span className="text-slate-500">{label}: </span>
          <span className="text-slate-800">{selectedText}</span>
        </span>
        <span className="flex items-center gap-1">
          {!!values.length && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  clear();
                }
              }}
              className="p-1 rounded hover:bg-slate-100 text-slate-500"
              title="Xóa chọn"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-2 w-full min-w-[180px] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-accent text-xs"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">Không có dữ liệu phù hợp.</div>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(String(o.value));
                return (
                  <label
                    key={String(o.value)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(o.value)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span className="text-slate-800">{o.label}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="p-2 border-t border-slate-100 flex justify-between">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-md"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={clear}
              className="px-2 py-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
              disabled={!values.length}
            >
              Xóa chọn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

