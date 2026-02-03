import React, { useState } from 'react';
import ScrollPicker from './ScrollPicker';

interface TimePickerModalProps {
    value: string; // Format: "HH:MM"
    onChange: (value: string) => void;
    onClose: () => void;
}

const TimePickerModal: React.FC<TimePickerModalProps> = ({ value, onChange, onClose }) => {
    const [hours, minutes] = value.split(':');
    const [selectedHour, setSelectedHour] = useState(hours);
    const [selectedMinute, setSelectedMinute] = useState(minutes);

    const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

    const handleConfirm = () => {
        onChange(`${selectedHour}:${selectedMinute}`);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[2000] p-0 sm:p-4 animate-modalFadeIn" onClick={onClose}>
            <div className="bg-white p-6 sm:p-8 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md animate-modalContentSlideIn touch-none modal-content-70" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="text-center mb-4 sm:mb-6">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">Chọn thời gian</h3>
                    <div className="flex items-center justify-center gap-2 text-4xl sm:text-5xl font-bold text-brand">
                        <span>{selectedHour}</span>
                        <span className="opacity-50">:</span>
                        <span>{selectedMinute}</span>
                    </div>
                </div>

                {/* Scroll Pickers */}
                <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-6 px-2">
                    <div className="flex-1 max-w-[120px] sm:max-w-[140px]">
                        <p className="text-center text-xs sm:text-sm font-semibold text-gray-600 mb-2">Giờ</p>
                        <ScrollPicker 
                            items={hourOptions} 
                            defaultIndex={hourOptions.indexOf(selectedHour)} 
                            onUpdate={setSelectedHour} 
                        />
                    </div>
                    
                    <div className="flex items-center h-[240px] pt-6">
                        <span className="text-3xl sm:text-4xl font-bold text-gray-400">:</span>
                    </div>
                    
                    <div className="flex-1 max-w-[120px] sm:max-w-[140px]">
                        <p className="text-center text-xs sm:text-sm font-semibold text-gray-600 mb-2">Phút</p>
                        <ScrollPicker 
                            items={minuteOptions} 
                            defaultIndex={minuteOptions.indexOf(selectedMinute)} 
                            onUpdate={setSelectedMinute} 
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 sm:gap-3 justify-end">
                    <button 
                        onClick={onClose}
                        className="px-5 sm:px-6 py-2.5 sm:py-3 bg-gray-200 text-gray-800 rounded-xl font-semibold transition hover:bg-gray-300 text-sm sm:text-base active:scale-95"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleConfirm}
                        className="px-5 sm:px-6 py-2.5 sm:py-3 bg-brand text-white rounded-xl font-semibold transition hover:bg-brand/90 hover:shadow-lg text-sm sm:text-base active:scale-95"
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TimePickerModal;

