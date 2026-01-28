import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, Edit, Lock, Plus, Shield, Trash2, Users, X, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import * as rbacService from '../../services/rbacService';
import PermissionTree from './PermissionTree';

// Searchable Select Component
const SearchableSelect = ({ value, onChange, options, placeholder = "Chọn...", className = "", searchFields = [] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchText, setSearchText] = useState('');

    const filteredOptions = options.filter(opt => {
        if (!searchText) return true;
        
        const label = typeof opt === 'string' ? opt : (opt.label || opt.name || opt);
        const searchLower = searchText.toLowerCase();
        
        // Tìm trong label
        if (label.toLowerCase().includes(searchLower)) return true;
        
        // Nếu có searchFields, tìm trong các field đó
        if (searchFields.length > 0 && typeof opt === 'object') {
            return searchFields.some(field => {
                const fieldValue = opt[field];
                return fieldValue && String(fieldValue).toLowerCase().includes(searchLower);
            });
        }
        
        // Tìm trong value nếu là object
        if (typeof opt === 'object' && opt.value) {
            return String(opt.value).toLowerCase().includes(searchLower);
        }
        
        return false;
    });

    const selectedOption = options.find(opt => {
        const optValue = typeof opt === 'string' ? opt : (opt.value || opt);
        return optValue === value;
    });
    const selectedLabel = selectedOption 
        ? (typeof selectedOption === 'string' ? selectedOption : (selectedOption.label || selectedOption.name || selectedOption.value))
        : placeholder;

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button 
                    variant="outline" 
                    className={`w-full justify-between text-left font-normal ${className}`}
                >
                    <span className={value ? "text-gray-900" : "text-gray-400"}>{selectedLabel}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent 
                className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-gray-200 shadow-lg z-[100]" 
                align="start"
                style={{ zIndex: 1000 }}
            >
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                        />
                    </div>
                </div>
                <ScrollArea className="h-[200px]">
                    <div className="p-1">
                        {filteredOptions.length === 0 ? (
                            <div className="p-2 text-sm text-gray-500 text-center">Không tìm thấy</div>
                        ) : (
                            filteredOptions.map((opt) => {
                                const optValue = typeof opt === 'string' ? opt : (opt.value || opt);
                                const optLabel = typeof opt === 'string' ? opt : (opt.label || opt.name || opt.value);
                                const isSelected = optValue === value;
                                
                                return (
                                    <div
                                        key={optValue}
                                        onClick={() => {
                                            onChange(optValue);
                                            setIsOpen(false);
                                            setSearchText('');
                                        }}
                                        className={`flex items-center justify-between px-2 py-1.5 text-sm cursor-pointer rounded hover:bg-gray-100 ${
                                            isSelected ? 'bg-blue-50 text-blue-700' : ''
                                        }`}
                                    >
                                        <span>{optLabel}</span>
                                        {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

const TeamEditor = ({ email, currentTeam, department, onSave }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(currentTeam || '');

    useEffect(() => {
        setValue(currentTeam || '');
    }, [currentTeam]);

    const handleSave = () => {
        if (value !== currentTeam) {
            onSave(value);
        }
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-1">
                <input
                    autoFocus
                    className="border rounded px-2 py-1 text-xs w-24 md:w-32 focus:outline-blue-500 uppercase placeholder-gray-300"
                    value={value}
                    onChange={(e) => setValue(e.target.value.toUpperCase())}
                    placeholder={`${department}_...`}
                />
                <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1"><Check size={14} /></button>
                <button onClick={() => { setIsEditing(false); setValue(currentTeam || ''); }} className="text-red-500 hover:text-red-600 p-1"><X size={14} /></button>
            </div>
        );
    }

    return (
        <div
            className="group flex items-center justify-between cursor-pointer hover:bg-gray-100 p-1 rounded -ml-1 pr-2"
            onClick={() => setIsEditing(true)}
            title="Nhấn để sửa Team"
        >
            <span className={`text-sm ${!currentTeam ? 'text-gray-400 italic' : 'text-gray-700'}`}>
                {currentTeam || 'Chưa gán'}
            </span>
            <Edit size={12} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
    );
};

// Component for multi-select teams - Dropdown with checkboxes (cho phép edit cho tất cả)
const TeamMultiSelect = ({ email, selectedTeams = [], allTeams = [], onSave }) => {
    const [tempSelected, setTempSelected] = useState(selectedTeams);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        setTempSelected(selectedTeams);
    }, [selectedTeams]);

    const toggleTeam = (team) => {
        setTempSelected(prev => {
            if (prev.includes(team)) {
                return prev.filter(t => t !== team);
            } else {
                return [...prev, team];
            }
        });
    };

    const toggleAll = () => {
        if (tempSelected.length === allTeams.length) {
            setTempSelected([]);
        } else {
            setTempSelected([...allTeams]);
        }
    };

    const handleSave = () => {
        onSave(tempSelected);
        setIsOpen(false);
    };

    const handleCancel = () => {
        setTempSelected(selectedTeams);
        setIsOpen(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs font-normal border-dashed justify-start w-full md:w-[200px] overflow-hidden">
                    {selectedTeams.length === 0 ? (
                        <span className="text-gray-400 italic">Chọn teams...</span>
                    ) : (
                        <span className="text-gray-800">Đã chọn {selectedTeams.length} team(s)</span>
                    )}
                    <ChevronDown className="ml-auto w-3 h-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-white shadow-md border" align="start">
                <div className="p-2 border-b bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                    <span className="text-xs font-semibold text-gray-500">Chọn Teams</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 px-2" onClick={toggleAll}>
                        {tempSelected.length === allTeams.length ? "Bỏ chọn hết" : "Chọn tất cả"}
                    </Button>
                </div>
                <ScrollArea className="h-[250px] p-2">
                    <div className="space-y-1">
                        {allTeams.map(team => {
                            const isChecked = tempSelected.includes(team);
                            return (
                                <div key={team} className="flex items-center space-x-2 p-1 hover:bg-gray-100 rounded cursor-pointer" onClick={() => toggleTeam(team)}>
                                    <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleTeam(team)}
                                        id={`team-${email}-${team}`}
                                    />
                                    <label
                                        htmlFor={`team-${email}-${team}`}
                                        className="text-sm cursor-pointer flex-1 user-select-none"
                                    >
                                        {team}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
                <div className="p-2 border-t bg-gray-50 flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
                        Hủy
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={handleSave}>
                        <Check className="w-3 h-3 mr-1" /> Lưu
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

// Component to display and edit employees list
const EmployeesList = ({ 
    teams = [], 
    employees = [], 
    allEmployees = [], 
    onUpdateEmployees,
    position = '',
    currentUserEmail = '',
    selectedPersonnel = [] // Danh sách email nhân sự đã chọn
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [teamEmployees, setTeamEmployees] = useState([]); // Nhân sự được load từ database
    
    // Xác định position có phải là Nhân viên không
    const isNhanVien = position && position.toLowerCase().includes('nhân viên') && 
                       !position.toLowerCase().includes('leader') &&
                       !position.toLowerCase().includes('trưởng');
    
    // Xác định có phải là Leader không
    const isLeader = position && (
        position.toLowerCase().includes('leader') || 
        position.toLowerCase().includes('trưởng nhóm') || 
        position.toLowerCase().includes('trưởng team') ||
        position.toLowerCase().includes('team lead')
    );
    
    // Load nhân sự từ database khi teams thay đổi (cho Leader)
    useEffect(() => {
        if (isLeader && teams && teams.length > 0) {
            const loadTeamEmployees = async () => {
                try {
                    const employeesFromDB = await rbacService.getEmployeesByTeams(teams);
                    setTeamEmployees(employeesFromDB);
                    console.log('🔍 Leader teams:', teams);
                    console.log('👥 Loaded employees from DB:', employeesFromDB.length);
                    console.log('📧 Employee emails:', employeesFromDB.map(e => e.email));
                } catch (error) {
                    console.error('Error loading team employees:', error);
                    setTeamEmployees([]);
                }
            };
            loadTeamEmployees();
        } else {
            setTeamEmployees([]);
        }
    }, [isLeader, teams]);
    
    useEffect(() => {
        if (isNhanVien && currentUserEmail) {
            // Nếu là Nhân viên: dùng selectedPersonnel nếu có, không tự động load từ teams
            if (selectedPersonnel && selectedPersonnel.length > 0) {
                setSelectedEmployees(selectedPersonnel);
            } else {
                // Không tự động load, để user tự chọn
                setSelectedEmployees([]);
            }
        } else if (isLeader && teams && teams.length > 0) {
            // Nếu là Leader: sử dụng nhân sự đã load từ database
            if (teamEmployees.length > 0) {
                // Chuyển từ email sang tên
                const teamEmployeeNames = teamEmployees.map(e => e['Họ Và Tên'] || e.name || e.email);
                
                console.log('📋 Team employees from DB:', teamEmployees.length);
                console.log('📝 Team employee names:', teamEmployeeNames);
                
                // Nếu có selectedPersonnel đã lưu (đã là tên), merge với nhân sự từ teams
                if (selectedPersonnel && selectedPersonnel.length > 0) {
                    // Merge: bao gồm tất cả nhân sự từ teams + thêm các nhân sự đã chọn thủ công
                    const merged = [...new Set([...teamEmployeeNames, ...selectedPersonnel])];
                    setSelectedEmployees(merged);
                } else {
                    // Chỉ dùng nhân sự từ teams (đã chuyển sang tên)
                    setSelectedEmployees(teamEmployeeNames);
                }
            } else {
                // Nếu chưa load xong, dùng selectedPersonnel hoặc rỗng
                setSelectedEmployees(selectedPersonnel || []);
            }
        } else if (selectedPersonnel && selectedPersonnel.length > 0) {
            // Nếu có selectedPersonnel: dùng danh sách đó (đã là tên)
            setSelectedEmployees(selectedPersonnel);
        } else if (teams && teams.length > 0) {
            // Nếu không có selectedPersonnel: lọc theo teams từ allEmployees
            const filtered = allEmployees.filter(emp => {
                const empTeam = emp.team || emp.Team || '';
                return teams.some(team => empTeam === team || String(empTeam).toLowerCase() === String(team).toLowerCase());
            });
            // Chuyển sang tên thay vì email
            setSelectedEmployees(filtered.map(e => e['Họ Và Tên'] || e.name || e.email));
        } else {
            setSelectedEmployees([]);
        }
    }, [teams, employees, allEmployees, isNhanVien, isLeader, currentUserEmail, selectedPersonnel, teamEmployees]);

    // Nếu là Nhân viên: hiển thị danh sách nhân sự đã chọn (nếu có) hoặc cho phép thêm
    // Không tự động load từ teams, nhưng vẫn có thể edit và thêm nhân sự thủ công
        if (isNhanVien && currentUserEmail) {
            // Nếu có selectedPersonnel, hiển thị danh sách đó (selectedPersonnel là tên)
            if (selectedPersonnel && selectedPersonnel.length > 0) {
                const selectedEmps = allEmployees.filter(emp => {
                    const empName = emp['Họ Và Tên'] || emp.name || emp.email;
                    return selectedPersonnel.includes(empName);
                });
                if (selectedEmps.length > 0) {
                return (
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-xs text-blue-600 hover:text-blue-700 underline"
                            >
                                {isExpanded ? 'Ẩn' : `Xem ${selectedEmps.length} nhân sự`}
                            </button>
                            <button
                                onClick={() => setIsEditing(true)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                                title="Chỉnh sửa"
                            >
                                <Edit size={12} />
                            </button>
                        </div>
                        {isExpanded && (
                            <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-1 bg-gray-50">
                                {selectedEmps.map(emp => (
                                    <div key={emp.email} className="text-xs text-gray-700 py-1 border-b last:border-0">
                                        <div className="font-medium">{emp['Họ Và Tên']}</div>
                                        <div className="text-gray-500">{emp.email} - {emp.team}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
        }
        
        // Nếu không có selectedPersonnel, hiển thị nút thêm nhân sự
        return (
            <div className="space-y-1">
                <span className="text-sm text-gray-400">Chưa chọn nhân sự</span>
                <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                    Thêm nhân sự
                </button>
            </div>
        );
    }

    // Nếu là Leader nhưng chưa chọn team
    if (isLeader && (!teams || teams.length === 0)) {
        return (
            <div className="space-y-1">
                <span className="text-sm text-gray-400">Vui lòng chọn team trong "Vị trí Team"</span>
            </div>
        );
    }

    // Nếu không có teams và không có selectedPersonnel (và không phải Leader)
    if ((!teams || teams.length === 0) && (!selectedPersonnel || selectedPersonnel.length === 0) && !isLeader) {
        return (
            <div className="space-y-1">
                <span className="text-sm text-gray-400">Chưa chọn nhân sự</span>
                <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                    Thêm nhân sự
                </button>
            </div>
        );
    }

    // Lấy danh sách nhân sự để hiển thị
    // selectedEmployees giờ chứa TÊN, không phải email
    const filteredEmployees = selectedEmployees.length > 0
        ? (isLeader && teamEmployees.length > 0
            ? teamEmployees.filter(emp => {
                const empName = emp['Họ Và Tên'] || emp.name || emp.email;
                return selectedEmployees.includes(empName);
            })
            : allEmployees.filter(emp => {
                const empName = emp['Họ Và Tên'] || emp.name || emp.email;
                return selectedEmployees.includes(empName);
            }))
        : (isLeader && teams && teams.length > 0 && teamEmployees.length > 0
            ? teamEmployees
            : allEmployees.filter(emp => {
                const empTeam = emp.team || emp.Team || '';
                return teams.some(team => empTeam === team || String(empTeam).toLowerCase() === String(team).toLowerCase());
            }));
    
    // Tất cả employees có sẵn để chọn (không chỉ từ team)
    const availableEmployees = allEmployees;

    const toggleEmployee = (emp) => {
        // Lưu tên nhân viên thay vì email
        const employeeName = emp['Họ Và Tên'] || emp.name || emp.email;
        setSelectedEmployees(prev => {
            if (prev.includes(employeeName)) {
                return prev.filter(e => e !== employeeName);
            } else {
                return [...prev, employeeName];
            }
        });
    };

    const handleSave = () => {
        console.log('💾 EmployeesList handleSave called:', { 
            selectedEmployees, 
            count: selectedEmployees.length,
            type: typeof selectedEmployees,
            isArray: Array.isArray(selectedEmployees),
            hasCallback: !!onUpdateEmployees
        });
        
        if (!onUpdateEmployees) {
            console.error('❌ onUpdateEmployees callback không tồn tại!');
            alert('Lỗi: Không tìm thấy callback để lưu dữ liệu');
            return;
        }
        
        // Lưu tên nhân viên (không phải email)
        const validNames = selectedEmployees.filter(name => {
            const nameStr = String(name).trim();
            return nameStr.length > 0;
        });
        
        console.log('📝 Valid names to save:', validNames);
        console.log('📞 Calling onUpdateEmployees with:', validNames);
        
        try {
            onUpdateEmployees(validNames);
            console.log('✅ onUpdateEmployees called successfully');
        } catch (error) {
            console.error('❌ Error calling onUpdateEmployees:', error);
            alert('Lỗi khi lưu: ' + error.message);
        }
        
        setIsEditing(false);
    };

    const handleCancel = () => {
        if (isNhanVien && currentUserEmail) {
            // Nhân viên: reset về selectedPersonnel nếu có (đã là tên)
            setSelectedEmployees(selectedPersonnel || []);
        } else if (isLeader && teams && teams.length > 0 && teamEmployees.length > 0) {
            // Nếu là Leader: lấy toàn bộ nhân sự từ teams (chuyển sang tên)
            const teamEmployeeNames = teamEmployees.map(e => e['Họ Và Tên'] || e.name || e.email);
            
            // Merge với selectedPersonnel nếu có (đã là tên)
            if (selectedPersonnel && selectedPersonnel.length > 0) {
                const merged = [...new Set([...teamEmployeeNames, ...selectedPersonnel])];
                setSelectedEmployees(merged);
            } else {
                setSelectedEmployees(teamEmployeeNames);
            }
        } else if (selectedPersonnel && selectedPersonnel.length > 0) {
            setSelectedEmployees(selectedPersonnel);
        } else if (teams && teams.length > 0) {
            const filtered = allEmployees.filter(emp => {
                const empTeam = emp.team || emp.Team || '';
                return teams.some(team => empTeam === team || String(empTeam).toLowerCase() === String(team).toLowerCase());
            });
            // Chuyển sang tên
            setSelectedEmployees(filtered.map(e => e['Họ Và Tên'] || e.name || e.email));
        } else {
            setSelectedEmployees([]);
        }
        setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="space-y-2">
                <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1 bg-gray-50">
                    {availableEmployees.map(emp => {
                        // Đảm bảo có email
                        const empEmail = emp.email || emp.Email || '';
                        const empName = emp['Họ Và Tên'] || emp.name || empEmail;
                        
                        if (!empEmail || !empEmail.includes('@')) {
                            console.warn('⚠️ Employee không có email hợp lệ:', emp);
                            return null;
                        }
                        
                        // So sánh theo tên (vì lưu tên)
                        const isSelected = selectedEmployees.includes(empName);
                        return (
                            <label key={empEmail} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                        console.log('🔘 Toggle employee:', { name: empName, email: empEmail });
                                        toggleEmployee(emp);
                                    }}
                                    className="rounded"
                                />
                                <div className="flex-1 text-xs">
                                    <div className="font-medium text-gray-700">{empName}</div>
                                    <div className="text-gray-500">{empEmail}</div>
                                </div>
                            </label>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={handleSave} className="text-green-600 hover:text-green-700 p-1 text-xs">
                        <Check size={14} /> Lưu
                    </button>
                    <button onClick={handleCancel} className="text-red-500 hover:text-red-600 p-1 text-xs">
                        <X size={14} /> Hủy
                    </button>
                </div>
            </div>
        );
    }

    if (filteredEmployees.length === 0) {
        return (
            <div className="space-y-1">
                <span className="text-sm text-gray-400">Không có nhân sự</span>
                <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                    Thêm nhân sự
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                    {isExpanded ? 'Ẩn' : `Xem ${filteredEmployees.length} nhân sự`}
                </button>
                <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                    title="Chỉnh sửa"
                >
                    <Edit size={12} />
                </button>
            </div>
            {isExpanded && (
                <div className="max-h-40 overflow-y-auto border rounded p-2 mt-1 space-y-1 bg-gray-50">
                    {filteredEmployees.map(emp => {
                        const empEmail = emp.email || emp.Email || '';
                        const empName = emp['Họ Và Tên'] || emp.name || empEmail;
                        return (
                            <div key={empEmail || empName} className="text-xs text-gray-700 py-1 border-b last:border-0">
                                <div className="font-medium">{empName}</div>
                                {empEmail && (
                                    <div className="text-gray-500">{empEmail}{emp.team ? ` - ${emp.team}` : ''}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Helper Component for Multi-Select Columns
const MultiSelectColumn = ({ resourceCode, selectedColumns, onChange }) => {
    // selectedColumns is array of strings e.g. ["*"] or ["col1", "col2"]
    const allColumns = rbacService.COLUMN_DEFINITIONS[resourceCode] || [];
    const isAllSelected = selectedColumns.includes("*");

    // Filter out '*' from count if it exists (though strictly if '*' is there, it should be the only one ideally, or handled logically)
    const selectedCount = isAllSelected ? allColumns.length : selectedColumns.length;

    const toggleColumn = (col) => {
        let newSelection = [...selectedColumns];

        if (isAllSelected) {
            // If currently All, switching to specific means we start with All minus the toggled one? 
            // Or usually: Unchecking one from All -> Switch to list of (All - 1)
            newSelection = [...allColumns]; // Expand * to full list
            newSelection = newSelection.filter(c => c !== col);
        } else {
            if (newSelection.includes(col)) {
                newSelection = newSelection.filter(c => c !== col);
            } else {
                newSelection.push(col);
            }
        }

        // Check if we effectively selected all again
        if (newSelection.length === allColumns.length && allColumns.length > 0) {
            onChange(["*"]);
        } else if (newSelection.length === 0) {
            onChange([]);
        } else {
            onChange(newSelection);
        }
    };

    const toggleAll = () => {
        if (isAllSelected) {
            onChange([]); // Deselect All
        } else {
            onChange(["*"]); // Select All
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="h-8 text-xs font-normal border-dashed justify-start w-full md:w-[300px] overflow-hidden">
                    {isAllSelected ? (
                        <span className="flex items-center text-blue-600 font-semibold"><Check className="w-3 h-3 mr-1" /> Tất cả ({allColumns.length} cột)</span>
                    ) : selectedCount > 0 ? (
                        <span className="flex items-center text-gray-800">Đã chọn {selectedCount} cột</span>
                    ) : (
                        <span className="text-gray-400 italic">Chọn cột cho phép...</span>
                    )}
                    <ChevronDown className="ml-auto w-3 h-3 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-white shadow-md border" align="start">
                <div className="p-2 border-b bg-gray-50 flex items-center justify-between sticky top-0 z-10">
                    <span className="text-xs font-semibold text-gray-500">Danh sách cột</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 px-2" onClick={toggleAll}>
                        {isAllSelected ? "Bỏ chọn hết" : "Chọn tất cả"}
                    </Button>
                </div>
                <ScrollArea className="h-[250px] p-2">
                    <div className="space-y-1">
                        {allColumns.map(col => {
                            const isChecked = isAllSelected || selectedColumns.includes(col);
                            return (
                                <div key={col} className="flex items-center space-x-2 p-1 hover:bg-gray-100 rounded cursor-pointer" onClick={() => toggleColumn(col)}>
                                    <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleColumn(col)}
                                        id={`col-${resourceCode}-${col}`}
                                    />
                                    <label
                                        htmlFor={`col-${resourceCode}-${col}`}
                                        className="text-sm cursor-pointer flex-1 user-select-none"
                                    >
                                        {col}
                                    </label>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
                <div className="p-2 border-t bg-gray-50 text-[10px] text-gray-400 text-center">
                    Cột được chọn sẽ hiển thị với nhân viên
                </div>
            </PopoverContent>
        </Popover>
    );
};

const PermissionManager = ({ searchQuery = "" }) => {
    // Dynamic DEPARTMENTS derived from employees "department" field
    // const DEPARTMENTS = ["SALE", "MKT", "RND", "CSKH", "KHO", "HR", "ADMIN", "ACCOUNTANT"];
    // const POSITIONS = [...now derived from employees data...];
    const [roles, setRoles] = useState([]);
    const [userRoles, setUserRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [employees, setEmployees] = useState([]);

    const [activeTab, setActiveTab] = useState('roles'); // 'roles' | 'users' | 'matrix'
    const [loading, setLoading] = useState(false);

    // Create Role State
    const [newRole, setNewRole] = useState({ code: '', name: '', department: '' });

    // Assign User State
    const [assignEmail, setAssignEmail] = useState('');
    const [assignRole, setAssignRole] = useState('');

    // Matrix State
    const [selectedRole, setSelectedRole] = useState(null);

    // Filter State
    const [filterDepartment, setFilterDepartment] = useState(''); // Filter by department
    const [filterTeam, setFilterTeam] = useState(''); // Filter by team

    // Edit User State
    const [editingUser, setEditingUser] = useState(null); // { email, name, department, position, team, role_code }
    const [editFormData, setEditFormData] = useState({
        name: '',
        department: '',
        position: '',
        team: '', // Team cơ bản (single)
        teams: [], // Danh sách teams (multi-select cho Vị trí Team)
        role_code: '',
        selectedPersonnel: [] // Danh sách nhân sự đã chọn
    });

    // Leader teams state
    const [leaderTeamsMap, setLeaderTeamsMap] = useState({}); // { email: [teams] }
    const [allTeams, setAllTeams] = useState([]);
    const [departmentsMap, setDepartmentsMap] = useState({}); // { email: department }
    const [selectedPersonnelMap, setSelectedPersonnelMap] = useState({}); // { email: [personnel_emails] }

    useEffect(() => {
        loadData();
    }, []);

    // Extract unique teams from employees
    useEffect(() => {
        const teams = [...new Set(employees.map(e => e.team).filter(Boolean))].sort();
        setAllTeams(teams);
    }, [employees]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [rData, uData, eData] = await Promise.all([
                rbacService.getRoles(),
                rbacService.getUserRoles(),
                rbacService.getEmployees()
            ]);
            setRoles(rData || []);
            setUserRoles(uData || []);
            setEmployees(eData || []);

            // Load leader_teams from users table
            if (uData && uData.length > 0) {
                try {
                    const teamsMap = await rbacService.getLeaderTeams(uData.map(u => u.email));
                    setLeaderTeamsMap(teamsMap);
                } catch (err) {
                    console.warn("Could not load leader_teams:", err);
                }
            }

            // Load selected_personnel from users table
            if (uData && uData.length > 0) {
                try {
                    const personnelMap = await rbacService.getSelectedPersonnel(uData.map(u => u.email));
                    console.log('📥 Loaded selected_personnel map:', personnelMap);
                    setSelectedPersonnelMap(personnelMap);
                } catch (err) {
                    console.error("❌ Could not load selected_personnel:", err);
                }
            }

            // Load departments from human_resources
            if (uData && uData.length > 0) {
                try {
                    const deptMap = await rbacService.getDepartmentsFromHR(uData.map(u => u.email));
                    setDepartmentsMap(deptMap);
                } catch (err) {
                    console.warn("Could not load departments from HR:", err);
                }
            }
        } catch (error) {
            console.error(error);
            toast.error("Lỗi tải dữ liệu phân quyền");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRole = async () => {
        if (!newRole.code || !newRole.name) return toast.warning("Vui lòng nhập Mã và Tên nhóm quyền");
        try {
            // Sanitize payload: only send fields that exist in DB
            const payload = {
                code: newRole.code,
                name: newRole.name,
                department: newRole.department
            };
            await rbacService.createRole(payload);
            toast.success("Đã tạo nhóm quyền mới");
            setNewRole({ code: '', name: '', department: '' });
            loadData();
        } catch (error) {
            if (error.message?.includes('duplicate key') || error.code === '23505') {
                toast.error("Mã nhóm quyền này đã tồn tại! Vui lòng đặt mã khác.");
            } else {
                toast.error("Lỗi tạo nhóm: " + error.message);
            }
        }
    };

    const handleDeleteRole = async (code) => {
        if (!window.confirm("Bạn chắc chắn muốn xóa nhóm quyền này?")) return;
        try {
            await rbacService.deleteRole(code);
            toast.success("Đã xóa nhóm quyền");
            loadData();
            if (selectedRole === code) setSelectedRole(null);
        } catch (error) {
            toast.error("Lỗi xóa: " + error.message);
        }
    };

    const handleAssignUser = async () => {
        if (!assignEmail || !assignRole) return toast.warning("Nhập email và chọn nhóm quyền");
        try {
            await rbacService.assignUserRole(assignEmail, assignRole);
            
            // Tự động điền tên nhân sự vào cột "Nhân sự"
            const selectedEmp = employees.find(e => e.email === assignEmail);
            if (selectedEmp) {
                const empName = selectedEmp['Họ Và Tên'] || selectedEmp.name || selectedEmp.email;
                // Tự động thêm tên nhân sự vào selectedPersonnel
                await rbacService.updateSelectedPersonnel(assignEmail, [empName]);
                console.log(`✅ Đã tự động điền tên nhân sự: ${empName} cho ${assignEmail}`);
            }
            
            toast.success(`Đã gán ${assignEmail} vào nhóm ${assignRole}${selectedEmp ? ` và tự động điền tên nhân sự` : ''}`);
            setAssignEmail('');
            loadData();
        } catch (error) {
            toast.error("Lỗi gán quyền: " + error.message);
        }
    };

    const handleRemoveUser = async (email) => {
        if (!window.confirm(`Gỡ quyền của ${email}?`)) return;
        try {
            await rbacService.removeUserRole(email);
            toast.success("Đã gỡ quyền");
            loadData();
        } catch (error) {
            toast.error("Lỗi: " + error.message);
        }
    };

    const handleUpdateUserInfo = async () => {
        if (!editingUser) return toast.warning("Không có thông tin để cập nhật");
        try {
            // Cập nhật thông tin user
            await rbacService.updateUserInfo(editingUser.email, {
                name: editFormData.name,
                department: editFormData.department,
                position: editFormData.position,
                team: editFormData.team,
                role: editFormData.role_code
            });
            
            // Cập nhật teams (Vị trí Team) nếu có
            if (editFormData.teams && Array.isArray(editFormData.teams)) {
                await rbacService.updateLeaderTeams(editingUser.email, editFormData.teams);
            }
            
            // Cập nhật danh sách nhân sự nếu có
            if (editFormData.selectedPersonnel && Array.isArray(editFormData.selectedPersonnel)) {
                await rbacService.updateSelectedPersonnel(editingUser.email, editFormData.selectedPersonnel);
            }
            
            toast.success(`Đã cập nhật thông tin cho ${editingUser.email}`);
            setEditingUser(null);
            setEditFormData({ name: '', department: '', position: '', team: '', teams: [], role_code: '', selectedPersonnel: [] });
            loadData();
        } catch (error) {
            toast.error("Lỗi cập nhật: " + error.message);
        }
    };

    const handleSaveLeaderTeams = async (email, teams) => {
        try {
            await rbacService.updateLeaderTeams(email, teams);
            setLeaderTeamsMap(prev => ({ ...prev, [email]: teams }));
            toast.success(`Đã cập nhật teams cho ${email}`);
            loadData();
        } catch (error) {
            toast.error("Lỗi cập nhật teams: " + error.message);
        }
    };

    const handleSaveSelectedPersonnel = async (email, personnelNames) => {
        try {
            console.log('💾 handleSaveSelectedPersonnel called:', { email, personnelNames, type: typeof personnelNames, isArray: Array.isArray(personnelNames) });
            
            // Đảm bảo là array
            let namesArray = [];
            if (Array.isArray(personnelNames)) {
                namesArray = personnelNames;
            } else if (personnelNames) {
                namesArray = [personnelNames];
            }
            
            // Lưu tên nhân viên (không phải email)
            const validNames = namesArray.filter(name => {
                const nameStr = String(name).trim();
                return nameStr.length > 0;
            });
            
            console.log('✅ Valid names to save:', validNames);
            
            const result = await rbacService.updateSelectedPersonnel(email, validNames);
            console.log('✅ Update result:', result);
            
            setSelectedPersonnelMap(prev => ({ ...prev, [email]: validNames }));
            toast.success(`Đã cập nhật danh sách nhân sự cho ${email} (${validNames.length} người)`);
            
            // Reload data để cập nhật UI
            await loadData();
            console.log('✅ Data reloaded');
        } catch (error) {
            console.error('❌ Lỗi khi lưu selected_personnel:', error);
            console.error('❌ Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            toast.error("Lỗi cập nhật danh sách nhân sự: " + (error.message || 'Unknown error'));
        }
    };

    // --- PERMISSION MATRIX LOGIC ---
    useEffect(() => {
        if (activeTab === 'matrix' && selectedRole) {
            loadPermissionsForRole(selectedRole);
        }
    }, [activeTab, selectedRole]);

    const loadPermissionsForRole = async (roleCode) => {
        try {
            const data = await rbacService.getPermissions(roleCode);
            setPermissions(data || []);
        } catch (error) {
            console.error(error);
        }
    };

    const handlePermissionChange = async (resourceCode, field, value) => {
        if (!selectedRole) return;

        const existing = permissions.find(p => p.resource_code === resourceCode) || {
            role_code: selectedRole,
            resource_code: resourceCode,
            can_view: false,
            can_edit: false,
            can_delete: false,
            allowed_columns: ["*"]
        };

        const updated = { ...existing, [field]: value };

        // Optimistic Update
        const newPerms = permissions.filter(p => p.resource_code !== resourceCode);
        newPerms.push(updated);
        setPermissions(newPerms);

        // Save Debounced? No, save immediately for admin tools usually fine
        try {
            await rbacService.upsertPermission(updated);
        } catch (error) {
            toast.error("Lỗi lưu quyền: " + error.message);
        }
    };

    const handleColumnChange = async (resourceCode, colListString) => {
        // Parse comma separated
        try {
            const cols = colListString.split(',').map(s => s.trim()).filter(Boolean);
            await handlePermissionChange(resourceCode, 'allowed_columns', cols.length ? cols : ["*"]);
        } catch (e) {
            // ignore
        }
    };

    // --- CODE NORMALIZATION & DICTIONARY ---
    const CODE_MAP = {
        "TRUONG_NHOM": "LEADER",
        "NHAN_VIEN": "MEMBER",
        "TRUONG_PHONG": "MANAGER",
        "GIAM_DOC": "DIRECTOR",
        "THUC_TAP_SINH": "INTERN",
        "LOGISTIC": "LOGISTICS",
        "KE_TOAN": "ACCOUNTANT",
        "VAN_DON": "ORDERS"
    };

    const getStandardizedCode = (str) => {
        if (!str) return "";
        const rawCode = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d").replace(/Đ/g, "D")
            .toUpperCase().replace(/\s+/g, "_");
        return CODE_MAP[rawCode] || rawCode;
    };

    // --- FILTERING ---
    const filteredRoles = roles.filter(role => {
        const q = searchQuery.toLowerCase();
        return role.name.toLowerCase().includes(q) || role.code.toLowerCase().includes(q);
    });

    // Get unique departments from employees
    const uniqueDepartments = [...new Set(
        employees
            .map(emp => departmentsMap[emp.email] || emp.department)
            .filter(Boolean)
    )].sort();

    // Get unique teams from employees (including leader teams)
    const uniqueTeams = [...new Set([
        ...employees.map(emp => emp.team).filter(Boolean),
        ...Object.values(leaderTeamsMap).flat()
    ])].sort();

    const filteredUserRoles = userRoles.filter(ur => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = ur.email.toLowerCase().includes(q) || ur.role_code.toLowerCase().includes(q);
        
        // Filter by department
        if (filterDepartment) {
            const emp = employees.find(e => e.email === ur.email);
            const departmentFromHR = departmentsMap[ur.email] || emp?.department || '';
            if (departmentFromHR !== filterDepartment) {
                return false;
            }
        }
        
        // Filter by team
        if (filterTeam) {
            const emp = employees.find(e => e.email === ur.email);
            const userTeam = emp?.team || '';
            const leaderTeams = leaderTeamsMap[ur.email] || [];
            
            // Check if user's team or any of their leader teams matches
            const matchesTeam = userTeam === filterTeam || leaderTeams.includes(filterTeam);
            if (!matchesTeam) {
                return false;
            }
        }
        
        return matchesSearch;
    });

    return (
        <div className="bg-white rounded-xl shadow-md border border-gray-100 animate-fadeIn overflow-hidden">
            {/* SUB-TABS */}
            <div className="flex bg-gray-50 border-b">
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`px-6 py-3 font-medium text-sm flex items-center gap-2 ${activeTab === 'roles' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Shield size={16} /> Nhóm Quyền (Roles)
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-6 py-3 font-medium text-sm flex items-center gap-2 ${activeTab === 'users' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Users size={16} /> Phân quyền Nhân viên
                </button>
                <button
                    onClick={() => setActiveTab('matrix')}
                    className={`px-6 py-3 font-medium text-sm flex items-center gap-2 ${activeTab === 'matrix' ? 'bg-white text-blue-600 border-t-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Lock size={16} /> Phân quyền Chi tiết (Matrix)
                </button>
            </div>

            <div className="p-6">
                {/* 1. ROLES MANAGEMENT */}
                {activeTab === 'roles' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-blue-50 p-4 rounded-lg">
                            <SearchableSelect
                                value={newRole.department || ""}
                                onChange={(dept) => {
                                    const pos = newRole.position || "";

                                    const posCode = getStandardizedCode(pos);
                                    const deptCode = getStandardizedCode(dept);

                                    // Auto-gen Code: DEPT_POS
                                    const code = (deptCode && posCode) ? `${deptCode}_${posCode}` : (deptCode ? deptCode + "_" : "");
                                    // Auto-gen Name: Position Label + Dept
                                    const name = (dept && pos) ? `${pos} ${dept}` : "";

                                    setNewRole(prev => ({ ...prev, department: dept, code, name }));
                                }}
                                options={[
                                    { value: '', label: '-- Chọn Phòng Ban --' },
                                    ...[...new Set(employees.map(e => e.department).filter(Boolean))].map(d => ({
                                        value: d,
                                        label: d
                                    }))
                                ]}
                                placeholder="-- Chọn Phòng Ban --"
                            />

                            <div className="md:col-span-2">
                                <SearchableSelect
                                    value={newRole.position || ""}
                                    onChange={(pos) => {
                                        const dept = newRole.department || "";

                                        const posCode = getStandardizedCode(pos);
                                        const deptCode = getStandardizedCode(dept);

                                        // Auto-gen Code: DEPT_POS
                                        const code = (deptCode && posCode) ? `${deptCode}_${posCode}` : (deptCode ? deptCode + "_" : "");
                                        // Auto-gen Name: Position Label + Dept
                                        const name = (dept && pos) ? `${pos} ${dept}` : "";

                                        setNewRole(prev => ({ ...prev, position: pos, code, name }));
                                    }}
                                    options={[
                                        { value: '', label: '-- Chọn Vị Trí --' },
                                        ...[...new Set(employees.map(e => e.position).filter(Boolean))].map(p => ({
                                            value: p,
                                            label: p
                                        }))
                                    ]}
                                    placeholder="-- Chọn Vị Trí --"
                                />
                            </div>

                            <button onClick={handleCreateRole} className="bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                                <Plus size={16} /> Thêm Mới
                            </button>
                        </div>
                        {/* Preview computed values */}
                        {(newRole.code || newRole.name) && (
                            <div className="flex gap-4 text-xs text-gray-500 px-2">
                                <span>Mã: <b className="text-blue-600">{newRole.code}</b></span>
                                <span>Tên: <b className="text-blue-600">{newRole.name}</b></span>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left border rounded-lg">
                                <thead className="bg-gray-100 font-semibold text-gray-600">
                                    <tr>
                                        <th className="p-3">Mã Role</th>
                                        <th className="p-3">Tên Role</th>
                                        <th className="p-3">Bộ phận</th>
                                        <th className="p-3 text-center">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredRoles.map(role => (
                                        <tr key={role.code} className="hover:bg-gray-50">
                                            <td className="p-3 font-medium text-blue-800">{role.code}</td>
                                            <td className="p-3">{role.name}</td>
                                            <td className="p-3">{role.department || '-'}</td>
                                            <td className="p-3 text-center">
                                                <button onClick={() => handleDeleteRole(role.code)} className="text-gray-400 hover:text-red-600 p-1">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredRoles.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-gray-500">
                                                Không tìm thấy kết quả
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* 2. USER ASSIGNMENT */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-4 bg-teal-50 p-4 rounded-lg items-end">
                            <div className="flex-1 w-full">
                                <label className="text-xs font-semibold text-gray-500 mb-1 block">Email Nhân viên</label>
                                <SearchableSelect
                                    value={assignEmail}
                                    onChange={(email) => {
                                        setAssignEmail(email);

                                        // Auto-suggest Role
                                        const emp = employees.find(e => e.email === email);
                                        if (emp && emp.department && emp.position) {
                                            const deptCode = getStandardizedCode(emp.department);
                                            const posCode = getStandardizedCode(emp.position);
                                            const suggestedCode = `${deptCode}_${posCode}`;

                                            // Try exact match or match with common prefix issues
                                            // But standard is standard, we look for exact match
                                            if (roles.some(r => r.code === suggestedCode)) {
                                                setAssignRole(suggestedCode);
                                            }
                                        }
                                    }}
                                    options={[
                                        { value: '', label: '-- Chọn Nhân viên --' },
                                        ...employees
                                            .filter(emp => {
                                                // Loại trừ các nhân viên đã có quyền
                                                if (userRoles.some(ur => ur.email === emp.email)) {
                                                    return false;
                                                }
                                                // Loại trừ các nhân sự đã có trong danh sách "Nhân sự" bên dưới
                                                const empName = emp['Họ Và Tên'] || emp.name || emp.email;
                                                const isInSelectedPersonnel = Object.values(selectedPersonnelMap).some(
                                                    personnelList => Array.isArray(personnelList) && personnelList.includes(empName)
                                                );
                                                return !isInSelectedPersonnel;
                                            })
                                            .map(emp => ({
                                                value: emp.email,
                                                label: `${emp['Họ Và Tên']} (${emp.email})`,
                                                email: emp.email,
                                                name: emp['Họ Và Tên']
                                            }))
                                    ]}
                                    placeholder="-- Chọn Nhân viên --"
                                    searchFields={['email', 'name']}
                                />
                            </div>
                            <div className="w-full md:w-64">
                                <label className="text-xs font-semibold text-gray-500 mb-1 block">Chọn Vai Trò</label>
                                <SearchableSelect
                                    value={assignRole}
                                    onChange={setAssignRole}
                                    options={[
                                        { value: '', label: '-- Chọn Role --' },
                                        ...roles.map(r => ({
                                            value: r.code,
                                            label: `${r.name} (${r.code})`
                                        }))
                                    ]}
                                    placeholder="-- Chọn Role --"
                                />
                            </div>
                            <button onClick={handleAssignUser} className="bg-teal-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-teal-700 flex items-center justify-center gap-2 h-10 w-full md:w-auto">
                                <Plus size={16} /> Gán Quyền
                            </button>
                        </div>

                        {/* Filter by Department and Team */}
                        <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                    Lọc theo Bộ phận:
                                </label>
                                <select
                                    value={filterDepartment}
                                    onChange={(e) => setFilterDepartment(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
                                >
                                    <option value="">-- Tất cả Bộ phận --</option>
                                    {uniqueDepartments.map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                    Lọc theo Team:
                                </label>
                                <select
                                    value={filterTeam}
                                    onChange={(e) => setFilterTeam(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[200px]"
                                >
                                    <option value="">-- Tất cả Team --</option>
                                    {uniqueTeams.map(team => (
                                        <option key={team} value={team}>{team}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {(filterDepartment || filterTeam) && (
                                <button
                                    onClick={() => {
                                        setFilterDepartment('');
                                        setFilterTeam('');
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700 underline whitespace-nowrap"
                                >
                                    Xóa tất cả bộ lọc
                                </button>
                            )}
                            
                            <div className="text-sm text-gray-600 ml-auto whitespace-nowrap">
                                Hiển thị: <span className="font-semibold">{filteredUserRoles.length}</span> / {userRoles.length} nhân viên
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-base text-left border rounded-lg">
                                <thead className="bg-gray-100 font-semibold text-gray-700">
                                    <tr>
                                        <th className="px-5 py-4 text-sm">Email</th>
                                        <th className="px-5 py-4 text-sm">Tên nhân viên</th>
                                        <th className="px-5 py-4 text-sm">Bộ phận</th>
                                        <th className="px-5 py-4 text-sm">Vị trí</th>
                                        <th className="px-5 py-4 text-sm">Team</th>
                                        <th className="px-5 py-4 text-sm">Vị trí Team</th>
                                        <th className="px-5 py-4 text-sm">Nhân sự</th>
                                        <th className="px-5 py-4 text-sm">Vai trò</th>
                                        <th className="px-5 py-4 text-sm">Updated At</th>
                                        <th className="px-5 py-4 text-center whitespace-nowrap text-sm" style={{ minWidth: '140px' }}>Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredUserRoles.map(ur => {
                                        const role = roles.find(r => r.code === ur.role_code);
                                        const emp = employees.find(e => e.email === ur.email);
                                        // Get department from HR
                                        const departmentFromHR = departmentsMap[ur.email] || emp?.department || '-';
                                        // Check if position is Leader (case-insensitive, multiple variations)
                                        const positionLower = emp?.position?.toLowerCase() || '';
                                        const isLeader = positionLower.includes('leader') || 
                                                       positionLower.includes('trưởng nhóm') || 
                                                       positionLower.includes('trưởng team') ||
                                                       positionLower.includes('team lead');
                                        const selectedTeams = leaderTeamsMap[ur.email] || [];
                                        return (
                                            <tr key={ur.email} className="hover:bg-gray-50">
                                                <td className="px-5 py-4 font-medium text-sm">{ur.email}</td>
                                                <td className="px-5 py-4 text-gray-700 text-sm">{emp ? emp['Họ Và Tên'] : '-'}</td>
                                                <td className="px-5 py-4 text-gray-600 text-sm">{departmentFromHR}</td>
                                                <td className="px-5 py-4 text-gray-600 text-sm">{emp ? emp.position : '-'}</td>
                                                <td className="px-5 py-4">
                                                    <TeamEditor
                                                        email={ur.email}
                                                        currentTeam={emp ? emp.team : ''}
                                                        department={emp ? emp.department : ''}
                                                        onSave={async (newTeam) => {
                                                            try {
                                                                await rbacService.updateUserTeam(ur.email, newTeam);
                                                                toast.success(`Đã cập nhật team cho ${ur.email}`);
                                                                loadData();
                                                            } catch (error) {
                                                                toast.error("Lỗi cập nhật team: " + error.message);
                                                            }
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-5 py-4">
                                                    <TeamMultiSelect
                                                        email={ur.email}
                                                        selectedTeams={selectedTeams}
                                                        allTeams={allTeams}
                                                        onSave={(teams) => handleSaveLeaderTeams(ur.email, teams)}
                                                    />
                                                </td>
                                                <td className="px-5 py-4">
                                                    <EmployeesList
                                                        teams={selectedTeams}
                                                        employees={employees}
                                                        allEmployees={employees}
                                                        position={emp?.position || ''}
                                                        currentUserEmail={ur.email}
                                                        selectedPersonnel={selectedPersonnelMap[ur.email] || []}
                                                        onUpdateEmployees={async (selectedNames) => {
                                                            console.log('📞 onUpdateEmployees called:', { 
                                                                userEmail: ur.email, 
                                                                selectedNames,
                                                                type: typeof selectedNames,
                                                                isArray: Array.isArray(selectedNames),
                                                                count: Array.isArray(selectedNames) ? selectedNames.length : 0
                                                            });
                                                            try {
                                                                await handleSaveSelectedPersonnel(ur.email, selectedNames);
                                                            } catch (error) {
                                                                console.error('❌ Error in onUpdateEmployees:', error);
                                                                toast.error('Lỗi: ' + (error.message || 'Unknown error'));
                                                            }
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className="bg-blue-100 text-blue-800 px-3 py-1.5 rounded text-sm font-semibold">
                                                        {role ? role.name : ur.role_code}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 text-gray-500 text-sm">{new Date(ur.assigned_at).toLocaleDateString()}</td>
                                                <td className="px-5 py-4 text-center whitespace-nowrap bg-white" style={{ minWidth: '140px', position: 'relative', zIndex: 10 }}>
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                const emp = employees.find(e => e.email === ur.email);
                                                                setEditingUser({ 
                                                                    email: ur.email, 
                                                                    role_code: ur.role_code,
                                                                    name: emp ? emp['Họ Và Tên'] : '',
                                                                    department: departmentsMap[ur.email] || emp?.department || '',
                                                                    position: emp?.position || '',
                                                                    team: emp?.team || ''
                                                                });
                                                                setEditFormData({
                                                                    name: emp ? emp['Họ Và Tên'] : '',
                                                                    department: departmentsMap[ur.email] || emp?.department || '',
                                                                    position: emp?.position || '',
                                                                    team: emp?.team || '',
                                                                    teams: leaderTeamsMap[ur.email] || [],
                                                                    role_code: ur.role_code,
                                                                    selectedPersonnel: selectedPersonnelMap[ur.email] || []
                                                                });
                                                            }}
                                                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-2.5 rounded-md transition-all cursor-pointer border border-blue-200 hover:border-blue-400 shadow-sm"
                                                            title="Sửa thông tin"
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                minWidth: '36px',
                                                                minHeight: '36px'
                                                            }}
                                                        >
                                                            <Edit size={18} strokeWidth={2} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                handleRemoveUser(ur.email);
                                                            }}
                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2.5 rounded-md transition-all cursor-pointer border border-red-200 hover:border-red-400 shadow-sm"
                                                            title="Xóa quyền"
                                                            type="button"
                                                            style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center',
                                                                minWidth: '36px',
                                                                minHeight: '36px'
                                                            }}
                                                        >
                                                            <Trash2 size={18} strokeWidth={2} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {filteredUserRoles.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-5 py-6 text-center text-gray-500 text-base">
                                                Không tìm thấy kết quả
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Edit User Info Modal */}
                        {editingUser && (
                            <div 
                                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]" 
                                onClick={() => {
                                    setEditingUser(null);
                                    setEditFormData({ name: '', department: '', position: '', team: '', teams: [], role_code: '', selectedPersonnel: [] });
                                }}
                            >
                                <div 
                                    className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto z-[101] relative" 
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3 className="text-lg font-bold text-gray-800 mb-4">Sửa Thông Tin Nhân Viên</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Email:
                                            </label>
                                            <input
                                                type="text"
                                                value={editingUser.email}
                                                disabled
                                                className="border p-2 rounded text-sm w-full bg-gray-100 text-gray-600"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Tên nhân viên:
                                            </label>
                                            <input
                                                type="text"
                                                value={editFormData.name}
                                                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                                className="border p-2 rounded text-sm w-full"
                                                placeholder="Nhập tên nhân viên"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Bộ phận:
                                                </label>
                                                <SearchableSelect
                                                    value={editFormData.department}
                                                    onChange={(value) => setEditFormData({ ...editFormData, department: value })}
                                                    options={[
                                                        { value: '', label: '-- Chọn Bộ phận --' },
                                                        ...[...new Set(employees.map(e => e.department).filter(Boolean))].map(d => ({
                                                            value: d,
                                                            label: d
                                                        }))
                                                    ]}
                                                    placeholder="-- Chọn Bộ phận --"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Vị trí:
                                                </label>
                                                <SearchableSelect
                                                    value={editFormData.position}
                                                    onChange={(value) => setEditFormData({ ...editFormData, position: value })}
                                                    options={[
                                                        { value: '', label: '-- Chọn Vị trí --' },
                                                        ...[...new Set(employees.map(e => e.position).filter(Boolean))].map(p => ({
                                                            value: p,
                                                            label: p
                                                        }))
                                                    ]}
                                                    placeholder="-- Chọn Vị trí --"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Team:
                                                </label>
                                                <TeamMultiSelect
                                                    email={editingUser.email}
                                                    selectedTeams={editFormData.teams}
                                                    allTeams={allTeams}
                                                    onSave={(teams) => {
                                                        setEditFormData({ ...editFormData, teams });
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Vai trò:
                                                </label>
                                                <SearchableSelect
                                                    value={editFormData.role_code}
                                                    onChange={(value) => setEditFormData({ ...editFormData, role_code: value })}
                                                    options={[
                                                        { value: '', label: '-- Chọn Role --' },
                                                        ...roles.map(r => ({
                                                            value: r.code,
                                                            label: `${r.name} (${r.code})`
                                                        }))
                                                    ]}
                                                    placeholder="-- Chọn Role --"
                                                />
                                            </div>
                                        </div>
                                        
                                        {/* Nhân sự */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Nhân sự:
                                            </label>
                                            <div className="border rounded p-3 bg-gray-50 max-h-60 overflow-y-auto">
                                                <div className="space-y-2">
                                                    {employees.map(emp => {
                                                        const empName = emp['Họ Và Tên'] || emp.name || emp.email;
                                                        const isSelected = editFormData.selectedPersonnel.includes(empName);
                                                        return (
                                                            <label
                                                                key={emp.email}
                                                                className="flex items-center space-x-2 cursor-pointer hover:bg-white p-2 rounded"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setEditFormData({
                                                                                ...editFormData,
                                                                                selectedPersonnel: [...editFormData.selectedPersonnel, empName]
                                                                            });
                                                                        } else {
                                                                            setEditFormData({
                                                                                ...editFormData,
                                                                                selectedPersonnel: editFormData.selectedPersonnel.filter(name => name !== empName)
                                                                            });
                                                                        }
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <div className="flex-1 text-sm">
                                                                    <div className="font-medium text-gray-700">{empName}</div>
                                                                    <div className="text-gray-500 text-xs">{emp.email} - {emp.team || 'N/A'}</div>
                                                                </div>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Đã chọn: {editFormData.selectedPersonnel.length} nhân sự
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-6">
                                        <button
                                            onClick={() => {
                                                setEditingUser(null);
                                                setEditFormData({ name: '', department: '', position: '', team: '', role_code: '', selectedPersonnel: [] });
                                            }}
                                            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 text-sm"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={handleUpdateUserInfo}
                                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
                                        >
                                            Cập nhật
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. PERMISSION MATRIX */}
                {activeTab === 'matrix' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 mb-4">
                            <label className="font-semibold text-gray-700">Đang cấu hình cho:</label>
                            <div className="w-64">
                                <SearchableSelect
                                    value={selectedRole || ''}
                                    onChange={setSelectedRole}
                                    options={[
                                        { value: '', label: '-- Chọn Bộ Phận / Vị Trí --' },
                                        ...roles.map(r => ({
                                            value: r.code,
                                            label: r.name
                                        }))
                                    ]}
                                    placeholder="-- Chọn Bộ Phận / Vị Trí --"
                                    className="bg-blue-50 text-blue-700 font-semibold"
                                />
                            </div>
                        </div>

                        {selectedRole ? (
                            <PermissionTree roleCode={selectedRole} />
                        ) : (
                            <div className="text-center py-12 text-gray-400 bg-gray-50 border border-dashed rounded-lg">
                                Vui lòng chọn một Nhóm quyền để cấu hình.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PermissionManager;
