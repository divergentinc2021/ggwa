/**
 * GRANNY GEAR WORKSHOP MANAGEMENT SYSTEM
 * Google Apps Script Backend - v4 (with Archive & Cancel Job)
 * 
 * SETUP INSTRUCTIONS:
 * 1. Paste this code into Code.gs in Apps Script
 * 2. Create Index.html and paste the HTML code
 * 3. Run the "initialSetup" function FIRST (from the Run menu)
 * 4. Authorize the app when prompted
 * 5. Deploy as Web App
 */

// ===== CONFIGURATION =====
const CONFIG = {
  SPREADSHEET_NAME: 'GrannyGear_Workshop_DB',
  SHOP_EMAIL: 'info@grannygear.co.za',
  SHOP_NAME: 'Granny Gear',
  OPERATOR_PIN: '1234', // Change this in production!
  MECHANICS: ['Mike', 'Johan', 'Sipho', 'Thandi'],
  
  // Official GG Logo (hosted on Cloudflare Pages)
  LOGO_URL: 'https://ggwa.pages.dev/icons/icon-192.png',
  
  // PHP Email API Configuration
  EMAIL_API: {
    ENDPOINT: 'https://grannygear.co.za/api/sendmail.php',
    API_KEY: 'grannygear-workshop-2026-secure',  // Must match PHP config!
    FROM_EMAIL: 'info@grannygear.co.za',
    FROM_NAME: 'Granny Gear',
    REPLY_TO: 'info@grannygear.co.za',
    ENABLED: true  // Set to false to use MailApp fallback
  }
};

// ===== INITIALIZATION - RUN THIS FIRST! =====

/**
 * Run this function first to set up the spreadsheet and permissions
 * Go to: Run > Run function > initialSetup
 */
function initialSetup() {
  try {
    Logger.log('Starting initial setup...');
    
    // Check if we already have a spreadsheet ID stored
    const props = PropertiesService.getScriptProperties();
    let ssId = props.getProperty('SPREADSHEET_ID');
    let ss;
    
    if (ssId) {
      try {
        ss = SpreadsheetApp.openById(ssId);
        Logger.log('Found existing spreadsheet: ' + ss.getUrl());
      } catch (e) {
        Logger.log('Stored spreadsheet ID invalid, will create new one');
        ssId = null;
      }
    }
    
    if (!ssId) {
      // Try to find by name first
      const files = DriveApp.getFilesByName(CONFIG.SPREADSHEET_NAME);
      if (files.hasNext()) {
        const file = files.next();
        ss = SpreadsheetApp.open(file);
        ssId = ss.getId();
        Logger.log('Found existing spreadsheet by name: ' + ss.getUrl());
      } else {
        // Create new spreadsheet
        ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
        ssId = ss.getId();
        Logger.log('Created new spreadsheet: ' + ss.getUrl());
      }
      
      // Store the ID for future use
      props.setProperty('SPREADSHEET_ID', ssId);
    }
    
    // Now set up the sheets
    setupSheets_(ss);
    
    Logger.log('='.repeat(50));
    Logger.log('SETUP COMPLETE!');
    Logger.log('Spreadsheet URL: ' + ss.getUrl());
    Logger.log('Spreadsheet ID: ' + ssId);
    Logger.log('='.repeat(50));
    Logger.log('Next step: Deploy as Web App');
    
    return {
      success: true,
      url: ss.getUrl(),
      id: ssId
    };
    
  } catch (error) {
    Logger.log('ERROR during setup: ' + error.toString());
    throw error;
  }
}

/**
 * Internal function to set up sheet structure
 */
function setupSheets_(ss) {
  Logger.log('Setting up sheets...');
  
  // Jobs sheet
  let jobsSheet = ss.getSheetByName('Jobs');
  if (!jobsSheet) {
    jobsSheet = ss.insertSheet('Jobs');
    Logger.log('Created Jobs sheet');
  }
  
  // Check if headers exist
  const jobsHeaders = jobsSheet.getRange('A1').getValue();
  if (!jobsHeaders) {
    const headers = [
      'JobID', 'Status', 'CreatedAt', 'UpdatedAt', 'FirstName', 'LastName',
      'Email', 'Phone', 'BoardNumber', 'BikeBrand', 'BikeModel', 'BikeType',
      'NeededBy', 'NeededByText', 'ServiceType', 'Checklist', 'Description',
      'Urgency', 'Complexity', 'WorkNotes', 'AssignedTo', 'StartedAt', 'CompletedAt'
    ];
    jobsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    jobsSheet.getRange('1:1').setFontWeight('bold').setBackground('#29ABE2').setFontColor('white');
    jobsSheet.setFrozenRows(1);
    Logger.log('Added headers to Jobs sheet');
  }
  
  // Archive sheet (for completed/cancelled jobs)
  let archiveSheet = ss.getSheetByName('Archive');
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet('Archive');
    const headers = [
      'JobID', 'Status', 'CreatedAt', 'UpdatedAt', 'FirstName', 'LastName',
      'Email', 'Phone', 'BoardNumber', 'BikeBrand', 'BikeModel', 'BikeType',
      'NeededBy', 'NeededByText', 'ServiceType', 'Checklist', 'Description',
      'Urgency', 'Complexity', 'WorkNotes', 'AssignedTo', 'StartedAt', 'CompletedAt',
      'ArchivedAt', 'ArchiveReason'
    ];
    archiveSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    archiveSheet.getRange('1:1').setFontWeight('bold').setBackground('#6C757D').setFontColor('white');
    archiveSheet.setFrozenRows(1);
    Logger.log('Created Archive sheet');
  }
  
  // Config sheet
  let configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = ss.insertSheet('Config');
    configSheet.appendRow(['Key', 'Value']);
    configSheet.appendRow(['LastJobNumber', '0']);
    configSheet.appendRow(['OperatorPIN', CONFIG.OPERATOR_PIN]);
    configSheet.getRange('1:1').setFontWeight('bold');
    Logger.log('Created Config sheet');
  }
  
  // AuditLog sheet
  let auditSheet = ss.getSheetByName('AuditLog');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('AuditLog');
    auditSheet.appendRow(['Timestamp', 'Action', 'JobID', 'User', 'Details']);
    auditSheet.getRange('1:1').setFontWeight('bold');
    Logger.log('Created AuditLog sheet');
  }
  
  // Remove default Sheet1 if exists and we have other sheets
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
    Logger.log('Removed default Sheet1');
  }
}

// ===== WEB APP ENTRY POINTS =====

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Granny Gear Workshop')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({ error: 'Use client-side API calls' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== SPREADSHEET ACCESS =====

/**
 * Get the spreadsheet - uses stored ID from properties
 */
function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const ssId = props.getProperty('SPREADSHEET_ID');
  
  if (!ssId) {
    throw new Error('Spreadsheet not initialized. Please run initialSetup() first.');
  }
  
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    throw new Error('Could not open spreadsheet. Please run initialSetup() again.');
  }
}

// ===== JOB MANAGEMENT API =====

/**
 * Reserve a Job ID when operator takes over (PIN verified)
 * Called immediately after successful PIN entry
 */
function reserveJobId() {
  try {
    const jobId = generateJobId();
    logAction_('JOB_ID_RESERVED', jobId, 'Operator', 'Job ID reserved at customer handoff');
    return {
      success: true,
      jobId: jobId
    };
  } catch (error) {
    Logger.log('Error reserving job ID: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}


function generateJobId() {
  const ss = getSpreadsheet_();
  const configSheet = ss.getSheetByName('Config');
  const data = configSheet.getDataRange().getValues();
  
  let lastNum = 0;
  let rowIndex = -1;
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'LastJobNumber') {
      lastNum = parseInt(data[i][1]) || 0;
      rowIndex = i + 1;
      break;
    }
  }
  
  const newNum = lastNum + 1;
  if (rowIndex > 0) {
    configSheet.getRange(rowIndex, 2).setValue(newNum);
  }
  
  return 'GG-' + String(newNum).padStart(3, '0');
}

function submitJob(jobData) {
  try {
    const ss = getSpreadsheet_();
    const jobsSheet = ss.getSheetByName('Jobs');

    // Use pre-generated jobId if provided, otherwise generate new one
    const jobId = jobData.jobId || generateJobId();
    const now = new Date().toISOString();
    
    const row = [
      jobId,
      'pending',
      now,
      now,
      jobData.firstName || '',
      jobData.lastName || '',
      jobData.email || '',
      jobData.phone || '',
      jobData.boardNumber || '',
      jobData.bikeBrand || '',
      jobData.bikeModel || '',
      jobData.bikeType || '',
      jobData.neededBy || '',
      jobData.neededByText || '',
      jobData.serviceType || '',
      JSON.stringify(jobData.checklist || []),
      jobData.description || '',
      'medium',
      'moderate',
      '',
      '',
      '',
      ''
    ];
    
    jobsSheet.appendRow(row);
    
    // Calculate queue position
    const allJobs = jobsSheet.getDataRange().getValues();
    const pendingJobs = allJobs.filter(r => r[1] === 'pending' || r[1] === 'triaged');
    const queuePosition = pendingJobs.length;
    
    // Log action
    logAction_('JOB_SUBMITTED', jobId, 'Customer', `${jobData.firstName} ${jobData.lastName}`);
    
    // Track email results
    let emailStatus = {
      customerEmailSent: false,
      shopEmailSent: false,
      customerEmail: jobData.email || null,
      errors: []
    };
    
      // Send confirmation email to customer (shop is BCC'd)
      if (jobData.email && jobData.email.includes('@')) {
        try {
          emailStatus.customerEmailSent = sendConfirmationEmail_(jobId, jobData, queuePosition);
          emailStatus.shopEmailSent = emailStatus.customerEmailSent; // Same email, BCC'd
          if (!emailStatus.customerEmailSent) {
            emailStatus.errors.push('Email failed to send');
          }
        } catch (emailError) {
          Logger.log('Email error: ' + emailError.toString());
          emailStatus.errors.push('Email error: ' + emailError.message);
        }
      } else {
        // No customer email - send shop-only notification
        try {
          emailStatus.shopEmailSent = sendShopNotification_(jobId, jobData);
        } catch (emailError) {
          Logger.log('Shop email error: ' + emailError.toString());
        }
      }
    
    Logger.log('Email status: ' + JSON.stringify(emailStatus));
    
    return {
      success: true,
      jobId: jobId,
      queuePosition: queuePosition,
      emailStatus: emailStatus
    };
    
  } catch (error) {
    Logger.log('Error submitting job: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

function getAllJobs() {
  try {
    const ss = getSpreadsheet_();
    const jobsSheet = ss.getSheetByName('Jobs');
    
    if (!jobsSheet) {
      Logger.log('Jobs sheet not found!');
      return [];
    }
    
    const data = jobsSheet.getDataRange().getValues();
    Logger.log('Total rows in Jobs sheet: ' + data.length);
    
    if (data.length <= 1) {
      Logger.log('No data rows found (only headers or empty)');
      return [];
    }
    
    const headers = data[0];
    Logger.log('Headers: ' + JSON.stringify(headers));
    
    const jobs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Skip empty rows (check if JobID is empty)
      if (!row[0] || row[0] === '') {
        continue;
      }
      
      const job = {};
      for (let j = 0; j < headers.length; j++) {
        let value = row[j];
        const headerKey = String(headers[j]).toLowerCase();
        
        // Parse JSON fields
        if (headerKey === 'checklist' && typeof value === 'string' && value) {
          try {
            value = JSON.parse(value);
          } catch (e) {
            value = [];
          }
        }
        
        // Normalize status to lowercase
        if (headerKey === 'status' && typeof value === 'string') {
          value = value.toLowerCase().trim();
        }
        
        // Convert dates to ISO strings
        if (value instanceof Date) {
          value = value.toISOString();
        }
        
        job[headerKey] = value;
      }
      
      // Ensure required fields have defaults
      job.status = job.status || 'pending';
      job.urgency = job.urgency || 'medium';
      job.complexity = job.complexity || 'moderate';
      
      jobs.push(job);
    }
    
    Logger.log('Processed ' + jobs.length + ' jobs');
    if (jobs.length > 0) {
      Logger.log('First job sample: ' + JSON.stringify(jobs[0]));
    }
    
    return jobs;
    
  } catch (error) {
    Logger.log('Error getting jobs: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    return [];
  }
}

function getJobsByStatus(status) {
  const allJobs = getAllJobs();
  return allJobs.filter(job => job.status === status);
}

function updateJobStatus(jobId, newStatus, updates) {
  try {
    updates = updates || {};
    
    const ss = getSpreadsheet_();
    const jobsSheet = ss.getSheetByName('Jobs');
    const data = jobsSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find job row
    let rowIndex = -1;
    let jobData = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === jobId) {
        rowIndex = i + 1;
        jobData = {};
        for (let j = 0; j < headers.length; j++) {
          jobData[headers[j].toLowerCase()] = data[i][j];
        }
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Update status
    const statusCol = headers.indexOf('Status') + 1;
    const updatedCol = headers.indexOf('UpdatedAt') + 1;
    
    jobsSheet.getRange(rowIndex, statusCol).setValue(newStatus);
    jobsSheet.getRange(rowIndex, updatedCol).setValue(new Date().toISOString());
    
    // Apply additional updates
    for (const [key, value] of Object.entries(updates)) {
      const colName = key.charAt(0).toUpperCase() + key.slice(1);
      const colIndex = headers.indexOf(colName);
      if (colIndex !== -1) {
        jobsSheet.getRange(rowIndex, colIndex + 1).setValue(value);
      }
    }
    
    // Special handling for status transitions
    if (newStatus === 'in-progress') {
      const startedCol = headers.indexOf('StartedAt') + 1;
      if (startedCol > 0) {
        jobsSheet.getRange(rowIndex, startedCol).setValue(new Date().toISOString());
      }
    }
    
    if (newStatus === 'completed') {
      const completedCol = headers.indexOf('CompletedAt') + 1;
      if (completedCol > 0) {
        jobsSheet.getRange(rowIndex, completedCol).setValue(new Date().toISOString());
      }
      
      // Send completion email with client-generated PDF
      try {
        if (jobData && jobData.email) {
          const pdfBase64 = updates.completionPdfBase64 || null;
          sendCompletionEmail_(jobData, pdfBase64);
        }
      } catch (emailError) {
        Logger.log('Completion email error: ' + emailError.toString());
      }
    }
    
    logAction_('STATUS_CHANGED', jobId, updates.assignedTo || 'System', `Status: ${newStatus}`);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('Error updating job: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function getJobById(jobId) {
  const allJobs = getAllJobs();
  return allJobs.find(job => job.jobid === jobId);
}

function updateJobTriage(jobId, urgency, complexity, workNotes, assignedTo) {
  return updateJobStatus(jobId, 'triaged', {
    urgency: urgency,
    complexity: complexity,
    workNotes: workNotes,
    assignedTo: assignedTo || ''
  });
}

// ===== ARCHIVE FUNCTIONS =====

/**
 * Archive a completed job (move from Jobs to Archive sheet)
 */
function archiveJob(jobId) {
  try {
    const ss = getSpreadsheet_();
    const jobsSheet = ss.getSheetByName('Jobs');
    let archiveSheet = ss.getSheetByName('Archive');
    
    // Create Archive sheet if it doesn't exist
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Archive');
      const headers = [
        'JobID', 'Status', 'CreatedAt', 'UpdatedAt', 'FirstName', 'LastName',
        'Email', 'Phone', 'BoardNumber', 'BikeBrand', 'BikeModel', 'BikeType',
        'NeededBy', 'NeededByText', 'ServiceType', 'Checklist', 'Description',
        'Urgency', 'Complexity', 'WorkNotes', 'AssignedTo', 'StartedAt', 'CompletedAt',
        'ArchivedAt', 'ArchiveReason'
      ];
      archiveSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      archiveSheet.getRange('1:1').setFontWeight('bold').setBackground('#6C757D').setFontColor('white');
      archiveSheet.setFrozenRows(1);
    }
    
    const data = jobsSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find job row
    let rowIndex = -1;
    let jobRow = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === jobId) {
        rowIndex = i + 1;
        jobRow = data[i];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Add archive metadata
    const archiveRow = [...jobRow, new Date().toISOString(), 'Completed - Archived'];
    
    // Append to Archive sheet
    archiveSheet.appendRow(archiveRow);
    
    // Delete from Jobs sheet
    jobsSheet.deleteRow(rowIndex);
    
    logAction_('JOB_ARCHIVED', jobId, 'System', 'Job moved to archive');
    
    return { success: true, message: 'Job archived successfully' };
    
  } catch (error) {
    Logger.log('Error archiving job: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Archive multiple completed jobs
 */
function archiveCompletedJobs() {
  try {
    const completedJobs = getJobsByStatus('completed');
    let archivedCount = 0;
    let errors = [];
    
    for (const job of completedJobs) {
      const result = archiveJob(job.jobid);
      if (result.success) {
        archivedCount++;
      } else {
        errors.push(`${job.jobid}: ${result.error}`);
      }
    }
    
    return {
      success: true,
      archivedCount: archivedCount,
      totalCompleted: completedJobs.length,
      errors: errors
    };
    
  } catch (error) {
    Logger.log('Error archiving completed jobs: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get archived jobs
 */
function getArchivedJobs() {
  try {
    const ss = getSpreadsheet_();
    const archiveSheet = ss.getSheetByName('Archive');
    
    if (!archiveSheet) {
      return [];
    }
    
    const data = archiveSheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return [];
    }
    
    const headers = data[0];
    const jobs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || row[0] === '') continue;
      
      const job = {};
      for (let j = 0; j < headers.length; j++) {
        let value = row[j];
        const headerKey = String(headers[j]).toLowerCase();
        
        if (headerKey === 'checklist' && typeof value === 'string' && value) {
          try { value = JSON.parse(value); } catch (e) { value = []; }
        }
        
        if (value instanceof Date) {
          value = value.toISOString();
        }
        
        job[headerKey] = value;
      }
      
      jobs.push(job);
    }
    
    return jobs;
    
  } catch (error) {
    Logger.log('Error getting archived jobs: ' + error.toString());
    return [];
  }
}

// ===== CANCEL JOB FUNCTION =====

/**
 * Cancel a job and notify customer
 */
function cancelJob(jobId, reason) {
  try {
    const ss = getSpreadsheet_();
    const jobsSheet = ss.getSheetByName('Jobs');
    let archiveSheet = ss.getSheetByName('Archive');
    
    // Create Archive sheet if it doesn't exist
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet('Archive');
      const headers = [
        'JobID', 'Status', 'CreatedAt', 'UpdatedAt', 'FirstName', 'LastName',
        'Email', 'Phone', 'BoardNumber', 'BikeBrand', 'BikeModel', 'BikeType',
        'NeededBy', 'NeededByText', 'ServiceType', 'Checklist', 'Description',
        'Urgency', 'Complexity', 'WorkNotes', 'AssignedTo', 'StartedAt', 'CompletedAt',
        'ArchivedAt', 'ArchiveReason'
      ];
      archiveSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      archiveSheet.getRange('1:1').setFontWeight('bold').setBackground('#6C757D').setFontColor('white');
      archiveSheet.setFrozenRows(1);
    }
    
    const data = jobsSheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find job row
    let rowIndex = -1;
    let jobRow = null;
    let jobData = {};
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === jobId) {
        rowIndex = i + 1;
        jobRow = [...data[i]];
        for (let j = 0; j < headers.length; j++) {
          jobData[headers[j].toLowerCase()] = data[i][j];
        }
        break;
      }
    }
    
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Update status to cancelled
    const statusCol = headers.indexOf('Status');
    if (statusCol !== -1) {
      jobRow[statusCol] = 'cancelled';
    }
    
    // Add archive metadata
    const archiveRow = [...jobRow, new Date().toISOString(), 'Cancelled: ' + (reason || 'No reason provided')];
    
    // Append to Archive sheet
    archiveSheet.appendRow(archiveRow);
    
    // Delete from Jobs sheet
    jobsSheet.deleteRow(rowIndex);
    
    // Send cancellation email to customer
    let emailSent = false;
    if (jobData.email && jobData.email.includes('@')) {
      try {
        emailSent = sendCancellationEmail_(jobData, reason);
      } catch (emailError) {
        Logger.log('Cancellation email error: ' + emailError.toString());
      }
    }
    
    logAction_('JOB_CANCELLED', jobId, 'Operator', 'Reason: ' + (reason || 'Not specified'));
    
    return { 
      success: true, 
      message: 'Job cancelled and customer notified',
      emailSent: emailSent
    };
    
  } catch (error) {
    Logger.log('Error cancelling job: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ===== PIN VERIFICATION =====

function verifyPin(pin) {
  try {
    const ss = getSpreadsheet_();
    const configSheet = ss.getSheetByName('Config');
    const data = configSheet.getDataRange().getValues();
    
    let storedPin = CONFIG.OPERATOR_PIN;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i][0] === 'OperatorPIN') {
        storedPin = String(data[i][1]);
        break;
      }
    }
    
    return String(pin) === storedPin;
  } catch (error) {
    Logger.log('PIN verification error: ' + error.toString());
    // Fall back to config PIN
    return String(pin) === CONFIG.OPERATOR_PIN;
  }
}

// ===== CORE EMAIL FUNCTION (PHP API with Attachment Support) =====

/**
 * Send email via PHP API or fallback to MailApp
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject  
 * @param {string} body - HTML body content
 * @param {object} options - Optional: { cc, bcc, replyTo, isHtml, attachment }
 *   attachment: { base64: string, filename: string, mimeType?: string }
 */
function sendEmail_(to, subject, body, options) {
  options = options || {};
  const opts = {
    cc: options.cc || [],
    bcc: options.bcc || [],
    replyTo: options.replyTo || CONFIG.EMAIL_API.REPLY_TO,
    isHtml: options.isHtml !== false, // Default true
    attachment: options.attachment || null
  };
  
  // Use PHP API if enabled
  if (CONFIG.EMAIL_API.ENABLED) {
    try {
      const result = sendViaPhpApi_(to, subject, body, opts);
      if (result.success) {
        Logger.log('Email sent via PHP API to: ' + to + (opts.attachment ? ' (with attachment)' : ''));
        return true;
      } else {
        Logger.log('PHP API failed, falling back to MailApp: ' + result.message);
      }
    } catch (e) {
      Logger.log('PHP API error, falling back to MailApp: ' + e.message);
    }
  }
  
  // Fallback to MailApp (supports attachments natively)
  try {
    const mailOptions = {
      to: to,
      subject: subject,
      htmlBody: body,
      replyTo: opts.replyTo
    };
    
    // Add attachment if provided
    if (opts.attachment && opts.attachment.base64) {
      try {
        const pdfBlob = Utilities.newBlob(
          Utilities.base64Decode(opts.attachment.base64),
          opts.attachment.mimeType || 'application/pdf',
          opts.attachment.filename || 'attachment.pdf'
        );
        mailOptions.attachments = [pdfBlob];
      } catch (attachError) {
        Logger.log('Attachment decode error: ' + attachError.message);
      }
    }
    
    MailApp.sendEmail(mailOptions);
    Logger.log('Email sent via MailApp to: ' + to);
    return true;
  } catch (e) {
    Logger.log('MailApp error: ' + e.message);
    return false;
  }
}

/**
 * Send email via PHP API endpoint (with attachment support)
 */
function sendViaPhpApi_(to, subject, body, opts) {
  const payload = {
    apiKey: CONFIG.EMAIL_API.API_KEY,
    to: to,
    subject: subject,
    body: body,
    replyTo: opts.replyTo || CONFIG.EMAIL_API.REPLY_TO
  };
  
  // Add CC/BCC if provided
  if (opts.cc && opts.cc.length > 0) {
    payload.cc = Array.isArray(opts.cc) ? opts.cc : [opts.cc];
  }
  if (opts.bcc && opts.bcc.length > 0) {
    payload.bcc = Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc];
  }
  
  // Add attachment if provided
  if (opts.attachment && opts.attachment.base64) {
    payload.attachment = {
      base64: opts.attachment.base64,
      filename: opts.attachment.filename || 'attachment.pdf',
      mimeType: opts.attachment.mimeType || 'application/pdf'
    };
  }
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(CONFIG.EMAIL_API.ENDPOINT, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  Logger.log('PHP API Response [' + responseCode + ']: ' + responseText);
  
  if (responseCode === 200) {
    const result = JSON.parse(responseText);
    return { success: result.success, message: result.message };
  } else {
    return { success: false, message: 'HTTP ' + responseCode + ': ' + responseText };
  }
}

/**
 * TEST FUNCTION: Send a test email via PHP API
 * Run this from Apps Script to verify the email endpoint works
 */
function testEmailApi() {
  const testEmail = Session.getActiveUser().getEmail() || CONFIG.SHOP_EMAIL;
  
  Logger.log('='.repeat(50));
  Logger.log('TESTING PHP EMAIL API');
  Logger.log('='.repeat(50));
  Logger.log('Endpoint: ' + CONFIG.EMAIL_API.ENDPOINT);
  Logger.log('API Key: ' + CONFIG.EMAIL_API.API_KEY.substring(0, 10) + '...');
  Logger.log('From: ' + CONFIG.EMAIL_API.FROM_EMAIL);
  Logger.log('Test recipient: ' + testEmail);
  Logger.log('');
  
  const testHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #29ABE2, #1E8BBB); padding: 30px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="Granny Gear" style="width: 80px; height: 80px; margin-bottom: 10px;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-family: 'Arial Black', Arial, sans-serif; font-style: italic; font-weight: 900; letter-spacing: -1px; text-transform: lowercase;">grannygear</h1>
        <h1 style="color: white; margin: 0; font-size: 48px;">!</h1>
        <h1 style="color: white; margin: 0;">🔧 Email API Test</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #333;">Success!</h2>
        <p>If you're reading this, the PHP Email API is working correctly.</p>
        <div style="background: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Endpoint:</strong> ${CONFIG.EMAIL_API.ENDPOINT}</p>
          <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
          <p><strong>From:</strong> ${CONFIG.EMAIL_API.FROM_EMAIL}</p>
        </div>
        <div style="background: #28A745; color: white; padding: 15px; border-radius: 8px; text-align: center;">
          <strong>✓ PHP Email API is configured correctly!</strong>
        </div>
      </div>
      <div style="background: #1A1A1A; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="GG" style="width: 40px; height: 40px; margin-bottom: 8px;">
        <p style="color: #999; margin: 0; font-size: 12px;">
          Granny Gear | www.grannygear.co.za
        </p>
      </div>
    </div>
  `;

  
  // Test with PHP API directly
  Logger.log('Attempting to send via PHP API...');
  
  try {
    const result = sendViaPhpApi_(testEmail, '[Granny Gear] Email API Test', testHtml, {
      replyTo: CONFIG.EMAIL_API.REPLY_TO
    });
    
    if (result.success) {
      Logger.log('');
      Logger.log('✅ SUCCESS! Test email sent via PHP API');
      Logger.log('Check inbox: ' + testEmail);
      return { 
        success: true, 
        method: 'PHP API',
        message: 'Test email sent to ' + testEmail,
        response: result
      };
    } else {
      Logger.log('');
      Logger.log('❌ PHP API returned error: ' + result.message);
      Logger.log('Trying MailApp fallback...');
      
      // Try fallback
      const fallbackResult = sendEmail_(testEmail, '[Granny Gear] Email API Test (Fallback)', testHtml);
      if (fallbackResult) {
        Logger.log('✅ Fallback successful via MailApp');
        return {
          success: true,
          method: 'MailApp (fallback)',
          message: 'PHP API failed, but MailApp worked. Check: ' + testEmail,
          phpError: result.message
        };
      } else {
        return {
          success: false,
          message: 'Both PHP API and MailApp failed',
          phpError: result.message
        };
      }
    }
  } catch (error) {
    Logger.log('');
    Logger.log('❌ Exception: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Test PHP API endpoint connectivity (without sending email)
 */
function testApiEndpoint() {
  Logger.log('Testing endpoint connectivity...');
  
  try {
    const response = UrlFetchApp.fetch(CONFIG.EMAIL_API.ENDPOINT, {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({ test: true }),
      muteHttpExceptions: true
    });
    
    const code = response.getResponseCode();
    const text = response.getContentText();
    
    Logger.log('Response Code: ' + code);
    Logger.log('Response: ' + text);
    
    // 401 means endpoint works but API key is wrong/missing (expected for test)
    if (code === 401 || code === 400) {
      Logger.log('✅ Endpoint is reachable (returned ' + code + ')');
      return { success: true, reachable: true, code: code };
    } else if (code === 200) {
      Logger.log('✅ Endpoint returned 200 OK');
      return { success: true, reachable: true, code: code, response: text };
    } else {
      Logger.log('⚠️ Unexpected response code: ' + code);
      return { success: false, reachable: true, code: code, response: text };
    }
  } catch (error) {
    Logger.log('❌ Cannot reach endpoint: ' + error.toString());
    return { success: false, reachable: false, error: error.toString() };
  }
}

// ===== EMAIL TEMPLATES =====

function sendConfirmationEmail_(jobId, jobData, queuePosition) {
  const subject = `[${CONFIG.SHOP_NAME}] Service Request Confirmed - ${jobId}`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #29ABE2, #1E8BBB); padding: 30px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="Granny Gear" style="width: 80px; height: 80px; margin-bottom: 10px;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-family: 'Arial Black', Arial, sans-serif; font-style: italic; font-weight: 900; letter-spacing: -1px; text-transform: lowercase;">grannygear</h1>
        <h1 style="color: white; margin: 0; font-size: 48px;">!</h1>
        <p style="color: white; margin: 5px 0 0; font-size: 14px;">Workshop Service Confirmation</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin-top: 0;">Hi ${jobData.firstName},</h2>
        <p>Your service request has been successfully logged!</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666;">Job Number:</td>
              <td style="padding: 8px 0; font-weight: bold; color: #29ABE2;">${jobId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Queue Position:</td>
              <td style="padding: 8px 0; font-weight: bold;">#${queuePosition}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Bike:</td>
              <td style="padding: 8px 0;">${jobData.bikeBrand} ${jobData.bikeModel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Service Type:</td>
              <td style="padding: 8px 0;">${jobData.serviceType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666;">Needed By:</td>
              <td style="padding: 8px 0;">${jobData.neededByText || 'Not specified'}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #FFF200; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-weight: bold; color: #1A1A1A;">
            We'll email you when your bike is ready for collection!
          </p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">
          Questions? Reply to this email or contact us.<br>
          info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829
        </p>
      </div>
      
      <div style="background: #1A1A1A; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="GG" style="width: 40px; height: 40px; margin-bottom: 8px;">
        <p style="color: #999; margin: 0; font-size: 12px;">
          Granny Gear | www.grannygear.co.za
        </p>
      </div>
    </div>
  `;
  
  // Build email options with BCC and optional PDF attachment
  const emailOptions = {
    bcc: [CONFIG.SHOP_EMAIL]
  };
  
  // Add PDF attachment if provided
  if (jobData.pdfBase64) {
    emailOptions.attachment = {
      base64: jobData.pdfBase64,
      filename: `GrannyGear_ServiceTicket_${jobId}.pdf`,
      mimeType: 'application/pdf'
    };
  }
  
  // Use PHP API via sendEmail_ wrapper (sends from info@grannygear.co.za)
  const result = sendEmail_(jobData.email, subject, htmlBody, emailOptions);
  
  Logger.log('Confirmation email sent to: ' + jobData.email + ' via ' + (CONFIG.EMAIL_API.ENABLED ? 'PHP API' : 'MailApp') + (jobData.pdfBase64 ? ' (with PDF)' : ''));
  return result;
}

function sendShopNotification_(jobId, jobData) {
  const subject = `[NEW JOB] ${jobId} - ${jobData.firstName} ${jobData.lastName}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #29ABE2; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="Granny Gear" style="width: 60px; height: 60px; margin-bottom: 8px;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-family: 'Arial Black', Arial, sans-serif; font-style: italic; font-weight: 900; letter-spacing: -1px; text-transform: lowercase;">grannygear</h1>
        <h1 style="color: white; margin: 0; font-size: 48px;">!</h1>
        <h2 style="color: white; margin: 0;">🔧 New Job Received</h2>
      </div>
      <div style="padding: 20px; background: #f8f9fa;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold; background: #e9ecef;">Job ID:</td><td style="padding: 8px; background: #e9ecef; color: #29ABE2; font-weight: bold;">${jobId}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Customer:</td><td style="padding: 8px;">${jobData.firstName} ${jobData.lastName}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #e9ecef;">Phone:</td><td style="padding: 8px; background: #e9ecef;">${jobData.phone}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${jobData.email || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #e9ecef;">Bike:</td><td style="padding: 8px; background: #e9ecef;">${jobData.bikeBrand} ${jobData.bikeModel} (${jobData.bikeType})</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Service:</td><td style="padding: 8px;">${jobData.serviceType}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #e9ecef;">Needed By:</td><td style="padding: 8px; background: #e9ecef;">${jobData.neededByText || 'Not specified'}</td></tr>
        </table>
        <div style="margin-top: 15px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #29ABE2;">
          <strong>Description:</strong><br>
          ${jobData.description || 'No description provided'}
        </div>
        <div style="margin-top: 15px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid #FFF200;">
          <strong>Checklist Items:</strong><br>
          ${(jobData.checklist || []).map(item => '• ' + item).join('<br>') || 'None selected'}
        </div>
      </div>
      <div style="background: #1A1A1A; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="GG" style="width: 40px; height: 40px; margin-bottom: 8px;">
        <p style="color: #999; margin: 0; font-size: 12px;">
          Granny Gear | www.grannygear.co.za
        </p>
      </div>
    </div>
  `;
  
  // Build email options with optional PDF attachment
  const emailOptions = {};
  
  // Add PDF attachment if provided
  if (jobData.pdfBase64) {
    emailOptions.attachment = {
      base64: jobData.pdfBase64,
      filename: `GrannyGear_ServiceTicket_${jobId}.pdf`,
      mimeType: 'application/pdf'
    };
  }
  
  // Use PHP API via sendEmail_ wrapper (sends from info@grannygear.co.za)
  const result = sendEmail_(CONFIG.SHOP_EMAIL, subject, htmlBody, emailOptions);
  Logger.log('Shop notification sent to ' + CONFIG.SHOP_EMAIL + ' via ' + (CONFIG.EMAIL_API.ENABLED ? 'PHP API' : 'MailApp') + (jobData.pdfBase64 ? ' (with PDF)' : ''));
  return result;
}

function sendCompletionEmail_(jobData, pdfBase64) {
  const subject = `[${CONFIG.SHOP_NAME}] Your bike is ready! - ${jobData.jobid}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #28A745, #1e7b34); padding: 30px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="Granny Gear" style="width: 80px; height: 80px; margin-bottom: 10px;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-family: 'Arial Black', Arial, sans-serif; font-style: italic; font-weight: 900; letter-spacing: -1px; text-transform: lowercase;">grannygear</h1>
        <h1 style="color: white; margin: 0; font-size: 48px;">✓</h1>
        <h2 style="color: white; margin: 10px 0 0;">Your bike is ready!</h2>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin-top: 0;">Hi ${jobData.firstname},</h2>
        <p>Great news! Your service has been completed.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p><strong>Job:</strong> ${jobData.jobid}</p>
          <p><strong>Bike:</strong> ${jobData.bikebrand} ${jobData.bikemodel}</p>
          <p><strong>Service:</strong> ${jobData.servicetype}</p>
        </div>
        
        <div style="background: #29ABE2; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="color: white; margin: 0; font-weight: bold; font-size: 18px;">
            Please contact us to arrange collection and payment.
          </p>
        </div>
        
        <p style="color: #666; margin-top: 30px; text-align: center;">
          Thank you for choosing Granny Gear!<br>
          info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829
        </p>
      </div>
      
      <div style="background: #1A1A1A; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="GG" style="width: 40px; height: 40px; margin-bottom: 8px;">
        <p style="color: #999; margin: 0; font-size: 12px;">
          Granny Gear | www.grannygear.co.za
        </p>
      </div>
    </div>
  `;
  
  // Build email options with BCC and optional PDF attachment
  const emailOptions = {
    bcc: [CONFIG.SHOP_EMAIL]
  };
  
  // Add completion PDF attachment if provided
  if (pdfBase64) {
    emailOptions.attachment = {
      base64: pdfBase64,
      filename: `GrannyGear_CompletionReport_${jobData.jobid}.pdf`,
      mimeType: 'application/pdf'
    };
  }
  
  // Use PHP API via sendEmail_ wrapper (sends from info@grannygear.co.za)
  const result = sendEmail_(jobData.email, subject, htmlBody, emailOptions);
  Logger.log('Completion email sent to: ' + jobData.email + ' via ' + (CONFIG.EMAIL_API.ENABLED ? 'PHP API' : 'MailApp') + (pdfBase64 ? ' (with PDF)' : ''));
  return result;
}

/**
 * Send cancellation email to customer
 */
function sendCancellationEmail_(jobData, reason) {
  const subject = `[${CONFIG.SHOP_NAME}] Service Request Cancelled - ${jobData.jobid}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #DC3545, #a71d2a); padding: 30px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="Granny Gear" style="width: 80px; height: 80px; margin-bottom: 10px;">
        <h1 style="color: white; margin: 0; font-size: 24px; font-family: 'Arial Black', Arial, sans-serif; font-style: italic; font-weight: 900; letter-spacing: -1px; text-transform: lowercase;">grannygear</h1>
        <h1 style="color: white; margin: 0; font-size: 48px;">✕</h1>
        <h2 style="color: white; margin: 10px 0 0;">Service Request Cancelled</h2>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin-top: 0;">Hi ${jobData.firstname},</h2>
        <p>We regret to inform you that your service request has been cancelled.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p><strong>Job Number:</strong> ${jobData.jobid}</p>
          <p><strong>Bike:</strong> ${jobData.bikebrand} ${jobData.bikemodel}</p>
          <p><strong>Service:</strong> ${jobData.servicetype}</p>
        </div>
        
        ${reason ? `
        <div style="background: #FFF3CD; padding: 15px; border-radius: 8px; border-left: 4px solid #FFC107; margin: 20px 0;">
          <strong>Reason:</strong><br>
          ${reason}
        </div>
        ` : ''}
        
        <div style="background: #E9ECEF; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #495057;">
            We sincerely apologize for any inconvenience caused.<br>
            Please feel free to contact us if you have any questions.
          </p>
        </div>
        
        <p style="color: #666; margin-top: 30px; text-align: center;">
          We hope to serve you again in the future.<br>
          info@grannygear.co.za | +27 21 001 0221 | +27 65 507 0829
        </p>
      </div>
      
      <div style="background: #1A1A1A; padding: 20px; text-align: center;">
        <img src="${CONFIG.LOGO_URL}" alt="GG" style="width: 40px; height: 40px; margin-bottom: 8px;">
        <p style="color: #999; margin: 0; font-size: 12px;">
          Granny Gear | www.grannygear.co.za
        </p>
      </div>
    </div>
  `;
  
  const result = sendEmail_(jobData.email, subject, htmlBody);
  Logger.log('Cancellation email to ' + jobData.email + ': ' + (result ? 'SUCCESS' : 'FAILED'));
  return result;
}

// ===== AUDIT LOGGING (Internal) =====

function logAction_(action, jobId, user, details) {
  try {
    const ss = getSpreadsheet_();
    const auditSheet = ss.getSheetByName('AuditLog');
    if (auditSheet) {
      auditSheet.appendRow([
        new Date().toISOString(),
        action,
        jobId,
        user,
        details
      ]);
    }
  } catch (error) {
    Logger.log('Audit log error: ' + error.toString());
  }
}

// ===== STATISTICS =====

function getStatistics() {
  const jobs = getAllJobs();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return {
    pending: jobs.filter(j => j.status === 'pending').length,
    triaged: jobs.filter(j => j.status === 'triaged').length,
    inProgress: jobs.filter(j => j.status === 'in-progress').length,
    completedToday: jobs.filter(j => {
      if (j.status !== 'completed') return false;
      const completedDate = new Date(j.completedat);
      return completedDate >= today;
    }).length,
    totalToday: jobs.filter(j => {
      const createdDate = new Date(j.createdat);
      return createdDate >= today;
    }).length
  };
}

// ===== UTILITY FUNCTIONS =====

function getConfig() {
  return {
    shopName: CONFIG.SHOP_NAME,
    mechanics: CONFIG.MECHANICS
  };
}

function getSpreadsheetUrl() {
  try {
    const ss = getSpreadsheet_();
    return ss.getUrl();
  } catch (e) {
    return 'Not initialized - run initialSetup() first';
  }
}

function testSubmitJob() {
  const result = submitJob({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    phone: '082 123 4567',
    bikeBrand: 'Specialized',
    bikeModel: 'Test Bike',
    bikeType: 'MTB',
    neededBy: '2025-01-20',
    neededByText: 'In 3 Days',
    serviceType: 'Standard',
    checklist: ['Clean bike', 'Check brakes'],
    description: 'Test job submission'
  });
  
  Logger.log('Test result: ' + JSON.stringify(result));
  return result;
}

function resetSpreadsheetConnection() {
  PropertiesService.getScriptProperties().deleteProperty('SPREADSHEET_ID');
  Logger.log('Spreadsheet connection reset. Run initialSetup() to reconnect.');
}

function debugCheckJobs() {
  try {
    const ss = getSpreadsheet_();
    Logger.log('Spreadsheet URL: ' + ss.getUrl());
    
    const jobsSheet = ss.getSheetByName('Jobs');
    if (!jobsSheet) {
      Logger.log('ERROR: Jobs sheet not found!');
      return;
    }
    
    const data = jobsSheet.getDataRange().getValues();
    Logger.log('Total rows: ' + data.length);
    Logger.log('Headers: ' + JSON.stringify(data[0]));
    
    for (let i = 1; i < Math.min(data.length, 6); i++) {
      Logger.log('Row ' + i + ': ' + JSON.stringify(data[i]));
    }
    
    const jobs = getAllJobs();
    Logger.log('getAllJobs returned ' + jobs.length + ' jobs');
    
    if (jobs.length > 0) {
      Logger.log('First job: ' + JSON.stringify(jobs[0]));
      Logger.log('First job status: "' + jobs[0].status + '"');
    }
    
    return {
      sheetUrl: ss.getUrl(),
      totalRows: data.length,
      jobsReturned: jobs.length,
      headers: data[0],
      sampleJob: jobs[0] || null
    };
    
  } catch (error) {
    Logger.log('Debug error: ' + error.toString());
    return { error: error.toString() };
  }
}

/**
 * Generate Service Ticket PDF as a Blob
 */
function generateServiceTicketPDF_(jobId, jobData, queuePosition) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .header { background: linear-gradient(135deg, #29ABE2, #1E8BBB); padding: 30px; text-align: center; color: white; }
        .header img { width: 60px; height: 60px; }
        .header h1 { margin: 10px 0 5px; font-size: 24px; }
        .header .subtitle { font-size: 12px; opacity: 0.9; }
        .job-id-box { background: #1A1A1A; color: white; display: inline-block; padding: 8px 20px; border-radius: 6px; font-size: 18px; font-weight: bold; margin: 15px 0; }
        .content { padding: 30px; }
        .section { background: #F8F9FA; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .section h3 { margin: 0 0 15px; color: #1A1A1A; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #29ABE2; padding-bottom: 8px; }
        .row { display: flex; margin-bottom: 8px; }
        .label { color: #666; width: 100px; }
        .value { color: #333; font-weight: 500; }
        .service-banner { background: #29ABE2; color: white; padding: 12px 20px; border-radius: 8px; font-size: 16px; font-weight: bold; margin-bottom: 20px; }
        .checklist { columns: 2; column-gap: 20px; }
        .checklist-item { break-inside: avoid; padding: 4px 0; font-size: 12px; color: #333; }
        .checklist-item::before { content: "✓ "; color: #29ABE2; font-weight: bold; }
        .queue-box { background: #FFF200; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px; }
        .queue-box .number { font-size: 48px; font-weight: bold; color: #1A1A1A; }
        .queue-box .label { font-size: 14px; color: #666; }
        .footer { background: #1A1A1A; color: #999; padding: 20px; text-align: center; font-size: 11px; margin-top: 30px; }
        .notes { background: white; border-left: 4px solid #29ABE2; padding: 15px; margin-top: 15px; font-size: 13px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${CONFIG.LOGO_URL}" alt="GG">
        <h1 style="font-family: 'Arial Black', Arial, sans-serif; font-style: italic; text-transform: lowercase;">grannygear</h1>
        <div class="subtitle">SERVICE TICKET</div>
      </div>
      
      <div style="text-align: center;">
        <div class="job-id-box">${jobId}</div>
      </div>
      
      <div class="content">
        <div class="section">
          <h3>Customer Details</h3>
          <div class="row"><span class="label">Name:</span><span class="value">${jobData.firstName} ${jobData.lastName}</span></div>
          <div class="row"><span class="label">Phone:</span><span class="value">${jobData.phone || 'Not provided'}</span></div>
          <div class="row"><span class="label">Email:</span><span class="value">${jobData.email || 'Not provided'}</span></div>
          <div class="row"><span class="label">Board #:</span><span class="value">${jobData.boardNumber || 'N/A'}</span></div>
        </div>
        
        <div class="section">
          <h3>Bicycle</h3>
          <div class="row"><span class="label">Brand:</span><span class="value">${jobData.bikeBrand || ''}</span></div>
          <div class="row"><span class="label">Model:</span><span class="value">${jobData.bikeModel || ''}</span></div>
          <div class="row"><span class="label">Type:</span><span class="value">${jobData.bikeType || ''}</span></div>
          <div class="row"><span class="label">Needed By:</span><span class="value">${jobData.neededByText || 'Not specified'}</span></div>
        </div>
        
        <div class="service-banner">SERVICE TYPE: ${(jobData.serviceType || 'Standard').toUpperCase()}</div>
        
        <div class="section">
          <h3>Service Checklist</h3>
          <div class="checklist">
            ${(jobData.checklist || []).map(item => `<div class="checklist-item">${item}</div>`).join('')}
          </div>
        </div>
        
        ${jobData.description ? `
        <div class="section">
          <h3>Notes / Description</h3>
          <div class="notes">${jobData.description}</div>
        </div>
        ` : ''}
        
        <div class="queue-box">
          <div class="number">#${queuePosition}</div>
          <div class="label">Your position in the queue</div>
        </div>
      </div>
      
      <div class="footer">
        <p>Granny Gear | www.grannygear.co.za | info@grannygear.co.za</p>
        <p>+27 21 001 0221 | +27 65 507 0829</p>
        <p>Thank you for your business!</p>
      </div>
    </body>
    </html>
  `;
  
  // Convert HTML to PDF using Google Apps Script
  const blob = Utilities.newBlob(htmlContent, 'text/html', 'temp.html');
  const pdf = blob.getAs('application/pdf');
  pdf.setName(`GrannyGear_ServiceTicket_${jobId}.pdf`);
  
  return pdf;
}


/**
 * Generate Completion Report PDF
 */
function generateCompletionPDF_(jobData) {
  // Calculate time in shop
  const createdDate = new Date(jobData.createdat);
  const completedDate = new Date(jobData.completedat || new Date());
  const hoursInShop = Math.round((completedDate - createdDate) / (1000 * 60 * 60));
  const daysInShop = Math.floor(hoursInShop / 24);
  const timeInShop = daysInShop > 0 ? `${daysInShop} day(s), ${hoursInShop % 24} hour(s)` : `${hoursInShop} hour(s)`;
  
  // Parse checklist if string
  let checklist = jobData.checklist || [];
  if (typeof checklist === 'string') {
    try { checklist = JSON.parse(checklist); } catch (e) { checklist = []; }
  }
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; font-size: 12px; }
        .header { background: #28A745; padding: 25px; text-align: center; color: white; }
        .header h1 { margin: 0 0 5px; font-size: 22px; }
        .header .subtitle { font-size: 14px; opacity: 0.9; }
        .completed-badge { background: white; color: #28A745; display: inline-block; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; margin-top: 10px; }
        .job-id-box { background: #1A1A1A; color: white; display: inline-block; padding: 8px 20px; border-radius: 6px; font-size: 16px; font-weight: bold; margin: 15px 0; }
        .content { padding: 25px; }
        .section { background: #F8F9FA; border-radius: 8px; padding: 15px; margin-bottom: 15px; }
        .section h3 { margin: 0 0 12px; color: #1A1A1A; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #28A745; padding-bottom: 6px; }
        .row { margin-bottom: 6px; }
        .row .label { color: #666; display: inline-block; width: 100px; }
        .row .value { color: #333; font-weight: 500; }
        .service-banner { background: #29ABE2; color: white; padding: 10px 15px; border-radius: 6px; font-size: 14px; font-weight: bold; margin-bottom: 15px; }
        .checklist { column-count: 2; column-gap: 15px; }
        .checklist-item { break-inside: avoid; padding: 3px 0; font-size: 11px; color: #333; }
        .checklist-item::before { content: "✓ "; color: #28A745; font-weight: bold; }
        .work-notes { background: #FFF3CD; border-left: 4px solid #FFC107; padding: 12px; margin: 15px 0; font-size: 12px; }
        .work-notes h4 { margin: 0 0 8px; color: #856404; }
        .summary-box { background: #D4EDDA; border: 2px solid #28A745; border-radius: 8px; padding: 15px; margin-top: 15px; }
        .summary-box h3 { color: #155724; margin: 0 0 10px; font-size: 14px; }
        .summary-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #C3E6CB; }
        .summary-row:last-child { border-bottom: none; }
        .footer { background: #1A1A1A; color: #999; padding: 15px; text-align: center; font-size: 10px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1 style="font-family: 'Arial Black', Arial, sans-serif; font-style: italic; text-transform: lowercase;">grannygear</h1>
        <div class="subtitle">SERVICE COMPLETION REPORT</div>
        <div class="completed-badge">✓ SERVICE COMPLETE</div>
      </div>
      
      <div style="text-align: center;">
        <div class="job-id-box">${jobData.jobid}</div>
      </div>
      
      <div class="content">
        <div class="section">
          <h3>Customer Details</h3>
          <div class="row"><span class="label">Name:</span><span class="value">${jobData.firstname} ${jobData.lastname}</span></div>
          <div class="row"><span class="label">Phone:</span><span class="value">${jobData.phone || 'Not provided'}</span></div>
          <div class="row"><span class="label">Email:</span><span class="value">${jobData.email || 'Not provided'}</span></div>
          <div class="row"><span class="label">Board #:</span><span class="value">${jobData.boardnumber || 'N/A'}</span></div>
        </div>
        
        <div class="section">
          <h3>Bicycle</h3>
          <div class="row"><span class="label">Brand:</span><span class="value">${jobData.bikebrand || ''}</span></div>
          <div class="row"><span class="label">Model:</span><span class="value">${jobData.bikemodel || ''}</span></div>
          <div class="row"><span class="label">Type:</span><span class="value">${jobData.biketype || ''}</span></div>
        </div>
        
        <div class="service-banner">SERVICE TYPE: ${(jobData.servicetype || 'Standard').toUpperCase()}</div>
        
        <div class="section">
          <h3>Work Performed</h3>
          <div class="checklist">
            ${checklist.map(item => `<div class="checklist-item">${item}</div>`).join('')}
          </div>
        </div>
        
        ${jobData.worknotes ? `
        <div class="work-notes">
          <h4>🔧 Mechanic Notes</h4>
          ${jobData.worknotes}
        </div>
        ` : ''}
        
        <div class="summary-box">
          <h3>Service Summary</h3>
          <div class="summary-row">
            <span>Date Received:</span>
            <span>${new Date(jobData.createdat).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div class="summary-row">
            <span>Date Completed:</span>
            <span>${completedDate.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div class="summary-row">
            <span>Time in Shop:</span>
            <span><strong>${timeInShop}</strong></span>
          </div>
          ${jobData.assignedto ? `
          <div class="summary-row">
            <span>Technician:</span>
            <span>${jobData.assignedto}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="footer">
        <p>Granny Gear | www.grannygear.co.za | info@grannygear.co.za</p>
        <p>+27 21 001 0221 | +27 65 507 0829</p>
        <p>Thank you for your business!</p>
      </div>
    </body>
    </html>
  `;
  
  const blob = Utilities.newBlob(htmlContent, 'text/html', 'temp.html');
  const pdf = blob.getAs('application/pdf');
  pdf.setName(`GrannyGear_CompletionReport_${jobData.jobid}.pdf`);
  
  return pdf;
}


function testConnection() {
  try {
    const ss = getSpreadsheet_();
    const jobs = getAllJobs();
    return {
      success: true,
      spreadsheetUrl: ss.getUrl(),
      jobCount: jobs.length,
      message: 'Connection OK'
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}