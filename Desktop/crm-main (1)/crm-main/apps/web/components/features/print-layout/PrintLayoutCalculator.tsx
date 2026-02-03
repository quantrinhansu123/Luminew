'use client';

import React, { useState, useEffect } from 'react';
import { Calculator, RotateCcw, Info, Grid3x3, AlertCircle } from 'lucide-react';

// Các khổ giấy chuẩn (cm)
const STANDARD_PAPER_SIZES: Record<string, { width: number; height: number }> = {
  'Tùy chỉnh': { width: 0, height: 0 },
  'A0 (84x119)': { width: 84.1, height: 118.9 },
  'A1 (59x84)': { width: 59.4, height: 84.1 },
  'A2 (42x59)': { width: 42, height: 59.4 },
  'A3 (29.7x42)': { width: 29.7, height: 42 },
  'A4 (21x29.7)': { width: 21, height: 29.7 },
  'A5 (14.8x21)': { width: 14.8, height: 21 },
  'Khổ 65x92': { width: 65, height: 92 },
  'Khổ 70x100': { width: 70, height: 100 },
  'Khổ 79x109': { width: 79, height: 109 },
  'Khổ 85x120': { width: 85, height: 120 },
  'Khổ 61x86': { width: 61, height: 86 },
  'Khổ 52x76': { width: 52, height: 76 },
};

interface LayoutResult {
  orientation: 'normal' | 'rotated';
  cols: number;
  rows: number;
  upsPerSheet: number;
  wasteArea: number;
  efficiency: number;
}

const PrintLayoutCalculator: React.FC = () => {
  // Paper settings
  const [selectedPaperSize, setSelectedPaperSize] = useState<string>('Khổ 65x92');
  const [paperWidth, setPaperWidth] = useState(65);
  const [paperHeight, setPaperHeight] = useState(92);

  // Product settings
  const [productWidth, setProductWidth] = useState(10);
  const [productHeight, setProductHeight] = useState(15);
  const [quantity, setQuantity] = useState(1000); // Số sản phẩm cần sản xuất

  // Additional settings
  const [bleed, setBleed] = useState(0.3); // cm
  const [gap, setGap] = useState(0.2); // cm - khoảng cách giữa các sản phẩm
  const [margin, setMargin] = useState(0.5); // cm - lề giấy

  // Results
  const [normalLayout, setNormalLayout] = useState<LayoutResult | null>(null);
  const [rotatedLayout, setRotatedLayout] = useState<LayoutResult | null>(null);
  const [bestLayout, setBestLayout] = useState<LayoutResult | null>(null);

  // Handle paper size selection
  useEffect(() => {
    if (selectedPaperSize !== 'Tùy chỉnh') {
      const size = STANDARD_PAPER_SIZES[selectedPaperSize];
      setPaperWidth(size.width);
      setPaperHeight(size.height);
    }
  }, [selectedPaperSize]);

  // Calculate layouts
  useEffect(() => {
    calculateLayouts();
  }, [paperWidth, paperHeight, productWidth, productHeight, bleed, gap, margin]);

  const calculateLayouts = () => {
    // Usable paper area (subtract margins)
    const usableWidth = paperWidth - (margin * 2);
    const usableHeight = paperHeight - (margin * 2);

    // Effective product size (including bleed and gap)
    const effectiveProductW = productWidth + (bleed * 2) + gap;
    const effectiveProductH = productHeight + (bleed * 2) + gap;

    // Calculate normal orientation
    const normalCols = Math.floor(usableWidth / effectiveProductW);
    const normalRows = Math.floor(usableHeight / effectiveProductH);
    const normalUps = normalCols * normalRows;
    const normalUsedArea = normalUps * productWidth * productHeight;
    const paperArea = paperWidth * paperHeight;
    const normalEfficiency = paperArea > 0 ? (normalUsedArea / paperArea) * 100 : 0;
    const normalWaste = paperArea - normalUsedArea;

    const normal: LayoutResult = {
      orientation: 'normal',
      cols: normalCols,
      rows: normalRows,
      upsPerSheet: normalUps,
      wasteArea: normalWaste,
      efficiency: normalEfficiency
    };

    // Calculate rotated orientation (90 degrees)
    const rotatedCols = Math.floor(usableWidth / effectiveProductH);
    const rotatedRows = Math.floor(usableHeight / effectiveProductW);
    const rotatedUps = rotatedCols * rotatedRows;
    const rotatedUsedArea = rotatedUps * productWidth * productHeight;
    const rotatedEfficiency = paperArea > 0 ? (rotatedUsedArea / paperArea) * 100 : 0;
    const rotatedWaste = paperArea - rotatedUsedArea;

    const rotated: LayoutResult = {
      orientation: 'rotated',
      cols: rotatedCols,
      rows: rotatedRows,
      upsPerSheet: rotatedUps,
      wasteArea: rotatedWaste,
      efficiency: rotatedEfficiency
    };

    setNormalLayout(normal);
    setRotatedLayout(rotated);

    // Determine best layout
    const best = normalUps >= rotatedUps ? normal : rotated;
    setBestLayout(best);
  };

  const resetToDefaults = () => {
    setSelectedPaperSize('Khổ 65x92');
    setPaperWidth(65);
    setPaperHeight(92);
    setProductWidth(10);
    setProductHeight(15);
    setQuantity(1000);
    setBleed(0.3);
    setGap(0.2);
    setMargin(0.5);
  };

  const renderLayoutPreview = (layout: LayoutResult | null, title: string, isRecommended: boolean = false) => {
    if (!layout || layout.upsPerSheet === 0) return null;

    const scale = 150 / Math.max(paperWidth, paperHeight);
    const previewPaperW = paperWidth * scale;
    const previewPaperH = paperHeight * scale;

    const productW = (layout.orientation === 'normal' ? productWidth : productHeight) * scale;
    const productH = (layout.orientation === 'normal' ? productHeight : productWidth) * scale;
    const marginScale = margin * scale;

    return (
      <div className={`bg-white p-4 rounded-lg border-2 ${isRecommended ? 'border-green-500 shadow-lg' : 'border-slate-200'}`}>
        {isRecommended && (
          <div className="mb-2 px-2 py-1 bg-green-500 text-white text-xs font-bold rounded inline-block">
            ✓ KHUYẾN NGHỊ
          </div>
        )}
        <h4 className="font-semibold text-slate-700 mb-3">{title}</h4>

        {/* Visual Preview */}
        <div className="flex justify-center mb-4">
          <svg width={previewPaperW + 20} height={previewPaperH + 20} className="border border-slate-300 bg-slate-50">
            {/* Paper outline */}
            <rect x="10" y="10" width={previewPaperW} height={previewPaperH} fill="white" stroke="#94a3b8" strokeWidth="1"/>

            {/* Margin guidelines */}
            <rect x={10 + marginScale} y={10 + marginScale}
                  width={previewPaperW - marginScale * 2}
                  height={previewPaperH - marginScale * 2}
                  fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="2,2"/>

            {/* Products */}
            {Array.from({ length: layout.rows }).map((_, row) =>
              Array.from({ length: layout.cols }).map((_, col) => {
                const x = 10 + marginScale + col * (productW + gap * scale);
                const y = 10 + marginScale + row * (productH + gap * scale);
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={x}
                    y={y}
                    width={productW}
                    height={productH}
                    fill="#3b82f6"
                    opacity="0.3"
                    stroke="#2563eb"
                    strokeWidth="1"
                  />
                );
              })
            )}
          </svg>
        </div>

        {/* Stats */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Bố trí:</span>
            <span className="font-semibold">{layout.cols} × {layout.rows}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Số con/tờ:</span>
            <span className="font-bold text-lg text-blue-600">{layout.upsPerSheet} con</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Hiệu suất:</span>
            <span className={`font-semibold ${layout.efficiency >= 70 ? 'text-green-600' : layout.efficiency >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {layout.efficiency.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Diện tích hao phí:</span>
            <span className="text-slate-500">{layout.wasteArea.toFixed(0)} cm²</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 rounded-lg text-blue-600">
            <Grid3x3 size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Công Cụ Bình File In Ấn</h2>
            <p className="text-slate-500 text-sm">Tính toán bố trí sản phẩm tối ưu trên khổ giấy in</p>
          </div>
        </div>
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition-colors"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Input Panel - Left */}
        <div className="lg:col-span-1 space-y-4">
          {/* 1. Paper Size */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-base mb-4 text-slate-700 flex items-center gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">1</span>
              Khổ Giấy In
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Khổ giấy</label>
                <select
                  value={selectedPaperSize}
                  onChange={(e) => setSelectedPaperSize(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Object.keys(STANDARD_PAPER_SIZES).map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rộng (cm)</label>
                  <input
                    type="number"
                    value={paperWidth}
                    onChange={(e) => {
                      setPaperWidth(Number(e.target.value));
                      setSelectedPaperSize('Tùy chỉnh');
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    step="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cao (cm)</label>
                  <input
                    type="number"
                    value={paperHeight}
                    onChange={(e) => {
                      setPaperHeight(Number(e.target.value));
                      setSelectedPaperSize('Tùy chỉnh');
                    }}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    step="0.1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Product Size */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-base mb-4 text-slate-700 flex items-center gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">2</span>
              Kích Thước Thành Phẩm
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Rộng (cm)</label>
                <input
                  type="number"
                  value={productWidth}
                  onChange={(e) => setProductWidth(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Cao (cm)</label>
                <input
                  type="number"
                  value={productHeight}
                  onChange={(e) => setProductHeight(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* 3. Advanced Settings */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-base mb-4 text-slate-700 flex items-center gap-2">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">3</span>
              Cài Đặt Nâng Cao
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tràn lề - Bleed (cm)
                  <span className="text-slate-400 ml-1">- Viền dự phòng</span>
                </label>
                <input
                  type="number"
                  value={bleed}
                  onChange={(e) => setBleed(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Khe hở (cm)
                  <span className="text-slate-400 ml-1">- Khoảng cách giữa các con</span>
                </label>
                <input
                  type="number"
                  value={gap}
                  onChange={(e) => setGap(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Lề giấy (cm)
                  <span className="text-slate-400 ml-1">- Lề an toàn</span>
                </label>
                <input
                  type="number"
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  step="0.1"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-start gap-2">
              <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-800">
                <p className="font-semibold mb-1">Hướng dẫn sử dụng:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Chọn khổ giấy in hoặc nhập tùy chỉnh</li>
                  <li>Nhập kích thước sản phẩm thành phẩm</li>
                  <li>Điều chỉnh bleed và khe hở nếu cần</li>
                  <li>Xem kết quả bố trí tối ưu</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3">
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-6 rounded-xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Grid3x3 size={24} />
              Kết Quả Bố Trí
            </h3>

            {/* Số sản phẩm và Tính số tờ - Cùng một hàng */}
            {bestLayout && bestLayout.upsPerSheet > 0 ? (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Input số sản phẩm */}
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Số sản phẩm cần:</label>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-32 p-2 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 font-semibold"
                      min="1"
                    />
                  </div>

                  {/* Kết quả tính số tờ */}
                  <div className="flex items-center gap-2 ml-auto">
                    <div className="text-sm text-slate-600">
                      <span className="font-medium">{quantity.toLocaleString('vi-VN')}</span> ÷ <span className="font-medium">{bestLayout.upsPerSheet}</span> =
                    </div>
                    <div className="bg-blue-600 text-white rounded-lg px-4 py-2 shadow-md">
                      <span className="text-xl font-bold">{Math.ceil(quantity / bestLayout.upsPerSheet).toLocaleString('vi-VN')}</span>
                      <span className="text-sm ml-1 opacity-90">tờ</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-4 rounded-lg shadow-sm mb-6 border border-slate-200">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Số sản phẩm cần:</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-32 p-2 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 font-semibold"
                    min="1"
                  />
                </div>
              </div>
            )}

            {bestLayout && bestLayout.upsPerSheet > 0 ? (
              <>

                {/* Summary */}
                <div className="bg-white p-6 rounded-lg shadow-sm mb-6 border-2 border-blue-500">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">{bestLayout.upsPerSheet}</div>
                      <div className="text-xs text-slate-600 mt-1">Con / Tờ</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-700">{bestLayout.cols} × {bestLayout.rows}</div>
                      <div className="text-xs text-slate-600 mt-1">Bố trí tối ưu</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${bestLayout.efficiency >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {bestLayout.efficiency.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-600 mt-1">Hiệu suất</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-700">
                        {bestLayout.orientation === 'normal' ? '⬜' : '🔄'}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {bestLayout.orientation === 'normal' ? 'Chiều dọc' : 'Xoay 90°'}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.ceil(quantity / bestLayout.upsPerSheet).toLocaleString('vi-VN')}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">Số tờ cần ({quantity.toLocaleString('vi-VN')} sp)</div>
                    </div>
                  </div>
                </div>

                {/* Layout Previews */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {normalLayout && renderLayoutPreview(
                    normalLayout,
                    'Bố trí chiều dọc',
                    bestLayout.orientation === 'normal'
                  )}
                  {rotatedLayout && renderLayoutPreview(
                    rotatedLayout,
                    'Bố trí xoay 90°',
                    bestLayout.orientation === 'rotated'
                  )}
                </div>
              </>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
                <AlertCircle size={48} className="text-yellow-600 mx-auto mb-3" />
                <p className="text-yellow-800 font-medium">
                  Không thể bố trí sản phẩm trên khổ giấy này
                </p>
                <p className="text-yellow-700 text-sm mt-2">
                  Vui lòng điều chỉnh kích thước hoặc chọn khổ giấy lớn hơn
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintLayoutCalculator;
