import { google } from 'googleapis';
import { SHEET_SCHEMAS } from '../models/sheet.schema.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ReportServices {
  constructor() {
    this.authClient = null;
    this.sheetsAPI = null;
    this.isAuthenticated = false;
    this.authPromise = null;
  }

  /**
   * Tạo authenticated client để kết nối Google Sheets API
   */
  async getAuthenticatedClient() {
    if (this.authClient && this.sheetsAPI && this.isAuthenticated) {
      return this.sheetsAPI;
    }

    if (this.authPromise) {
      await this.authPromise;
      return this.sheetsAPI;
    }

    this.authPromise = this.performAuthentication();
    await this.authPromise;
    this.authPromise = null;

    return this.sheetsAPI;
  }

  /**
   * Thực hiện authentication
   */
  async performAuthentication() {
    try {
      const KEYFILEPATH = path.join(__dirname, '../..', 'sheetCredentials.json');
      
      this.authClient = new google.auth.GoogleAuth({
        keyFile: KEYFILEPATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });

      this.sheetsAPI = google.sheets({ 
        version: 'v4', 
        auth: this.authClient 
      });

      this.isAuthenticated = true;
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Authentication failed: ${error.message}`);
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
        fullRange: `${sheetName}!A1:${lastColumn}`,
        batchRanges: null,
        columns: schema.columns.map((col, index) => ({
          key: col.key,
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
          key: field,
          index: colIndex,
          letter: this.getColumnLetter(colIndex + 1),
          type: schema.columns[colIndex].type
        });
      } else {
        console.warn(`⚠️ Field '${field}' not found in schema for sheet '${sheetName}'`);
      }
    });


    if (requestedColumns.length === 0) {
      return { fullRange: `${sheetName}!A1:A`, batchRanges: null };
    }

    // Kiểm tra xem các cột có liền kề không
    const sortedColumns = requestedColumns.sort((a, b) => a.index - b.index);
    const isContiguous = this.areColumnsContiguous(sortedColumns);


    if (isContiguous) {
      // Các cột liền kề -> sử dụng single range
      const firstCol = sortedColumns[0].letter;
      const lastCol = sortedColumns[sortedColumns.length - 1].letter;
      return {
        fullRange: `${sheetName}!${firstCol}1:${lastCol}`,
        batchRanges: null,
        columns: requestedColumns
      };
    } else {
      // Các cột không liền kề -> sử dụng batchGet
      const batchRanges = sortedColumns.map(col => ({
        range: `${sheetName}!${col.letter}:${col.letter}`,
        key: col.key,
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

        // Xử lý string date
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
    dataRows.forEach((row, rowIndex) => {
      const rowObject = { rowIndex: rowIndex + 2 };

      columns.forEach(col => {
        const rawValue = row[col.index];
        const transformedValue = this.transformValueFast(rawValue, col.type);
        rowObject[col.key] = transformedValue;
      });

      result.push(rowObject);
    });

    return result;
  }

  /**
   * Lấy tất cả dữ liệu từ một sheet với spreadsheetId tùy chỉnh - SMART RANGE VERSION
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {string} sheetName - Tên sheet
   * @param {object} options - Options: { limit, offset, fields }
   */
  async getAllData(spreadsheetId, sheetName, options = {}) {
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
        processedData = await this.getAllDataWithBatch(spreadsheetId, sheets, rangeInfo, { limit, offset });
      } else {
        // Contiguous columns or full data - use single range
        processedData = await this.getAllDataWithSingleRange(spreadsheetId, sheets, rangeInfo, { limit, offset });
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
          rangeUsed: rangeInfo.fullRange || rangeInfo.batchRanges?.map(b => b.range),
          spreadsheetId: spreadsheetId
        }
      };

    } catch (error) {
      throw new Error(`Failed to get data from spreadsheet ${spreadsheetId}: ${error.message}`);
    }
  }

  /**
   * Get data with single range (contiguous columns) với spreadsheetId tùy chỉnh
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {object} sheets - Google Sheets API instance
   * @param {object} rangeInfo - Range information
   * @param {object} options - Options: { limit, offset }
   */
  async getAllDataWithSingleRange(spreadsheetId, sheets, rangeInfo, options = {}) {
    const { limit, offset = 0 } = options;

    try {

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
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

    } catch (error) {
      console.error(`❌ [SingleRange] Error fetching from ${spreadsheetId}:`, error.message);
      throw new Error(`Failed to fetch single range data: ${error.message}`);
    }
  }

  /**
   * Get data with batchGet (non-contiguous columns) với spreadsheetId tùy chỉnh
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {object} sheets - Google Sheets API instance
   * @param {object} rangeInfo - Range information
   * @param {object} options - Options: { limit, offset }
   */
  async getAllDataWithBatch(spreadsheetId, sheets, rangeInfo, options = {}) {
    const { limit, offset = 0 } = options;

    // Prepare batch request
    const ranges = rangeInfo.batchRanges.map(batch => batch.range);

    try {

      const batchRequest = {
        spreadsheetId: spreadsheetId,
        ranges: ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'ROWS'
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

      // Calculate how many rows to process
      const maxRows = limit ? Math.min(limit, maxDataRows - offset) : maxDataRows - offset;
      const startRow = offset + 1; // +1 to skip header

      for (let i = 0; i < maxRows; i++) {
        const rowIndex = startRow + i;
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
      }

      return processedData;

    } catch (error) {
      console.error(`❌ [BatchGet] Error fetching from ${spreadsheetId}:`, error.message);
      console.error(`📋 [BatchGet] Failed ranges:`, ranges);
      throw new Error(`Failed to fetch batch data: ${error.message}`);
    }
  }

  /**
   * Get row count for a specific spreadsheet
   * @param {string} spreadsheetId - Google Spreadsheet ID
   * @param {string} sheetName - Sheet name
   */
  async getRowCount(spreadsheetId, sheetName) {
    try {
      const sheets = await this.getAuthenticatedClient();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:A`,
        valueRenderOption: 'UNFORMATTED_VALUE'
      });

      const values = response.data.values || [];
      return Math.max(0, values.length - 1); // Subtract 1 for header
    } catch (error) {
      throw new Error(`Failed to get row count from ${spreadsheetId}: ${error.message}`);
    }
  }

  /**
   * Get spreadsheet info
   * @param {string} spreadsheetId - Google Spreadsheet ID
   */
  async getSpreadsheetInfo(spreadsheetId) {
    try {
      const sheets = await this.getAuthenticatedClient();

      const response = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId
      });

      return {
        title: response.data.properties.title,
        spreadsheetId: spreadsheetId,
        sheets: response.data.sheets.map(sheet => ({
          id: sheet.properties.sheetId,
          title: sheet.properties.title,
          gridProperties: sheet.properties.gridProperties
        }))
      };
    } catch (error) {
      throw new Error(`Failed to get spreadsheet info for ${spreadsheetId}: ${error.message}`);
    }
  }
}

export default ReportServices;
