import React, { useState, useRef, useEffect } from 'react';
import { DROPDOWN_OPTIONS } from '../types';

// Các cột cho bảng Thêm nhanh - đồng bộ với bảng chính
const COLUMNS = [
    "Mã đơn hàng",           // Cột bắt buộc - khóa chính
    "Mã Tracking",
    "Ngày đóng hàng",
    "Trạng thái giao hàng",
    "GHI CHÚ",
    "Thời gian giao dự kiến",
    "Phí ship nội địa Mỹ (usd)",
    "Phí xử lý đơn đóng hàng-Lưu kho(usd)",
    "Kết quả Check",
    "Ghi chú",
    "Đơn vị vận chuyển"
];

const QuickAddModal = ({ isOpen, onClose, onSync }) => {
    const [rows, setRows] = useState([]);
    const [selection, setSelection] = useState(null);
    const isSelecting = useRef(false);
    const containerRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setRows(Array(15).fill(null).map(() => Array(COLUMNS.length).fill("")));
            setSelection(null);
            setTimeout(() => containerRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Mouse up listener
    useEffect(() => {
        const handleMouseUp = () => { isSelecting.current = false; };
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

    if (!isOpen) return null;

    // Selection handlers - giống bảng chính
    const handleMouseDown = (rowIdx, colIdx, e) => {
        if (e.button !== 0) return;
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
        e.preventDefault();
        isSelecting.current = true;
        setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx });
    };

    const handleMouseEnter = (rowIdx, colIdx) => {
        if (isSelecting.current) {
            setSelection(prev => prev ? { ...prev, endRow: rowIdx, endCol: colIdx } : null);
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

    // Handle paste (Ctrl+V)
    const handlePaste = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const clipboardData = e.clipboardData.getData('text');
        if (!clipboardData) return;

        const pastedRows = clipboardData.trim().split(/\r\n|\n/).map(row => row.split('\t'));
        const startRow = selection?.startRow ?? 0;
        const startCol = selection?.startCol ?? 0;

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
                        newRows[targetRow][targetCol] = pastedRows[i][j];
                    }
                }
            }
            return newRows;
        });
    };

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

    const handleSyncClick = () => {
        const validRows = rows.filter(r => r.length > 0 && r[0] && r[0].trim() !== "");
        if (validRows.length === 0) {
            alert("Chưa có dữ liệu hợp lệ (Cần có Mã đơn hàng)");
            return;
        }
        onSync(validRows);
        onClose();
    };

    const addMoreRows = () => {
        setRows(prev => [...prev, ...Array(5).fill(null).map(() => Array(COLUMNS.length).fill(""))]);
    };

    // Get cell class - giống bảng chính
    const getCellClass = (col, rIdx, cIdx) => {
        let classes = "px-3 py-2 border border-gray-200 text-sm h-[38px] whitespace-nowrap ";

        // Editable cell style - giống bảng chính
        classes += "bg-[#e8f5e9] border-l-4 border-l-[#66bb6a] hover:bg-gray-50 ";

        // Selection - giống bảng chính
        if (isSelected(rIdx, cIdx)) {
            classes += "!bg-[#a7ffeb] outline outline-2 outline-[#00bfa5] -outline-offset-2 ";
        }

        return classes;
    };

    // Render cell content - giống bảng chính (dropdown/input trực tiếp)
    const renderCell = (col, rowIdx, colIdx, value) => {
        // Dropdown columns
        if (DROPDOWN_OPTIONS[col]) {
            return (
                <select
                    className="w-full bg-transparent border-none outline-none text-sm p-0 m-0 cursor-pointer"
                    value={value}
                    onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                    onFocus={() => setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx })}
                >
                    <option value="">-- Chọn --</option>
                    {DROPDOWN_OPTIONS[col].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            );
        }

        // Text input - giống bảng chính
        return (
            <input
                type="text"
                value={value}
                onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                onFocus={() => setSelection({ startRow: rowIdx, startCol: colIdx, endRow: rowIdx, endCol: colIdx })}
                className="w-full h-full outline-none bg-transparent border-none p-0 text-sm"
                placeholder={colIdx === 0 ? "Nhập mã đơn..." : ""}
            />
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[1060] flex justify-center items-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                    <div>
                        <h4 className="text-lg font-bold text-gray-800">Thêm nhanh / Cập nhật hàng loạt</h4>
                        <p className="text-sm text-gray-500 mt-1">
                            Nhập trực tiếp hoặc <b>Ctrl+V</b> để paste từ Excel. <b>Ctrl+C</b> để copy vùng chọn.
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                            💡 Kéo chuột để chọn nhiều ô. Mũi tên để di chuyển. Delete để xóa.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl font-bold px-2">&times;</button>
                </div>

                <div
                    className="p-0 overflow-auto flex-1 relative bg-white min-h-[400px] select-none"
                    ref={containerRef}
                    tabIndex={0}
                    onPaste={handlePaste}
                    onCopy={handleCopy}
                    onKeyDown={handleKeyDown}
                >
                    <table className="w-full border-collapse min-w-[1800px] text-sm">
                        <thead className="sticky top-0 z-30">
                            <tr className="bg-gray-100 h-12">
                                <th className="p-1.5 border-b-2 border-r border-gray-300 min-w-[50px] bg-[#f8f9fa] font-semibold text-gray-700">#</th>
                                {COLUMNS.map((col, idx) => (
                                    <th key={idx} className="p-1.5 border-b-2 border-r border-gray-300 min-w-[120px] bg-[#f8f9fa] text-left">
                                        <div className="font-semibold text-gray-700">
                                            {col} {idx === 0 && <span className="text-red-500">*</span>}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-[#E8EAF6] transition-colors">
                                    <td className="px-2 py-2 border border-gray-200 text-center text-gray-400 text-xs bg-gray-50">
                                        {rIdx + 1}
                                    </td>
                                    {COLUMNS.map((col, cIdx) => (
                                        <td
                                            key={cIdx}
                                            className={getCellClass(col, rIdx, cIdx)}
                                            onMouseDown={(e) => handleMouseDown(rIdx, cIdx, e)}
                                            onMouseEnter={() => handleMouseEnter(rIdx, cIdx)}
                                        >
                                            {renderCell(col, rIdx, cIdx, row[cIdx] || "")}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-gray-200 flex justify-between items-center bg-gray-50 rounded-b-lg">
                    <button
                        onClick={addMoreRows}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition"
                    >
                        + Thêm 5 hàng
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setRows(Array(15).fill(null).map(() => Array(COLUMNS.length).fill("")))}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition"
                        >
                            Xóa bảng
                        </button>
                        <button
                            onClick={handleSyncClick}
                            className="px-6 py-2 bg-success text-white font-bold rounded hover:bg-successHover transition shadow-sm"
                        >
                            Đồng bộ ({rows.filter(r => r.length > 0 && r[0] && r[0].trim() !== "").length})
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickAddModal;
