/**
 * Cloudflare Pages Function - API Proxy
 * Location: /functions/api/proxy.js
 * 
 * This handles requests to /api/proxy and forwards them to Google Apps Script
 */

export async function onRequest(context) {
  const { request } = context;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      }
    });
  }
  
  try {
    // Parse request body
    const body = await request.json();
    console.log('API Request:', body);
    
    // Google Apps Script Web App URL
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyhSpACfq5hYN88C4yd7YX7FEpXRjv9gA9gX6Qb9J1qp35B0IOpvl107HcT3KDFXFRx/exec';
    
    // Forward to Apps Script
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain', // Apps Script requires this
      },
      body: JSON.stringify(body)
    });
    
    // Check response
    if (!response.ok) {
      throw new Error(`Apps Script returned ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Apps Script Response:', data);
    
    // Return with CORS headers
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
    
  } catch (error) {
    console.error('API Proxy Error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}