import { supabase } from '../supabase/config';
import { fetchOrders } from './api';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_BACKUP_URL;

/**
 * Perform daily F3 backup to Google Sheets
 * Filters data by today's date and sends to Google Apps Script
 * @param {string} trigger - 'cron' or 'manual'
 * @returns {Promise<Object>} Backup result
 */
export const performDailyBackup = async (trigger = 'cron') => {
    console.log('🔄 Starting F3 daily backup...');

    try {
        // 1. Get current date in GMT+7
        const now = new Date();
        const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const today = vietnamTime.toISOString().split('T')[0]; // "2026-01-19"
        const sheetName = `F3_Backup_${today}`;

        // 2. Fetch all F3 data
        console.log('📥 Fetching F3 data...');
        const allData = await fetchOrders();

        // 3. Filter by today's date
        const filteredData = allData.filter(order => {
            const orderDateStr = order['Ngày lên đơn'];
            if (!orderDateStr) return false;

            const orderDate = orderDateStr.split('T')[0];
            return orderDate === today;
        });

        console.log(`✅ Found ${filteredData.length} orders for ${today}`);

        // 4. If no data, still log it
        if (filteredData.length === 0) {
            await logBackupHistory({
                backup_date: today,
                sheet_name: sheetName,
                records_count: 0,
                status: 'success',
                backup_trigger: trigger
            });

            return {
                success: true,
                message: `No data to backup for ${today}`,
                recordsCount: 0,
                sheetName
            };
        }

        // 5. Send to Google Apps Script
        console.log('📤 Sending data to Google Sheets...');

        if (!APPS_SCRIPT_URL) {
            throw new Error('VITE_APPS_SCRIPT_BACKUP_URL is not configured');
        }

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sheetName,
                data: filteredData
            })
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Apps Script returned error');
        }

        // 6. Log success to Supabase
        await logBackupHistory({
            backup_date: today,
            sheet_name: sheetName,
            records_count: filteredData.length,
            status: 'success',
            backup_trigger: trigger
        });

        console.log('✅ Backup completed successfully');

        return {
            success: true,
            message: `Backup completed for ${today}`,
            recordsCount: filteredData.length,
            sheetName
        };

    } catch (error) {
        console.error('❌ Backup failed:', error);

        // Log failure
        const now = new Date();
        const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const today = vietnamTime.toISOString().split('T')[0];

        await logBackupHistory({
            backup_date: today,
            sheet_name: `F3_Backup_${today}`,
            records_count: 0,
            status: 'failed',
            error_message: error.message,
            backup_trigger: trigger
        });

        throw error;
    }
};

/**
 * Log backup operation to Supabase
 */
const logBackupHistory = async (data) => {
    try {
        // Use upsert to handle duplicate dates
        const { error } = await supabase
            .from('f3_backup_history')
            .upsert(data, {
                onConflict: 'backup_date',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('Failed to log backup history:', error);
        }
    } catch (err) {
        console.error('Error logging backup history:', err);
    }
};

/**
 * Get backup history
 * @param {number} limit - Number of records to fetch
 * @returns {Promise<Array>} Backup history
 */
export const getBackupHistory = async (limit = 30) => {
    try {
        const { data, error } = await supabase
            .from('f3_backup_history')
            .select('*')
            .order('backup_date', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching backup history:', error);
        return [];
    }
};

/**
 * Get backup for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object|null>} Backup record
 */
export const getBackupForDate = async (date) => {
    try {
        const { data, error } = await supabase
            .from('f3_backup_history')
            .select('*')
            .eq('backup_date', date)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error fetching backup for date:', error);
        return null;
    }
};
