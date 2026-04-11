import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Dropdown sản phẩm MKT: mở danh sách cuộn được + ô tìm kiếm phía trên.
 * Dùng Portal (Radix) để không bị cắt bởi overflow của lưới báo cáo.
 */
export function MktSearchableProductSelect({
  value,
  onChange,
  options,
  className = '',
  emptyLabel = '-- Chọn sản phẩm --',
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  const list = useMemo(() => {
    const base = Array.isArray(options) ? [...options] : [];
    const cur = String(value || '').trim();
    if (cur && !base.includes(cur)) base.unshift(cur);
    return base;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => String(p).toLowerCase().includes(q));
  }, [list, search]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const display = String(value || '').trim() || emptyLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'box-border flex w-full max-w-full items-center justify-between gap-1 px-2 py-1.5 text-left text-xs border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-600',
            className
          )}
          title="Mở danh sách — tìm SP phía trên, kéo xuống xem hết"
        >
          <span className={cn('min-w-0 flex-1 truncate', !String(value || '').trim() && 'text-gray-400')}>
            {display}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1rem,24rem)] p-0 border border-gray-300 bg-white shadow-lg z-[300]"
      >
        <div className="border-b border-gray-200 p-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Tìm SP…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1">
          <button
            type="button"
            className="w-full rounded px-2 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {emptyLabel}
          </button>
          {filtered.map((p) => {
            const sel = String(value || '').trim() === p;
            return (
              <button
                key={p}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-1 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100',
                  sel && 'bg-blue-50 text-blue-800'
                )}
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 break-words">{p}</span>
                {sel ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" /> : null}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-gray-500">Không tìm thấy</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
