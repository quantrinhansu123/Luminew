import HandleDataReportMKT from '../services/handleDataReportMKT.js';
import HandleDataReportSale from '../services/handleDataReportSale.js';

class ReportController {
  constructor() {
    this.handleDataRMKT = new HandleDataReportMKT();
    this.handleDataRSale = new HandleDataReportSale();
  }

  /**
   * API để tạo báo cáo theo tableName
   * GET /api/report/generate?tableName=string
   * Query: tableName (string)
   */
  generateReport = async (req, res) => {
    try {
      const { tableName } = req.query;

      if (!tableName) {
        return res.status(400).json({
          success: false,
          message: 'tableName query parameter is required'
        });
      }

    //   console.log(`📊 Generating report for table: ${tableName}`);
      const startTime = Date.now();

        let result;

      switch (tableName) {
        case 'Báo cáo MKT':
          result = await this.handleDataRMKT.processReport(tableName);
            break;
        case 'Báo cáo sale':
            result = await this.handleDataRSale.processReport(tableName);
            break;
        default:
            return res.status(400).json({
                success: false,
                message: `Unsupported tableName: ${tableName}`
            });
      }


      const endTime = Date.now();
      const processingTime = endTime - startTime;

      return res.status(200).json({
        success: true,
        message: `Report generated successfully for ${tableName}`,
        data: result.data,
        meta: {
          ...result.meta,
          processingTime: `${processingTime}ms`,
          requestedTable: tableName
        }
      });

    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  };

  /**
   * API để lấy danh sách các loại báo cáo có sẵn
   * GET /api/report/available
   */
  getAvailableReports = async (req, res) => {
    try {
      const availableReports = [
        {
          sheetName: 'Báo cáo MKT',
          description: 'Báo cáo tổng hợp Marketing - kết hợp dữ liệu từ Báo cáo MKT, F3 và Nhân sự',
          dataSources: [
            { spreadsheetId: '1RewSYNjJA-tq41-3pioN5fbiDFgJvlMmTGzJT_0icqo', sheet: 'Báo cáo MKT' },
            { spreadsheetId: '10sN3t4YnrBiqzA78-RZ5zFFngli0pL2t4G4tCIN4vKA', sheet: 'F3' },
            { spreadsheetId: '1RewSYNjJA-tq41-3pioN5fbiDFgJvlMmTGzJT_0icqo', sheet: 'Nhân sự' }
          ]
        }
      ];

      return res.status(200).json({
        success: true,
        data: availableReports,
        meta: {
          totalAvailable: availableReports.length
        }
      });

    } catch (error) {
      console.error('❌ Error getting available reports:', error.message);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };
}

export default ReportController;
