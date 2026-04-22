import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

/** Chuẩn hóa chuỗi để lọc gợi ý (không phân biệt hoa thường, bỏ dấu tiếng Việt). */
function normalizeForFilter(s) {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

const MultiSelect = ({
    label,
    options,
    selected,
    onChange,
    placeholder = 'Select...',
    mainFilter = false,
    /** Nút trigger thấp hơn — toolbar / header bảng chật chiều dọc */
    compact = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const wrapperRef = useRef(null);
    const menuRef = useRef(null);
    const buttonRef = useRef(null);
    const searchInputRef = useRef(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

    const ALL_OPTION = 'Tất cả';

    const filteredOptions = useMemo(() => {
        const q = normalizeForFilter(searchQuery.trim());
        if (!q) return options;
        return options.filter((o) => normalizeForFilter(o).includes(q));
    }, [options, searchQuery]);

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
        } else {
            requestAnimationFrame(() => searchInputRef.current?.focus());
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            const t = event.target;
            const inWrapper = wrapperRef.current?.contains(t);
            const inMenu = menuRef.current?.contains(t);
            if (!inWrapper && !inMenu) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    }, [isOpen]);

    const handleToggle = () => setIsOpen(!isOpen);

    const isAllSelected = selected.length === 0 || (selected.length === options.length && options.length > 0);
    const isNoneSelected = selected.length === 1 && selected[0] === '__NONE__';

    const handleOptionChange = (value) => {
        if (value === ALL_OPTION) {
            if (isAllSelected) {
                // If all selected, and user clicks "All" again, unselect everything
                onChange(['__NONE__']);
            } else {
                // If not all selected (some or none), click "All" to select everything
                onChange([]);
            }
        } else {
            let nextSelected = selected.filter(v => v !== '__NONE__');

            if (selected.length === 0) {
                // When "All" is active, clicking one option should deselect only that option.
                nextSelected = options.filter((item) => item !== value);
                if (nextSelected.length === 0) {
                    onChange(['__NONE__']);
                } else {
                    onChange(nextSelected);
                }
                return;
            } else {
                if (nextSelected.includes(value)) {
                    nextSelected = nextSelected.filter(item => item !== value);
                } else {
                    nextSelected.push(value);
                }
                
                if (nextSelected.length === 0) {
                    onChange(['__NONE__']);
                } else if (nextSelected.length === options.length && options.length > 0) {
                    // If everything was manually selected, clear filter to mean "All"
                    onChange([]);
                } else {
                    onChange(nextSelected);
                }
            }
        }
    };

    let displayText = placeholder;
    if (isAllSelected) {
        displayText = mainFilter ? placeholder : 'Tất cả';
    } else if (isNoneSelected) {
        displayText = 'Chọn lọc...';
    } else if (selected.length > 0) {
        if (selected.length === 1) displayText = selected[0];
        else displayText = `${selected.length} đã chọn`;
    } else {
        displayText = mainFilter ? placeholder : label;
    }

    return (
        <>
            <div className="relative w-full" ref={wrapperRef} style={{ margin: 0, padding: 0 }}>
                <button
                    ref={buttonRef}
                    onClick={handleToggle}
                    className={`w-full text-left border rounded bg-white overflow-hidden text-ellipsis whitespace-nowrap shadow-sm ${compact ? 'px-1.5 py-0.5 text-[11px] leading-tight' : 'px-2 py-1.5 text-sm'} ${mainFilter ? 'border-gray-300 min-w-[120px] text-gray-700' : 'border-gray-300 text-gray-500'
                        }`}
                    title={displayText}
                    style={
                        compact
                            ? { width: '100%', margin: 0, textAlign: 'left', fontSize: '11px', padding: '3px 6px', lineHeight: 1.25 }
                            : { width: '100%', margin: 0, textAlign: 'left', fontSize: '12px', padding: '6px 8px' }
                    }
                >
                    {displayText}
                </button>
            </div>

            {isOpen && createPortal(
                <div 
                    ref={menuRef}
                    className="fixed bg-white border border-gray-300 rounded shadow-lg w-64 max-h-72 flex flex-col overflow-hidden"
                    style={{ 
                        zIndex: 10000,
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width || 256}px`
                    }}
                >
                    <div className="shrink-0 border-b border-gray-200 p-2 bg-gray-50">
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Gõ để tìm..."
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div className="overflow-y-auto flex-1 min-h-0 max-h-[14rem]">
                    <div
                        className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-100 text-sm"
                        onClick={() => handleOptionChange(ALL_OPTION)}
                    >
                        <input
                            type="checkbox"
                            checked={isAllSelected}
                            readOnly
                            className="mr-2 h-[13px] w-[13px] text-primary focus:ring-primary border-gray-300 rounded"
                        />
                        <span className="font-bold">Tất cả</span>
                    </div>
                    {filteredOptions.length === 0 ? (
                        <div className="px-3 py-3 text-sm text-gray-500 text-center">Không có kết quả</div>
                    ) : (
                    filteredOptions.map((option, idx) => (
                        <div
                            key={`${option}-${idx}`}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-50 last:border-0 text-sm"
                            onClick={() => handleOptionChange(option)}
                        >
                            <input
                                type="checkbox"
                                checked={selected.length === 0 || selected.includes(option)}
                                readOnly
                                className="mr-2 h-[13px] w-[13px] text-primary focus:ring-primary border-gray-300 rounded"
                            />
                            <span className="text-gray-700">{option}</span>
                        </div>
                    ))
                    )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default MultiSelect;
