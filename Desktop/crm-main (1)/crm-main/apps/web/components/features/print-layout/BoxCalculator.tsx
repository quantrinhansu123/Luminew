'use client';

import React, { useState, useEffect } from 'react';
// Icons removed per design request

const BoxCalculator: React.FC = () => {
  // Khổ giấy chuẩn
  const standardPaperSizes = [
    { name: 'A4 (21x29.7cm)', width: 21, height: 29.7 },
    { name: 'A3 (29.7x42cm)', width: 29.7, height: 42 },
    { name: 'A2 (42x59.4cm)', width: 42, height: 59.4 },
    { name: 'A1 (59.4x84.1cm)', width: 59.4, height: 84.1 },
    { name: '65x86cm', width: 65, height: 86 },
    { name: '70x100cm', width: 70, height: 100 },
    { name: '79x109cm', width: 79, height: 109 },
    { name: '90x120cm', width: 90, height: 120 },
    { name: '100x140cm', width: 100, height: 140 }
  ];

  // Inputs - Kích thước hộp
  const [boxSize, setBoxSize] = useState({ width: 20, height: 30, depth: 10 }); // cm
  const [quantity, setQuantity] = useState(1000);
  const [selectedPaperSize, setSelectedPaperSize] = useState<string>('auto');
  const [recommendedPaperSize, setRecommendedPaperSize] = useState<{ width: number; height: number; name?: string; isCustom?: boolean }>({ width: 0, height: 0 });
  const [recommendedPaperWeight, setRecommendedPaperWeight] = useState<{ weight: number; reason: string }>({ weight: 300, reason: '' });
  const [upsPerSheet, setUpsPerSheet] = useState(0);
  const [layoutInfo, setLayoutInfo] = useState<{ cols: number; rows: number; rotated: boolean }>({ cols: 0, rows: 0, rotated: false });

  // Cài đặt nâng cao
  const [bleed, setBleed] = useState(0.3); // cm - Viền dự phòng
  const [gap, setGap] = useState(0.2); // cm - Khoảng cách giữa các hộp
  const [margin, setMargin] = useState(0.5); // cm - Lề giấy

  // Vật liệu
  const [paperWeight, setPaperWeight] = useState(300); // gsm - Hộp cần giấy dày hơn
  const [isLaminated, setIsLaminated] = useState(false);
  const [hasInnerFlaps, setHasInnerFlaps] = useState(true); // Có nắp gấp trong

  // Đơn giá
  const [paperPricePerM2, setPaperPricePerM2] = useState(15000); // VND/m2 - Giấy hộp đắt hơn
  const [printCostPerM2, setPrintCostPerM2] = useState(8000);
  const [laminateCostPerM2, setLaminateCostPerM2] = useState(5000);
  const [gluingCostPerBox, setGluingCostPerBox] = useState(500);
  const [cuttingCostPerBox, setCuttingCostPerBox] = useState(300);

  // Outputs
  const [result, setResult] = useState({
    flatArea: 0,
    totalMaterialArea: 0,
    totalCost: 0,
    costPerUnit: 0
  });

  useEffect(() => {
    calculate();
  }, [boxSize, quantity, paperWeight, isLaminated, hasInnerFlaps,
      paperPricePerM2, printCostPerM2, laminateCostPerM2, gluingCostPerBox, cuttingCostPerBox, selectedPaperSize, bleed, gap, margin]);

  // Tự động tính toán khi component mount
  useEffect(() => {
    calculate();
  }, []);

  const calculate = () => {
    const { width, height, depth } = boxSize;

    // Tính diện tích bế hộp (flat pattern)
    // Công thức: Diện tích các mặt + nắp gấp + lưỡi dán
    const topBottom = width * depth * 2; // Mặt trên + đáy
    const frontBack = width * height * 2; // Mặt trước + sau
    const leftRight = depth * height * 2; // Mặt trái + phải

    // Nắp gấp bên trong (nếu có)
    const innerFlaps = hasInnerFlaps ? (width * depth * 0.5) : 0;

    // Lưỡi dán (thêm 10% tổng diện tích)
    const glueTabs = (topBottom + frontBack + leftRight) * 0.1;

    // Tổng diện tích bế + 10% margin
    const flatAreaCm2 = topBottom + frontBack + leftRight + innerFlaps + glueTabs;
    const flatAreaWithMargin = flatAreaCm2 * 1.10;
    const flatAreaM2 = flatAreaWithMargin / 10000;

    // Tính khổ giấy đề xuất
    const flatWidth = (width * 2) + (depth * 2) + 3 + (bleed * 2) + gap;
    const flatHeight = height + depth + 3 + (bleed * 2) + gap;

    const standardPaperSizes = [
      { w: 21, h: 29.7, name: 'A4' },
      { w: 29.7, h: 42, name: 'A3' },
      { w: 42, h: 59.4, name: 'A2' },
      { w: 59.4, h: 84.1, name: 'A1' },
      { w: 65, h: 86, name: '65x86 cm' },
      { w: 70, h: 100, name: '70x100 cm' },
      { w: 79, h: 109, name: '79x109 cm' },
      { w: 90, h: 120, name: '90x120 cm' },
      { w: 100, h: 140, name: '100x140 cm' }
    ];

    let recommendedSize = { width: flatWidth, height: flatHeight, name: 'Đặc biệt', isCustom: true };

    if (selectedPaperSize !== 'auto') {
      const selectedSize = standardPaperSizes.find(s => s.name === selectedPaperSize);
      if (selectedSize) {
        recommendedSize = { width: selectedSize.w, height: selectedSize.h, name: selectedSize.name, isCustom: false };
      }
    } else {
      for (const size of standardPaperSizes) {
        if ((flatWidth <= size.w && flatHeight <= size.h) || (flatWidth <= size.h && flatHeight <= size.w)) {
          recommendedSize = { width: size.w, height: size.h, name: size.name, isCustom: false };
          break;
        }
      }
    }
    setRecommendedPaperSize(recommendedSize);

    // Gợi ý định lượng giấy cho hộp
    const boxVolume = width * height * depth;
    const maxDimension = Math.max(width, height, depth);

    let suggestedWeight = 300;
    let reason = '';

    if (boxVolume > 50000 || maxDimension > 50) {
      suggestedWeight = 400;
      reason = 'Hộp lớn, cần giấy duplex 400gsm để đảm bảo độ cứng';
    } else if (boxVolume > 20000 || maxDimension > 35) {
      suggestedWeight = 350;
      reason = 'Hộp trung bình, giấy 350gsm vừa đủ độ cứng';
    } else if (boxVolume > 8000 || maxDimension > 25) {
      suggestedWeight = 300;
      reason = 'Hộp vừa, giấy 300gsm là lựa chọn phổ biến';
    } else {
      suggestedWeight = 250;
      reason = 'Hộp nhỏ, giấy 250gsm nhẹ và tiết kiệm';
    }

    setRecommendedPaperWeight({ weight: suggestedWeight, reason });

    // Tính số hộp bế được trên 1 tờ giấy
    if (recommendedSize.width > 0 && recommendedSize.height > 0) {
      // Usable paper area (subtract margins)
      const usableWidth = recommendedSize.width - (margin * 2);
      const usableHeight = recommendedSize.height - (margin * 2);

      const boxFlatWidth = flatWidth;
      const boxFlatHeight = flatHeight;

      const option1_cols = Math.floor(usableWidth / boxFlatWidth);
      const option1_rows = Math.floor(usableHeight / boxFlatHeight);
      const option1_ups = option1_cols * option1_rows;

      const option2_cols = Math.floor(usableWidth / boxFlatHeight);
      const option2_rows = Math.floor(usableHeight / boxFlatWidth);
      const option2_ups = option2_cols * option2_rows;

      const bestUps = Math.max(option1_ups, option2_ups);
      const isRotated = option2_ups > option1_ups;

      setUpsPerSheet(bestUps);
      setLayoutInfo({
        cols: isRotated ? option2_cols : option1_cols,
        rows: isRotated ? option2_rows : option1_rows,
        rotated: isRotated
      });
    } else {
      setUpsPerSheet(0);
      setLayoutInfo({ cols: 0, rows: 0, rotated: false });
    }

    // Tổng diện tích vật liệu
    const wastePercentage = 1.05;
    const totalMaterialArea = flatAreaM2 * quantity * wastePercentage;

    // Chi phí
    const paperCost = totalMaterialArea * paperPricePerM2;
    const printingCost = totalMaterialArea * printCostPerM2;
    const laminatingCost = isLaminated ? totalMaterialArea * laminateCostPerM2 : 0;
    const gluingCost = quantity * gluingCostPerBox;
    const cuttingCost = quantity * cuttingCostPerBox;

    const total = paperCost + printingCost + laminatingCost + gluingCost + cuttingCost;

    setResult({
      flatArea: flatAreaM2,
      totalMaterialArea: totalMaterialArea,
      totalCost: total,
      costPerUnit: total / quantity
    });
  };

  const formatVND = (num: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);

  return (
    <div
      className="p-6 max-w-full mx-auto min-h-screen"
      style={{ background: 'linear-gradient(90deg, #FFFFFF 50%, #e6f0f7 100%)' }}
    >
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="space-y-2">
            <h2 className="text-3xl font-bold text-primary">Tính Giá Hộp Giấy</h2>
            <p className="text-[#1F2937] text-sm leading-relaxed">Tính toán diện tích bế và chi phí sản xuất hộp carton</p>
        </div>
        <div className="shrink-0">
          <button
            className="px-6 py-2 text-sm font-semibold text-white rounded-full shadow-lg"
            style={{ background: 'linear-gradient(90deg, #4CAF50 0%, #009688 100%)' }}
          >
            Đăng ký tư vấn
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Input Panel - Left */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-xl border border-slate-200">
                <h3 className="font-bold text-base mb-3 text-slate-700 border-b pb-2">1. Kích thước hộp (cm)</h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Rộng (W)</label>
                        <input
                          type="number"
                          value={boxSize.width}
                          onChange={e => setBoxSize({...boxSize, width: Number(e.target.value)})}
                          className="w-full p-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Cao (H)</label>
                        <input
                          type="number"
                          value={boxSize.height}
                          onChange={e => setBoxSize({...boxSize, height: Number(e.target.value)})}
                          className="w-full p-2 border rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Sâu (D)</label>
                        <input
                          type="number"
                          value={boxSize.depth}
                          onChange={e => setBoxSize({...boxSize, depth: Number(e.target.value)})}
                          className="w-full p-2 border rounded"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    <div>
                         <label className="block text-xs font-medium text-slate-500 mb-1">Số lượng hộp</label>
                         <input
                           type="number"
                           value={quantity}
                           onChange={e => setQuantity(Number(e.target.value))}
                           className="w-full p-2 border rounded"
                         />
                    </div>
                    <div>
                         <label className="block text-xs font-medium text-slate-500 mb-1">Chọn khổ giấy</label>
                         <select
                           value={selectedPaperSize}
                           onChange={e => setSelectedPaperSize(e.target.value)}
                           className="w-full p-2 border rounded bg-white"
                         >
                           <option value="auto">Tự động gợi ý</option>
                           <option value="A4">A4 (21x29.7cm)</option>
                           <option value="A3">A3 (29.7x42cm)</option>
                           <option value="A2">A2 (42x59.4cm)</option>
                           <option value="A1">A1 (59.4x84.1cm)</option>
                           <option value="65x86 cm">65x86cm</option>
                           <option value="70x100 cm">70x100cm</option>
                           <option value="79x109 cm">79x109cm</option>
                           <option value="90x120 cm">90x120cm</option>
                           <option value="100x140 cm">100x140cm</option>
                         </select>
                    </div>
                </div>

                {/* Gợi ý khổ giấy */}
                {recommendedPaperSize.width > 0 && (
                  <div className={`mt-3 rounded-lg p-3 ${
                    recommendedPaperSize.isCustom
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-blue-50 border border-blue-200'
                  }`}>
                    <div className="flex flex-col gap-1">
                        <p className={`text-sm font-semibold ${
                          recommendedPaperSize.isCustom ? 'text-red-800' : 'text-blue-800'
                        }`}>
                          {recommendedPaperSize.isCustom ? 'Khổ giấy đặc biệt:' : 'Khổ giấy đề xuất:'}
                        </p>
                        <p className={`text-lg font-bold ${
                          recommendedPaperSize.isCustom ? 'text-red-900' : 'text-blue-900'
                        }`}>
                          {recommendedPaperSize.name || `${Math.ceil(recommendedPaperSize.width)} x ${Math.ceil(recommendedPaperSize.height)} cm`}
                        </p>
                        <p className={`text-xs ${
                          recommendedPaperSize.isCustom ? 'text-red-700' : 'text-blue-700'
                        }`}>
                          {recommendedPaperSize.isCustom
                            ? 'Cần đặt khổ giấy đặc biệt - không có khổ chuẩn phù hợp'
                            : 'Khổ giấy chuẩn phù hợp nhất để bế hộp này'}
                        </p>
                        {upsPerSheet > 0 && (
                          <div className={`mt-2 pt-2 border-t ${
                            recommendedPaperSize.isCustom ? 'border-red-200' : 'border-blue-200'
                          }`}>
                            <p className={`text-sm font-bold ${
                              recommendedPaperSize.isCustom ? 'text-red-800' : 'text-blue-800'
                            }`}>
                              Bình file: <span className="text-xl">{upsPerSheet}</span> hộp/tờ
                            </p>
                            <p className={`text-xs ${
                              recommendedPaperSize.isCustom ? 'text-red-600' : 'text-blue-600'
                            }`}>
                              Cần {Math.ceil(quantity / upsPerSheet)} tờ giấy để bế {quantity} hộp
                            </p>
                          </div>
                        )}
                    </div>
                  </div>
                )}

            </div>

            <div className="bg-white p-5 rounded-2xl shadow-xl border border-slate-200">
                <h3 className="font-bold text-base mb-3 text-slate-700 border-b pb-2">📐 Cài Đặt Nâng Cao</h3>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Tràn lề - Bleed (cm) - <span className="text-slate-400">Viền dự phòng</span>
                        </label>
                        <input
                          type="number"
                          value={bleed}
                          onChange={e => setBleed(Number(e.target.value))}
                          className="w-full p-2 border rounded"
                          step="0.1"
                          min="0"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Khe hở (cm) - <span className="text-slate-400">Khoảng cách giữa các con</span>
                        </label>
                        <input
                          type="number"
                          value={gap}
                          onChange={e => setGap(Number(e.target.value))}
                          className="w-full p-2 border rounded"
                          step="0.1"
                          min="0"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Lề giấy (cm) - <span className="text-slate-400">Lề an toàn</span>
                        </label>
                        <input
                          type="number"
                          value={margin}
                          onChange={e => setMargin(Number(e.target.value))}
                          className="w-full p-2 border rounded"
                          step="0.1"
                          min="0"
                        />
                    </div>
                </div>
            </div>

        </div>

        {/* Tất cả hình ảnh - Right */}
        <div className="xl:col-span-7 space-y-4">
          {/* Số lượng hộp và Tính số tờ - Cùng một hàng */}
          {upsPerSheet > 0 && layoutInfo.cols > 0 ? (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Input số lượng hộp */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Số lượng hộp cần:</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e => setQuantity(Number(e.target.value))}
                    className="w-32 p-2 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 font-semibold"
                    min="1"
                  />
                </div>

                {/* Kết quả tính số tờ */}
                <div className="flex items-center gap-2 ml-auto">
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">{quantity.toLocaleString('vi-VN')}</span> ÷ <span className="font-medium">{upsPerSheet}</span> =
                  </div>
                  <div className="bg-blue-600 text-white rounded-lg px-4 py-2 shadow-md">
                    <span className="text-xl font-bold">{Math.ceil(quantity / upsPerSheet).toLocaleString('vi-VN')}</span>
                    <span className="text-sm ml-1 opacity-90">tờ</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">Số lượng hộp cần:</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                  className="w-32 p-2 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 font-semibold"
                  min="1"
                />
              </div>
            </div>
          )}

          {/* Visualization bố trí trên tờ giấy */}
          {upsPerSheet > 0 && layoutInfo.cols > 0 && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-base mb-3 text-slate-700 border-b pb-2">📐 Bố trí {recommendedPaperSize.name}</h3>
              <div className="bg-slate-50 rounded-lg p-3">
                <svg width="100%" height="280" viewBox="0 0 400 400" className="mx-auto" style={{maxWidth: '100%'}}>
                  {/* Tờ giấy nền */}
                  <rect x="20" y="20" width="360" height="360" fill="#fff" stroke="#2563eb" strokeWidth="3" rx="2"/>
                  <text x="200" y="15" textAnchor="middle" fill="#1e40af" fontSize="11" fontWeight="bold">
                    {recommendedPaperSize.name} - {layoutInfo.cols}×{layoutInfo.rows} = {upsPerSheet} hộp/tờ
                  </text>

                  {/* Vẽ grid các hộp */}
                  {Array.from({ length: layoutInfo.rows }).map((_, rowIdx) =>
                    Array.from({ length: layoutInfo.cols }).map((_, colIdx) => {
                      const boxW = 360 / layoutInfo.cols - 4;
                      const boxH = 360 / layoutInfo.rows - 4;
                      const x = 20 + (colIdx * (360 / layoutInfo.cols)) + 2;
                      const y = 20 + (rowIdx * (360 / layoutInfo.rows)) + 2;

                      return (
                        <g key={`${rowIdx}-${colIdx}`}>
                          <rect
                            x={x}
                            y={y}
                            width={boxW}
                            height={boxH}
                            fill="#dbeafe"
                            stroke="#2563eb"
                            strokeWidth="1.5"
                            opacity="0.9"
                          />
                          <text
                            x={x + boxW/2}
                            y={y + boxH/2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#1e40af"
                            fontSize="10"
                            fontWeight="bold"
                          >
                            {rowIdx * layoutInfo.cols + colIdx + 1}
                          </text>
                        </g>
                      );
                    })
                  )}

                  {/* Label kích thước */}
                  <text x="200" y="395" textAnchor="middle" fill="#1e40af" fontSize="10">
                    {layoutInfo.rotated ? '🔄 Xoay tối ưu' : '✓ Chuẩn'}
                  </text>
                </svg>
              </div>
            </div>
          )}

          {/* Ảnh trải hộp và Mô hình 3D - Cùng một khung */}
          <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Ảnh trải hộp */}
              <div>
                <h3 className="font-bold text-base mb-3 text-slate-700 border-b pb-2">Ảnh trải hộp (Flat Pattern)</h3>
                <div className="bg-slate-50 rounded-lg p-6">
                  <p className="text-sm font-semibold text-slate-700 mb-3 text-center">Bản trải hộp trên mặt phẳng</p>
                  <svg width="100%" height="240" viewBox="0 0 300 200" className="mx-auto" preserveAspectRatio="xMidYMid meet">
                    {/* Main box flat layout */}
                    <rect x="40" y="60" width="50" height="70" fill="#bfdbfe" stroke="#2563eb" strokeWidth="2"/>
                    <rect x="90" y="60" width="70" height="70" fill="#93c5fd" stroke="#2563eb" strokeWidth="2"/>
                    <rect x="160" y="60" width="50" height="70" fill="#bfdbfe" stroke="#2563eb" strokeWidth="2"/>
                    <rect x="210" y="60" width="70" height="70" fill="#93c5fd" stroke="#2563eb" strokeWidth="2"/>

                    {/* Top flap */}
                    <rect x="90" y="25" width="70" height="35" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="3"/>
                    <rect x="210" y="25" width="70" height="35" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="3"/>

                    {/* Bottom */}
                    <rect x="90" y="130" width="70" height="50" fill="#60a5fa" stroke="#2563eb" strokeWidth="2"/>
                    <rect x="210" y="130" width="70" height="50" fill="#60a5fa" stroke="#2563eb" strokeWidth="2"/>

                    {/* Glue tabs */}
                    <path d="M 40 60 L 30 65 L 30 125 L 40 130" fill="#e0f2fe" stroke="#2563eb" strokeWidth="1" strokeDasharray="2"/>

                    {/* Labels */}
                    <text x="125" y="100" fill="#1e3a8a" fontSize="9" fontWeight="bold" textAnchor="middle">Mặt</text>
                    <text x="245" y="100" fill="#1e3a8a" fontSize="9" fontWeight="bold" textAnchor="middle">Mặt</text>
                    <text x="65" y="100" fill="#1e3a8a" fontSize="8" textAnchor="middle">Hông</text>
                    <text x="185" y="100" fill="#1e3a8a" fontSize="8" textAnchor="middle">Hông</text>
                    <text x="125" y="158" fill="#1e40af" fontSize="8" fontWeight="bold" textAnchor="middle">Đáy</text>
                  </svg>
                </div>
              </div>

              {/* Mô hình 3D */}
              <div>
                <h3 className="font-bold text-base mb-3 text-slate-700 border-b pb-2">Mô hình hộp 3D</h3>
                <div className="bg-slate-50 rounded-lg p-6 flex items-center justify-center">
                  <svg width="100%" height="240" viewBox="0 0 300 400" className="mx-auto" preserveAspectRatio="xMidYMid meet">
                    {/* Hộp giấy 3D view */}
                    <defs>
                      <linearGradient id="boxGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style={{stopColor: '#60a5fa', stopOpacity: 0.8}} />
                        <stop offset="100%" style={{stopColor: '#3b82f6', stopOpacity: 0.9}} />
                      </linearGradient>
                      <linearGradient id="boxGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{stopColor: '#93c5fd', stopOpacity: 0.7}} />
                        <stop offset="100%" style={{stopColor: '#60a5fa', stopOpacity: 0.8}} />
                      </linearGradient>
                      <linearGradient id="boxGrad3" x1="100%" y1="0%" x2="0%" y2="0%">
                        <stop offset="0%" style={{stopColor: '#1e40af', stopOpacity: 0.9}} />
                        <stop offset="100%" style={{stopColor: '#3b82f6', stopOpacity: 0.8}} />
                      </linearGradient>
                    </defs>

                    {/* Mặt chính hộp */}
                    <rect x="80" y="80" width="140" height="180" fill="url(#boxGrad1)" stroke="#1e40af" strokeWidth="2" rx="2"/>

                    {/* Mặt bên trái */}
                    <path d="M 80 80 L 60 100 L 60 260 L 80 260 Z" fill="url(#boxGrad2)" stroke="#1e40af" strokeWidth="2"/>

                    {/* Mặt bên phải */}
                    <path d="M 220 80 L 240 100 L 240 260 L 220 260 Z" fill="url(#boxGrad3)" stroke="#1e40af" strokeWidth="2"/>

                    {/* Nắp hộp */}
                    <rect x="80" y="60" width="140" height="30" fill="#3b82f6" fillOpacity="0.6" stroke="#1e40af" strokeWidth="2" rx="2"/>
                    <path d="M 80 60 L 60 80 L 80 80 Z" fill="#2563eb" fillOpacity="0.7" stroke="#1e40af" strokeWidth="1"/>
                    <path d="M 220 60 L 240 80 L 220 80 Z" fill="#1e40af" fillOpacity="0.7" stroke="#1e40af" strokeWidth="1"/>

                    {/* Đáy hộp */}
                    <path d="M 80 260 L 60 280 L 150 300 L 240 280 L 220 260 Z" fill="#1e40af" fillOpacity="0.6" stroke="#1e40af" strokeWidth="2"/>

                    {/* Labels */}
                    <text x="150" y="170" fill="#fff" fontSize="14" fontWeight="bold" textAnchor="middle">H: {boxSize.height}</text>
                    <text x="250" y="180" fill="#1e40af" fontSize="12" fontWeight="bold">D: {boxSize.depth}</text>
                    <text x="150" y="290" fill="#1e40af" fontSize="12" fontWeight="bold" textAnchor="middle">W: {boxSize.width} cm</text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BoxCalculator;
