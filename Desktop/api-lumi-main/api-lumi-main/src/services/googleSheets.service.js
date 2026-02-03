import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import { DataValidator, SHEET_SCHEMAS } from '../models/sheet.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Cấu hình Google Sheets
const KEYFILEPATH = path.join(__dirname, '../..', 'sheetCredentials.json');
const SPREADSHEET_ID = '1RewSYNjJA-tq41-3pioN5fbiDFgJvlMmTGzJT_0icqo';
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || 'AIzaSyBE9Jf6sf4JiAWzBha957e3l0geBWi-k1U';

class GoogleSheetsService {
  constructor() {
    this.authClient = null;
    this.sheetsAPI = null;
    this.isAuthenticated = false;
    this.authPromise = null; // Để tránh multiple authentication calls
  }

  /**
   * Tạo authenticated client để kết nối Google Sheets API - OPTIMIZED
   */
  async getAuthenticatedClient() {
    // Nếu đã có client và đã authenticated, return ngay
    if (this.authClient && this.sheetsAPI && this.isAuthenticated) {
      return this.sheetsAPI;
    }

    // Nếu đang trong quá trình authenticate, chờ
    if (this.authPromise) {
      await this.authPromise;
      return this.sheetsAPI;
    }

    // Tạo promise để authenticate
    this.authPromise = this.performAuthentication();
    await this.authPromise;
    this.authPromise = null;

    return this.sheetsAPI;
  }

  /**
   * Thực hiện authentication một lần
   */
  async performAuthentication() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: KEYFILEPATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.authClient = await auth.getClient();
      this.sheetsAPI = google.sheets({ version: 'v4', auth: this.authClient });
      this.isAuthenticated = true;

    } catch (error) {
      this.isAuthenticated = false;
      this.authClient = null;
      this.sheetsAPI = null;
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Lấy thông tin spreadsheet
   */
  async getSpreadsheetInfo() {
    try {
      const sheets = await this.getAuthenticatedClient();

      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      });

      return {
        title: response.data.properties.title,
        sheets: response.data.sheets.map(sheet => ({
          id: sheet.properties.sheetId,
          title: sheet.properties.title,
          gridProperties: sheet.properties.gridProperties
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get spreadsheet info: ${error.message}`);
    }
  }

  /**
   * Calculate Smart Range based on requested fields
   */
  calculateSmartRange(sheetName, requestedFields = null) {
    const schema = SHEET_SCHEMAS[sheetName];
    if (!schema) {
      return { fullRange: `${sheetName}!A:Z`, batchRanges: null };
    }

    // Nếu không có fields cụ thể, lấy tất cả
    if (!requestedFields) {
      const lastColumn = this.getColumnLetter(schema.columns.length);
      return {
        fullRange: `${sheetName}!A1:${lastColumn}`, // Lấy toàn bộ data
        batchRanges: null,
        columns: schema.columns.map((col, index) => ({
          key: col.key, // không phải API key, giữ nguyên
          index: index,
          letter: this.getColumnLetter(index + 1),
          type: col.type
        }))
      };
    }

    // Tìm các cột được yêu cầu trong schema
    const requestedColumns = [];
    requestedFields.forEach(field => {
      const colIndex = schema.columns.findIndex(col => col.key === field);
      if (colIndex !== -1) {
        requestedColumns.push({
          key: field, // không phải API key, giữ nguyên
          index: colIndex,
          letter: this.getColumnLetter(colIndex + 1),
          type: schema.columns[colIndex].type
        });
      } else {
        console.log(`⚠️ Field "${field}" not found in schema`);
      }
    });


    if (requestedColumns.length === 0) {
      return { fullRange: `${sheetName}!A1:A`, batchRanges: null }; // Lấy toàn bộ cột A
    }

    // Kiểm tra xem các cột có liền kề không
    const sortedColumns = requestedColumns.sort((a, b) => a.index - b.index);
    const isContiguous = this.areColumnsContiguous(sortedColumns);

    if (isContiguous) {
      // Các cột liền kề -> sử dụng single range
      const firstCol = sortedColumns[0].letter;
      const lastCol = sortedColumns[sortedColumns.length - 1].letter;
      return {
        fullRange: `${sheetName}!${firstCol}1:${lastCol}`, // Lấy toàn bộ data
        batchRanges: null,
        columns: requestedColumns
      };
    } else {
      // Các cột không liền kề -> sử dụng batchGet
      const batchRanges = sortedColumns.map(col => ({
        range: `${sheetName}!${col.letter}:${col.letter}`, // Format: Sheet!A:A, Sheet!E:E
        key: col.key, // không phải API key, giữ nguyên
        type: col.type
      }));

      return {
        fullRange: null,
        batchRanges: batchRanges,
        columns: requestedColumns
      };
    }
  }

  /**
   * Kiểm tra các cột có liền kề không
   */
  areColumnsContiguous(sortedColumns) {
    for (let i = 1; i < sortedColumns.length; i++) {
      if (sortedColumns[i].index - sortedColumns[i - 1].index !== 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Lấy tất cả dữ liệu từ một sheet - SMART RANGE VERSION
   */
  async getAllData(sheetName, options = {}) {
    try {
      const startTime = Date.now();

      const { limit, offset = 0, fields } = options;
      const sheets = await this.getAuthenticatedClient();
      const schema = SHEET_SCHEMAS[sheetName];

      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      // Calculate smart range
      const rangeInfo = this.calculateSmartRange(sheetName, fields);

      let processedData;

      if (rangeInfo.batchRanges) {
        // Non-contiguous columns - use batchGet
        processedData = await this.getAllDataWithBatch(sheets, rangeInfo, { limit, offset });
      } else {
        // Contiguous columns or full data - use single range
        processedData = await this.getAllDataWithSingleRange(sheets, rangeInfo, { limit, offset });
      }

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      return {
        data: processedData,
        meta: {
          total: processedData.length,
          queryTime: `${queryTime}ms`,
          optimization: rangeInfo.batchRanges ? 'batch-get' : 'smart-range + field-selection',
          requestedFields: fields,
          rangeUsed: rangeInfo.fullRange || rangeInfo.batchRanges?.map(b => b.range)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get data: ${error.message}`);
    }
  }

  /**
   * Get data with single range (contiguous columns)
   */
  async getAllDataWithSingleRange(sheets, rangeInfo, options = {}) {
    const { limit, offset = 0 } = options;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: rangeInfo.fullRange,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });

    const rows = response.data.values || [];
    if (rows.length <= 1) return [];

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Apply pagination at data level
    const paginatedRows = limit ? dataRows.slice(offset, offset + limit) : dataRows.slice(offset);

    // Process with column mapping
    return this.processRowsWithColumnMapping(paginatedRows, headers, rangeInfo.columns);
  }

  /**
   * Get data with batchGet (non-contiguous columns) - FIXED WITH majorDimension
   */
  async getAllDataWithBatch(sheets, rangeInfo, options = {}) {
    const { limit, offset = 0 } = options;

    // Prepare batch request
    const ranges = rangeInfo.batchRanges.map(batch => batch.range);

    try {
      const batchRequest = {
        spreadsheetId: SPREADSHEET_ID,
        ranges: ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'ROWS'  // ✅ FIX: Ensure data is returned as rows, not columns
      };

      const batchResponse = await sheets.spreadsheets.values.batchGet(batchRequest);

      const valueRanges = batchResponse.data.valueRanges || [];

      // Process data
      const processedData = [];

      // Find the maximum number of available rows across all ranges
      let maxAvailableRows = 0;
      valueRanges.forEach(valueRange => {
        const rowCount = valueRange?.values?.length || 1;
        maxAvailableRows = Math.max(maxAvailableRows, rowCount);
      });

      const maxDataRows = Math.max(0, maxAvailableRows - 1); // Subtract 1 for header

      // Calculate how many rows to process (consistent with SingleRange)
      const maxRows = limit ? Math.min(limit, maxDataRows) : maxDataRows;

      for (let rowIndex = 1; rowIndex <= maxRows; rowIndex++) { // Start from 1 to skip header
        const rowObject = { rowIndex: rowIndex + 1 };
        let hasData = false;

        valueRanges.forEach((valueRange, rangeIndex) => {
          const values = valueRange.values || [];
          const batchInfo = rangeInfo.batchRanges[rangeIndex];
          const rawValue = values[rowIndex]?.[0]; // Single column per range

          if (rawValue !== undefined) {
            hasData = true;
          }

          // Transform value based on type
          rowObject[batchInfo.key] = this.transformValueFast(rawValue, batchInfo.type);
        });

        // Only add row if it has data
        if (hasData) {
          processedData.push(rowObject);
        }

        // Break if we have enough data (only when limit is specified)
        if (limit && processedData.length >= limit) {
          break;
        }
      }

      return processedData;

    } catch (error) {
      console.error(`❌ [BatchGet] Error:`, error.message);
      console.error(`📋 [BatchGet] Failed ranges:`, ranges);
      throw error;
    }
  }

  /**
   * Fast transform value - SAFE VERSION
   */
  transformValueFast(value, type) {
    // Handle null/undefined values first
    if (value === null || value === undefined || value === '') {
      switch (type) {
        case 'number':
        case 'currency':
          return 0;
        default:
          return '';
      }
    }

    switch (type) {
      case 'number':
      case 'currency':
        return typeof value === 'number' ? value : (parseFloat(value) || 0);

      case 'string':
        return String(value);

      case 'date':
      //return yyyy-mm-dd
      const formatDate = (date) => {
        const d = date.getDate();
        const m = date.getMonth() + 1;
        const y = date.getFullYear();
        return `${y}-${m}-${d}`;
      };
        // Xử lý số Excel date
        if (typeof value === 'number' && value > 1) {
          return formatDate(new Date((value - 25569) * 86400 * 1000));
        }

        return formatDate(new Date(value));
      case 'datetime':

        const formatDateTime = (date) => {
          const d = date.getDate();
          const m = date.getMonth() + 1;
          const y = date.getFullYear();
          const h = date.getHours().toString().padStart(2, '0');
          const min = date.getMinutes().toString().padStart(2, '0');
          const s = date.getSeconds().toString().padStart(2, '0');

          return `${d}/${m}/${y} ${h}:${min}:${s}`;
        };

        // Xử lý số Excel date
        if (typeof value === 'number' && value > 1) {
          return formatDateTime(new Date((value - 25569) * 86400 * 1000));
        }

        // Xử lý string date (bao gồm cả có 'Z' đằng sau)
        if (typeof value === 'string' && value.trim()) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return formatDateTime(date);
          }
        }

        // Xử lý Date object
        if (value instanceof Date && !isNaN(value.getTime())) {
          return formatDateTime(value);
        }

        // Fallback cho các trường hợp còn lại
        return value || '';

      case 'text':
      default:
        return String(value);
    }
  }

  /**
   * Process rows với column mapping
   */
  processRowsWithColumnMapping(dataRows, headers, columns) {
    const result = [];
    // Process each row
    dataRows.forEach((row, rowIndex) => {
      const rowObject = { rowIndex: rowIndex + 2 }; // +2 because of header and 0-based index

      columns.forEach(col => {
        // Use column index to get raw value
        const rawValue = row[col.index];
        const transformedValue = this.transformValueFast(rawValue, col.type);
        rowObject[col.key] = transformedValue;
      });

      result.push(rowObject);
    });

    return result;
  }

  /**
   * Convert column index to letter (1=A, 2=B, etc.)
   */
  getColumnLetter(colIndex) {
    let result = '';
    while (colIndex > 0) {
      colIndex--;
      result = String.fromCharCode(65 + (colIndex % 26)) + result;
      colIndex = Math.floor(colIndex / 26);
    }
    return result;
  }

  /**
   * Get row count
   */
  async getRowCount(sheetName) {
    try {
      const sheets = await this.getAuthenticatedClient();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const values = response.data.values || [];
      return Math.max(0, values.length - 1); // Subtract 1 for header
    } catch (error) {
      throw new Error(`Failed to get row count: ${error.message}`);
    }
  }

  /**
   * UPDATE API - Database-like update by primary key (first column)
   * Updates only the fields provided, keeping others unchanged
   */
  async updateByPrimaryKey(sheetName, updates, options = {}) {
    try {
      const { verbose = false } = options;
      const startTime = Date.now();

      const sheets = await this.getAuthenticatedClient();
      const schema = SHEET_SCHEMAS[sheetName];

      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      // OPTIMIZED: Only fetch primary key column (first column)
      const primaryKeyResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'ROWS'
      });

      const primaryKeyRows = primaryKeyResponse.data.values || [];
      if (primaryKeyRows.length <= 1) {
        throw new Error('No data found in sheet');
      }

      const primaryKeyColumn = schema.columns[0].key;
      const primaryKeyValues = primaryKeyRows.slice(1).map(row => row[0]);

      const updateRequests = [];
      let updatedCount = 0;
      let notFoundCount = 0;
      let skippedCount = 0;
      let unchangedCount = 0;

      // Minimal results for non-verbose mode
      const results = verbose ? [] : null;

      // Process each update request
      for (const updateData of updates) {
        const primaryKeyValue = updateData[primaryKeyColumn];

        if (!primaryKeyValue) {
          skippedCount++;
          if (verbose) {
            results.push({
              primaryKey: primaryKeyValue,
              status: 'skipped',
              reason: `Primary key '${primaryKeyColumn}' is required`
            });
          }
          continue;
        }

        // Find the row index with matching primary key
        const targetRowIndex = primaryKeyValues.findIndex(value => {
          return String(value).trim() === String(primaryKeyValue).trim();
        });

        if (targetRowIndex === -1) {
          notFoundCount++;
          if (verbose) {
            results.push({
              primaryKey: primaryKeyValue,
              status: 'not_found'
            });
          }
          continue;
        }

        const actualRowIndex = targetRowIndex + 2;

        // Create cell updates for only the fields provided in updateData
        const cellUpdates = [];
        const changedFields = [];
        let hasChanges = false;

        schema.columns.forEach((col, colIndex) => {
          if (updateData.hasOwnProperty(col.key) && col.key !== primaryKeyColumn) {
            const newValue = updateData[col.key];
            const columnLetter = this.getColumnLetter(colIndex + 1);

            cellUpdates.push({
              range: `${sheetName}!${columnLetter}${actualRowIndex}`,
              values: [[newValue]]
            });
            hasChanges = true;
            changedFields.push(col.key);
          }
        });

        if (hasChanges) {
          updateRequests.push(...cellUpdates);
          updatedCount++;

          if (verbose) {
            results.push({
              primaryKey: primaryKeyValue,
              status: 'updated',
              rowIndex: actualRowIndex,
              changedFields: changedFields,
              cellsUpdated: cellUpdates.length
            });
          }
        } else {
          unchangedCount++;
          if (verbose) {
            results.push({
              primaryKey: primaryKeyValue,
              status: 'unchanged'
            });
          }
        }
      }

      // Execute batch update if there are changes
      if (updateRequests.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            valueInputOption: 'RAW',
            data: updateRequests
          }
        });
      }

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      // Minimal response for production, detailed for verbose
      const response = {
        success: true,
        updated: updatedCount,
        total: updates.length
      };

      if (verbose) {
        response.summary = {
          total: updates.length,
          updated: updatedCount,
          unchanged: unchangedCount,
          notFound: notFoundCount,
          skipped: skippedCount,
          queryTime: `${queryTime}ms`
        };
        response.details = results;
      }

      return response;

    } catch (error) {
      throw new Error(`Failed to update data: ${error.message}`);
    }
  }

  /**
   * UPDATE SINGLE RECORD - Optimized for single object payload
   * Much faster than array version for single record updates
   */
  async updateSingleByPrimaryKey(sheetName, updateData, options = {}) {
    try {
      const { verbose = false } = options;
      const startTime = Date.now();

      const sheets = await this.getAuthenticatedClient();
      const schema = SHEET_SCHEMAS[sheetName];

      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      const primaryKeyColumn = schema.columns[0].key;
      const primaryKeyValue = updateData[primaryKeyColumn];

      if (!primaryKeyValue) {
        throw new Error(`Primary key '${primaryKeyColumn}' is required`);
      }

      // OPTIMIZED: Only fetch primary key column
      const primaryKeyResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`,
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'ROWS'
      });

      const primaryKeyRows = primaryKeyResponse.data.values || [];
      if (primaryKeyRows.length <= 1) {
        throw new Error('No data found in sheet');
      }

      const primaryKeyValues = primaryKeyRows.slice(1).map(row => row[0]);

      // Find target row (single operation, no loop)
      const targetRowIndex = primaryKeyValues.findIndex(value => {
        return String(value).trim() === String(primaryKeyValue).trim();
      });

      if (targetRowIndex === -1) {
        return {
          success: false,
          error: 'Record not found',
          primaryKey: primaryKeyValue
        };
      }

      const actualRowIndex = targetRowIndex + 2;

      // Create cell updates (single operation, no loop over array)
      const updateRequests = [];
      const changedFields = [];

      schema.columns.forEach((col, colIndex) => {
        if (updateData.hasOwnProperty(col.key) && col.key !== primaryKeyColumn) {
          const newValue = updateData[col.key];
          const columnLetter = this.getColumnLetter(colIndex + 1);

          updateRequests.push({
            range: `${sheetName}!${columnLetter}${actualRowIndex}`,
            values: [[newValue]]
          });
          changedFields.push(col.key);
        }
      });

      // Execute update if there are changes
      if (updateRequests.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: {
            valueInputOption: 'RAW',
            data: updateRequests
          }
        });
      }

      const endTime = Date.now();
      const queryTime = endTime - startTime;

      // Minimal response
      const response = {
        success: true,
        updated: updateRequests.length > 0 ? 1 : 0,
        changedFields: changedFields.length,
        primaryKey: primaryKeyValue
      };

      if (verbose) {
        response.details = {
          rowIndex: actualRowIndex,
          changedFields: changedFields,
          cellsUpdated: updateRequests.length,
          queryTime: `${queryTime}ms`
        };
      }

      return response;

    } catch (error) {
      throw new Error(`Failed to update record: ${error.message}`);
    }
  }

  /**
   * Thêm một dòng dữ liệu mới vào sheet
   */
  async addRow(sheetName, rowData) {
    try {
      const sheets = await this.getAuthenticatedClient();

      // Lấy headers để đảm bảo thứ tự cột đúng
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!1:1`
      });

      const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];

      if (headers.length === 0) {
        throw new Error('Sheet has no headers');
      }

      // Tạo array values theo thứ tự headers
      const values = headers.map(header => rowData[header] || '');

      // Append dòng mới vào cuối sheet
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:A`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [values]
        }
      });

      return {
        success: true,
        addedRange: response.data.updates.updatedRange,
        addedRow: rowData
      };

    } catch (error) {
      throw new Error(`Failed to add row: ${error.message}`);
    }
  }

  /**
   * Thêm nhiều dòng dữ liệu vào sheet (batch operation) với kiểm tra trùng lặp
   */
  async addMultipleRows(sheetName, rows) {
    try {
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Rows must be a non-empty array');
      }

      const sheets = await this.getAuthenticatedClient();

      // Lấy headers để đảm bảo thứ tự cột đúng
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!1:1`
      });

      const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];

      if (headers.length === 0) {
        throw new Error('Sheet has no headers');
      }

      const primaryKeyColumn = headers[0]; // Cột đầu tiên là primary key

      // Lấy tất cả dữ liệu hiện có để kiểm tra trùng lặp
      const existingDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!A:${String.fromCharCode(64 + headers.length)}`
      });

      const existingData = existingDataResponse.data.values || [];
      const existingPrimaryKeys = new Set();

      // Tạo Set các primary key đã tồn tại (bỏ qua header row)
      for (let i = 1; i < existingData.length; i++) {
        if (existingData[i] && existingData[i][0]) {
          existingPrimaryKeys.add(existingData[i][0].toString());
        }
      }

      // Phân loại dữ liệu: mới vs trùng lặp
      const newRows = [];
      const duplicateKeys = [];
      const skippedRows = [];

      rows.forEach((rowData, index) => {
        const primaryKeyValue = rowData[primaryKeyColumn];

        if (!primaryKeyValue) {
          skippedRows.push({
            index: index,
            reason: `Thiếu mã khóa chính (${primaryKeyColumn})`,
            data: rowData
          });
          return;
        }

        if (existingPrimaryKeys.has(primaryKeyValue.toString())) {
          duplicateKeys.push(primaryKeyValue.toString());
          skippedRows.push({
            index: index,
            reason: 'Mã khóa chính đã tồn tại',
            primaryKey: primaryKeyValue.toString(),
            data: rowData
          });
        } else {
          newRows.push(rowData);
        }
      });

      let addedResponse = null;
      let addedRange = null;

      // Chỉ thêm dữ liệu mới nếu có
      if (newRows.length > 0) {
        const values = newRows.map(rowData =>
          headers.map(header => rowData[header] || '')
        );

        addedResponse = await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:A`,
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: values
          }
        });

        addedRange = addedResponse.data.updates.updatedRange;
      }

      return {
        success: true,
        summary: {
          totalRequested: rows.length,
          added: newRows.length,
          duplicates: duplicateKeys.length,
          skipped: skippedRows.length
        },
        details: {
          addedRows: newRows.length,
          addedRange: addedRange,
          updatedCells: addedResponse ? addedResponse.data.updates.updatedCells : 0,
          duplicateKeys: duplicateKeys,
          skippedRows: skippedRows.length > 0 ? skippedRows : undefined
        }
      };

    } catch (error) {
      throw new Error(`Failed to add multiple rows: ${error.message}`);
    }
  }
}

export default GoogleSheetsService;
