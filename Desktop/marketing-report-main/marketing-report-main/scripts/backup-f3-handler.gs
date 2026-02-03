/**
 * Google Apps Script for F3 Daily Backup
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to https://script.google.com/
 * 2. Create a new project
 * 3. Copy this entire code into Code.gs
 * 4. Replace YOUR_SPREADSHEET_ID with your actual spreadsheet ID
 * 5. Deploy > New deployment > Select type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the Web App URL
 * 7. Add to Vercel environment variables as: VITE_APPS_SCRIPT_BACKUP_URL
 */

// Replace with your spreadsheet ID
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

function doPost(e) {
  try {
    // Parse incoming data
    const payload = JSON.parse(e.postData.contents);
    const { sheetName, data } = payload;
    
    if (!sheetName || !data) {
      throw new Error('Missing sheetName or data in payload');
    }
    
    Logger.log(`Processing backup for sheet: ${sheetName}`);
    Logger.log(`Data rows: ${data.length}`);
    
    // Open the spreadsheet
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Check if sheet already exists
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      // Create new sheet
      sheet = ss.insertSheet(sheetName);
      Logger.log(`Created new sheet: ${sheetName}`);
    } else {
      // Clear existing data
      sheet.clear();
      Logger.log(`Cleared existing sheet: ${sheetName}`);
    }
    
    // If no data, just return success
    if (data.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        sheetName: sheetName,
        recordsCount: 0,
        message: 'No data to backup'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Extract headers from first row
    const headers = Object.keys(data[0]);
    
    // Write headers
    sheet.appendRow(headers);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285F4');
    headerRange.setFontColor('#FFFFFF');
    
    // Write data rows
    let successCount = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const values = headers.map(header => {
        const value = row[header];
        // Handle null/undefined
        if (value === null || value === undefined) return '';
        // Convert objects to JSON string
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      });
      
      sheet.appendRow(values);
      successCount++;
      
      // Log progress every 100 rows
      if ((i + 1) % 100 === 0) {
        Logger.log(`Progress: ${i + 1}/${data.length} rows`);
      }
    }
    
    // Auto-resize columns
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    Logger.log(`Backup completed: ${successCount} rows`);
    
    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      sheetName: sheetName,
      recordsCount: successCount,
      message: `Backup completed successfully`
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log(`Error: ${error.toString()}`);
    
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString(),
      message: 'Backup failed'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function (optional)
function testBackup() {
  const testData = {
    sheetName: 'F3_Backup_TEST',
    data: [
      { 'Mã đơn hàng': 'TEST001', 'Name*': 'Test Customer', 'Phone*': '0123456789' },
      { 'Mã đơn hàng': 'TEST002', 'Name*': 'Test Customer 2', 'Phone*': '0987654321' }
    ]
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}
