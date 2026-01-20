/**
 * GRANNY GEAR WORKSHOP - External API Handler (v2.1)
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
 * 
 * NOTE: This dispatches to functions in Code.gs
 * Your Code.gs should have these functions:
 * - verifyPin(pin)
 * - reserveJobId()
 * - submitJob(jobData)
 * - getAllJobs()
 * - updateJobStatus(jobId, status, updates)
 * - updateJobTriage(jobId, urgency, complexity, workNotes, assignedTo)
 * - archiveJob(jobId)
 * - archiveCompletedJobs()
 * - cancelJob(jobId, reason)
 * - getStatistics()
 * - getConfig()
 */

// ===== WEB APP ENTRY POINTS =====

/**
 * Handle GET requests
 * Used for: health checks, CORS preflight, API info
 */
function doGet(e) {
  const output = {
    status: 'ok',
    service: 'Granny Gear Workshop API',
    version: '2.1',
    timestamp: new Date().toISOString(),
    endpoints: [
      'verifyPin', 'reserveJobId', 'createJob', 'submitJob',
      'getJobs', 'getAllJobs', 'triageJob', 'updateJobTriage',
      'updateStatus', 'updateJobStatus', 'completeJob',
      'archiveJob', 'archiveCompletedJobs', 'cancelJob',
      'getStatistics', 'getConfig', 'ping', 'testEmail', 'testConnection'
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
    Logger.log(`[API] Action: ${action} | Timestamp: ${new Date().toISOString()}`);
    
    // Route to appropriate handler
    let result;
    
    switch(action) {
      // ===== Authentication & Authorization =====
      case 'verifyPin':
        result = { success: verifyPin(data.pin) };
        break;
      
      // ===== Job ID Management =====
      case 'reserveJobId':
        result = reserveJobId();
        break;
      
      // ===== Job Creation/Submission =====
      case 'createJob':
      case 'submitJob':
        // Maps to submitJob in Code.gs (handles booking form submission)
        result = submitJob(data);
        break;
      
      // ===== Job Retrieval =====
      case 'getJobs':
      case 'getAllJobs':
        result = { success: true, jobs: getAllJobs() };
        break;
      
      // ===== Job Workflow - Triage =====
      case 'triageJob':
      case 'updateJobTriage':
        result = updateJobTriage(
          data.jobId, 
          data.urgency, 
          data.complexity, 
          data.workNotes, 
          data.assignedTo
        );
        break;
      
      // ===== Job Workflow - Status Updates =====
      case 'updateStatus':
      case 'updateJobStatus':
        result = updateJobStatus(data.jobId, data.status, data.updates);
        break;
      
      case 'completeJob':
        // Complete a job (mark as completed)
        result = updateJobStatus(data.jobId, 'completed', {
          workNotes: data.workNotes,
          completionPdfBase64: data.pdfBase64
        });
        break;
      
      // ===== Archive Operations =====
      case 'archiveJob':
        result = archiveJob(data.jobId);
        break;
      
      case 'archiveAllCompleted':
      case 'archiveCompletedJobs':
        result = archiveCompletedJobs();
        break;
      
      case 'getArchivedJobs':
        result = { success: true, jobs: getArchivedJobs() };
        break;
      
      // ===== Job Cancellation =====
      case 'cancelJob':
        result = cancelJob(data.jobId, data.reason);
        break;
      
      // ===== Statistics & Config =====
      case 'getStatistics':
        result = { success: true, stats: getStatistics() };
        break;
      
      case 'getConfig':
        result = { success: true, config: getConfig() };
        break;
      
      // ===== Test/Debug Endpoints =====
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
      
      case 'testConnection':
        result = testConnection();
        break;
      
      // ===== Unknown Action =====
      default:
        result = { 
          success: false, 
          error: `Unknown action: ${action}`,
          code: 'UNKNOWN_ACTION',
          availableActions: [
            'verifyPin', 'reserveJobId', 'createJob', 'submitJob',
            'getJobs', 'getAllJobs', 'triageJob', 'updateJobTriage',
            'updateStatus', 'updateJobStatus', 'completeJob',
            'archiveJob', 'archiveCompletedJobs', 'getArchivedJobs', 'cancelJob',
            'getStatistics', 'getConfig', 'ping', 'testEmail', 'testConnection'
          ]
        };
    }
    
    // Add metadata
    const duration = new Date() - startTime;
    result._meta = {
      action: action,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };
    
    Logger.log(`[API] ${action} completed in ${duration}ms`);
    
    return createJsonResponse_(result);
    
  } catch (error) {
    // Catch-all error handler
    Logger.log(`[API ERROR] ${error.toString()}`);
    
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
 * Create a properly formatted JSON response
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
      subject: '[Granny Gear] API Email Test ✓',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
          <div style="background: #29ABE2; padding: 20px; text-align: center; border-radius: 8px; color: white;">
            <h2 style="margin: 0;">Email Test Successful! ✓</h2>
          </div>
          <div style="background: #f8f9fa; padding: 20px; margin-top: 10px; border-radius: 8px;">
            <p>This confirms that the Granny Gear Workshop API can send emails through Apps Script.</p>
            <p><strong>Test Result:</strong> SUCCESS</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p><strong>Recipient:</strong> ${testEmail}</p>
          </div>
          <div style="background: #1A1A1A; padding: 15px; text-align: center; margin-top: 10px; border-radius: 8px; color: #999;">
            <p style="margin: 0; font-size: 12px;">Granny Gear Workshop | API Test Email</p>
          </div>
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
 * Test API routing - call this from Apps Script to verify all routes work
 */
function testApiRouting() {
  Logger.log('=== TESTING API ROUTING ===');
  
  try {
    // Test 1: PIN Verification
    Logger.log('Test 1: verifyPin("1234")');
    const pinResult = verifyPin('1234');
    Logger.log('  Result: ' + JSON.stringify(pinResult));
    
    // Test 2: Reserve Job ID
    Logger.log('Test 2: reserveJobId()');
    const idResult = reserveJobId();
    Logger.log('  Result: ' + JSON.stringify(idResult));
    
    // Test 3: Get Jobs
    Logger.log('Test 3: getAllJobs()');
    const jobsResult = getAllJobs();
    Logger.log('  Result: ' + (jobsResult && jobsResult.length ? `${jobsResult.length} jobs found` : 'No jobs'));
    
    // Test 4: Get Config
    Logger.log('Test 4: getConfig()');
    const configResult = getConfig();
    Logger.log('  Result: ' + JSON.stringify(configResult));
    
    Logger.log('=== ALL ROUTING TESTS COMPLETED ===');
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
  }
}

/**
 * Simulate a POST request for testing the doPost handler
 */
function simulatePostRequest(action, dataObj) {
  Logger.log(`Simulating POST: action=${action}`);
  
  // Simulate the event object that doPost receives
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: action,
        ...dataObj
      })
    }
  };
  
  const response = doPost(mockEvent);
  const content = response.getContent();
  Logger.log('Response: ' + content);
  
  return content;
}
