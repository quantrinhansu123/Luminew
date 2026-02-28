/**
 * Google Apps Script for Uploading Files to Google Drive
 * 
 * DEPLOYMENT INSTRUCTIONS:
 * 1. Go to https://script.google.com/
 * 2. Create a new project
 * 3. Copy this entire code into Code.gs
 * 4. Replace DRIVE_FOLDER_ID with your actual folder ID: 1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5
 * 5. Deploy > New deployment > Select type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the Web App URL
 * 7. Add to .env file as: VITE_GOOGLE_DRIVE_UPLOAD_URL=your_web_app_url
 */

// Replace with your Google Drive folder ID
const DRIVE_FOLDER_ID = '1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5';

// Handle GET requests (for testing)
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Google Drive Upload Handler is running',
    folderId: DRIVE_FOLDER_ID
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    // Log that we received a request
    Logger.log('=== POST Request Received ===');
    Logger.log('postData exists: ' + (e.postData != null));
    Logger.log('postData.contents exists: ' + (e.postData != null && e.postData.contents != null));
    
    if (!e.postData || !e.postData.contents) {
      throw new Error('No postData or contents received');
    }
    
    // Parse incoming data
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseError) {
      Logger.log('JSON parse error: ' + parseError.toString());
      throw new Error('Invalid JSON in request: ' + parseError.toString());
    }
    
    const { folderId, fileName, fileContent, mimeType } = payload;
    
    if (!fileName || !fileContent) {
      throw new Error('Missing fileName or fileContent in payload');
    }
    
    // Use provided folderId or default
    const targetFolderId = folderId || DRIVE_FOLDER_ID;
    
    Logger.log(`Uploading file: ${fileName} to folder: ${targetFolderId}`);
    Logger.log(`File content length: ${fileContent.length} characters`);
    
    // Get the target folder
    let folder;
    try {
      folder = DriveApp.getFolderById(targetFolderId);
    } catch (folderError) {
      throw new Error(`Cannot access folder with ID: ${targetFolderId}. Please check folder ID and permissions.`);
    }
    
    // Convert base64 to blob
    let blob;
    try {
      blob = Utilities.newBlob(
        Utilities.base64Decode(fileContent),
        mimeType || 'application/json',
        fileName
      );
    } catch (decodeError) {
      throw new Error(`Failed to decode base64 content: ${decodeError.toString()}`);
    }
    
    // Create file in the folder
    let file;
    try {
      file = folder.createFile(blob);
    } catch (createError) {
      throw new Error(`Failed to create file: ${createError.toString()}`);
    }
    
    Logger.log(`File created successfully: ${file.getName()} (ID: ${file.getId()})`);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileName: file.getName(),
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      message: 'File uploaded successfully'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log(`Error: ${error.toString()}`);
    Logger.log(`Stack trace: ${error.stack || 'N/A'}`);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function (optional)
function testUpload() {
  const testData = {
    folderId: DRIVE_FOLDER_ID,
    fileName: 'test_' + new Date().getTime() + '.json',
    fileContent: Utilities.base64Encode('{"test": "data"}'),
    mimeType: 'application/json'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}
