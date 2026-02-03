import ReportServices from './reportServices.js';

class HandleDataReportSale {
    constructor() {
        this.reportServices = new ReportServices();
    }

    /**
     * Xử lý báo cáo Sale - kết hợp dữ liệu từ 3 sheets
     */
    async processMarketingReport() {
        try {
            // Lấy dữ liệu từ 3 sheets song song
            const [baoCaoSaleData, f3Data, nhanSuData] = await Promise.all([
                this.reportServices.getAllData(
                    '1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y',
                    'Báo cáo sale',
                    { //id	Email	Tên	Ngày	Ca	Sản phẩm	Thị trường	Số Mess	Phản hồi	Đơn Mess	Doanh số Mess	id số mess	id phản hồi	Team	Trạng thái	Chi nhánh	id_NS	Doanh số đi	Số đơn Hoàn huỷ	Doanh số hoàn huỷ	Số đơn thành công	Doanh số thành công	Khách mới	Khách cũ	Bán chéo
                        fields: [
                            'id', 'Email', 'Tên', 'Ngày', 'Ca', 'Sản phẩm', 'Thị trường', 'Số Mess', 'Phản hồi', 'Đơn Mess', 'Doanh số Mess', 'id số mess', 'id phản hồi', 'Team', 'Trạng thái', 'Chi nhánh', 'id_NS', 'Doanh số đi', 'Số đơn Hoàn huỷ', 'Doanh số hoàn huỷ', 'Số đơn thành công', 'Doanh số thành công', 'Khách mới', 'Khách cũ', 'Bán chéo'
                        ]
                    }
                ),
                this.reportServices.getAllData(
                    '1rI9cHBNlI2Dc-d6VF6zdKiUagBh-VPFrWdddPysuSmo',
                    'F3',
                    {
                        fields: [
                            'Mã đơn hàng', 'Ngày lên đơn', 'Name*', 'Phone*', 'Add',
                            'City', 'State', 'Mặt hàng', 'Loại tiền thanh toán',
                            'Tổng tiền VNĐ', 'Nhân viên Sale', 'Nhân viên Marketing',
                            'NV Vận đơn', 'Kết quả Check', 'Trạng thái giao hàng NB',
                            'Đơn vị vận chuyển', 'Trạng thái thu tiền', 'Phân loại KH',
                            'Khu vực', 'Team', 'Trạng thái giao hàng'
                        ]
                    }
                ),
                this.reportServices.getAllData(
                    '1ylYT0UAcahij5UtDikKyJFWT3gIyRZsuFsYQ5aUTi2Y',
                    'Nhân sự',
                    {
                        fields: [
                            'id', 'Họ Và Tên', 'Vị trí', 'Email', 'Team', 'chi nhánh', 'Vị trí vận đơn'
                        ]
                    }
                )
            ]);

            // Tạo map nhân sự để tra cứu nhanh chức vụ theo tên
            const nhanSuMap = this.createEmployeeMap(nhanSuData.data);

            // Khởi tạo báo cáo từ dữ liệu Báo cáo Sale
            const reportArray = this.initializeReportArray(baoCaoSaleData.data, nhanSuMap);

            // Xử lý dữ liệu F3 và cập nhật báo cáo
            const finalReport = this.processF3Data(reportArray, f3Data.data, nhanSuMap);

            return {
                success: true,
                data: finalReport,
                meta: {
                    totalRecords: finalReport.length,
                    baoCaoSaleRecords: baoCaoSaleData.data.length,
                    f3Records: f3Data.data.length,
                    nhanSuRecords: nhanSuData.data.length,
                    processedAt: new Date().toISOString()
                }
            };

        } catch (error) {
            throw new Error(`Failed to process marketing report: ${error.message}`);
        }
    }

    /**
     * Tạo map nhân sự để tra cứu nhanh
     */
    createEmployeeMap(nhanSuData) {
        const map = new Map();
        nhanSuData.forEach(employee => {
            if (employee['Họ Và Tên']) {
                map.set(employee['Họ Và Tên'].trim(), {
                    chucVu: employee['Vị trí'] || 'NV',
                    team: employee['Team'] || '',
                    email: employee['Email'] || '',
                    id: employee['id'] || ''
                });
            }
        });
        return map;
    }

    /**
     * Khởi tạo mảng báo cáo từ dữ liệu Báo cáo Sale
     */
    initializeReportArray(baoCaoSaleData, nhanSuMap) {
        return baoCaoSaleData.map(record => {
            const employeeInfo = nhanSuMap.get(record['Tên']?.trim()) || {};

            return {
                id: record['id'] || '',
                Email: record['Email'] || '',
                'Chức vụ': employeeInfo.chucVu || 'NV',
                Tên: record['Tên'] || '',
                'Ngày': this.formatDate(record['Ngày']),
                Ca: record['Ca'] || 'Hết ca',
                'Sản phẩm': record['Sản phẩm'] || '',
                'Thị trường': record['Thị trường'] || '',
                'Số Mess': record['Số Mess'] || 0,
                'Phản hồi': record['Phản hồi'] || 0,
                'Đơn Mess': record['Đơn Mess'] || 0,
                'Doanh số Mess': record['Doanh số Mess'] || 0,
                'id số mess': record['id số mess'] || '',
                'id phản hồi': record['id phản hồi'] || '',
                Team: record['Team'] || '',
                'Trạng thái': record['Trạng thái'] || 'Đã gửi',
                'Chi nhánh': record['Chi nhánh'] || '',
                id_NS: record['id_NS'] || '',
                'Doanh số đi': record['Doanh số đi'] || 0,
                'Số đơn Hoàn huỷ': record['Số đơn Hoàn huỷ'] || 0,
                'Doanh số hoàn huỷ': record['Doanh số hoàn huỷ'] || 0,
                'Số đơn thành công': record['Số đơn thành công'] || 0,
                'Doanh số thành công': record['Doanh số thành công'] || 0,
                'Khách mới': record['Khách mới'] || '',
                'Khách cũ': record['Khách cũ'] || '',
                'Bán chéo': record['Bán chéo'] || '',
                'Số đơn thực tế': 0,
                'Doanh thu chốt thực tế': 0,
                'Doanh số đi thực tế': 0,
                'Doanh số hoàn hủy thực tế': 0,
                'Số đơn hoàn hủy thực tế': 0,
                'Doanh số sau hoàn hủy thực tế': 0,
                'Phân loại KH': ''
            };
        });
    }

    /**
     * Xử lý dữ liệu F3 và cập nhật báo cáo
     */
    processF3Data(reportArray, f3Data, nhanSuMap) {
        // Tạo map để tra cứu nhanh các record trong reportArray
        const reportMap = new Map();
        reportArray.forEach((record, index) => {
            const key = this.createMatchingKey(
                record['Ngày'],
                record['Tên'],
                record['Sản phẩm'],
                record['Thị trường']
            );
            reportMap.set(key, index);
        });

        // Lặp qua dữ liệu F3
        f3Data.forEach(f3Record => {
            const ngayLenDon = this.formatDate(f3Record['Ngày lên đơn']);
            const nhanVienMarketing = f3Record['Nhân viên Sale']?.trim() || '';
            const matHang = f3Record['Mặt hàng']?.trim() || '';
            const khuVuc = f3Record['Khu vực']?.trim() || '';
            const ketQuaCheck = f3Record['Kết quả Check']?.trim().toLowerCase() || '';
            const phanLoaiKH = f3Record['Phân loại KH']?.trim() || '';

            const matchingKey = this.createMatchingKey(ngayLenDon, nhanVienMarketing, matHang, khuVuc);

            if (reportMap.has(matchingKey)) {
                // Cập nhật record có sẵn
                const index = reportMap.get(matchingKey);
                reportArray[index]['Số đơn thực tế'] += 1;

                // Cập nhật doanh thu nếu có
                const tongTien = parseFloat(f3Record['Tổng tiền VNĐ']) || 0;
                reportArray[index]['Doanh thu chốt thực tế'] += tongTien;

                // Cập nhật doanh số đi hoặc hoàn hủy dựa trên kết quả check
                if (ketQuaCheck === 'ok') {
                    reportArray[index]['Doanh số đi thực tế'] += tongTien;
                } else if (ketQuaCheck === 'hủy' || ketQuaCheck === 'hoàn' || ketQuaCheck === 'huỷ') {
                    reportArray[index]['Doanh số hoàn hủy thực tế'] += tongTien;
                    reportArray[index]['Số đơn hoàn hủy thực tế'] += 1;
                }

            } else {
                // Tạo record mới nếu chưa có
                const employeeInfo = nhanSuMap.get(nhanVienMarketing) || {};
                const dsDiThucTe = ketQuaCheck === 'ok' ? (parseFloat(f3Record['Tổng tiền VNĐ']) || 0) : 0;
                const dsHuyThucTe = (ketQuaCheck === 'hủy' || ketQuaCheck === 'hoàn' || ketQuaCheck === 'huỷ') ? (parseFloat(f3Record['Tổng tiền VNĐ']) || 0) : 0;
                const soDonHuyThucTe = (ketQuaCheck === 'hủy' || ketQuaCheck === 'hoàn' || ketQuaCheck === 'huỷ') ? 1 : 0;

                const newRecord = {
                    id: `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    Email: employeeInfo.email || '',
                    'Chức vụ': employeeInfo.chucVu || 'NV',
                    Tên: nhanVienMarketing,
                    Ngày: ngayLenDon,
                    Ca: 'Hết ca',
                    'Sản phẩm': matHang,
                    'Thị trường': khuVuc,
                    'Số Mess': 0,
                    'Phản hồi': 0,
                    'Đơn Mess': 0,
                    'Doanh số Mess': 0,
                    'id số mess': '',
                    'id phản hồi': '',
                    Team: employeeInfo.team || '',
                    'Trạng thái': 'Đã gửi',
                    'Chi nhánh': String(f3Record['Team'] || ''),
                    id_NS: employeeInfo.id || '',
                    'Doanh số đi': 0,
                    'Số đơn Hoàn huỷ': 0,
                    'Doanh số hoàn huỷ': 0,
                    'Số đơn thành công': 0,
                    'Doanh số thành công': 0,
                    'Khách mới': '',
                    'Khách cũ': '',
                    'Bán chéo': '',
                    'Số đơn thực tế': 1,
                    'Doanh thu chốt thực tế': parseFloat(f3Record['Tổng tiền VNĐ']) || 0,
                    'Doanh số đi thực tế': dsDiThucTe,
                    'Doanh số hoàn hủy thực tế': dsHuyThucTe,
                    'Số đơn hoàn hủy thực tế': soDonHuyThucTe,
                    'Doanh số sau hoàn hủy thực tế': 0,
                    'Phân loại KH': phanLoaiKH || ''
                };

                reportArray.push(newRecord);

                // Cập nhật map để tra cứu lần sau
                reportMap.set(matchingKey, reportArray.length - 1);
            }
        });

        return reportArray;
    }

    /**
     * Tạo key để match giữa báo cáo Sale và F3
     */
    createMatchingKey(ngay, ten, sanPham, thiTruong) {
        return `${ngay}|${ten}|${sanPham}|${thiTruong}`.toLowerCase();
    }

    /**
     * Format date để đồng nhất
     */
    formatDate(dateValue) {
        // 1. Kiểm tra các giá trị đầu vào không hợp lệ ngay từ đầu
        if (dateValue === null || dateValue === undefined || dateValue === '') {
            return null; // Hoặc trả về chuỗi rỗng '' tùy yêu cầu
        }

        let date;

        // 2. Xử lý logic cho kiểu số một cách cẩn thận hơn
        if (typeof dateValue === 'number') {
            // Giả định: số nhỏ (dưới 100000) là số sê-ri của Excel, số lớn là timestamp (ms).
            // Đây là một phỏng đoán, cách tốt nhất là biết rõ nguồn dữ liệu của bạn.
            if (dateValue > 1 && dateValue < 100000) { // Khoảng giá trị hợp lý cho ngày Excel
                // Công thức chuyển đổi từ số ngày của Excel (epoch 1900) sang JS (epoch 1970)
                date = new Date((dateValue - 25569) * 86400 * 1000);
            } else { // Coi như là một timestamp
                date = new Date(dateValue);
            }
        } else {
            // Đối với chuỗi hoặc đối tượng Date có sẵn
            date = new Date(dateValue);
        }

        // 3. Kiểm tra xem đối tượng Date có hợp lệ không
        // `isNaN(date.getTime())` là cách chuẩn để kiểm tra "Invalid Date"
        if (isNaN(date.getTime())) {
            return null; // Hoặc trả về chuỗi rỗng ''
        }

        // 4. Định dạng với zero-padding (thêm số 0 vào trước)
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0'); // getMonth() bắt đầu từ 0
        const y = date.getFullYear();

        return `${m}/${d}/${y}`;
    }

    /**
     * Xử lý báo cáo theo tableName
     */
    async processReport(tableName) {
        switch (tableName) {
            case 'Báo cáo sale':
                return await this.processMarketingReport();

            default:
                throw new Error(`Unsupported table name for report: ${tableName}`);
        }
    }
}

export default HandleDataReportSale;
