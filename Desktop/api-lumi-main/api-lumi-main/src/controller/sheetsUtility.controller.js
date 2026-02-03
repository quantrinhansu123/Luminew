import SheetsUtility from '../../utils/sheets.utility.js';

const sheetsUtility = new SheetsUtility();

class SheetsUtilityController {

  /**
   * Backup toàn bộ dữ liệu của một sheet
   */
  async backupSheet(req, res) {
    try {
      const { sheetName } = req.params;
      const result = await sheetsUtility.backupSheet(sheetName);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Restore dữ liệu từ backup
   */
  async restoreSheet(req, res) {
    try {
      const { sheetName } = req.params;
      const { backupData } = req.body;
      
      if (!Array.isArray(backupData)) {
        return res.status(400).json({
          success: false,
          message: 'backupData must be an array'
        });
      }

      const result = await sheetsUtility.restoreSheet(sheetName, backupData);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Copy dữ liệu từ sheet này sang sheet khác
   */
  async copySheetData(req, res) {
    try {
      const { sourceSheetName, targetSheetName } = req.body;
      
      if (!sourceSheetName || !targetSheetName) {
        return res.status(400).json({
          success: false,
          message: 'sourceSheetName and targetSheetName are required'
        });
      }

      const result = await sheetsUtility.copySheetData(sourceSheetName, targetSheetName);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Validate dữ liệu hàng loạt
   */
  async validateBatchData(req, res) {
    try {
      const { sheetName } = req.params;
      const { rows } = req.body;
      
      if (!Array.isArray(rows)) {
        return res.status(400).json({
          success: false,
          message: 'rows must be an array'
        });
      }

      const result = await sheetsUtility.validateBatchData(sheetName, rows);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Import dữ liệu với validation
   */
  async importDataWithValidation(req, res) {
    try {
      const { sheetName } = req.params;
      const { rows, options = {} } = req.body;
      
      if (!Array.isArray(rows)) {
        return res.status(400).json({
          success: false,
          message: 'rows must be an array'
        });
      }

      const result = await sheetsUtility.importDataWithValidation(sheetName, rows, options);
      
      res.json({
        success: result.success,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Lấy thống kê sheet
   */
  async getSheetStatistics(req, res) {
    try {
      const { sheetName } = req.params;
      const result = await sheetsUtility.getSheetStatistics(sheetName);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Tìm và thay thế
   */
  async findAndReplace(req, res) {
    try {
      const { sheetName } = req.params;
      const { searchValue, replaceValue, options = {} } = req.body;
      
      if (!searchValue || replaceValue === undefined) {
        return res.status(400).json({
          success: false,
          message: 'searchValue and replaceValue are required'
        });
      }

      const result = await sheetsUtility.findAndReplace(sheetName, searchValue, replaceValue, options);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Export CSV
   */
  async exportToCSV(req, res) {
    try {
      const { sheetName } = req.params;
      const result = await sheetsUtility.exportToCSV(sheetName);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Duplicate sheet
   */
  async duplicateSheet(req, res) {
    try {
      const { sourceSheetName, newSheetName } = req.body;
      
      if (!sourceSheetName || !newSheetName) {
        return res.status(400).json({
          success: false,
          message: 'sourceSheetName and newSheetName are required'
        });
      }

      const result = await sheetsUtility.duplicateSheet(sourceSheetName, newSheetName);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new SheetsUtilityController();
