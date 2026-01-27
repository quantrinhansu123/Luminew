import { supabase } from '../supabase/config';

/**
 * Log a data change to the change_logs table
 * @param {Object} params
 * @param {string} params.user_email - Email of user making the change
 * @param {string} params.action - 'UPDATE', 'INSERT', 'DELETE', 'SNAPSHOT'
 * @param {string} params.table_name - Table being modified
 * @param {string} params.record_id - ID of the record
 * @param {string} params.field - Field being changed (optional)
 * @param {string} params.old_value - Old value (optional)
 * @param {string} params.new_value - New value (optional)
 * @param {Object} params.details - Extra details JSON
 */
export const logDataChange = async ({
    user_email,
    action,
    table_name,
    record_id,
    field = null,
    old_value = null,
    new_value = null,
    details = {}
}) => {
    try {
        // Try to get user email from localStorage if not provided
        const email = user_email || localStorage.getItem('userEmail') || 'system';

        const { error } = await supabase
            .from('change_logs')
            .insert({
                user_email: email,
                action,
                table_name,
                record_id,
                field,
                old_value: String(old_value),
                new_value: String(new_value),
                details
            });

        if (error) {
            console.error('Supabase logging error:', error);
        }
    } catch (err) {
        console.error('Error logging change:', err);
    }
};
