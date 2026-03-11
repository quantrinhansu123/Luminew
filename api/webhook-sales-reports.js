// Vercel Serverless Function for /api/webhook-sales-reports
// Webhook handler để tự động tính order_count khi có record mới trong sales_reports
// Có thể được trigger từ Supabase Database Webhooks

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📡 [webhook-sales-reports] Webhook received');
    console.log('📋 Body:', JSON.stringify(req.body, null, 2));

    // Get environment variables
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ Missing Supabase configuration');
      return res.status(500).json({
        success: false,
        error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.'
      });
    }

    // Parse webhook payload
    const webhookData = req.body;
    const eventType = webhookData.type || webhookData.eventType; // 'INSERT', 'UPDATE', 'DELETE'
    const record = webhookData.record || webhookData.new || webhookData.old;

    if (!record || !record.id) {
      console.log('ℹ️ No record found in webhook payload');
      return res.status(200).json({
        success: true,
        message: 'No record to process'
      });
    }

    // Chỉ xử lý INSERT và UPDATE
    if (eventType === 'DELETE') {
      console.log('ℹ️ DELETE event, skipping');
      return res.status(200).json({
        success: true,
        message: 'DELETE event ignored'
      });
    }

    console.log(`🔍 Processing ${eventType} event for record ID: ${record.id}`);

    // Gọi API calculate-order-count để tính toán
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : (req.headers.host ? `https://${req.headers.host}` : 'http://localhost:3000');
    
    const calculateUrl = `${baseUrl}/api/calculate-order-count?recordId=${record.id}`;
    
    console.log(`📡 Calling calculate-order-count API: ${calculateUrl}`);

    try {
      const response = await fetch(calculateUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        console.log(`✅ Successfully calculated order_count for record ${record.id}`);
        return res.status(200).json({
          success: true,
          message: `Order count calculated for record ${record.id}`,
          order_count: result.data[0]?.order_count
        });
      } else {
        console.error(`❌ Error calculating order_count:`, result.error);
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (fetchError) {
      console.error('❌ Error calling calculate-order-count API:', fetchError);
      return res.status(500).json({
        success: false,
        error: `Failed to call calculate-order-count: ${fetchError.message}`
      });
    }

  } catch (error) {
    console.error('❌ [webhook-sales-reports] Error:', error);
    console.error('❌ Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      errorStack: error.stack
    });
  }
}
