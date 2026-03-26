import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { DROPDOWN_OPTIONS } from '../types';
import { FFM_QUICK_ADD_COLUMNS } from '../types';

// Helper function để format date thành dd/mm/yyyy
const formatDateToDDMMYYYY = (dateValue) => {
    if (!dateValue) return '';
    
    // Nếu là string dd/mm/yyyy, giữ nguyên
    if (typeof dateValue === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateValue.trim())) {
        return dateValue.trim();
    }
    
    // Nếu là Date object hoặc string có thể parse
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        // Ignore
    }
    
    // Nếu là format khác (yyyy-mm-dd), convert
    if (typeof dateValue === 'string') {
        const parts = dateValue.split(/[-\/]/);
        if (parts.length === 3) {
            // Nếu là yyyy-mm-dd hoặc yyyy/mm/dd
            if (parts[0].length === 4) {
                return `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            // Nếu là dd-mm-yyyy hoặc dd/mm/yyyy
            return `${parts[0]}/${parts[1]}/${parts[2]}`;
        }
    }
    
    return dateValue;
};

// Helper function để parse date từ nhiều format
const parseDateValue = (value) => {
    if (!value || value.trim() === '') return '';
    
    const trimmed = value.trim();
    
    // Nếu đã là dd/mm/yyyy, giữ nguyên
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
        return trimmed;
    }
    
    // Thử parse các format khác
    try {
        // Format yyyy-mm-dd
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const parts = trimmed.split('-');
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        
        // Format dd-mm-yyyy
        if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
            return trimmed.replace(/-/g, '/');
        }
        
        // Thử parse như Date object
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        // Ignore
    }
    
    return trimmed;
};

// Các cột cho bảng Thêm nhanh - đồng bộ với bảng chính
const COLUMNS = FFM_QUICK_ADD_COLUMNS;
const TRACKING_COL_INDEX = COLUMNS.indexOf("Mã Tracking");
const NGAY_DONG_HANG_COL_INDEX = COLUMNS.indexOf("Ngày đóng hàng");

/** Hôm nay theo giờ local, định dạng dd/mm/yyyy (đồng bộ ô Ngày đóng hàng). */
const getTodayDDMMYYYY = () => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

/** Cùng quy tắc với FFM handleQuickSync — khớp đúng dòng theo Mã đơn hàng trong bảng chính. */
const normOrderId = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

const QuickAddModal = ({ isOpen, onClose, onSync, existingTrackingOwnerMap = {} }) => {
    const [rows, setRows] = useState([]);
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

    useEffect(() => {
        if (isOpen) {
            setRows(Array(15).fill(null).map(() => Array(COLUMNS.length).fill("")));
            setSelection(null);
            selectionRef.current = null;
            setTimeout(() => containerRef.current?.focus(), 100);
        }
    }, [isOpen]);

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
                    next.push(Array(COLUMNS.length).fill(""));
                }
                for (let r = from + 1; r <= to; r++) {
                    next[r][drag.colIdx] = drag.value;
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
    }, []);

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
                rowData.push(rows[r]?.[c] || '');
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
                console.log('🖱️ [MouseEnter] Update selection:', newSelection);
                return newSelection;
            });
        }
    };

    const handleCellChange = (rowIdx, colIdx, value) => {
        setRows(prev => {
            const newRows = prev.map(r => [...r]);
            while (newRows.length <= rowIdx) {
                newRows.push(Array(COLUMNS.length).fill(""));
            }
            newRows[rowIdx][colIdx] = value;
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

    // Handle paste (Ctrl+V) - xử lý paste từ container hoặc input
    const handlePaste = useCallback((e, rowIdx = null, colIdx = null) => {
        e.preventDefault();
        e.stopPropagation();

        const clipboardData = e.clipboardData.getData('text');
        if (!clipboardData || !clipboardData.trim()) return;

        // Parse dữ liệu paste
        const pastedRows = clipboardData.trim().split(/\r\n|\n/).filter(row => row.trim()).map(row => row.split('\t'));
        if (pastedRows.length === 0) return;
        
        // Lấy selection hiện tại từ ref (luôn có giá trị mới nhất)
        const currentSelection = selectionRef.current;
        
        // Debug: log selection hiện tại
        console.log('🔍 [Paste] Current Selection:', currentSelection, 'rowIdx:', rowIdx, 'colIdx:', colIdx);
        
        // Xác định điểm bắt đầu paste và vùng đã chọn
        let startRow, startCol, endRow, endCol;
        
        if (rowIdx !== null && colIdx !== null) {
            // Paste từ input cụ thể - dùng vị trí input
            startRow = rowIdx;
            startCol = colIdx;
            endRow = rowIdx + pastedRows.length - 1;
            endCol = Math.min(colIdx + (pastedRows[0]?.length || 1) - 1, COLUMNS.length - 1);
        } else if (currentSelection && currentSelection.startRow !== undefined && currentSelection.startCol !== undefined) {
            // Paste từ container - dùng selection hiện tại
            startRow = Math.min(currentSelection.startRow, currentSelection.endRow);
            startCol = Math.min(currentSelection.startCol, currentSelection.endCol);
            endRow = Math.max(currentSelection.startRow, currentSelection.endRow);
            endCol = Math.max(currentSelection.startCol, currentSelection.endCol);
            
            // Tính số hàng và cột đã chọn
            const selectedRowCount = endRow - startRow + 1;
            const selectedColCount = endCol - startCol + 1;
            const totalSelectedCells = selectedRowCount * selectedColCount;
            
            // Flatten dữ liệu paste thành mảng 1 chiều
            const flatPastedData = [];
            for (let i = 0; i < pastedRows.length; i++) {
                for (let j = 0; j < (pastedRows[i]?.length || 0); j++) {
                    flatPastedData.push(pastedRows[i][j] || '');
                }
            }
            
            // Số giá trị sẽ điền = min(số ô đã chọn, số giá trị paste)
            const valuesToFill = Math.min(totalSelectedCells, flatPastedData.length);
            
            console.log('📋 Paste vào selection:', { 
                startRow, startCol, endRow, endCol,
                selectedRowCount, selectedColCount, totalSelectedCells,
                pastedRows: pastedRows.length, 
                pastedCols: pastedRows[0]?.length,
                flatPastedData: flatPastedData.length,
                valuesToFill
            });

            // Paste dữ liệu vào TẤT CẢ các ô đã chọn (theo thứ tự từ trái sang phải, trên xuống dưới)
            setRows(prev => {
                const newRows = prev.map(r => [...r]);
                const neededRows = endRow + 1;
                while (newRows.length < neededRows) {
                    newRows.push(Array(COLUMNS.length).fill(""));
                }

                // Điền dữ liệu vào các ô đã chọn theo thứ tự
                let dataIndex = 0;
                for (let r = startRow; r <= endRow && dataIndex < valuesToFill; r++) {
                    for (let c = startCol; c <= endCol && dataIndex < valuesToFill; c++) {
                        if (c < COLUMNS.length) {
                            const colName = COLUMNS[c];
                            let value = flatPastedData[dataIndex] || '';
                            
                            // Xử lý format date cho các cột ngày
                            if (colName === 'Ngày đóng hàng' || colName === 'Thời gian giao dự kiến') {
                                value = parseDateValue(value);
                            }
                            
                            newRows[r][c] = value;
                            dataIndex++;
                        }
                    }
                }
                return newRows;
            });
            
            // Giữ nguyên selection sau khi paste
            const finalSelection = { startRow, startCol, endRow, endCol };
            setSelection(finalSelection);
            return;
        } else {
            // Fallback: paste vào ô đầu tiên
            startRow = 0;
            startCol = 0;
            endRow = startRow + pastedRows.length - 1;
            endCol = Math.min(startCol + (pastedRows[0]?.length || 1) - 1, COLUMNS.length - 1);
        }

        console.log('📋 Paste:', { startRow, startCol, pastedRows: pastedRows.length });

        // Paste dữ liệu (không có selection)
        setRows(prev => {
            const newRows = prev.map(r => [...r]);
            const neededRows = startRow + pastedRows.length;
            while (newRows.length < neededRows) {
                newRows.push(Array(COLUMNS.length).fill(""));
            }

            for (let i = 0; i < pastedRows.length; i++) {
                const targetRow = startRow + i;
                for (let j = 0; j < pastedRows[i].length; j++) {
                    const targetCol = startCol + j;
                    if (targetCol < COLUMNS.length) {
                        const colName = COLUMNS[targetCol];
                        let value = pastedRows[i][j] || '';
                        
                        // Xử lý format date cho các cột ngày
                        if (colName === 'Ngày đóng hàng' || colName === 'Thời gian giao dự kiến') {
                            value = parseDateValue(value);
                        }
                        
                        newRows[targetRow][targetCol] = value;
                    }
                }
            }
            return newRows;
        });
        
        // Cập nhật selection sau khi paste
        const newSelection = { startRow, startCol, endRow, endCol };
        setSelection(newSelection);
        selectionRef.current = newSelection;
    }, []);

    // Handle keyboard
    const handleKeyDown = (e) => {
        if (!selection) return;

        const { endRow, endCol } = selection;
        let newRow = endRow;
        let newCol = endCol;

        if (e.key === 'ArrowUp' && endRow > 0) newRow = endRow - 1;
        if (e.key === 'ArrowDown' && endRow < rows.length - 1) newRow = endRow + 1;
        if (e.key === 'ArrowLeft' && endCol > 0) newCol = endCol - 1;
        if (e.key === 'ArrowRight' && endCol < COLUMNS.length - 1) newCol = endCol + 1;

        if (newRow !== endRow || newCol !== endCol) {
            e.preventDefault();
            if (e.shiftKey) {
                setSelection(prev => prev ? { ...prev, endRow: newRow, endCol: newCol } : null);
            } else {
                setSelection({ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol });
            }
        }

        // Delete to clear
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;

            e.preventDefault();
            const minR = Math.min(selection.startRow, selection.endRow);
            const maxR = Math.max(selection.startRow, selection.endRow);
            const minC = Math.min(selection.startCol, selection.endCol);
            const maxC = Math.max(selection.startCol, selection.endCol);

            setRows(prev => {
                const newRows = prev.map(r => [...r]);
                for (let r = minR; r <= maxR; r++) {
                    for (let c = minC; c <= maxC; c++) {
                        if (newRows[r]) newRows[r][c] = '';
                    }
                }
                return newRows;
            });
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
            for (let c = minC; c <= maxC && c < COLUMNS.length; c++) {
                count++;
                const val = rows[r][c];
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
    }, [selection, rows]);

    const duplicateTrackingState = useMemo(() => {
        const duplicateCells = new Set();
        const duplicatedCodes = new Set();
        const localTrackingRows = new Map();
        const orderCodeIndex = 0;

        rows.forEach((row, rowIdx) => {
            const orderCode = String(row?.[orderCodeIndex] || '').trim();
            const trackingCode = String(row?.[TRACKING_COL_INDEX] || '').trim();
            if (!orderCode || !trackingCode) return;

            const normalizedTracking = trackingCode.toLowerCase();
            const ownerFromData = String(existingTrackingOwnerMap[normalizedTracking] || '').trim();
            if (ownerFromData && ownerFromData !== orderCode) {
                duplicateCells.add(`${rowIdx}-${TRACKING_COL_INDEX}`);
                duplicatedCodes.add(trackingCode);
            }

            if (!localTrackingRows.has(normalizedTracking)) {
                localTrackingRows.set(normalizedTracking, [{ rowIdx, orderCode, trackingCode }]);
            } else {
                localTrackingRows.get(normalizedTracking).push({ rowIdx, orderCode, trackingCode });
            }
        });

        localTrackingRows.forEach((items) => {
            const uniqueOrderIds = new Set(items.map((it) => it.orderCode));
            if (uniqueOrderIds.size > 1) {
                items.forEach((it) => duplicateCells.add(`${it.rowIdx}-${TRACKING_COL_INDEX}`));
                duplicatedCodes.add(items[0].trackingCode);
            }
        });

        return {
            duplicateCells,
            hasDuplicate: duplicateCells.size > 0,
            duplicatedCodes: Array.from(duplicatedCodes),
        };
    }, [rows, existingTrackingOwnerMap]);

    const handleSyncClick = () => {
        if (duplicateTrackingState.hasDuplicate) return;

        const todayStr = getTodayDDMMYYYY();
        const working = rows.map((r) => {
            const copy = [...r];
            while (copy.length < COLUMNS.length) copy.push("");
            const orderCode = normOrderId(copy[0]);
            const tracking = normOrderId(copy[TRACKING_COL_INDEX]);
            const ngay = normOrderId(copy[NGAY_DONG_HANG_COL_INDEX]);
            // Chỉ điền today trên đúng dòng (mã đơn + tracking + chưa có ngày đóng hàng)
            if (orderCode && tracking && !ngay) {
                copy[NGAY_DONG_HANG_COL_INDEX] = todayStr;
            }
            return copy;
        });

        const validRows = working.filter((r) => r.length > 0 && r[0] && r[0].trim() !== "");
        if (validRows.length === 0) {
            alert("Chưa có dữ liệu hợp lệ (Cần có Mã đơn hàng)");
            return;
        }
        setRows(working);
        onSync(validRows);
        onClose();
    };


    const addMoreRows = () => {
        setRows(prev => [...prev, ...Array(5).fill(null).map(() => Array(COLUMNS.length).fill(""))]);
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
        if (cIdx === TRACKING_COL_INDEX && duplicateTrackingState.duplicateCells.has(`${rIdx}-${cIdx}`)) {
            classes += "!bg-red-50 !border-red-400 ";
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

    // Render cell content - giống bảng chính (dropdown/input trực tiếp)
    const renderCell = (col, rowIdx, colIdx, value) => {
        // Date columns - hiển thị và nhập dạng dd/mm/yyyy
        if (col === 'Ngày đóng hàng' || col === 'Thời gian giao dự kiến') {
            // Lưu giá trị thô để cho phép nhập tự do
            const rawValue = value || '';
            return (
                    <input
                        type="text"
                        value={rawValue}
                        onChange={(e) => {
                            const inputValue = e.target.value;
                            // Cho phép nhập tự do
                            handleCellChange(rowIdx, colIdx, inputValue);
                        }}
                        onPaste={(e) => {
                            // Cho phép paste nhiều giá trị từ input
                            handlePaste(e, rowIdx, colIdx);
                        }}
                        onBlur={(e) => {
                            // Format lại khi blur nếu có giá trị
                            if (e.target.value.trim()) {
                                const formatted = parseDateValue(e.target.value);
                                if (formatted !== e.target.value) {
                                    handleCellChange(rowIdx, colIdx, formatted);
                                }
                            }
                        }}
                        onClick={(e) => {
                            // Ngăn event bubble để không trigger selection
                            e.stopPropagation();
                        }}
                        onMouseDown={(e) => {
                            // Ngăn event bubble để không trigger selection khi click vào input
                            e.stopPropagation();
                        }}
                        onFocus={(e) => {
                            e.stopPropagation();
                            setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
                        }}
                        className="w-full h-full outline-none bg-transparent border-none p-0 text-sm font-medium text-gray-700 placeholder:text-gray-400"
                        placeholder="dd/mm/yyyy"
                        maxLength={10}
                    />
            );
        }

        // Dropdown columns - cho phép paste nhiều giá trị
        if (DROPDOWN_OPTIONS[col]) {
            // Sử dụng input với datalist để cho phép paste và tự do nhập
            const options = DROPDOWN_OPTIONS[col] || [];
            const listId = `datalist-${colIdx}-${rowIdx}`;
            
            return (
                <>
                    <input
                        type="text"
                        list={listId}
                        value={value}
                        onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                        onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                            e.stopPropagation();
                            setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
                        }}
                        className="w-full h-full outline-none bg-transparent border-none p-0 text-sm cursor-pointer"
                        placeholder="Nhập hoặc chọn..."
                    />
                    <datalist id={listId}>
                        <option value="">-- Chọn --</option>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </datalist>
                </>
            );
        }

        // Text input - giống bảng chính
        return (
            <input
                type="text"
                value={value}
                onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                onPaste={(e) => handlePaste(e, rowIdx, colIdx)}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={(e) => {
                    e.stopPropagation();
                    setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
                }}
                className="w-full h-full outline-none bg-transparent border-none p-0 text-sm font-medium text-gray-700 placeholder:text-gray-400"
                placeholder={colIdx === 0 ? "Nhập mã đơn..." : ""}
            />
        );
    };

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
                                <h4 className="text-base font-bold text-gray-800 leading-tight">Thêm nhanh / Cập nhật hàng loạt</h4>
                                <p className="text-[11px] text-gray-500 mt-0">Bulk data entry</p>
                            </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-600">
                            <span>Ctrl+V: paste Excel</span>
                            <span>Ctrl+C: copy vùng chọn</span>
                            <span className="text-blue-600">Kéo góc ô để sao chép xuống</span>
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
                        // Paste vào container - không truyền rowIdx/colIdx để sử dụng selection
                        console.log('📋 [Container] Paste event, selection:', selection);
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
                    <table className="w-full border-collapse min-w-[1800px] text-sm">
                        <thead className="sticky top-0 z-30 shadow-sm">
                            <tr className="bg-gradient-to-r from-gray-800 to-gray-700 h-12">
                                <th className="p-3 border-b-2 border-r border-gray-600 min-w-[60px] font-bold text-white text-center">
                                    <div className="flex items-center justify-center">
                                        <span className="text-xs">#</span>
                                    </div>
                                </th>
                                {COLUMNS.map((col, idx) => (
                                    <th key={idx} className={`p-3 border-b-2 border-r border-gray-600 text-left ${idx === TRACKING_COL_INDEX ? 'min-w-[260px]' : 'min-w-[140px]'}`}>
                                        <div className="font-bold text-white flex items-center gap-1.5">
                                            <span>{col}</span>
                                            {idx === 0 && <span className="text-red-400 text-xs">*</span>}
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
                                    {COLUMNS.map((col, cIdx) => (
                                        <td
                                            key={cIdx}
                                            className={getCellClass(col, rIdx, cIdx)}
                                            style={cIdx === TRACKING_COL_INDEX ? { minWidth: '260px', width: '260px' } : undefined}
                                            onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
                                            onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                                        >
                                            {renderCell(col, rIdx, cIdx, row[cIdx] || "")}
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
                                                            value: row[cIdx] || ''
                                                        };
                                                    }}
                                                />
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Thông báo lỗi trùng mã tracking */}
                    {duplicateTrackingState.hasDuplicate && (
                        <div className="mx-4 mt-3 mb-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                            Trùng mã Tracking: {duplicateTrackingState.duplicatedCodes.join(', ')}. Vui lòng sửa trước khi đồng bộ.
                        </div>
                    )}

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
                            onClick={() => setRows(Array(15).fill(null).map(() => Array(COLUMNS.length).fill("")))}
                            className="px-5 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-all duration-200 shadow-sm hover:shadow"
                        >
                            Xóa bảng
                        </button>
                        <button
                            onClick={handleSyncClick}
                            disabled={duplicateTrackingState.hasDuplicate}
                            className={`px-6 py-2.5 text-white font-bold rounded-lg transition-all duration-200 shadow-md flex items-center gap-2 ${
                                duplicateTrackingState.hasDuplicate
                                    ? 'bg-gray-400 cursor-not-allowed opacity-80'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg'
                            }`}
                        >
                            <span>🔄</span>
                            <span>Đồng bộ</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                                {rows.filter(r => r.length > 0 && r[0] && r[0].trim() !== "").length}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickAddModal;
