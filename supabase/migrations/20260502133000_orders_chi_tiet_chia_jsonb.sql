import { BRAND_LOGO_PUBLIC_PATH } from "@/lib/brand/logo-public-path";
import { htmlBangChu } from "@/lib/reports/amount-in-words-html";
import { escapeHtml } from "@/lib/reports/escape-html";

export const PAYROLL_SLIP_LOGO_PUBLIC_PATH = BRAND_LOGO_PUBLIC_PATH;

/** Styles dành cho việc capture PDF hoặc In */
export const PAYROLL_PDF_CAPTURE_STYLE = `
  html.payroll-pdf-capture,
  html.payroll-pdf-capture body {
    max-width: none !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  @media print {
    @page { size: A4 portrait; margin: 15mm; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

/** CSS chuyên nghiệp cho phiếu lương */
function payrollSlipEmbeddedStylesCss(): string {
  return `
    :root {
      --pr-primary: #1e293b;
      --pr-secondary: #64748b;
      --pr-border: #e2e8f0;
      --pr-bg-head: #f8fafc;
      --pr-accent: #f1f5f9;
      --pr-net-bg: #1e293b;
      --pr-net-text: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 20px;
      color: var(--pr-primary);
      line-height: 1.5;
    }
    .payroll-slip {
      max-width: 210mm;
      margin: 0 auto;
      padding: 10px;
      background: #fff;
    }
    .page-break { page-break-after: always; break-after: page; }

    /* Header Section */
    .header-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 20px;
      align-items: center;
      border-bottom: 2px solid var(--pr-primary);
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .slip-logo {
      height: 60px;
      width: auto;
      object-fit: contain;
    }
    .company-info h1 {
      margin: 0;
      font-size: 18px;
      text-transform: uppercase;
      font-weight: 800;
      color: var(--pr-primary);
    }
    .company-info p {
      margin: 2px 0 0;
      font-size: 12px;
      color: var(--pr-secondary);
    }

    .slip-title-container {
      text-align: center;
      margin-bottom: 25px;
    }
    .slip-title {
      font-size: 24px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 1px;
    }
    .slip-period {
      font-size: 14px;
      color: var(--pr-secondary);
      font-weight: 600;
    }

    /* Info Grid */
    .employee-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 40px;
      background: var(--pr-bg-head);
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid var(--pr-border);
    }
    .info-item {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      border-bottom: 1px dashed var(--pr-border);
      padding-bottom: 4px;
    }
    .info-label { color: var(--pr-secondary); font-weight: 500; }
    .info-value { font-weight: 700; color: var(--pr-primary); }

    /* Attendance Table */
    .attendance-summary {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 20px;
    }
    .att-box {
      flex: 1;
      text-align: center;
      padding: 8px;
      border: 1px solid var(--pr-border);
      border-radius: 6px;
    }
    .att-label { display: block; font-size: 11px; text-transform: uppercase; color: var(--pr-secondary); margin-bottom: 4px; }
    .att-val { display: block; font-size: 16px; font-weight: 700; }

    /* Main Salary Table */
    .salary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
    }
    .salary-table th {
      background: var(--pr-primary);
      color: #fff;
      text-align: left;
      padding: 10px;
      font-size: 12px;
      text-transform: uppercase;
    }
    .salary-table td {
      padding: 10px;
      border-bottom: 1px solid var(--pr-border);
      font-size: 13px;
    }
    .salary-table .section-head {
      background: var(--pr-accent);
      font-weight: 800;
      color: var(--pr-primary);
      font-size: 12px;
      text-transform: uppercase;
    }
    .num { text-align: right; font-family: "Courier New", monospace; font-weight: 600; }
    
    .total-row {
      background: var(--pr-net-bg) !important;
      color: var(--pr-net-text);
    }
    .total-row td {
      border: none;
      font-size: 16px;
      font-weight: 800;
      padding: 15px 10px;
    }

    .bang-chu-line {
      font-style: italic;
      font-size: 13px;
      margin-top: 10px;
      color: var(--pr-secondary);
      padding: 10px;
      border-left: 4px solid var(--pr-primary);
      background: var(--pr-accent);
    }

    /* Signatures */
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
      margin-top: 40px;
      text-align: center;
    }
    .sig-box .label { font-weight: 800; font-size: 13px; text-transform: uppercase; }
    .sig-box .desc { font-size: 11px; color: var(--pr-secondary); font-style: italic; }
    .sig-space { height: 80px; }

    @media print {
      .payroll-slip { padding: 0; }
      ${PAYROLL_PDF_CAPTURE_STYLE}
    }
  `;
}

export type PayrollSlipRow = {
  employee_code: string;
  employee_name: string;
  position: string | null;
  department: string | null;
  base_salary: number;
  worked_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  overtime_hours: number;
  gross_salary: number;
  lunch_allowance: number;
  fuel_allowance: number;
  phone_allowance: number;
  holiday_bonus: number;
  sales_bonus: number;
  social_insurance: number;
  health_insurance: number;
  unemployment_insurance: number;
  dependent_count: number;
  family_deduction_amount: number;
  dependent_deduction_amount: number;
  advance_payment: number;
  total_allowance: number;
  total_income: number;
  total_insurance: number;
  taxable_income: number;
  personal_income_tax: number;
  total_deduction: number;
  net_salary: number;
  note?: string | null;
};

export type PayrollSlipOptions = {
  year: number;
  month: number;
  companyName?: string;
  title?: string;
  pageBreakAfter?: boolean;
};

const money = (n: number) => Math.round(n || 0).toLocaleString("vi-VN");
const dashOrMoney = (n: number | null | undefined) => (!n || Math.abs(n) < 1) ? "—" : money(n);

function buildSlipBody(rowData: PayrollSlipRow, opts: PayrollSlipOptions) {
  const company = opts.companyName || "CÔNG TY TNHH KTSMILE";
  
  return `
    <section class="payroll-slip${opts.pageBreakAfter ? " page-break" : ""}">
      <div class="header-grid">
        <img class="slip-logo" src="${PAYROLL_SLIP_LOGO_PUBLIC_PATH}" alt="Logo" />
        <div class="company-info">
          <h1>${escapeHtml(company)}</h1>
          <p>Địa chỉ: Hệ thống quản lý nhân sự trực tuyến</p>
        </div>
      </div>

      <div class="slip-title-container">
        <h2 class="slip-title">${escapeHtml(opts.title || "PHIẾU LƯƠNG NHÂN VIÊN")}</h2>
        <span class="slip-period">Tháng ${opts.month} / Năm ${opts.year}</span>
      </div>

      <div class="employee-info-grid">
        <div class="info-item"><span class="info-label">Mã nhân viên:</span> <span class="info-value">${escapeHtml(rowData.employee_code)}</span></div>
        <div class="info-item"><span class="info-label">Họ và tên:</span> <span class="info-value">${escapeHtml(rowData.employee_name)}</span></div>
        <div class="info-item"><span class="info-label">Bộ phận:</span> <span class="info-value">${escapeHtml(rowData.department || "—")}</span></div>
        <div class="info-item"><span class="info-label">Chức vụ:</span> <span class="info-value">${escapeHtml(rowData.position || "—")}</span></div>
      </div>

      <div class="attendance-summary">
        <div class="att-box"><span class="att-label">Công chuẩn</span><span class="att-val">${rowData.worked_days}</span></div>
        <div class="att-box"><span class="att-label">Nghỉ phép</span><span class="att-val">${rowData.paid_leave_days}</span></div>
        <div class="att-box"><span class="att-label">Tăng ca (h)</span><span class="att-val">${rowData.overtime_hours}</span></div>
        <div class="att-box"><span class="att-label">Phụ thuộc</span><span class="att-val">${rowData.dependent_count}</span></div>
      </div>

      <table class="salary-table">
        <thead>
          <tr>
            <th>Nội dung thanh toán</th>
            <th class="num">Số tiền (VNĐ)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="section-head" colspan="2">I. Thu nhập (Earnings)</td></tr>
          <tr><td>Lương cơ bản</td><td class="num">${money(rowData.base_salary)}</td></tr>
          <tr><td>Lương theo ngày công thực tế</td><td class="num">${money(rowData.gross_salary)}</td></tr>
          <tr><td>Phụ cấp ăn trưa</td><td class="num">${dashOrMoney(rowData.lunch_allowance)}</td></tr>
          <tr><td>Phụ cấp điện thoại / Xăng xe</td><td class="num">${dashOrMoney(rowData.phone_allowance + rowData.fuel_allowance)}</td></tr>
          <tr><td>Thưởng doanh số / Thưởng khác</td><td class="num">${dashOrMoney(rowData.sales_bonus + rowData.holiday_bonus)}</td></tr>
          <tr style="font-weight:700"><td>Tổng thu nhập gộp (Gross)</td><td class="num">${money(rowData.total_income)}</td></tr>
          
          <tr><td class="section-head" colspan="2">II. Khấu trừ & Thuế (Deductions & Tax)</td></tr>
          <tr><td>Bảo hiểm xã hội (8%)</td><td class="num">(${dashOrMoney(rowData.social_insurance)})</td></tr>
          <tr><td>Bảo hiểm y tế (1.5%)</td><td class="num">(${dashOrMoney(rowData.health_insurance)})</td></tr>
          <tr><td>Bảo hiểm thất nghiệp (1%)</td><td class="num">(${dashOrMoney(rowData.unemployment_insurance)})</td></tr>
          <tr><td>Thuế TNCN tạm tính</td><td class="num">(${dashOrMoney(rowData.personal_income_tax)})</td></tr>
          <tr><td>Khoản tạm ứng</td><td class="num">(${dashOrMoney(rowData.advance_payment)})</td></tr>
          
          <tr class="total-row">
            <td>THỰC LĨNH (NET TAKE-HOME)</td>
            <td class="num">${money(rowData.net_salary)}</td>
          </tr>
        </tbody>
      </table>

      ${htmlBangChu(rowData.net_salary, "Số tiền bằng chữ")}

      <div class="signatures">
        <div class="sig-box">
          <div class="label">Người lập phiếu</div>
          <div class="desc">(Ký, họ tên)</div>
          <div class="sig-space"></div>
        </div>
        <div class="sig-box">
          <div class="label">Kế toán trưởng</div>
          <div class="desc">(Ký, họ tên)</div>
          <div class="sig-space"></div>
        </div>
        <div class="sig-box">
          <div class="label">Người nhận</div>
          <div class="desc">(Ký, họ tên)</div>
          <div class="sig-space"></div>
        </div>
      </div>
      
      <div style="margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center;">
        Mọi thắc mắc về lương vui lòng phản hồi phòng Nhân sự trong vòng 03 ngày kể từ ngày nhận phiếu.
      </div>
    </section>
  `;
}

export function buildPayrollSlipHtml(rowData: PayrollSlipRow, opts: PayrollSlipOptions): string {
  return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8" />
      <title>Phiếu lương - ${rowData.employee_name}</title>
      <style>${payrollSlipEmbeddedStylesCss()}</style>
    </head>
    <body>
      <div class="payroll-slip-batch-root">${buildSlipBody(rowData, opts)}</div>
    </body>
    </html>
  `;
}