import GoogleSheetsService from '../src/services/googleSheets.service.js';

class SheetsUtility {
  constructor() {
    this.sheetsService = new GoogleSheetsService();
  }

  /**
   * Backup toàn bộ dữ liệu của một sheet
   */
  async backupSheet(sheetName) {
    try {
      const data = await this.sheetsService.getAllData(sheetName);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      return {
        sheetName,
        timestamp,
        data,
        totalRows: data.length,
        message: `Backup completed for sheet "${sheetName}"`
      };
    } catch (error) {
      throw new Error(`Failed to backup sheet: ${error.message}`);
    }
  }

  /**
   * Restore dữ liệu từ backup
   */
  async restoreSheet(sheetName, backupData) {
    try {
      // Clear existing data
      await this.sheetsService.clearAllData(sheetName);
      
      // Restore data
      if (backupData.length > 0) {
        await this.sheetsService.addMultipleRows(sheetName, backupData);
      }

      return {
        message: `Sheet "${sheetName}" restored successfully`,
        restoredRows: backupData.length
      };
    } catch (error) {
      throw new Error(`Failed to restore sheet: ${error.message}`);
    }
  }

  /**
   * Copy dữ liệu từ sheet này sang sheet khác
   */
  async copySheetData(sourceSheetName, targetSheetName) {
    try {
      const sourceData = await this.sheetsService.getAllData(sourceSheetName);
      
      if (sourceData.length === 0) {
        return {
          message: 'No data to copy',
          copiedRows: 0
        };
      }

      await this.sheetsService.addMultipleRows(targetSheetName, sourceData);

      return {
        message: `Data copied from "${sourceSheetName}" to "${targetSheetName}"`,
        copiedRows: sourceData.length
      };
    } catch (error) {
      throw new Error(`Failed to copy sheet data: ${error.message}`);
    }
  }

  /**
   * Validate dữ liệu hàng loạt trước khi import
   */
  async validateBatchData(sheetName, rows) {
    const errors = [];
    const validRows = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const validatedRow = await this.sheetsService.validateRow(rows[i], sheetName);
        validRows.push(validatedRow);
      } catch (error) {
        errors.push({
          rowIndex: i,
          error: error.message,
          data: rows[i]
        });
      }
    }

    return {
      validRows,
      errors,
      validCount: validRows.length,
      errorCount: errors.length,
      totalRows: rows.length
    };
  }

  /**
   * Import dữ liệu với validation và báo lỗi chi tiết
   */
  async importDataWithValidation(sheetName, rows, options = {}) {
    const { skipErrors = false, clearBeforeImport = false } = options;

    try {
      // Validate all rows first
      const validation = await this.validateBatchData(sheetName, rows);

      if (validation.errorCount > 0 && !skipErrors) {
        return {
          success: false,
          message: 'Validation failed. Use skipErrors option to import valid rows only.',
          validation
        };
      }

      // Clear existing data if requested
      if (clearBeforeImport) {
        await this.sheetsService.clearAllData(sheetName);
      }

      // Import valid rows
      let importResult = null;
      if (validation.validRows.length > 0) {
        importResult = await this.sheetsService.addMultipleRows(sheetName, validation.validRows);
      }

      return {
        success: true,
        message: 'Import completed',
        importResult,
        validation,
        importedRows: validation.validCount
      };
    } catch (error) {
      throw new Error(`Failed to import data: ${error.message}`);
    }
  }

  /**
   * Tính toán thống kê cơ bản cho một sheet
   */
  async getSheetStatistics(sheetName) {
    try {
      const data = await this.sheetsService.getAllData(sheetName);
      const schema = this.sheetsService.getSheetSchema(sheetName);

      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      const stats = {
        totalRows: data.length,
        emptyRows: 0,
        columnStats: {}
      };

      // Initialize column stats
      schema.columns.forEach(column => {
        stats.columnStats[column.key] = {
          header: column.header,
          type: column.type,
          totalValues: 0,
          emptyValues: 0,
          uniqueValues: new Set()
        };
      });

      // Calculate statistics
      data.forEach(row => {
        let isEmptyRow = true;

        schema.columns.forEach(column => {
          const value = row[column.key];
          const hasValue = value !== null && value !== undefined && value.toString().trim() !== '';

          if (hasValue) {
            isEmptyRow = false;
            stats.columnStats[column.key].totalValues++;
            stats.columnStats[column.key].uniqueValues.add(value.toString());
          } else {
            stats.columnStats[column.key].emptyValues++;
          }
        });

        if (isEmptyRow) {
          stats.emptyRows++;
        }
      });

      // Convert Sets to counts
      Object.keys(stats.columnStats).forEach(key => {
        const uniqueCount = stats.columnStats[key].uniqueValues.size;
        stats.columnStats[key].uniqueCount = uniqueCount;
        delete stats.columnStats[key].uniqueValues;
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get sheet statistics: ${error.message}`);
    }
  }

  /**
   * Tìm và thay thế giá trị trong toàn bộ sheet
   */
  async findAndReplace(sheetName, searchValue, replaceValue, options = {}) {
    const { 
      searchColumns = null, // null = search all columns
      exactMatch = true,
      caseSensitive = false 
    } = options;

    try {
      const data = await this.sheetsService.getAllData(sheetName);
      const schema = this.sheetsService.getSheetSchema(sheetName);
      
      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      const columnsToSearch = searchColumns || schema.columns.map(col => col.key);
      const replacements = [];

      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        let hasChanges = false;
        const newRow = { ...row };

        columnsToSearch.forEach(columnKey => {
          const currentValue = row[columnKey]?.toString() || '';
          const searchStr = caseSensitive ? searchValue : searchValue.toLowerCase();
          const currentStr = caseSensitive ? currentValue : currentValue.toLowerCase();

          let shouldReplace = false;
          if (exactMatch) {
            shouldReplace = currentStr === searchStr;
          } else {
            shouldReplace = currentStr.includes(searchStr);
          }

          if (shouldReplace) {
            const newValue = exactMatch 
              ? replaceValue
              : currentValue.replace(new RegExp(searchValue, caseSensitive ? 'g' : 'gi'), replaceValue);
            
            newRow[columnKey] = newValue;
            hasChanges = true;

            replacements.push({
              rowIndex,
              column: columnKey,
              oldValue: currentValue,
              newValue
            });
          }
        });

        if (hasChanges) {
          await this.sheetsService.updateRowByIndex(sheetName, rowIndex, newRow);
        }
      }

      return {
        message: `Find and replace completed`,
        replacements,
        totalReplacements: replacements.length
      };
    } catch (error) {
      throw new Error(`Failed to find and replace: ${error.message}`);
    }
  }

  /**
   * Export dữ liệu sheet thành CSV format
   */
  async exportToCSV(sheetName) {
    try {
      const data = await this.sheetsService.getAllData(sheetName);
      const schema = this.sheetsService.getSheetSchema(sheetName);

      if (!schema) {
        throw new Error(`Schema not found for sheet: ${sheetName}`);
      }

      // Create CSV headers
      const headers = schema.columns.map(col => col.header);
      const csvRows = [headers];

      // Add data rows
      data.forEach(row => {
        const csvRow = schema.columns.map(col => {
          const value = row[col.key] || '';
          // Escape commas and quotes in CSV
          return typeof value === 'string' && (value.includes(',') || value.includes('"'))
            ? `"${value.replace(/"/g, '""')}"` 
            : value;
        });
        csvRows.push(csvRow);
      });

      const csvContent = csvRows.map(row => row.join(',')).join('\n');

      return {
        filename: `${sheetName}_${new Date().toISOString().split('T')[0]}.csv`,
        content: csvContent,
        rowCount: data.length,
        message: 'CSV export completed'
      };
    } catch (error) {
      throw new Error(`Failed to export CSV: ${error.message}`);
    }
  }

  /**
   * Duplicate một sheet với tên mới
   */
  async duplicateSheet(sourceSheetName, newSheetName) {
    try {
      // Create new sheet
      await this.sheetsService.createSheet(newSheetName);
      
      // Copy data
      const result = await this.copySheetData(sourceSheetName, newSheetName);

      return {
        message: `Sheet "${sourceSheetName}" duplicated as "${newSheetName}"`,
        copiedRows: result.copiedRows
      };
    } catch (error) {
      throw new Error(`Failed to duplicate sheet: ${error.message}`);
    }
  }
}

export default SheetsUtility;
