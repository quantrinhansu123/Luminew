import fs from 'fs';

const path = 'src/pages/AdminTools.jsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

// Remove broken useEffect tail (starts with comment about U1 modal)
const brokenStart = lines.findIndex((l) =>
  l.includes('Thứ tự nhân sự U1 (theo danh_sach_van_don) khi mở modal')
);
if (brokenStart >= 0) {
  const brokenEnd = lines.findIndex(
    (l, i) => i > brokenStart && l.includes('[isStatsModalOpen, historyChiaDon')
  );
  if (brokenEnd >= 0) {
    lines.splice(brokenStart, brokenEnd - brokenStart + 1);
  }
}

const btn = lines.findIndex((l) => l.includes('NÚT MỞ MODAL BÁO CÁO'));
let modalEnd = -1;
for (let i = btn; i < lines.length; i++) {
  if (lines[i].trim() === ')}') {
    const chunk = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
    if (chunk.includes('isStatsModalOpen')) {
      modalEnd = i;
      break;
    }
  }
}

if (btn >= 0 && modalEnd > btn) {
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
  lines.splice(btn - 1, modalEnd - btn + 2, ...replacement);
}

fs.writeFileSync(path, lines.join('\n'));
console.log('Fixed AdminTools', { btn: btn + 1, modalEnd: modalEnd + 1 });
