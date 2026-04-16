import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { normalizeMktReportDate } from '../utils/mktDetailReportKey';

/** Khớp dòng trên lưới báo cáo MKT — cùng `buildMktReportDedupeKey` (utils). */
const KEY_FIELDS = ['Ngày', 'Tên', 'ca', 'Sản_phẩm', 'Thị_trường'];

/** Cột Ngày: luôn chuẩn YYYY-MM-DD (cùng `<input type="date">` trên lưới chính). */
function mktQuickCellStoredValue(colName, raw) {
    if (colName !== 'Ngày') return String(raw ?? '');
    const s = String(raw ?? '').trim();
    if (!s) return '';
    return normalizeMktReportDate(s) || '';
}

const MktQuickAddModal = ({
    isOpen,
    onClose,
    onSync,
    columns = [],
    visibleColumns = {},
    /** User không đổi được cột Tên trên lưới — không bắt buộc nhập Tên trong modal (khớp theo tài khoản). */
    skipTenRequiredForKeyMatch = false,
}) => {
    const [rows, setRows] = useState([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [showColumnSettings, setShowColumnSettings] = useState(false);
    const [selection, setSelection] = useState(null);
    const isSelecting = useRef(false);
    const containerRef = useRef(null);
    const selectionRef = useRef(null);
    const fillDragRef = useRef({
        active: false,
        startRow: null,
        endRow: null,
        colIdx: null,
        value: ''
    });
    /** Tránh reset bảng mỗi lần cha re-render (vd. `visibleColumns={{}}` mới mỗi render) khi modal vẫn mở. */
    const wasOpenRef = useRef(false);

    const colCount = columns?.length ?? 0;
    const buildEmptyRow = useCallback(() => Array(colCount).fill(''), [colCount]);

    const visibleColIndices = useMemo(() => {
        if (!columns || columns.length === 0) return [];
        const indices = [];
        columns.forEach((col, idx) => {
            const mustShow = KEY_FIELDS.includes(col);
            if (mustShow || columnVisibility[col] !== false) indices.push(idx);
        });
        return indices;
    }, [columnVisibility, columns]);

    const visibleColumnsList = useMemo(
        () => visibleColIndices.map((idx) => columns[idx]),
        [visibleColIndices, columns]
    );

    const getActualColIdx = useCallback(
        (visibleColIdx) => visibleColIndices[visibleColIdx],
        [visibleColIndices]
    );

    useEffect(() => {
        if (!isOpen) {
            wasOpenRef.current = false;
            return;
        }
        const justOpened = !wasOpenRef.current;
        wasOpenRef.current = true;
        if (!justOpened) return;

        const nextVisibility = {};
        (columns || []).forEach((col) => {
            nextVisibility[col] = KEY_FIELDS.includes(col) ? true : visibleColumns[col] !== false;
        });
        setColumnVisibility(nextVisibility);
        setRows(Array(15).fill(null).map(() => buildEmptyRow()));
        setSelection(null);
        setShowColumnSettings(false);
        selectionRef.current = null;
        setTimeout(() => containerRef.current?.focus(), 100);
    }, [isOpen, visibleColumns, columns, buildEmptyRow]);

    // Keep selectionRef in sync with selection state
    useEffect(() => {
        selectionRef.current = selection;
    }, [selection]);

    // Mouse up listener
    useEffect(() => {
        const handleMouseUp = () => {
            isSelecting.current = false;
            const drag = fillDragRef.current;
            if (!drag.active || drag.startRow === null || drag.endRow === null || drag.colIdx === null) return;

            const from = Math.min(drag.startRow, drag.endRow);
            const to = Math.max(drag.startRow, drag.endRow);
            if (to === from) {
                fillDragRef.current = { active: false, startRow: null, endRow: null, colIdx: null, value: '' };
                return;
            }

            // Batch update một lần khi thả chuột để mượt hơn.
            setRows((prev) => {
                const next = prev.map((r) => [...r]);
                while (next.length <= to) {
                    next.push(buildEmptyRow());
                }
                const actualColIdx = getActualColIdx(drag.colIdx);
                if (actualColIdx == null) return next;
                const colName = columns[actualColIdx];
                const fillVal = mktQuickCellStoredValue(colName, drag.value);
                for (let r = from + 1; r <= to; r++) {
                    next[r][actualColIdx] = fillVal;
                }
                return next;
            });

            setSelection({
                startRow: from,
                endRow: to,
                startCol: drag.colIdx,
                endCol: drag.colIdx
            });
            fillDragRef.current = { active: false, startRow: null, endRow: null, colIdx: null, value: '' };
        };
        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [getActualColIdx, buildEmptyRow, columns]);

    // Check if a cell is selected
    const isSelected = (rIdx, cIdx) => {
        if (!selection) return false;
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);
        return rIdx >= minR && rIdx <= maxR && cIdx >= minC && cIdx <= maxC;
    };

    // Get selected data for copy
    const getSelectedData = () => {
        if (!selection) return '';
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);

        const selectedRows = [];
        for (let r = minR; r <= maxR; r++) {
            const rowData = [];
            for (let c = minC; c <= maxC; c++) {
                const actualColIdx = getActualColIdx(c);
                rowData.push(actualColIdx == null ? '' : (rows[r]?.[actualColIdx] || ''));
            }
            selectedRows.push(rowData.join('\t'));
        }
        return selectedRows.join('\n');
    };

    // Selection handlers - giống bảng chính
    const handleMouseDown = (rowIdx, colIdx, e) => {
        if (e.button !== 0) return;
        const target = e.target;
        // Không prevent default nếu click vào input, select, hoặc các phần tử tương tác
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'OPTION' || target.closest('input') || target.closest('select')) {
            return;
        }
        e.preventDefault();
        isSelecting.current = true;
        setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    };

    const handleMouseEnter = (rowIdx, colIdx) => {
        if (fillDragRef.current.active) {
            // Fill handle: chỉ kéo theo chiều dọc trong cùng một cột.
            if (colIdx === fillDragRef.current.colIdx) {
                fillDragRef.current.endRow = rowIdx;
                setSelection({
                    startRow: fillDragRef.current.startRow,
                    endRow: rowIdx,
                    startCol: colIdx,
                    endCol: colIdx
                });
            }
            return;
        }
        if (isSelecting.current) {
            setSelection(prev => {
                if (!prev) return null;
                const newSelection = { ...prev, endRow: rowIdx, endCol: colIdx };
                return newSelection;
            });
        }
    };

    const handleCellChange = (rowIdx, actualColIdx, value) => {
        const colName = actualColIdx != null ? columns[actualColIdx] : '';
        const stored = colName ? mktQuickCellStoredValue(colName, value) : String(value ?? '');
        setRows((prev) => {
            const newRows = prev.map((r) => [...r]);
            while (newRows.length <= rowIdx) {
                newRows.push(buildEmptyRow());
            }
            if (actualColIdx != null) newRows[rowIdx][actualColIdx] = stored;
            return newRows;
        });
    };

    // Handle copy (Ctrl+C)
    const handleCopy = (e) => {
        if (!selection) return;
        e.preventDefault();
        const data = getSelectedData();
        e.clipboardData.setData('text/plain', data);
    };

    // Paste: cột j trong clipboard → ô (startCol + j) trên lưới *cột đang hiển thị* (bỏ qua cột đã ẩn), rồi map sang chỉ số đầy đủ qua visibleColIndices.
    const handlePaste = useCallback((e, rowIdx = null, colIdx = null) => {
        e.preventDefault();
        e.stopPropagation();

        const clipboardData = e.clipboardData.getData('text');
        if (clipboardData == null) return;

        const normalized = String(clipboardData).replace(/\r\n/g, '\n');
        if (normalized.length === 0) return;
        const pastedRows = normalized.split('\n').map((line) => line.split('\t'));
        if (pastedRows.length === 0) return;

        const currentSelection = selectionRef.current;

        let startRow;
        let startCol;
        if (rowIdx !== null && colIdx !== null) {
            startRow = rowIdx;
            startCol = colIdx;
        } else if (currentSelection && currentSelection.startRow !== undefined && currentSelection.startCol !== undefined) {
            startRow = Math.min(currentSelection.startRow, currentSelection.endRow);
            startCol = Math.min(currentSelection.startCol, currentSelection.endCol);
        } else {
            startRow = 0;
            startCol = 0;
        }

        /** Cột bắt đầu là chỉ số trên lưới *đang hiển thị* (không phải chỉ số mảng đầy đủ). */
        if (startCol < 0 || startCol >= visibleColIndices.length) return;

        const pasteH = pastedRows.length;
        const maxLineLen = Math.max(...pastedRows.map((r) => r.length), 0);

        setRows((prev) => {
            const newRows = prev.map((r) => [...r]);
            const neededRows = startRow + pasteH;
            while (newRows.length < neededRows) {
                newRows.push(buildEmptyRow());
            }

            for (let i = 0; i < pastedRows.length; i++) {
                const targetRow = startRow + i;
                const line = pastedRows[i] || [];
                for (let j = 0; j < line.length; j++) {
                    const visibleIdx = startCol + j;
                    if (visibleIdx < 0 || visibleIdx >= visibleColIndices.length) continue;
                    const actualColIdx = visibleColIndices[visibleIdx];
                    if (actualColIdx == null || actualColIdx < 0 || actualColIdx >= columns.length) continue;
                    const cname = columns[actualColIdx];
                    newRows[targetRow][actualColIdx] = mktQuickCellStoredValue(cname, line[j]);
                }
            }
            return newRows;
        });

        const endRow = startRow + pasteH - 1;
        const endCol = Math.min(
            startCol + Math.max(0, maxLineLen - 1),
            Math.max(0, visibleColIndices.length - 1)
        );

        const newSelection = { startRow, startCol, endRow, endCol };
        setSelection(newSelection);
        selectionRef.current = newSelection;
    }, [visibleColIndices, columns, buildEmptyRow]);

    // Handle keyboard
    const handleKeyDown = (e) => {
        if (!selection) return;

        // Delete / Backspace: xóa cả vùng chọn trên mọi cột — kể cả khi focus đang trong input (trước đây chỉ xóa được khi focus ở vùng bảng).
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const minR = Math.min(selection.startRow, selection.endRow);
            const maxR = Math.max(selection.startRow, selection.endRow);
            const minC = Math.min(selection.startCol, selection.endCol);
            const maxC = Math.max(selection.startCol, selection.endCol);
            const isMultiCell = minR !== maxR || minC !== maxC;

            const target = e.target;
            if (!isMultiCell && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) {
                return;
            }

            e.preventDefault();
            setRows(prev => {
                const newRows = prev.map(r => [...r]);
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        const actualColIdx = getActualColIdx(c);
                        if (newRows[r] && actualColIdx != null) newRows[r][actualColIdx] = '';
                    }
                }
                return newRows;
            });
            return;
        }

        const { endRow, endCol } = selection;
        let newRow = endRow;
        let newCol = endCol;

        if (e.key === 'ArrowUp' && endRow > 0) newRow = endRow - 1;
        if (e.key === 'ArrowDown' && endRow < rows.length - 1) newRow = endRow + 1;
        if (e.key === 'ArrowLeft' && endCol > 0) newCol = endCol - 1;
        if (e.key === 'ArrowRight' && endCol < visibleColIndices.length - 1) newCol = endCol + 1;

        if (newRow !== endRow || newCol !== endCol) {
            e.preventDefault();
            if (e.shiftKey) {
                setSelection(prev => prev ? { ...prev, endRow: newRow, endCol: newCol } : null);
            } else {
                setSelection({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
            }
        }
    };

    const calculatedSummary = useMemo(() => {
        if (!selection) return null;

        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);

        let count = 0;
        let sum = 0;
        let numericCount = 0;

        for (let r = minR; r <= maxR && r < rows.length; r++) {
            for (let c = minC; c <= maxC && c < visibleColIndices.length; c++) {
                const actualColIdx = getActualColIdx(c);
                if (actualColIdx == null) continue;
                count++;
                const val = rows[r][actualColIdx];
                if (val && val.trim() !== "") {
                    const numVal = parseFloat(String(val).replace(/[^\d.-]/g, ''));
                    if (!isNaN(numVal)) {
                        sum += numVal;
                        numericCount++;
                    }
                }
            }
        }

        return {
            count,
            sum: numericCount > 0 ? sum : 0,
            avg: numericCount > 0 ? sum / numericCount : 0
        };
    }, [selection, rows, getActualColIdx, visibleColIndices.length]);

    const handleSyncClick = () => {
        if (!columns || columns.length === 0) return;

        const activeColumns = visibleColIndices.filter((idx) => idx >= 0).map((idx) => columns[idx]);

        const working = rows.map((r) => {
            const copy = [...r];
            while (copy.length < columns.length) copy.push('');
            return copy;
        });

        const hasAllKeys = (r) =>
            KEY_FIELDS.every((k) => {
                const i = columns.indexOf(k);
                if (i < 0) return false;
                if (k === 'Tên' && skipTenRequiredForKeyMatch) return true;
                return String(r[i] ?? '').trim() !== '';
            });

        const validRows = working.filter((r) => r.length > 0 && hasAllKeys(r));
        if (validRows.length === 0) {
            alert(`Chưa có dòng hợp lệ. Cần đủ các cột khớp dòng: ${KEY_FIELDS.join(', ')}.`);
            return;
        }
        setRows(working);
        onSync(validRows, { activeColumns });
        onClose();
    };

    const addMoreRows = () => {
        setRows((prev) => [...prev, ...Array(5).fill(null).map(() => buildEmptyRow())]);
    };

    // Get cell class - giống bảng chính
    const getCellClass = (col, rIdx, cIdx) => {
        let classes = "px-3 py-2.5 border-r border-b border-gray-200 text-sm h-[42px] whitespace-nowrap transition-all duration-150 relative ";

        // Editable cell style
        classes += "bg-white border-l-4 border-l-emerald-400 hover:bg-emerald-50/30 hover:border-l-emerald-500 ";

        // Selection 
        if (isSelected(rIdx, cIdx)) {
            classes += "!bg-[#e3f2fd] ";
            
            const minR = Math.min(selection.startRow, selection.endRow);
            const maxR = Math.max(selection.startRow, selection.endRow);
            const minC = Math.min(selection.startCol, selection.endCol);
            const maxC = Math.max(selection.startCol, selection.endCol);

            if (rIdx === minR) classes += 'selection-border-top ';
            if (rIdx === maxR) classes += 'selection-border-bottom ';
            if (cIdx === minC) classes += 'selection-border-left ';
            if (cIdx === maxC) classes += 'selection-border-right ';
        }

        return classes;
    };

    const isFillHandleCell = (rIdx, cIdx) => {
        if (!selection) return false;
        const maxR = Math.max(selection.startRow, selection.endRow);
        const maxC = Math.max(selection.startCol, selection.endCol);
        const minR = Math.min(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        return minR === maxR && minC === maxC && rIdx === maxR && cIdx === maxC;
    };

    const renderCell = (col, rowIdx, colIdx, value) => {
        const actualColIdx = getActualColIdx(colIdx);
        if (actualColIdx == null) return null;
        const isKey = KEY_FIELDS.includes(col);

        if (col === 'Ngày') {
            const dateVal = normalizeMktReportDate(value) || '';
            return (
                <input
                    type="date"
                    value={dateVal}
                    onChange={(e) => handleCellChange(rowIdx, actualColIdx, e.target.value)}
                    onPaste={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const t = e.clipboardData.getData('text');
                        handleCellChange(rowIdx, actualColIdx, t);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onFocus={(e) => {
                        e.stopPropagation();
                        setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
                    }}
                    className="w-full min-h-[2rem] outline-none bg-transparent border-none p-0 text-sm font-medium text-gray-700"
                    title="Định dạng hệ thống: YYYY-MM-DD"
                />
            );
        }

        return (
            <input
                type="text"
                value={value}
                onChange={(e) => handleCellChange(rowIdx, actualColIdx, e.target.value)}
                onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => {
                    e.stopPropagation();
                    setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
                }}
                className="w-full h-full outline-none bg-transparent border-none p-0 text-sm font-medium text-gray-700 placeholder:text-gray-400"
                placeholder={isKey ? 'Bắt buộc để khớp dòng…' : ''}
            />
        );
    };

    const rowHasValidMatchKey = useCallback(
        (r) => {
            if (!columns || columns.length === 0) return false;
            return KEY_FIELDS.every((k) => {
                const i = columns.indexOf(k);
                if (i < 0) return false;
                if (k === 'Tên' && skipTenRequiredForKeyMatch) return true;
                return String(r[i] ?? '').trim() !== '';
            });
        },
        [columns, skipTenRequiredForKeyMatch]
    );

    const validSyncRowCount = useMemo(
        () => rows.filter((r) => r.length > 0 && rowHasValidMatchKey(r)).length,
        [rows, rowHasValidMatchKey]
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1060] flex justify-center items-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col border border-gray-200 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header compact để ưu tiên diện tích bảng */}
                <div className="flex justify-between items-start px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-md flex items-center justify-center shadow-sm">
                                <span className="text-white text-base font-bold">⚡</span>
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-gray-800 leading-tight">Điền nhanh báo cáo MKT</h4>
                                <p className="text-[11px] text-gray-500 mt-0">Cùng tên cột với lưới báo cáo — khớp dòng theo Ngày, Tên, ca, Sản_phẩm, Thị_trường</p>
                            </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600">
                            <span>Ctrl+V: paste Excel</span>
                            <span>Ctrl+C: copy vùng chọn</span>
                            <span>Delete / Backspace: xóa vùng đã bôi đen</span>
                            <span className="text-blue-600">Kéo góc ô để sao chép xuống</span>
                        </div>
                        <p className="mt-1.5 text-[11px] text-gray-600 max-w-3xl leading-snug">
                            Khi <strong>Đồng bộ</strong>: chỉ các cột đang bật (⚙ Cài đặt cột) mới áp vào lưới nhập; ô trống = bỏ qua (không xóa dữ liệu cũ).
                            Các cột khớp dòng (<strong>Ngày, Tên, ca, Sản_phẩm, Thị_trường</strong>) luôn hiện — dùng để tìm đúng dòng trên lưới (cùng quy tắc trùng dòng với hệ thống).
                            <span className="block mt-0.5 text-indigo-700/90">Cột <strong>Ngày</strong>: định dạng hệ thống <strong>YYYY-MM-DD</strong> (ô chọn ngày; dán từ Excel sẽ tự chuẩn hoá).</span>
                        </p>
                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => setShowColumnSettings((p) => !p)}
                                className="px-2.5 py-1 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold"
                            >
                                ⚙️ Cài đặt cột hiển thị
                            </button>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="ml-3 w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white/80 rounded-md transition-all duration-200 text-lg font-light"
                        aria-label="Đóng"
                    >
                        ×
                    </button>
                </div>

                <div
                    className="p-0 overflow-auto flex-1 relative bg-gradient-to-br from-gray-50 to-white min-h-[400px] select-none"
                    ref={containerRef}
                    tabIndex={0}
                    data-quick-add-modal="true"
                    onPaste={(e) => {
                        handlePaste(e);
                    }}
                    onCopy={handleCopy}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => {
                        // Đảm bảo container có focus khi click vào cell (không phải input)
                        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
                            containerRef.current?.focus();
                        }
                    }}
                    style={{ outline: 'none' }}
                >
                    {showColumnSettings && (
                        <div className="sticky top-0 z-40 bg-white/95 border-b border-indigo-100 px-3 py-2">
                            <div className="flex flex-wrap gap-2">
                                {columns.map((col) => {
                                    const isKey = KEY_FIELDS.includes(col);
                                    const checked = isKey ? true : columnVisibility[col] !== false;
                                    return (
                                        <label key={col} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-gray-200 bg-white">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                disabled={isKey}
                                                onChange={(e) => {
                                                    if (isKey) return;
                                                    const isChecked = e.target.checked;
                                                    setColumnVisibility((prev) => ({ ...prev, [col]: isChecked }));
                                                    setSelection(null);
                                                    selectionRef.current = null;
                                                }}
                                            />
                                            <span>{col}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    <table
                        className="w-full border-collapse text-sm"
                        style={{ minWidth: Math.max(1200, (columns?.length || 0) * 110) }}
                    >
                        <thead className="sticky top-0 z-30 shadow-sm">
                            <tr className="bg-gradient-to-r from-gray-800 to-gray-700 h-12">
                                <th className="p-3 border-b-2 border-r border-gray-600 min-w-[60px] font-bold text-white text-center">
                                    <div className="flex items-center justify-center">
                                        <span className="text-xs">#</span>
                                    </div>
                                </th>
                                {visibleColumnsList.map((col) => (
                                    <th key={col} className="p-3 border-b-2 border-r border-gray-600 text-left min-w-[120px]">
                                        <div className="font-bold text-white flex items-center gap-1.5">
                                            <span>{col}</span>
                                            {KEY_FIELDS.includes(col) && <span className="text-red-400 text-xs">*</span>}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-blue-50/50 transition-colors border-b border-gray-100 group">
                                    <td className="px-3 py-3 border-r border-gray-200 text-center text-gray-500 text-xs font-medium bg-gray-50/80 group-hover:bg-gray-100/80 transition-colors">
                                        <div className="flex items-center justify-center">
                                            <span className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-200 group-hover:border-blue-300 group-hover:bg-blue-50 transition-colors">
                                                {rIdx + 1}
                                            </span>
                                        </div>
                                    </td>
                                    {visibleColumnsList.map((col, cIdx) => {
                                        const actualColIdx = visibleColIndices[cIdx];
                                        return (
                                        <td
                                            key={`${rIdx}-${col}`}
                                            className={getCellClass(col, rIdx, cIdx)}
                                            onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
                                            onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                                        >
                                            {renderCell(col, rIdx, cIdx, row[actualColIdx] || "")}
                                            {isFillHandleCell(rIdx, cIdx) && (
                                                <div
                                                    title="Kéo để sao chép xuống"
                                                    className="absolute right-0 bottom-0 w-2.5 h-2.5 bg-blue-600 border border-white rounded-sm cursor-ns-resize shadow-sm"
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        fillDragRef.current = {
                                                            active: true,
                                                            startRow: rIdx,
                                                            endRow: rIdx,
                                                            colIdx: cIdx,
                                                            value: row[actualColIdx] || ''
                                                        };
                                                    }}
                                                />
                                            )}
                                        </td>
                                    )})}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Bộ đếm số lượng ô được chọn */}
                    {calculatedSummary && calculatedSummary.count > 1 && (
                        <div className="absolute bottom-4 right-4 z-50 bg-[#1a73e8] text-white px-4 py-2 rounded-lg shadow-xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] opacity-80 uppercase tracking-tighter">Số ô</span>
                                <span className="font-bold text-sm tracking-tight">{calculatedSummary.count}</span>
                            </div>
                            {calculatedSummary.sum !== 0 && (
                                <>
                                    <div className="w-px h-6 bg-white/30"></div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] opacity-80 uppercase tracking-tighter">Tổng</span>
                                        <span className="font-bold text-sm tracking-tight">{calculatedSummary.sum.toLocaleString('vi-VN')}</span>
                                    </div>
                                    <div className="w-px h-6 bg-white/30"></div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] opacity-80 uppercase tracking-tighter">Trung bình</span>
                                        <span className="font-bold text-sm tracking-tight">{calculatedSummary.avg.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-gray-200 flex justify-between items-center bg-gradient-to-r from-gray-50 to-white">
                    <button
                        onClick={addMoreRows}
                        className="px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all duration-200 flex items-center gap-2 border border-indigo-200 hover:border-indigo-300"
                    >
                        <span className="text-lg">+</span>
                        <span>Thêm 5 hàng</span>
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setRows(Array(15).fill(null).map(() => buildEmptyRow()))}
                            className="px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow"
                        >
                            Xóa bảng
                        </button>
                        <button
                            onClick={handleSyncClick}
                            className="px-6 py-2.5 text-white font-bold rounded-lg transition-all duration-200 shadow-md flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg"
                        >
                            <span>🔄</span>
                            <span>Đồng bộ</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                                {validSyncRowCount}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MktQuickAddModal;
