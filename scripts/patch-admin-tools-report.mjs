import fs from 'fs';

const path = 'src/pages/AdminTools.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// 1) Remove helper block lines 166-707 (index 165-706 inclusive)
lines.splice(165, 707 - 165);

// Re-find after splice
const findLine = (pred) => lines.findIndex(pred);

// 2) Add useNavigate import
const reactImportIdx = lines.findIndex((l) => l.includes("from 'react'"));
if (reactImportIdx >= 0 && !lines.some((l) => l.includes('useNavigate'))) {
  lines[reactImportIdx] = lines[reactImportIdx].replace(
    "from 'react'",
    "from 'react'"
  );
  lines.splice(reactImportIdx + 1, 0, "import { useNavigate } from 'react-router-dom';");
}

// 3) Remove history/report state inside component
const removeStateBlock = () => {
  const start = findLine((l) => l.includes('const [isStatsModalOpen'));
  const end = findLine((l, i) => i > start && l.includes('const [selectedMonth'));
  if (start >= 0 && end > start) {
    lines.splice(start, end - start);
    return true;
  }
  return false;
};
removeStateBlock();

// 4) Remove useEffects for isStatsModalOpen
for (let pass = 0; pass < 2; pass++) {
  const start = findLine((l) => l.includes('if (!isStatsModalOpen) return'));
  if (start < 0) break;
  let effectStart = start;
  while (effectStart > 0 && !lines[effectStart].includes('useEffect(')) effectStart--;
  let effectEnd = start;
  while (effectEnd < lines.length && !lines[effectEnd].includes('}, [isStatsModalOpen')) effectEnd++;
  if (lines[effectEnd]?.includes('}, [isStatsModalOpen')) {
    while (effectEnd < lines.length && lines[effectEnd].trim() !== '});') effectEnd++;
    effectEnd++;
    lines.splice(effectStart, effectEnd - effectStart);
  }
}

// 5) Remove handleLoadHistoryChiaDon function
const hlStart = findLine((l) => l.includes('const handleLoadHistoryChiaDon = async'));
if (hlStart >= 0) {
  let hlEnd = hlStart;
  while (hlEnd < lines.length && !lines[hlEnd].includes('// --- CHIA ĐƠN VẬN ĐƠN ---')) hlEnd++;
  lines.splice(hlStart, hlEnd - hlStart);
}

// 6) Remove normalizeHistoryBranchKey inside component if still there
const nhStart = findLine((l) => l.trim().startsWith('const normalizeHistoryBranchKey ='));
if (nhStart >= 0) {
  let nhEnd = nhStart + 1;
  while (nhEnd < lines.length && lines[nhEnd].trim() !== '};') nhEnd++;
  nhEnd++;
  lines.splice(nhStart, nhEnd - nhStart);
}

// 7) Remove handleLoadHistoryChiaDon() call in finally
lines = lines.map((l) =>
  l.includes('handleLoadHistoryChiaDon();') && l.trim() === 'handleLoadHistoryChiaDon();'
    ? '            // Lịch sử: xem trang /bao-cao-phan-bo-don-hang'
    : l
);

// 8) Replace stats button + modal with navigate button only
const btnStart = findLine((l) => l.includes('NÚT MỞ MODAL BÁO CÁO'));
const modalEnd = findLine((l, i) => i > btnStart && l.trim() === ')}' && lines.slice(Math.max(0, i - 5), i + 1).join('\n').includes('isStatsModalOpen'));
if (btnStart >= 0 && modalEnd > btnStart) {
  const replacement = [
    '                                {/* --- Báo cáo phân bổ (trang riêng) --- */}',
    '                                <div className="mt-6 flex justify-center">',
    '                                    <button',
    '                                        type="button"',
    '                                        onClick={() => navigate(\'/bao-cao-phan-bo-don-hang\')}',
    '                                        className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"',
    '                                    >',
    '                                        <div className="bg-white/20 p-2 rounded-xl">',
    '                                            <BarChart3 className="w-6 h-6" />',
    '                                        </div>',
    '                                        <div className="text-left">',
    '                                            <p className="text-sm">Xem Thống kê &</p>',
    '                                            <p className="text-lg leading-tight">Báo cáo Chia đơn Chi tiết</p>',
    '                                        </div>',
    '                                        <ArrowLeft className="w-5 h-5 rotate-180 group-hover:translate-x-1 transition-transform" />',
    '                                    </button>',
    '                                </div>',
    '',
  ];
  lines.splice(btnStart - 1, modalEnd - btnStart + 2, ...replacement);
}

// 9) Add navigate hook in component
const adminStart = findLine((l) => l.includes('const AdminTools = () => {'));
if (adminStart >= 0) {
  const canViewLine = findLine((l, i) => i > adminStart && l.includes('const { canView }'));
  if (canViewLine >= 0 && !lines.slice(adminStart, canViewLine + 3).some((l) => l.includes('useNavigate'))) {
    lines.splice(canViewLine + 1, 0, '    const navigate = useNavigate();', '');
  }
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Patched AdminTools.jsx');
