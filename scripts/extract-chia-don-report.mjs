import fs from 'fs';

const adminPath = 'src/pages/AdminTools.jsx';
const lines = fs.readFileSync(adminPath, 'utf8').split(/\r?\n/);

const helperBlock = lines.slice(165, 707).join('\n');
let utils = helperBlock
  .replace(/^async function fetchPagedSupabaseSelect/m, 'export async function fetchPagedSupabaseSelect')
  .replace(/^async function fetchOrderRowsWithChiTietForReportRange/m, 'export async function fetchOrderRowsWithChiTietForReportRange')
  .replace(/^function /gm, 'export function ')
  .replace(/^const CHI_TIET_CHIA_REPORT_KEY_ORDER/m, 'export const CHI_TIET_CHIA_REPORT_KEY_ORDER')
  .replace(/^const ADMIN_TOOLS_PAGE_SIZE = 1000;/m, 'const REPORT_PAGE_SIZE = 1000;')
  .replace(/ADMIN_TOOLS_PAGE_SIZE/g, 'REPORT_PAGE_SIZE');

utils = `import { supabase } from '../supabase/config';\n\n${utils}\n\n/** Alias dùng trong UI báo cáo. */\nexport function normalizeHistoryBranchKey(raw) {\n  return normalizeHistoryBranchForChiReport(raw);\n}\n`;

fs.mkdirSync('src/utils', { recursive: true });
fs.writeFileSync('src/utils/chiaDonVanDonReport.js', utils);

const modalStart = lines.findIndex((l) => l.includes('{isStatsModalOpen &&'));
let modalEnd = -1;
for (let i = modalStart + 1; i < lines.length; i++) {
  if (lines[i].trim() === ')}') {
    const chunk = lines.slice(modalStart, i + 1).join('\n');
    if (chunk.includes('Đóng báo cáo')) {
      modalEnd = i;
      break;
    }
  }
}

console.log('modal lines', modalStart + 1, '-', modalEnd + 1);
fs.writeFileSync('scripts/_modal_extract.txt', lines.slice(modalStart, modalEnd + 1).join('\n'));
