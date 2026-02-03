import express from "express";
import SheetsController from '../controller/sheets.controller.js';
import SheetsUtilityController from '../controller/sheetsUtility.controller.js';

const router = express.Router();

// ===== SPREADSHEET INFO ROUTES =====
/**
 * GET /api/sheets/info
 * Lấy thông tin về spreadsheet và tất cả các sheets
 */
router.get('/info', SheetsController.getSpreadsheetInfo);

/**
 * GET /api/sheets/schemas
 * Lấy danh sách tất cả schemas có sẵn
 */
router.get('/schemas', SheetsController.getAvailableSchemas);

/**
 * GET /api/sheets/:sheetName/schema
 * Lấy schema của một sheet cụ thể
 */
router.get('/:sheetName/schema', SheetsController.getSheetSchema);

// ===== SHEET MANAGEMENT ROUTES =====
/**
 * POST /api/sheets
 * Tạo sheet mới với headers theo schema
 * Body: { sheetName: string }
 */
router.post('/', SheetsController.createSheet);

/**
 * DELETE /api/sheets/:sheetName
 * Xóa một sheet
 */
router.delete('/:sheetName', SheetsController.deleteSheet);

/**
 * PUT /api/sheets/:sheetName/headers
 * Thiết lập lại headers cho sheet theo schema
 */
router.put('/:sheetName/headers', SheetsController.setHeaders);

/**
 * DELETE /api/sheets/:sheetName/data
 * Xóa tất cả dữ liệu (giữ lại headers)
 */
router.delete('/:sheetName/data', SheetsController.clearAllData);

// ===== DATA RETRIEVAL ROUTES =====
/**
 * GET /api/sheets/:sheetName/data
 * Lấy tất cả dữ liệu từ một sheet với pagination & field selection
 * Query: limit, offset, fields, compress
 */
router.get('/:sheetName/data', SheetsController.getAllData);

/**
 * GET /api/sheets/:sheetName/stream
 * Streaming data cho datasets lớn
 * Query: batchSize
 */
router.get('/:sheetName/stream', SheetsController.streamData);

/**
 * GET /api/sheets/:sheetName/data/range
 * Lấy dữ liệu theo range cụ thể
 * Query: range (e.g., A1:D10)
 */
router.get('/:sheetName/data/range', SheetsController.getDataByRange);

/**
 * GET /api/sheets/:sheetName/count
 * Lấy số lượng dòng có dữ liệu
 */
router.get('/:sheetName/count', SheetsController.getRowCount);

/**
 * GET /api/sheets/:sheetName/search
 * Tìm kiếm dữ liệu theo điều kiện
 * Query: searchColumn, searchValue, exactMatch (true/false)
 */
router.get('/:sheetName/search', SheetsController.searchRows);

// ===== DATA MODIFICATION ROUTES =====
/**
 * POST /api/sheets/:sheetName/rows
 * Thêm một dòng dữ liệu mới
 * Body: { [columnKey]: value, ... }
 */
router.post('/:sheetName/rows', SheetsController.addRow);

/**
 * POST /api/sheets/:sheetName/rows/batch
 * Thêm nhiều dòng dữ liệu
 * Body: { rows: [{ [columnKey]: value, ... }, ...] }
 */
router.post('/:sheetName/rows/batch', SheetsController.addMultipleRows);

/**
 * PUT /api/sheets/:sheetName/rows/:rowIndex
 * Cập nhật dòng dữ liệu theo index (0-based, không tính header)
 * Body: { [columnKey]: value, ... }
 */
router.put('/:sheetName/rows/:rowIndex', SheetsController.updateRowByIndex);

/**
 * PUT /api/sheets/:sheetName/rows/condition
 * Cập nhật dòng dữ liệu theo điều kiện tìm kiếm
 * Body: { searchColumn: string, searchValue: any, newRowData: { [columnKey]: value, ... } }
 */
router.put('/:sheetName/rows/condition', SheetsController.updateRowByCondition);

/**
 * PATCH /api/sheets/:sheetName/update
 * Database-like batch update by primary key (first column)
 * Only updates provided fields, keeps others unchanged
 * Body: [{ primaryKeyField: value, field1: newValue1, field2: newValue2 }, ...]
 * Example: [{ "Mã đơn hàng": "ABC123", "Name*": "New Name", "Phone*": "0123456789" }]
 */
router.patch('/:sheetName/update', SheetsController.updateByPrimaryKey);

/**
 * PATCH /api/sheets/:sheetName/update-single
 * Optimized single record update by primary key (faster than array version)
 * Only updates provided fields, keeps others unchanged
 * Body: { primaryKeyField: value, field1: newValue1, field2: newValue2 }
 * Example: { "Mã đơn hàng": "ABC123", "Name*": "New Name", "Phone*": "0123456789" }
 */
router.patch('/:sheetName/update-single', SheetsController.updateSingleByPrimaryKey);

/**
 * DELETE /api/sheets/:sheetName/rows/:rowIndex
 * Xóa dòng dữ liệu theo index (0-based, không tính header)
 */
router.delete('/:sheetName/rows/:rowIndex', SheetsController.deleteRowByIndex);

/**
 * DELETE /api/sheets/:sheetName/rows/condition
 * Xóa dòng dữ liệu theo điều kiện tìm kiếm
 * Body: { searchColumn: string, searchValue: any }
 */
router.delete('/:sheetName/rows/condition', SheetsController.deleteRowByCondition);

// ===== UTILITY ROUTES =====
/**
 * POST /api/sheets/:sheetName/backup
 * Backup toàn bộ dữ liệu của một sheet
 */
router.post('/:sheetName/backup', SheetsUtilityController.backupSheet);

/**
 * POST /api/sheets/:sheetName/restore
 * Restore dữ liệu từ backup
 * Body: { backupData: array }
 */
router.post('/:sheetName/restore', SheetsUtilityController.restoreSheet);

/**
 * POST /api/sheets/copy
 * Copy dữ liệu từ sheet này sang sheet khác
 * Body: { sourceSheetName: string, targetSheetName: string }
 */
router.post('/copy', SheetsUtilityController.copySheetData);

/**
 * POST /api/sheets/:sheetName/validate
 * Validate dữ liệu hàng loạt
 * Body: { rows: array }
 */
router.post('/:sheetName/validate', SheetsUtilityController.validateBatchData);

/**
 * POST /api/sheets/:sheetName/import
 * Import dữ liệu với validation
 * Body: { rows: array, options: { skipErrors: boolean, clearBeforeImport: boolean } }
 */
router.post('/:sheetName/import', SheetsUtilityController.importDataWithValidation);

/**
 * GET /api/sheets/:sheetName/statistics
 * Lấy thống kê của sheet
 */
router.get('/:sheetName/statistics', SheetsUtilityController.getSheetStatistics);

/**
 * POST /api/sheets/:sheetName/find-replace
 * Tìm và thay thế giá trị trong sheet
 * Body: { searchValue: any, replaceValue: any, options: { searchColumns: array, exactMatch: boolean, caseSensitive: boolean } }
 */
router.post('/:sheetName/find-replace', SheetsUtilityController.findAndReplace);

/**
 * GET /api/sheets/:sheetName/export/csv
 * Export sheet thành file CSV
 */
router.get('/:sheetName/export/csv', SheetsUtilityController.exportToCSV);

/**
 * POST /api/sheets/duplicate
 * Duplicate một sheet với tên mới
 * Body: { sourceSheetName: string, newSheetName: string }
 */
router.post('/duplicate', SheetsUtilityController.duplicateSheet);

export default router;
