import React, { useState, useRef, useEffect } from 'react';

const MultiSelect = ({
    label,
    options,
    selected,
    onChange,
    placeholder = 'Select...',
    mainFilter = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const ALL_OPTION = 'Tất cả';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => setIsOpen(!isOpen);

    const handleOptionChange = (value) => {
        if (value === ALL_OPTION) {
            if (selected.length === options.length) {
                onChange([]);
            } else {
                onChange([...options]);
            }
        } else {
            if (selected.includes(value)) {
                onChange(selected.filter(item => item !== value));
            } else {
                onChange([...selected, value]);
            }
        }
    };

    const isAllSelected = selected.length === options.length && options.length > 0;

    let displayText = placeholder;
    if (selected.length === options.length && options.length > 0) {
        displayText = mainFilter ? placeholder : 'Tất cả'; // For table filters, show "Filter [Col]" usually
    } else if (selected.length > 0) {
        if (selected.length === 1) displayText = selected[0];
        else displayText = `${selected.length} đã chọn`;
    } else {
        displayText = mainFilter ? placeholder : label;
    }

    return (
        <div className={`relative ${mainFilter ? 'w-full' : 'w-full'}`} ref={dropdownRef}>
            <button
                onClick={handleToggle}
                className={`w-full text-left px-2 py-1.5 border rounded text-sm bg-white overflow-hidden text-ellipsis whitespace-nowrap ${mainFilter ? 'border-gray-300 min-w-[180px] text-gray-700' : 'border-gray-300 text-gray-500 text-xs py-1'
                    }`}
                title={displayText}
            >
                {displayText}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-[100] w-64 max-h-72 overflow-y-auto">
                    <div
                        className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-100 text-sm"
                        onClick={() => handleOptionChange(ALL_OPTION)}
                    >
                        <input
                            type="checkbox"
                            checked={isAllSelected}
                            readOnly
                            className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        />
                        <span className="font-bold">Tất cả</span>
                    </div>
                    {options.map((option, idx) => (
                        <div
                            key={idx}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center border-b border-gray-50 last:border-0 text-sm"
                            onClick={() => handleOptionChange(option)}
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(option)}
                                readOnly
                                className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                            />
                            <span className="text-gray-700">{option}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiSelect;
