import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

function normalizeForSearch(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim();
}

function optionLabel(option) {
  if (option && typeof option === 'object') return String(option.label ?? option.value ?? '');
  return String(option ?? '');
}

function optionValue(option) {
  if (option && typeof option === 'object') return String(option.value ?? option.label ?? '');
  return String(option ?? '');
}

export default function SearchableFilterSelect({
  label,
  value,
  onChange,
  options,
  allValue = 'all',
  allLabel = 'Tất cả',
  placeholder = 'Tìm kiếm...',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 220 });
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    const rows = [];
    if (allLabel != null && allLabel !== '') {
      rows.push({ value: allValue, label: allLabel });
    }
    (options || []).forEach((option) => {
      const nextValue = optionValue(option);
      if (!nextValue || nextValue === allValue) return;
      rows.push({ value: nextValue, label: optionLabel(option) });
    });
    return rows;
  }, [allLabel, allValue, options]);

  const selected = normalizedOptions.find((item) => item.value === value) || normalizedOptions[0];
  const filteredOptions = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((item) => normalizeForSearch(item.label).includes(q));
  }, [normalizedOptions, query]);

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    updateMenuPosition();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      const target = event.target;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnPageScroll = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('scroll', closeOnPageScroll, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('scroll', closeOnPageScroll, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [open]);

  const pick = (nextValue) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`min-w-0 ${className}`}>
      {label && (
        <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-[#2864d9]">
          {label}
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((next) => !next)}
        className="flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 text-left text-xs font-bold text-[#202534] shadow-sm hover:border-[#55dbe8] focus:outline-none focus:ring-2 focus:ring-[#55dbe8]/35"
        title={selected?.label}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label || allLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#69768c]" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[10000] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="border-b border-slate-100 bg-slate-50 p-1.5">
            <div className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs font-semibold text-slate-500">Không có kết quả</div>
            ) : (
              filteredOptions.map((item) => {
                const checked = item.value === value || (!value && item.value === allValue);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => pick(item.value)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-[#f1fbff] ${
                      checked ? 'text-[#2864d9]' : 'text-[#202534]'
                    }`}
                    title={item.label}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        checked ? 'border-[#2864d9] bg-[#2864d9] text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
