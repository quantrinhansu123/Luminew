/**
 * Service to call Orders API
 * Replaces direct Supabase queries with optimized API calls
 */

const ORDERS_API_URL = import.meta.env.VITE_ORDERS_API_URL || 'http://localhost:8000';

/**
 * Fetch orders from Orders API with filters
 * @param {Object} filters - Filter criteria
 * @param {string} filters.order_date_from - Start date (YYYY-MM-DD)
 * @param {string} filters.order_date_to - End date (YYYY-MM-DD)
 * @param {number} filters.total_amount_vnd_min - Minimum amount
 * @param {number} filters.total_amount_vnd_max - Maximum amount
 * @param {string} filters.country - Filter by country
 * @param {string} filters.product - Filter by product
 * @param {string} filters.tracking_code - Filter by tracking code
 * @param {string} filters.marketing_staff - Filter by marketing staff
 * @param {string} filters.sale_staff - Filter by sale staff
 * @param {string} filters.team - Filter by team
 * @param {string} sort_by - Sort field (default: "order_date")
 * @param {string} sort_order - Sort order: "asc" or "desc" (default: "desc")
 * @returns {Promise<Object>} Response with data and total
 */
export const fetchOrders = async (filters = {}, options = {}) => {
    const {
        order_date_from,
        order_date_to,
        total_amount_vnd_min,
        total_amount_vnd_max,
        country,
        product,
        tracking_code,
        marketing_staff,
        sale_staff,
        team
    } = filters;

    const {
        sort_by = 'order_date',
        sort_order = 'desc'
    } = options;

    // Build query parameters
    const params = new URLSearchParams();
    
    if (order_date_from) params.append('order_date_from', order_date_from);
    if (order_date_to) params.append('order_date_to', order_date_to);
    if (total_amount_vnd_min !== undefined) params.append('total_amount_vnd_min', total_amount_vnd_min);
    if (total_amount_vnd_max !== undefined) params.append('total_amount_vnd_max', total_amount_vnd_max);
    if (country) params.append('country', country);
    if (product) params.append('product', product);
    if (tracking_code) params.append('tracking_code', tracking_code);
    if (marketing_staff) params.append('marketing_staff', marketing_staff);
    if (sale_staff) params.append('sale_staff', sale_staff);
    if (team) params.append('team', team);
    
    params.append('sort_by', sort_by);
    params.append('sort_order', sort_order);

    try {
        const response = await fetch(`${ORDERS_API_URL}/?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`Orders API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error fetching orders from API:', error);
        throw error;
    }
};

/**
 * Fetch all orders (API now returns all matching records in one call)
 * @param {Object} filters - Filter criteria
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of all orders
 */
export const fetchAllOrders = async (filters = {}, options = {}) => {
    try {
        const result = await fetchOrders(filters, options);
        return result.data || [];
    } catch (error) {
        console.error('Error fetching orders:', error);
        throw error;
    }
};

/**
 * Check if Orders API is available
 * @returns {Promise<boolean>}
 */
export const checkApiHealth = async () => {
    try {
        const response = await fetch(`${ORDERS_API_URL}/health`);
        return response.ok;
    } catch (error) {
        return false;
    }
};
