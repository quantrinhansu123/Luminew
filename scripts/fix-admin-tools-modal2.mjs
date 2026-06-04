import fs from 'fs';

const path = 'src/pages/AdminTools.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const startIdx = lines.findIndex((l) => l.includes('NÚT MỞ MODAL BÁO CÁO')) - 1;
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === ')}' && lines[i - 1]?.includes('</div>'));

// Find the modal closing: line after "Đóng báo cáo" block
let closeIdx = -1;
for (let i = startIdx; i < lines.length; i++) {
  if (lines[i].includes('Đóng báo cáo')) {
    for (let j = i; j < i + 10; j++) {
      if (lines[j].trim() === ')}') {
        closeIdx = j;
        break;
      }
    }
    break;
  }
}

if (startIdx >= 0 && closeIdx > startIdx) {
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
  lines.splice(startIdx, closeIdx - startIdx + 1, ...replacement);
  fs.writeFileSync(path, lines.join('\n'));
  console.log('Removed modal', startIdx + 1, '-', closeIdx + 1);
} else {
  console.error('Could not find modal block', { startIdx, closeIdx });
  process.exit(1);
}
