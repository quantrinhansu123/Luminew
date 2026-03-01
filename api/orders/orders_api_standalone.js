/**
 * Orders API using Node.js/Express
 * Optimized API for querying orders from Supabase
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// CORS middleware
app.use(cors());
app.use(express.json());

// Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('='.repeat(60));
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    console.error('='.repeat(60));
    console.error('Please create a .env file in the api/orders directory with:');
    console.error('SUPABASE_URL=https://your-project-id.supabase.co');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here');
    console.error('='.repeat(60));
    process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * GET / - Get orders with filtering and sorting
 * Query params:
 * - order_date_from: Start date (YYYY-MM-DD)
 * - order_date_to: End date (YYYY-MM-DD)
 * - total_amount_vnd_min: Minimum amount
 * - total_amount_vnd_max: Maximum amount
 * - country: Filter by country
 * - product: Filter by product
 * - tracking_code: Filter by tracking code
 * - marketing_staff: Filter by marketing staff
 * - sale_staff: Filter by sale staff
 * - team: Filter by team
 * - sort_by: Sort field (default: "order_date")
 * - sort_order: Sort order "asc" or "desc" (default: "desc")
 */
app.get('/', async (req, res) => {
    try {
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
            team,
            sort_by = 'order_date',
            sort_order = 'desc'
        } = req.query;

        // Build base query
        let query = supabase.from('orders').select('*', { count: 'exact' });

        // Apply filters
        if (order_date_from) {
            query = query.gte('order_date', order_date_from);
            console.log(`Filter: order_date >= ${order_date_from}`);
        }
        if (order_date_to) {
            query = query.lte('order_date', order_date_to);
            console.log(`Filter: order_date <= ${order_date_to}`);
        }
        if (total_amount_vnd_min !== undefined) {
            query = query.gte('total_amount_vnd', parseFloat(total_amount_vnd_min));
        }
        if (total_amount_vnd_max !== undefined) {
            query = query.lte('total_amount_vnd', parseFloat(total_amount_vnd_max));
        }
        if (country) {
            query = query.eq('country', country);
        }
        if (product) {
            query = query.eq('product', product);
        }
        if (tracking_code) {
            query = query.eq('tracking_code', tracking_code);
        }
        if (marketing_staff) {
            query = query.eq('marketing_staff', marketing_staff);
        }
        if (sale_staff) {
            query = query.eq('sale_staff', sale_staff);
        }
        if (team) {
            query = query.eq('team', team);
        }

        // Apply sorting
        query = query.order(sort_by, { ascending: sort_order === 'asc' });

        // Check if we have filters
        const hasFilters = !!(
            order_date_from || order_date_to ||
            total_amount_vnd_min !== undefined || total_amount_vnd_max !== undefined ||
            country || product || tracking_code || marketing_staff || sale_staff || team
        );

        if (hasFilters) {
            console.log(`Executing query WITH filters: order_date_from=${order_date_from}, order_date_to=${order_date_to}`);
        } else {
            console.log('Executing query WITHOUT filters - fetching all data');
        }

        // First, get total count
        const countQuery = supabase.from('orders').select('*', { count: 'exact', head: true });
        
        // Apply same filters for count
        let countQueryWithFilters = countQuery;
        if (order_date_from) countQueryWithFilters = countQueryWithFilters.gte('order_date', order_date_from);
        if (order_date_to) countQueryWithFilters = countQueryWithFilters.lte('order_date', order_date_to);
        if (total_amount_vnd_min !== undefined) countQueryWithFilters = countQueryWithFilters.gte('total_amount_vnd', parseFloat(total_amount_vnd_min));
        if (total_amount_vnd_max !== undefined) countQueryWithFilters = countQueryWithFilters.lte('total_amount_vnd', parseFloat(total_amount_vnd_max));
        if (country) countQueryWithFilters = countQueryWithFilters.eq('country', country);
        if (product) countQueryWithFilters = countQueryWithFilters.eq('product', product);
        if (tracking_code) countQueryWithFilters = countQueryWithFilters.eq('tracking_code', tracking_code);
        if (marketing_staff) countQueryWithFilters = countQueryWithFilters.eq('marketing_staff', marketing_staff);
        if (sale_staff) countQueryWithFilters = countQueryWithFilters.eq('sale_staff', sale_staff);
        if (team) countQueryWithFilters = countQueryWithFilters.eq('team', team);

        const { count: total, error: countError } = await countQueryWithFilters;
        
        if (countError) {
            console.error('Error getting count:', countError);
            return res.status(500).json({ error: 'Error getting count', details: countError.message });
        }

        console.log(`Total records to fetch: ${total || 0}`);

        // Fetch all records by looping through pages (Supabase limit: 1000 per request)
        const PAGE_SIZE = 1000;
        const allData = [];
        let offset = 0;
        let pageNum = 1;
        const maxPages = total > 0 ? Math.ceil(total / PAGE_SIZE) + 2 : 100; // Safety limit

        while (pageNum <= maxPages) {
            // Build query for current page
            let pageQuery = supabase.from('orders').select('*');

            // Apply filters
            if (order_date_from) pageQuery = pageQuery.gte('order_date', order_date_from);
            if (order_date_to) pageQuery = pageQuery.lte('order_date', order_date_to);
            if (total_amount_vnd_min !== undefined) pageQuery = pageQuery.gte('total_amount_vnd', parseFloat(total_amount_vnd_min));
            if (total_amount_vnd_max !== undefined) pageQuery = pageQuery.lte('total_amount_vnd', parseFloat(total_amount_vnd_max));
            if (country) pageQuery = pageQuery.eq('country', country);
            if (product) pageQuery = pageQuery.eq('product', product);
            if (tracking_code) pageQuery = pageQuery.eq('tracking_code', tracking_code);
            if (marketing_staff) pageQuery = pageQuery.eq('marketing_staff', marketing_staff);
            if (sale_staff) pageQuery = pageQuery.eq('sale_staff', sale_staff);
            if (team) pageQuery = pageQuery.eq('team', team);

            // Apply sorting and pagination
            pageQuery = pageQuery.order(sort_by, { ascending: sort_order === 'asc' });
            pageQuery = pageQuery.range(offset, offset + PAGE_SIZE - 1);

            console.log(`Fetching page ${pageNum} (offset: ${offset}, limit: ${PAGE_SIZE})...`);

            const { data: pageData, error: pageError } = await pageQuery;

            if (pageError) {
                console.error(`Error fetching page ${pageNum}:`, pageError);
                return res.status(500).json({ error: 'Error fetching data', details: pageError.message });
            }

            if (!pageData || pageData.length === 0) {
                console.log(`No more data at page ${pageNum}, stopping...`);
                break;
            }

            allData.push(...pageData);
            console.log(`Page ${pageNum}: Got ${pageData.length} records. Total fetched: ${allData.length}/${total || '?'}`);

            // Stop if we got less than PAGE_SIZE (means last page)
            if (pageData.length < PAGE_SIZE) {
                console.log(`Got less than ${PAGE_SIZE} records, this is the last page`);
                break;
            }

            // Stop if we reached or exceeded total
            if (total > 0 && allData.length >= total) {
                console.log(`Reached total count: ${total}`);
                break;
            }

            offset += PAGE_SIZE;
            pageNum++;
        }

        // Normalize keys to lowercase for consistency
        const normalizedData = allData.map(order => {
            const normalized = {};
            for (const [key, value] of Object.entries(order)) {
                normalized[key.toLowerCase()] = value;
            }
            return normalized;
        });

        const finalTotal = total || normalizedData.length;
        console.log(`✅ Final: Fetched ${normalizedData.length} records (expected: ${finalTotal})`);

        return res.json({
            data: normalizedData,
            total: finalTotal
        });

    } catch (error) {
        console.error('Error querying orders:', error);
        return res.status(500).json({ 
            error: 'Error querying orders', 
            details: error.message 
        });
    }
});

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Orders API running on http://localhost:${PORT}`);
    console.log(`📊 Supabase URL: ${SUPABASE_URL}`);
});
