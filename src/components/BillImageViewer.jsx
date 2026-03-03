import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

const BillImageViewer = ({ paymentImage, orderCode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Parse các link từ textarea (mỗi dòng một link)
  const links = paymentImage && paymentImage.trim()
    ? paymentImage
        .split('\n')
        .map(link => link.trim())
        .filter(link => link.length > 0)
    : [];

  const hasData = paymentImage && paymentImage.trim() && links.length > 0;

  const handleOpen = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (hasData) {
      setIsOpen(true);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const modalContent = isOpen && hasData ? (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4" 
      onClick={handleClose}
      style={{ zIndex: 99999 }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h3 className="text-xl font-bold text-gray-800">Link hình ảnh Bill</h3>
            <p className="text-sm text-gray-500 mt-1">Mã đơn: {orderCode || 'N/A'}</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white/80 rounded-lg transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Hiển thị toàn bộ nội dung text */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Nội dung đầy đủ:</h4>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-white p-3 rounded border border-gray-200 max-h-32 overflow-y-auto">
              {paymentImage}
            </pre>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Danh sách link ({links.length}):</h4>
            {links.map((link, index) => {
              // Kiểm tra xem có phải là link hình ảnh không
              const isImageLink = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(link) || 
                                 link.includes('drive.google.com') || 
                                 link.includes('imgur.com') ||
                                 link.includes('cloudinary.com') ||
                                 link.includes('i.imgur.com');

              return (
                <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          Link {index + 1}
                        </span>
                        {isImageLink && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            Hình ảnh
                          </span>
                        )}
                      </div>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 break-all flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{link}</span>
                      </a>
                    </div>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors flex items-center gap-1 flex-shrink-0"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Mở
                    </a>
                  </div>
                  
                  {/* Preview image nếu là link hình ảnh */}
                  {isImageLink && (
                    <div className="mt-3 border-t border-gray-200 pt-3">
                      <img
                        src={link}
                        alt={`Bill ${index + 1}`}
                        className="max-w-full h-auto max-h-64 rounded border border-gray-200"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Tổng cộng: {links.length} link • Click vào link để mở trong tab mới
          </p>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={!hasData}
        className={`px-2 py-1 text-white text-xs rounded transition-colors flex items-center gap-1 ${
          hasData 
            ? 'bg-blue-500 hover:bg-blue-600 cursor-pointer' 
            : 'bg-gray-300 cursor-not-allowed'
        }`}
        title={hasData ? `Xem ${links.length} link bill` : 'Không có dữ liệu'}
      >
        <ExternalLink className="w-3 h-3" />
        <span>Mở</span>
      </button>

      {mounted && typeof document !== 'undefined' && document.body && modalContent
        ? createPortal(modalContent, document.body)
        : modalContent}
    </>
  );
};

export default BillImageViewer;
