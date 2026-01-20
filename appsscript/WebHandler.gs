/**
 * GRANNY GEAR WORKSHOP - External API Handler
 * 
 * This file handles all external HTTP requests from the Cloudflare PWA.
 * It routes requests to the business logic functions in Code.gs.
 * 
 * File named "WebHandler.gs" to load AFTER "Code.gs" alphabetically,
 * ensuring these doGet/doPost handlers take precedence.
 * 
 * CORS: Configured to allow requests from any origin (required for PWA)
 * 
 * Deploy as Web App:
 * 1. Deploy > New deployment > Web app
 * 2. Execute as: Me (your account)
 * 3. Who has access: Anyone
 * 4. After deploy, copy the Web App URL to your PWA's API config
 */

// ===== CORS CONFIGURATION =====
const ALLOWED_ORIGINS = [
  'https://grannygear.pages.dev',
  'https://grannygear.co.za',
  'http://localhost:3000',
  'http://localhost:8788',
  'http://127.0.0.1:8788'
];

// ===== WEB APP ENTRY POINTS =====

/**
 * Handle GET requests
 * Used for: health checks, CORS preflight, API info
 */
function doGet(e) {
  const output = {
    status: 'ok',
    service: 'Granny Gear Workshop API',
    version: '2.0',
    timestamp: new Date().toISOString(),
    endpoints: [
      'verifyPin',
      'reserveJobId', 
      'createJob',
      'getJobs',
      'triageJob',
      'updateStatus',
      'completeJob',
      'archiveJob',
      'archiveAllCompleted',
      'cancelJob'
    ]
  };
  
  return createJsonResponse_(output);
}

/**
 * Handle POST requests (main API endpoint)
 * All actions from the PWA come through here
 */
function doPost(e) {
  const startTime = new Date();
  
  try {
    // Parse incoming request
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse_({ 
        success: false, 
        error: 'No data received',
        code: 'EMPTY_REQUEST'
      });
    }
    
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return createJsonResponse_({ 
        success: false, 
        error: 'Invalid JSON: ' + parseError.message,
        code: 'INVALID_JSON'
      });
    }
    
    const action = data.action;
    
    if (!action) {
      return createJsonResponse_({ 
        success: false, 
        error: 'No action specified',
        code: 'NO_ACTION'
      });
    }
    
    // Log the request (useful for debugging)
    Logger.log(`[API] Action: ${action} | Data: ${JSON.stringify(data).substring(0, 200)}`);
    
    // Route to appropriate handler
    let result;
    
    switch(action) {
      // ===== Authentication =====
      case 'verifyPin':
        result = verifyPin(data.pin);
        break;
      
      // ===== Job ID Management =====
      case 'reserveJobId':
        result = reserveJobId();
        break;
      
      // ===== Job CRUD =====
      case 'createJob':
        result = createJob(data);
        break;
        
      case 'getJobs':
        result = getJobs();
        break;
      
      // ===== Job Workflow =====
      case 'triageJob':
        result = triageJob(data.jobId, data.urgency, data.complexity, data.workNotes);
        break;
        
      case 'updateStatus':
        result = updateJobStatus(data.jobId, data.status);
        break;
        
      case 'completeJob':
        result = completeJob(data.jobId, data.pdfBase64, data.workNotes);
        break;
      
      // ===== Archive Operations =====
      case 'archiveJob':
        result = archiveJob(data.jobId);
        break;
        
      case 'archiveAllCompleted':
        result = archiveAllCompleted();
        break;
        
      case 'cancelJob':
        result = cancelJob(data.jobId, data.reason);
        break;
      
      // ===== Test/Debug =====
      case 'ping':
        result = { 
          success: true, 
          message: 'pong',
          timestamp: new Date().toISOString()
        };
        break;
        
      case 'testEmail':
        result = testEmailSending_();
        break;
      
      // ===== Unknown Action =====
      default:
        result = { 
          success: false, 
          error: `Unknown action: ${action}`,
          code: 'UNKNOWN_ACTION',
          availableActions: [
            'verifyPin', 'reserveJobId', 'createJob', 'getJobs',
            'triageJob', 'updateStatus', 'completeJob',
            'archiveJob', 'archiveAllCompleted', 'cancelJob',
            'ping', 'testEmail'
          ]
        };
    }
    
    // Add timing info
    const duration = new Date() - startTime;
    result._meta = {
      action: action,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };
    
    Logger.log(`[API] Response: ${JSON.stringify(result).substring(0, 300)} | ${duration}ms`);
    
    return createJsonResponse_(result);
    
  } catch (error) {
    // Catch-all error handler
    Logger.log(`[API ERROR] ${error.toString()}\n${error.stack}`);
    
    return createJsonResponse_({ 
      success: false, 
      error: error.toString(),
      code: 'SERVER_ERROR',
      _meta: {
        timestamp: new Date().toISOString()
      }
    });
  }
}

// ===== RESPONSE HELPERS =====

/**
 * Create a properly formatted JSON response with CORS headers
 */
function createJsonResponse_(data) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  return output;
}

// ===== TEST FUNCTIONS =====

/**
 * Test email sending capability
 */
function testEmailSending_() {
  try {
    const testEmail = Session.getActiveUser().getEmail();
    
    if (!testEmail) {
      return { 
        success: false, 
        error: 'Could not determine user email for test' 
      };
    }
    
    MailApp.sendEmail({
      to: testEmail,
      subject: '[Granny Gear] Email Test',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #29ABE2;">Email Test Successful! ✓</h2>
          <p>This confirms that the Granny Gear Workshop API can send emails.</p>
          <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
      `
    });
    
    return { 
      success: true, 
      message: `Test email sent to ${testEmail}` 
    };
    
  } catch (error) {
    return { 
      success: false, 
      error: error.toString() 
    };
  }
}

/**
 * Manual test function - run this from Apps Script editor
 * to verify the API routing works correctly
 */
function testApiRouting() {
  // Test verifyPin
  console.log('Testing verifyPin...');
  const pinResult = verifyPin('1234');
  console.log('verifyPin result:', pinResult);
  
  // Test reserveJobId
  console.log('Testing reserveJobId...');
  const idResult = reserveJobId();
  console.log('reserveJobId result:', idResult);
  
  // Test getJobs
  console.log('Testing getJobs...');
  const jobsResult = getJobs();
  console.log('getJobs result:', jobsResult);
  
  console.log('All tests completed!');
}

/**
 * Simulate a POST request for testing
 */
function simulatePostRequest() {
  // Simulate the event object that doPost receives
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'ping'
      })
    }
  };
  
  const response = doPost(mockEvent);
  console.log('Response:', response.getContent());
}
