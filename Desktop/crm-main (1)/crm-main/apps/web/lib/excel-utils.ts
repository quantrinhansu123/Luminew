import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Lead, Customer, InteractionLog } from './types';

/**
 * Format date to Vietnamese locale
 */
const formatDateVN = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format currency to VND
 */
const formatVND = (num: number | undefined): string => {
  if (!num) return '0';
  return new Intl.NumberFormat('vi-VN').format(num);
};

/**
 * Translate lead status to Vietnamese
 */
const translateLeadStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'new': 'Mới',
    'calling': 'Đang gọi',
    'no_answer': 'Không nghe máy',
    'closed': 'Đã chốt',
    'rejected': 'Từ chối'
  };
  return statusMap[status] || status;
};

/**
 * Export leads to Excel file with full details
 */
export function exportLeadsToExcel(leads: Lead[], filename: string = 'danh-sach-lead.xlsx') {
  if (!leads || leads.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }

  const excelData = leads.map((lead, index) => ({
    'STT': index + 1,
    'Mã KH': lead.id,
    'Họ và tên': lead.full_name,
    'Số điện thoại': lead.phone,
    'Email': lead.email || '',
    'Nguồn': lead.lead_sources?.name || '',
    'Loại nguồn': lead.lead_sources?.type || '',
    'Nhãn nguồn': lead.source_label || '',
    'Chiến dịch': lead.campaigns?.name || '',
    'Nhu cầu': lead.demand || '',
    'Nhóm sản phẩm': lead.product_groups?.name || '',
    'Nhóm khách hàng': lead.customer_group || '',
    'Trạng thái': translateLeadStatus(lead.status),
    'NV Sale': lead.sales_employees?.full_name || '',
    'Mã NV': lead.sales_employees?.employee_code || '',
    'Phương thức phân bổ': lead.assignment_method || '',
    'Ngày phân bổ': formatDateVN(lead.assigned_at),
    'Liên hệ lần cuối': formatDateVN(lead.last_contacted_at),
    'Ngày tạo': formatDateVN(lead.created_at),
    'Đã chuyển KH': lead.is_converted ? 'Có' : 'Không',
    'Ngày chuyển KH': formatDateVN(lead.converted_at),
  }));

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');

  // Auto-size columns
  const maxWidth = 40;
  const colWidths = Object.keys(excelData[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...excelData.map((row) => String(row[key as keyof typeof row] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  ws['!cols'] = colWidths;

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, filename);
}

/**
 * Export customers to Excel file
 */
export function exportCustomersToExcel(customers: Customer[], filename: string = 'danh-sach-khach-hang.xlsx') {
  if (!customers || customers.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }

  const excelData = customers.map((customer, index) => ({
    'STT': index + 1,
    'Mã KH': customer.customer_code || `#${customer.id}`,
    'Họ và tên': customer.full_name,
    'Số điện thoại': customer.phone,
    'Email': customer.email || '',
    'Địa chỉ': customer.address || '',
    'Mã số thuế': customer.tax_code || '',
    'Tên công ty': customer.company_name || '',
    'NV quản lý': customer.sales_employees?.full_name || '',
    'Tổng đơn hàng': customer.total_orders || 0,
    'Tổng doanh thu': formatVND(customer.total_revenue),
    'Công nợ': formatVND(customer.outstanding_balance),
    'Ngày chuyển đổi': formatDateVN(customer.converted_at),
    'Đơn hàng cuối': formatDateVN(customer.last_order_at),
    'Ngày tạo': formatDateVN(customer.created_at),
  }));

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const maxWidth = 40;
  const colWidths = Object.keys(excelData[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...excelData.map((row) => String(row[key as keyof typeof row] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  ws['!cols'] = colWidths;

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, filename);
}

/**
 * Export interaction logs to Excel
 */
export function exportInteractionsToExcel(logs: InteractionLog[], filename: string = 'lich-su-tuong-tac.xlsx') {
  if (!logs || logs.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }

  const typeMap: Record<string, string> = {
    'message': 'Tin nhắn',
    'call': 'Cuộc gọi',
    'email': 'Email',
    'meeting': 'Gặp mặt',
    'note': 'Ghi chú'
  };

  const excelData = logs.map((log, index) => ({
    'STT': index + 1,
    'Mã tương tác': log.id,
    'Loại': typeMap[log.type] || log.type,
    'Kênh': log.channel || '',
    'Hướng': log.direction === 'inbound' ? 'Đến' : 'Đi',
    'Nội dung': log.content || '',
    'Tóm tắt': log.summary || '',
    'NV thực hiện': log.sales_employees?.full_name || '',
    'Thời lượng (giây)': log.duration_seconds || '',
    'Thời gian': formatDateVN(log.occurred_at),
  }));

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Interactions');

  const maxWidth = 50;
  const colWidths = Object.keys(excelData[0] || {}).map((key) => {
    const maxLength = Math.max(
      key.length,
      ...excelData.map((row) => String(row[key as keyof typeof row] || '').length)
    );
    return { wch: Math.min(maxLength + 2, maxWidth) };
  });
  ws['!cols'] = colWidths;

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, filename);
}

/**
 * Parse Excel file to lead data for import
 */
export async function parseExcelToLeads(file: File): Promise<Partial<Lead>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const leads = jsonData.map((row: any) => ({
          full_name: row['Họ và tên'] || row['full_name'] || row['Tên'] || '',
          phone: String(row['Số điện thoại'] || row['phone'] || row['SĐT'] || '').trim(),
          email: row['Email'] || row['email'] || undefined,
          demand: row['Nhu cầu'] || row['demand'] || row['Yêu cầu'] || undefined,
          source_label: row['Nhãn nguồn'] || row['source_label'] || row['Nguồn'] || undefined,
          customer_group: row['Nhóm KH'] || row['customer_group'] || undefined,
        }));

        // Filter out empty rows
        const validLeads = leads.filter(lead => lead.full_name && lead.phone);

        resolve(validLeads);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error('Không thể đọc file'));
    };

    reader.readAsBinaryString(file);
  });
}

/**
 * Generate Excel template for lead import
 */
export function downloadLeadTemplate() {
  const template = [
    {
      'Họ và tên': 'Nguyễn Văn A',
      'Số điện thoại': '0901234567',
      'Email': 'example@email.com',
      'Nhu cầu': 'Cần in hộp giấy 1000 cái',
      'Nhãn nguồn': 'Facebook Ads - Chiến dịch Tết',
      'Nhóm KH': 'Khách hàng doanh nghiệp',
    },
    {
      'Họ và tên': 'Trần Thị B',
      'Số điện thoại': '0912345678',
      'Email': 'tranb@company.com',
      'Nhu cầu': 'Thiết kế túi giấy',
      'Nhãn nguồn': 'Zalo OA',
      'Nhóm KH': 'Khách hàng cá nhân',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  ws['!cols'] = [
    { wch: 25 },
    { wch: 15 },
    { wch: 30 },
    { wch: 35 },
    { wch: 30 },
    { wch: 25 },
  ];

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, 'mau-import-lead.xlsx');
}

/**
 * Export box calculation results to Excel
 */
export function exportBoxCalculationToExcel(data: {
  boxSize: { width: number; height: number; depth: number };
  quantity: number;
  paperSize: string;
  upsPerSheet: number;
  sheetsNeeded: number;
  paperWeight: number;
  totalCost: number;
  costPerUnit: number;
}, filename: string = 'bao-gia-hop.xlsx') {
  const excelData = [
    { 'Thông tin': 'Kích thước hộp (Rộng x Cao x Sâu)', 'Giá trị': `${data.boxSize.width} x ${data.boxSize.height} x ${data.boxSize.depth} cm` },
    { 'Thông tin': 'Số lượng', 'Giá trị': formatVND(data.quantity) + ' hộp' },
    { 'Thông tin': 'Khổ giấy', 'Giá trị': data.paperSize },
    { 'Thông tin': 'Số hộp/tờ', 'Giá trị': data.upsPerSheet.toString() },
    { 'Thông tin': 'Số tờ giấy cần', 'Giá trị': formatVND(data.sheetsNeeded) + ' tờ' },
    { 'Thông tin': 'Định lượng giấy', 'Giá trị': data.paperWeight + ' gsm' },
    { 'Thông tin': '', 'Giá trị': '' },
    { 'Thông tin': 'TỔNG CHI PHÍ', 'Giá trị': formatVND(data.totalCost) + ' VNĐ' },
    { 'Thông tin': 'GIÁ MỖI HỘP', 'Giá trị': formatVND(data.costPerUnit) + ' VNĐ' },
  ];

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Báo giá hộp');

  ws['!cols'] = [{ wch: 35 }, { wch: 30 }];

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, filename);
}

/**
 * Export bag calculation results to Excel
 */
export function exportBagCalculationToExcel(data: {
  bagSize: { width: number; height: number; gusset: number };
  quantity: number;
  paperSize: string;
  upsPerSheet: number;
  sheetsNeeded: number;
  paperWeight: number;
  totalCost: number;
  costPerUnit: number;
}, filename: string = 'bao-gia-tui.xlsx') {
  const excelData = [
    { 'Thông tin': 'Kích thước túi (Rộng x Cao x Hông)', 'Giá trị': `${data.bagSize.width} x ${data.bagSize.height} x ${data.bagSize.gusset} cm` },
    { 'Thông tin': 'Số lượng', 'Giá trị': formatVND(data.quantity) + ' túi' },
    { 'Thông tin': 'Khổ giấy', 'Giá trị': data.paperSize },
    { 'Thông tin': 'Số túi/tờ', 'Giá trị': data.upsPerSheet.toString() },
    { 'Thông tin': 'Số tờ giấy cần', 'Giá trị': formatVND(data.sheetsNeeded) + ' tờ' },
    { 'Thông tin': 'Định lượng giấy', 'Giá trị': data.paperWeight + ' gsm' },
    { 'Thông tin': '', 'Giá trị': '' },
    { 'Thông tin': 'TỔNG CHI PHÍ', 'Giá trị': formatVND(data.totalCost) + ' VNĐ' },
    { 'Thông tin': 'GIÁ MỖI TÚI', 'Giá trị': formatVND(data.costPerUnit) + ' VNĐ' },
  ];

  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Báo giá túi');

  ws['!cols'] = [{ wch: 35 }, { wch: 30 }];

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  saveAs(blob, filename);
}
