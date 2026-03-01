// Vercel Serverless Function for /api/orders
// API với API key authentication để lấy tất cả các cột trong bảng orders

const { createClient } = require('@supabase/supabase-js');

// Helper function để verify API key
function verifyApiKey(req) {
  // Lấy API key từ header hoặc query parameter
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.api_key;
  const validApiKey = process.env.ORDERS_API_KEY || process.env.VITE_ORDERS_API_KEY;
  
  if (!validApiKey) {
    console.warn('⚠️ ORDERS_API_KEY not set in environment variables');
    return false;
  }
  
  return apiKey === validApiKey;
}

// Helper function để setup CORS
function setupCORS(res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-API-Key, Authorization'
  );
}

module.exports = async function handler(req, res) {
  // Setup CORS
  setupCORS(res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only GET method is supported'
    });
    return;
  }

  try {
    // Verify API key
    if (!verifyApiKey(req)) {
      console.warn('❌ Invalid or missing API key');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing API key. Please provide a valid API key in X-API-Key header or api_key query parameter.'
      });
      return;
    }

    console.log('✅ API key verified');
    console.log('GET /api/orders - Request received');
    console.log('Query params:', req.query);

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Supabase credentials not configured');
      res.status(500).json({
        error: 'Server configuration error',
        message: 'Supabase credentials are not configured'
      });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query parameters
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

    // Build base query - select ALL columns
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
      console.log(`Executing query WITH filters`);
    } else {
      console.log('Executing query WITHOUT filters - fetching all data');
    }

    // Get total count first
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
      return res.status(500).json({ 
        error: 'Error getting count', 
        details: countError.message 
      });
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
        return res.status(500).json({ 
          error: 'Error fetching data', 
          details: pageError.message 
        });
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

    // Normalize keys to lowercase for consistency (optional)
    // Comment out if you want to keep original case
    const normalizedData = allData.map(order => {
      const normalized = {};
      for (const [key, value] of Object.entries(order)) {
        normalized[key.toLowerCase()] = value;
      }
      return normalized;
    });

    const finalTotal = total || normalizedData.length;
    console.log(`✅ Final: Fetched ${normalizedData.length} records (expected: ${finalTotal})`);

    // Add cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

    return res.status(200).json({
      success: true,
      data: normalizedData,
      total: finalTotal,
      fetched_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in /api/orders:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
}
