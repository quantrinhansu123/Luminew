// Vercel Serverless Function for /api/fetch-detail-reports
// This will be available at: https://your-domain.vercel.app/api/fetch-detail-reports

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET method
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('📡 GET /api/fetch-detail-reports - Request received');
    console.log('📋 Query params:', req.query);

    // Get environment variables
    // Vercel uses process.env.VARIABLE_NAME directly
    // Vite uses process.env.VITE_VARIABLE_NAME (prefixed with VITE_)
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing Supabase configuration');
      return res.status(500).json({
        success: false,
        error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured. Please set them in Vercel environment variables.',
        data: []
      });
    }

    // Create Supabase admin client (bypasses RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get query parameters
    const { startDate, endDate, limit = '10000' } = req.query;

    console.log('🔑 Key prefix:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...');

    // Try selecting all first, then filter in memory if needed
    // Note: Column name "Ngày" has special character, need to use double quotes in PostgREST
    let query = supabaseAdmin
      .from('detail_reports')
      .select('*');

    // Apply date filters if provided
    // Convert date strings to proper format for Supabase DATE comparison
    if (startDate) {
      console.log('📅 Filtering by startDate:', startDate);
      // Ensure date is in YYYY-MM-DD format
      const startDateFormatted = startDate.split('T')[0]; // Remove time if present
      query = query.gte('Ngày', startDateFormatted);
    }
    if (endDate) {
      console.log('📅 Filtering by endDate:', endDate);
      // Ensure date is in YYYY-MM-DD format
      const endDateFormatted = endDate.split('T')[0]; // Remove time if present
      query = query.lte('Ngày', endDateFormatted);
    }
    
    // Order by date - column name with special character
    query = query.order('Ngày', { ascending: false });
    
    // Apply limit
    query = query.limit(parseInt(limit));

    console.log('🔍 Executing query...');
    console.log('📋 Query params:', { startDate, endDate, limit });
    
    try {
      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching detail_reports:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        
        // Check if it's an RLS error
        if (error.message && (error.message.includes('row-level security') || error.message.includes('RLS') || error.message.includes('permission denied'))) {
          return res.status(500).json({
            success: false,
            error: `RLS Policy Error: ${error.message}. Please configure SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables to bypass RLS.`,
            data: [],
            hint: 'The current key may not have permission to bypass RLS. You need a service role key.',
            errorCode: error.code,
            errorMessage: error.message
          });
        }
        
        // Check if column doesn't exist
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist') || error.message.includes('Ngày'))) {
          return res.status(500).json({
            success: false,
            error: `Column Error: ${error.message}. Please check if column 'Ngày' exists in detail_reports table.`,
            data: [],
            hint: 'The column name might be different. Check your database schema.',
            errorCode: error.code,
            errorMessage: error.message
          });
        }
        
        return res.status(500).json({
          success: false,
          error: error.message || 'Unknown error',
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: JSON.stringify(error),
          data: []
        });
      }

      console.log(`✅ Fetched ${data?.length || 0} records from detail_reports`);

      return res.status(200).json({
        success: true,
        data: data || [],
        count: data?.length || 0
      });
    } catch (queryError) {
      console.error('❌ Query execution error:', queryError);
      console.error('❌ Query error stack:', queryError.stack);
      return res.status(500).json({
        success: false,
        error: `Query execution failed: ${queryError.message}`,
        errorStack: queryError.stack,
        data: []
      });
    }

  } catch (error) {
    console.error('❌ Fetch detail_reports error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      errorStack: error.stack,
      data: []
    });
  }
}
