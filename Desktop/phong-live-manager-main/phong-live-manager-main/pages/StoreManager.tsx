import React, { useState, useEffect, useMemo } from 'react';
import { fetchStores, createStore, updateStore, deleteStore, fetchPersonnel } from '../services/dataService';
import { StoreDetailModal } from '../components/StoreDetailModal';
import { FilterBar } from '../components/FilterBar';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { Store, Personnel } from '../types';
import { getCurrentUserDepartment, isPartner, getPartnerId, isAdmin } from '../utils/permissionUtils';

export const StoreManager: React.FC = () => {
    const [stores, setStores] = useState<Store[]>([]);
    const [personnel, setPersonnel] = useState<Personnel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddFormOpen, setIsAddFormOpen] = useState(false);
    const [newStoreName, setNewStoreName] = useState('');
    const [newStorePartnerId, setNewStorePartnerId] = useState<string>('');
    const [newStoreType, setNewStoreType] = useState<'own' | 'partner'>('own');
    const [newStorePersonnelIds, setNewStorePersonnelIds] = useState<string[]>([]);
    const [personnelSearchText, setPersonnelSearchText] = useState('');
    const [showPersonnelDropdown, setShowPersonnelDropdown] = useState(false);
    const [editingStore, setEditingStore] = useState<Store | null>(null);
    const [selectedStore, setSelectedStore] = useState<Store | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [storeToDelete, setStoreToDelete] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});

    // Lọc danh sách đối tác từ personnel có department là 'Đối tác'
    const partners = useMemo(() => {
        return personnel.filter(p => p.department === 'Đối tác').map(p => ({
            id: p.id || '',
            name: p.fullName
        }));
    }, [personnel]);

    useEffect(() => {
        loadStores();
    }, []);

    const loadStores = async () => {
        setIsLoading(true);
        try {
            const [storeData, personnelData] = await Promise.all([
                fetchStores(),
                fetchPersonnel()
            ]);
            let filteredStores = storeData.filter(s => s.id !== 'all');
            
            // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
            if (isPartner() && !isAdmin()) {
                const partnerId = getPartnerId();
                if (partnerId) {
                    filteredStores = filteredStores.filter(s => s.partnerId === partnerId);
                }
            }
            
            setStores(filteredStores);
            setPersonnel(personnelData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddStore = async () => {
        if(!newStoreName.trim()) {
            alert('Vui lòng nhập tên cửa hàng');
            return;
        }
        
        const storeNameToAdd = newStoreName.trim();
        try {
            // Nếu chọn đối tác thì chỉ lưu partnerId (ID của nhân viên có department "Đối tác"), không lưu personnelIds
            // Nếu là của mình thì chỉ lưu personnelIds, không lưu partnerId
            const storeData: any = {
                name: storeNameToAdd
            };
            
            if (newStorePartnerId) {
                storeData.partnerId = newStorePartnerId;
                storeData.personnelIds = undefined; // Xóa personnelIds nếu là đối tác
            } else {
                storeData.personnelIds = newStorePersonnelIds.length > 0 ? newStorePersonnelIds : undefined;
                storeData.partnerId = undefined; // Xóa partnerId nếu là của mình
            }
            
            await createStore(storeData);
            setNewStoreName('');
            setNewStorePartnerId('');
            setNewStorePersonnelIds([]);
            setPersonnelSearchText('');
            setShowPersonnelDropdown(false);
            setIsAddFormOpen(false);
            await loadStores();
            alert(`Đã thêm cửa hàng: ${storeNameToAdd}`);
        } catch (error) {
            console.error('Error adding store:', error);
            alert('Có lỗi xảy ra khi thêm cửa hàng');
        }
    };

    const handleStoreClick = (store: Store) => {
        setSelectedStore(store);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedStore(null);
    };

    const handleStartEdit = (store: Store) => {
        setEditingStore(store);
        setNewStoreName(store.name);
        setNewStorePartnerId(store.partnerId || '');
        setNewStoreType(store.storeType || 'own');
        setNewStorePersonnelIds(store.personnelIds || []);
        setPersonnelSearchText('');
        setShowPersonnelDropdown(false);
    };

    const handlePersonnelSelect = (personnelId: string) => {
        if (personnelId && personnelId !== '') {
            if (!newStorePersonnelIds.includes(personnelId)) {
                setNewStorePersonnelIds([...newStorePersonnelIds, personnelId]);
            }
            setPersonnelSearchText('');
            setShowPersonnelDropdown(false);
        }
    };

    const handleRemovePersonnel = (personnelId: string) => {
        setNewStorePersonnelIds(newStorePersonnelIds.filter(id => id !== personnelId));
    };

    // Filter personnel theo search text
    const filteredPersonnel = personnel.filter(person => {
        // Loại bỏ các nhân sự đã được chọn
        if (newStorePersonnelIds.includes(person.id || '')) return false;
        
        // Nếu có text tìm kiếm, filter theo text
        if (personnelSearchText) {
            const searchLower = personnelSearchText.toLowerCase();
            return (
                person.fullName.toLowerCase().includes(searchLower) ||
                person.department.toLowerCase().includes(searchLower) ||
                person.position.toLowerCase().includes(searchLower)
            );
        }
        
        // Nếu không có text, hiển thị tất cả
        return true;
    });

    const handleCancelEdit = () => {
        setEditingStore(null);
        setNewStoreName('');
        setNewStorePartnerId('');
        setNewStoreType('own');
        setNewStorePersonnelIds([]);
        setPersonnelSearchText('');
        setShowPersonnelDropdown(false);
        setIsAddFormOpen(false);
    };

    const handleUpdateStore = async () => {
        if (!editingStore || !newStoreName.trim()) {
            alert('Vui lòng nhập tên cửa hàng');
            return;
        }
        
        const storeNameToUpdate = newStoreName.trim();
        try {
            // Nếu chọn đối tác thì chỉ lưu partnerId (ID của nhân viên có department "Đối tác"), không lưu personnelIds
            // Nếu là của mình thì chỉ lưu personnelIds, không lưu partnerId
            const updateData: any = {
                name: storeNameToUpdate
            };
            
            if (newStorePartnerId) {
                updateData.partnerId = newStorePartnerId;
                updateData.personnelIds = undefined; // Xóa personnelIds nếu là đối tác
            } else {
                updateData.personnelIds = newStorePersonnelIds.length > 0 ? newStorePersonnelIds : undefined;
                updateData.partnerId = undefined; // Xóa partnerId nếu là của mình
            }
            
            await updateStore(editingStore.id, updateData);
            handleCancelEdit();
            await loadStores();
            alert(`Đã cập nhật cửa hàng: ${storeNameToUpdate}`);
        } catch (error) {
            console.error('Error updating store:', error);
            alert('Có lỗi xảy ra khi cập nhật cửa hàng');
        }
    };

    const handleDeleteStore = (storeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setStoreToDelete(storeId);
    };

    const confirmDeleteStore = async () => {
        if (storeToDelete) {
            try {
                await deleteStore(storeToDelete);
            setStoreToDelete(null);
                await loadStores();
            alert('Đã xóa cửa hàng');
            } catch (error) {
                console.error('Error deleting store:', error);
                alert('Có lỗi xảy ra khi xóa cửa hàng');
            }
        }
    };

    // Filter stores với search và filters
    const filteredStores = useMemo(() => {
        let filtered = stores;

        // Filter by search text
        if (searchText) {
            const searchLower = searchText.toLowerCase();
            filtered = filtered.filter(store => {
                // Tìm tên đối tác từ personnel có department "Đối tác"
                const partnerName = store.partnerId ? personnel.find(p => p.id === store.partnerId && p.department === 'Đối tác')?.fullName || '' : '';
                const personnelNames = (store.personnelIds || [])
                    .map(id => personnel.find(p => p.id === id)?.fullName || '')
                    .join(' ');
                return (
                    store.name.toLowerCase().includes(searchLower) ||
                    partnerName.toLowerCase().includes(searchLower) ||
                    personnelNames.toLowerCase().includes(searchLower)
                );
            });
        }

        return filtered;
    }, [stores, personnel, searchText, selectedFilters]);

    return (
        <div className="p-6 bg-gray-50 min-h-screen font-sans">
            <StoreDetailModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                store={selectedStore}
            />

             <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 uppercase">Quản lý Cửa Hàng (店铺管理)</h2>
                <button
                    onClick={() => {
                        setIsAddFormOpen(true);
                        setEditingStore(null);
                        setNewStoreName('');
                        setNewStorePartnerId('');
                        setNewStoreType('own');
                        setNewStorePersonnelIds([]);
                        setPersonnelSearchText('');
                        setShowPersonnelDropdown(false);
                    }}
                    className="bg-brand-navy hover:bg-brand-darkNavy text-white px-4 py-2 rounded shadow text-sm font-bold flex items-center gap-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Thêm Cửa Hàng Mới (添加新店铺)
                </button>
                    </div>

             {/* Filter Bar */}
             <FilterBar
                onSearch={setSearchText}
                onExportExcel={() => {
                    const exportData = filteredStores.map(store => {
                        const partner = store.partnerId ? personnel.find(p => p.id === store.partnerId && p.department === 'Đối tác') : null;
                        const personnelList = (store.personnelIds || [])
                            .map(id => personnel.find(p => p.id === id)?.fullName || '')
                            .join(', ');
                        return {
                            'Tên cửa hàng': store.name,
                            'Đối tác': partner?.fullName || '',
                            'Nhân sự phụ trách': personnelList || '',
                        };
                    });
                    exportToExcel(exportData, `stores-${new Date().toISOString().split('T')[0]}.xlsx`);
                }}
                onImportExcel={async (file) => {
                    try {
                        const data = await importFromExcel(file);
                        alert(`Đã import ${data.length} cửa hàng từ Excel. Vui lòng kiểm tra dữ liệu.`);
                        // TODO: Implement import logic
                    } catch (error) {
                        alert('Lỗi khi import Excel: ' + (error as Error).message);
                    }
                }}
                onReset={() => {
                    setSearchText('');
                    setSelectedFilters({});
                }}
                filterFields={[
                    {
                        key: 'storeTypes',
                        label: 'Loại cửa hàng (店铺类型)',
                        type: 'checkbox',
                        options: [
                            { value: 'own', label: 'Của mình (自己的)' },
                            { value: 'partner', label: 'Đối tác phụ trách (合作伙伴负责)' }
                        ]
                    },
                    {
                        key: 'partners',
                        label: 'Đối tác (合作伙伴)',
                        type: 'checkbox',
                        options: (partners || []).map(p => ({ value: p.id || '', label: p.name }))
                    }
                ]}
                selectedFilters={selectedFilters}
                onFilterChange={(field, values) => {
                    setSelectedFilters(prev => ({ ...prev, [field]: values }));
                }}
                dateFrom=""
                dateTo=""
                onDateFromChange={() => {}}
                onDateToChange={() => {}}
                onQuickDateSelect={() => {}}
             />

             {/* Table */}
             <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                            <tr>
                                <th className="px-4 py-3 text-left">Tên cửa hàng (店铺名称)</th>
                                <th className="px-4 py-3 text-left">Loại (类型)</th>
                                <th className="px-4 py-3 text-left">Đối tác (合作伙伴)</th>
                                <th className="px-4 py-3 text-left">Nhân sự phụ trách (负责人事)</th>
                                <th className="px-4 py-3 text-center">Thao tác (操作)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Store Rows */}
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500">Đang tải... (正在加载...)</td>
                                </tr>
                            ) : filteredStores.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-400">Chưa có cửa hàng nào (暂无店铺)</td>
                                </tr>
                            ) : (
                                filteredStores.map(store => (
                                    <tr key={store.id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-3 font-bold text-gray-800">{store.name}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                store.storeType === 'own' 
                                                    ? 'bg-green-100 text-green-800 border border-green-300' 
                                                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                                            }`}>
                                                {store.storeType === 'own' ? 'Của mình (自己的)' : 'Đối tác phụ trách (合作伙伴负责)'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {store.partnerId ? (
                                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs border border-blue-200">
                                                    {personnel.find(p => p.id === store.partnerId && p.department === 'Đối tác')?.fullName || store.partnerId}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {store.personnelIds && store.personnelIds.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {store.personnelIds.map(personnelId => {
                                                        const person = personnel.find(p => p.id === personnelId);
                                                        return person ? (
                                                            <span key={personnelId} className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs border border-purple-200">
                                                                {person.fullName}
                                                            </span>
                                                        ) : null;
                                                    })}
                                    </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-center gap-1">
                                        <button
                                                    onClick={() => handleStoreClick(store)}
                                            className="text-green-600 hover:text-green-800 font-medium text-xs border border-green-200 rounded px-2 py-1 bg-green-50 hover:bg-green-100"
                                            title="Xem chi tiết (查看详情)"
                                        >
                                                    Xem (查看)
                                        </button>
                                        <button
                                                    onClick={() => handleStartEdit(store)}
                                            className="text-blue-600 hover:text-blue-800 font-medium text-xs border border-blue-200 rounded px-2 py-1 bg-blue-50 hover:bg-blue-100"
                                            title="Sửa (编辑)"
                                        >
                                                    Sửa (编辑)
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteStore(store.id, e)}
                                            className="text-red-600 hover:text-red-800 font-medium text-xs border border-red-200 rounded px-2 py-1 bg-red-50 hover:bg-red-100"
                                            title="Xóa (删除)"
                                        >
                                                    Xóa (删除)
                                        </button>
                                    </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                    </div>

            {/* Add/Edit Store Modal */}
            {(isAddFormOpen || editingStore) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md m-4 p-6 relative">
                        <button 
                            onClick={handleCancelEdit} 
                            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h2 className="text-xl font-bold text-gray-800 mb-6 uppercase border-b pb-2">
                            {editingStore ? 'Sửa Cửa Hàng (编辑店铺)' : 'Thêm Cửa Hàng Mới (添加新店铺)'}
                        </h2>

                        <form onSubmit={(e) => { e.preventDefault(); editingStore ? handleUpdateStore() : handleAddStore(); }} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Tên cửa hàng * (店铺名称 *)</label>
                                <input 
                                    required
                                    type="text" 
                                    value={newStoreName}
                                    onChange={(e) => setNewStoreName(e.target.value)}
                                    placeholder="Nhập tên cửa hàng (输入店铺名称)"
                                    className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Đối tác (合作伙伴)</label>
                                <select
                                    value={newStorePartnerId}
                                    onChange={(e) => {
                                        setNewStorePartnerId(e.target.value);
                                        if (e.target.value) {
                                            setNewStorePersonnelIds([]); // Xóa personnelIds nếu chọn đối tác
                                        }
                                    }}
                                    className="w-full border rounded px-3 py-2 bg-white focus:ring-brand-navy focus:border-brand-navy"
                                >
                                    <option value="">-- Chọn đối tác (选择合作伙伴) --</option>
                                    {personnel.filter(p => p.department === 'Đối tác').map(partner => (
                                        <option key={partner.id} value={partner.id}>
                                            {partner.fullName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {!newStorePartnerId && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Nhân sự phụ trách (负责人事)</label>
                                <div className="space-y-3">
                                    {/* Searchable input để tìm và chọn nhân sự */}
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={personnelSearchText}
                                            onChange={(e) => {
                                                setPersonnelSearchText(e.target.value);
                                                setShowPersonnelDropdown(true);
                                            }}
                                            onFocus={() => setShowPersonnelDropdown(true)}
                                            onBlur={() => {
                                                // Delay để cho phép click vào item
                                                setTimeout(() => setShowPersonnelDropdown(false), 200);
                                            }}
                                            placeholder="Gõ để tìm nhân sự... (输入以查找人员...)"
                                            className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy"
                                        />
                                        {/* Dropdown list khi focus hoặc có text */}
                                        {showPersonnelDropdown && filteredPersonnel.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                                                {filteredPersonnel.map(person => (
                                                    <div
                                                        key={person.id}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault(); // Prevent blur before click
                                                            handlePersonnelSelect(person.id || '');
                                                            setShowPersonnelDropdown(false);
                                                        }}
                                                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                                    >
                                                        <div className="text-sm text-gray-700 font-medium">{person.fullName}</div>
                                                        <div className="text-xs text-gray-500">{person.department} - {person.position}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {showPersonnelDropdown && personnelSearchText && filteredPersonnel.length === 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg p-3">
                                                <p className="text-sm text-gray-500">Không tìm thấy nhân sự nào (未找到人员)</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Danh sách nhân sự đã chọn */}
                                    {newStorePersonnelIds.length > 0 && (
                                        <div className="border rounded p-3 bg-gray-50 max-h-40 overflow-y-auto">
                                            <p className="text-xs text-gray-600 mb-2 font-medium">Nhân sự đã chọn: (已选人员:)</p>
                                            <div className="space-y-1">
                                                {newStorePersonnelIds.map(personnelId => {
                                                    const person = personnel.find(p => p.id === personnelId);
                                                    return person ? (
                                                        <div key={personnelId} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200">
                                                            <div>
                                                                <span className="text-sm text-gray-700 font-medium">{person.fullName}</span>
                                                                <span className="text-xs text-gray-500 ml-2">({person.department})</span>
                                                            </div>
                                    <button 
                                        type="button"
                                                                onClick={() => handleRemovePersonnel(personnelId)}
                                                                className="text-red-600 hover:text-red-800 text-xs px-2 py-1 hover:bg-red-50 rounded"
                                    >
                                                                删除
                                    </button>
                                                        </div>
                                                    ) : null;
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            )}

                            <div className="pt-4 border-t flex justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={handleCancelEdit} 
                                    className="px-6 py-2 border rounded text-gray-600 hover:bg-gray-50"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy"
                                >
                                    {editingStore ? 'Cập nhật (更新)' : 'Thêm mới (添加)'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {storeToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80]">
                    <div className="bg-white p-6 rounded shadow-lg max-w-sm w-full text-center">
                        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Xác nhận xóa? (确认删除?)</h3>
                        <p className="text-sm text-gray-500 mb-6">Bạn có chắc chắn muốn xóa cửa hàng này không? Hành động này không thể hoàn tác. (您确定要删除此店铺吗? 此操作无法撤销。)</p>
                        <div className="flex justify-center gap-3">
                            <button onClick={() => setStoreToDelete(null)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 text-gray-800">Hủy (取消)</button>
                            <button onClick={confirmDeleteStore} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Xóa (删除)</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};