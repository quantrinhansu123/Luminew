import { supabase } from '../supabase/config';

const DRIVE_FOLDER_ID = '1Jg0XAV5-5FFosEbl6FK2kZ-M_7-Qro_5';
const APPS_SCRIPT_URL = import.meta.env.VITE_GOOGLE_DRIVE_UPLOAD_URL || 'https://script.google.com/macros/s/AKfycbw-y-vLK1sDH15ski_IgTY31AletNjknER04FcZTtZDql36pHWTg1YsIGQ4Gl72U6ow3Q/exec';

// Table mapping
const TABLE_MAPPING = {
    'sale_reports': 'sales_reports',
    'delivery_orders': 'orders',
    'mkt_reports': 'detail_reports',
    'cskh_report': 'orders',
    'users': 'users'
};

// Get table display name
const getTableDisplayName = (tableId) => {
    const names = {
        'sale_reports': 'Xem báo cáo (Sale)',
        'delivery_orders': 'Quản lý vận đơn',
        'mkt_reports': 'Xem báo cáo (MKT)',
        'cskh_report': 'Xem báo cáo CSKH',
        'users': 'Quản lý nhân sự (Users)'
    };
    return names[tableId] || tableId;
};

/**
 * Get today's date in Vietnam timezone (YYYY-MM-DD)
 */
const getTodayVietnam = () => {
    const now = new Date();
    const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    return vietnamTime.toISOString().split('T')[0];
};

/**
 * Upload a single table to Google Drive
 */
const uploadTableToDrive = async (tableId, tableName, today) => {
    try {
        console.log(`📤 Uploading ${tableId} (${tableName}) for date: ${today}`);
        
        // Build query for today's data
        let query = supabase.from(tableName).select('*');
        
        // Apply date filter based on table type
        if (tableName === 'orders') {
            query = query.neq('team', 'RD'); // Exclude R&D
            query = query.gte('order_date', today);
            query = query.lte('order_date', today);
        } else if (tableName === 'sales_reports') {
            query = query.gte('date', today);
            query = query.lte('date', today);
        } else if (tableName === 'detail_reports') {
            query = query.gte('Ngày', today);
            query = query.lte('Ngày', today);
        } else if (tableName === 'users') {
            // For users table, get all data (no date filter)
            // Or filter by created_at if needed
            query = query.gte('created_at', today);
            query = query.lte('created_at', today + 'T23:59:59');
        } else {
            // Default: use created_at
            query = query.gte('created_at', today);
            query = query.lte('created_at', today + 'T23:59:59');
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        if (!data || data.length === 0) {
            console.log(`⚠️ No data found for ${tableId} on ${today}`);
            return {
                success: true,
                tableId,
                fileName: null,
                recordsCount: 0,
                message: `No data for ${today}`
            };
        }
        
        // Format file name: table name + date + time
        const tableDisplayName = getTableDisplayName(tableId).replace(/\//g, '-');
        const now = new Date();
        const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const year = vietnamTime.getFullYear();
        const month = String(vietnamTime.getMonth() + 1).padStart(2, '0');
        const day = String(vietnamTime.getDate()).padStart(2, '0');
        const hours = String(vietnamTime.getHours()).padStart(2, '0');
        const minutes = String(vietnamTime.getMinutes()).padStart(2, '0');
        const seconds = String(vietnamTime.getSeconds()).padStart(2, '0');
        
        const dateStr = `${year}${month}${day}`;
        const timeStr = `${hours}${minutes}${seconds}`;
        const fileName = `${tableDisplayName}_${dateStr}_${timeStr}.json`;
        
        // Convert to JSON and base64
        const jsonString = JSON.stringify(data, null, 2);
        
        // Encode to base64 (works in both browser and Node.js)
        let base64Data;
        if (typeof Buffer !== 'undefined') {
            // Node.js/serverless environment
            base64Data = Buffer.from(jsonString, 'utf8').toString('base64');
        } else {
            // Browser environment
            base64Data = btoa(unescape(encodeURIComponent(jsonString)));
        }
        
        // Upload to Google Drive
        const payload = {
            folderId: DRIVE_FOLDER_ID,
            fileName: fileName,
            fileContent: base64Data,
            mimeType: 'application/json'
        };
        
        // Use fetch with no-cors for reliability
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        console.log(`✅ Uploaded ${tableId}: ${fileName} (${data.length} records)`);
        
        return {
            success: true,
            tableId,
            fileName,
            recordsCount: data.length,
            message: `Uploaded successfully`
        };
        
    } catch (error) {
        console.error(`❌ Error uploading ${tableId}:`, error);
        return {
            success: false,
            tableId,
            fileName: null,
            recordsCount: 0,
            error: error.message
        };
    }
};

/**
 * Perform daily automatic upload of all tables to Google Drive
 * Only uploads data from today (no date range filter)
 */
export const performDailyDriveUpload = async (trigger = 'cron') => {
    console.log('🔄 Starting daily Google Drive upload...');
    
    const today = getTodayVietnam();
    console.log(`📅 Uploading data for date: ${today}`);
    
    const tables = Object.keys(TABLE_MAPPING);
    const results = [];
    
    // Upload each table sequentially to avoid overwhelming the server
    for (const tableId of tables) {
        const tableName = TABLE_MAPPING[tableId];
        const result = await uploadTableToDrive(tableId, tableName, today);
        results.push(result);
        
        // Small delay between uploads
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const successCount = results.filter(r => r.success).length;
    const totalRecords = results.reduce((sum, r) => sum + r.recordsCount, 0);
    
    console.log(`✅ Daily upload completed: ${successCount}/${tables.length} tables, ${totalRecords} total records`);
    
    return {
        success: true,
        date: today,
        trigger,
        tablesProcessed: tables.length,
        tablesSucceeded: successCount,
        totalRecords,
        results
    };
};
