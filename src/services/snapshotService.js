import { supabase } from '../supabase/config';
import { fetchOrders } from './api';
import { logDataChange } from './logging';

/**
 * Perform End of Shift Snapshot
 * 1. Clones detail_reports -> detail_reports_view_copy
 * 2. Clones F3 Data (Live) -> f3_data_snapshot
 * @param {string} userEmail - User performing the snapshot
 */
export const performEndOfShiftSnapshot = async (userEmail) => {
    console.log('Starting End of Shift Snapshot...');

    try {
        // 1. Snapshot Detail Reports
        // Fetch current live data
        const { data: liveReports, error: fetchError } = await supabase
            .from('detail_reports')
            .select('*');

        if (fetchError) throw fetchError;

        // Clear existing snapshot (Simulated Truncate)
        // Note: DELETE without WHERE is blocked by default in some SQL setups, 
        // but Supabase JS usually requires a wrapper or RLS allowing it.
        // We use neq '0' to delete all assuming IDs are not '0'
        const { error: deleteReportsError } = await supabase
            .from('detail_reports_view_copy')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Hack to delete all if UUID

        if (deleteReportsError) console.warn('Warning clearing reports snapshot:', deleteReportsError);

        // Insert new snapshot
        if (liveReports && liveReports.length > 0) {
            const { error: insertReportsError } = await supabase
                .from('detail_reports_view_copy')
                .insert(liveReports);

            if (insertReportsError) throw insertReportsError;
        }

        // 2. Snapshot F3 Data
        // Fetch from Live Source (API/Firebase via api.js)
        const f3Data = await fetchOrders(); // This gets data from Vercel API

        // Transform for snapshot
        const f3SnapshotRows = f3Data.map(item => ({
            id: item['Mã đơn hàng'] || item['id'] || `f3_${Date.now()}_${Math.random()}`,
            order_code: item['Mã đơn hàng'],
            raw_data: item,
            snapshot_timestamp: new Date().toISOString()
        }));

        // Clear existing F3 snapshot
        const { error: deleteF3Error } = await supabase
            .from('f3_data_snapshot')
            .delete()
            .neq('id', 'placeholder'); // Assuming ID is text

        if (deleteF3Error) console.warn('Warning clearing F3 snapshot:', deleteF3Error);

        // Insert new F3 snapshot (in chunks if large)
        if (f3SnapshotRows.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < f3SnapshotRows.length; i += chunkSize) {
                const chunk = f3SnapshotRows.slice(i, i + chunkSize);
                const { error: insertF3Error } = await supabase
                    .from('f3_data_snapshot')
                    .insert(chunk);
                if (insertF3Error) throw insertF3Error;
            }
        }

        // 3. Log the action
        await logDataChange({
            user_email: userEmail,
            action: 'SNAPSHOT',
            table_name: 'ALL',
            record_id: 'BATCH',
            details: {
                message: 'End of shift snapshot performed',
                reports_count: liveReports?.length || 0,
                f3_count: f3SnapshotRows.length
            }
        });

        console.log('Snapshot completed successfully');
        return true;

    } catch (error) {
        console.error('Snapshot failed:', error);
        throw error;
    }
};

export { logDataChange };
