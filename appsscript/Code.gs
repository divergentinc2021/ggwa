/**
 * GRANNY GEAR WORKSHOP - Apps Script Backend
 * 
 * This script handles all backend operations:
 * - PIN verification
 * - Job CRUD operations (Google Sheets)
 * - Email sending (MailApp)
 * - PDF saving to Google Drive
 * 
 * Deploy as Web App:
 * 1. Deploy > New deployment > Web app
 * 2. Execute as: Me
 * 3. Who has access: Anyone
 * 4. Copy the Web App URL
 */

// ===== CONFIGURATION =====
const CONFIG = {
  SPREADSHEET_ID: '1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U',
  OPERATOR_PIN: '1234', // Change this!
  SHOP_NAME: 'Granny Gear',
  SHOP_EMAIL: 'info@grannygear.co.za',
  SHOP_PHONE: '+27 21 001 0221',
  SHOP_CELL: '+27 65 507 0829',
  SHOP_WEBSITE: 'www.grannygear.co.za',
  DRIVE_FOLDER_ID: '1GIaVT0A6AuGvMrgcI047eBqG0HKj4ld_', // Your Drive folder
  SHEETS: {
    JOBS: 'Jobs',
    ARCHIVE: 'Archive',
    CONFIG: 'Config'
  }
};

// ===== WEB APP ENTRY POINTS =====

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ 
      status: 'ok', 
      message: 'Granny Gear Workshop API v1.0',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests (main API)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    let result;
    
    switch(action) {
      case 'verifyPin':
        result = verifyPin(data.pin);
        break;
      case 'reserveJobId':
        result = reserveJobId();
        break;
      case 'createJob':
        result = createJob(data);
        break;
      case 'getJobs':
        result = getJobs();
        break;
      case 'triageJob':
        result = triageJob(data.jobId, data.urgency, data.complexity, data.workNotes);
        break;
      case 'updateStatus':
        result = updateJobStatus(data.jobId, data.status);
        break;
      case 'completeJob':
        result = completeJob(data.jobId, data.pdfBase64, data.workNotes);
        break;
      case 'archiveJob':
        result = archiveJob(data.jobId);
        break;
      case 'archiveAllCompleted':
        result = archiveAllCompleted();
        break;
      case 'cancelJob':
        result = cancelJob(data.jobId, data.reason);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== PIN VERIFICATION =====

function verifyPin(pin) {
  const isValid = pin === CONFIG.OPERATOR_PIN;
  return { success: isValid };
}

// ===== JOB ID MANAGEMENT =====

function reserveJobId() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let configSheet = ss.getSheetByName(CONFIG.SHEETS.CONFIG);
    
    // Create Config sheet if it doesn't exist
    if (!configSheet) {
      configSheet = ss.insertSheet(CONFIG.SHEETS.CONFIG);
      configSheet.getRange('A1').setValue('LastJobNumber');
      configSheet.getRange('B1').setValue(0);
    }
    
    // Get and increment job number
    const lastJobNum = parseInt(configSheet.getRange('B1').getValue()) || 0;
    const newJobNum = lastJobNum + 1;
    configSheet.getRange('B1').setValue(newJobNum);
    
    // Format job ID
    const jobId = 'GG-' + String(newJobNum).padStart(3, '0');
    
    return { success: true, jobId: jobId };
  } catch (error) {
    Logger.log('reserveJobId error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function generateJobId_() {
  const result = reserveJobId();
  return result.success ? result.jobId : 'GG-ERR';
}

// ===== JOB CRUD OPERATIONS =====

function createJob(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    // Create Jobs sheet with headers if it doesn't exist
    if (!jobsSheet) {
      jobsSheet = ss.insertSheet(CONFIG.SHEETS.JOBS);
      jobsSheet.getRange(1, 1, 1, 20).setValues([[
        'JobId', 'FirstName', 'LastName', 'Email', 'Phone', 'BoardNumber',
        'BikeBrand', 'BikeModel', 'BikeType', 'NeededBy', 'NeededByText',
        'ServiceType', 'Checklist', 'Description', 'Status', 'Urgency',
        'Complexity', 'WorkNotes', 'CreatedAt', 'UpdatedAt'
      ]]);
    }
    
    const jobId = data.jobId || generateJobId_();
    const now = new Date().toISOString();
    
    // Calculate queue position (pending + triaged jobs + 1)
    const allData = jobsSheet.getDataRange().getValues();
    const queuePosition = allData.filter(row => 
      row[14] === 'pending' || row[14] === 'triaged'
    ).length + 1;
    
    // Prepare row data
    const rowData = [
      jobId,
      data.firstName || '',
      data.lastName || '',
      data.email || '',
      data.phone || '',
      data.boardNumber || '',
      data.bikeBrand || '',
      data.bikeModel || '',
      data.bikeType || '',
      data.neededBy || '',
      data.neededByText || '',
      data.serviceType || '',
      JSON.stringify(data.checklist || []),
      data.description || '',
      'pending',
      'medium',
      'moderate',
      '',
      now,
      now
    ];
    
    // Append to sheet
    jobsSheet.appendRow(rowData);
    
    // Save PDF to Drive if provided
    let pdfSaved = false;
    if (data.pdfBase64) {
      try {
        savePdfToDrive_(data.pdfBase64, `ServiceTicket_${jobId}.pdf`, jobId);
        pdfSaved = true;
      } catch (pdfError) {
        Logger.log('PDF save error: ' + pdfError.toString());
      }
    }
    
    // Send confirmation email
    let emailStatus = { customerEmailSent: false };
    if (data.email && data.email.includes('@')) {
      try {
        sendJobConfirmationEmail_(data, jobId, queuePosition);
        emailStatus.customerEmailSent = true;
      } catch (emailError) {
        Logger.log('Email error: ' + emailError.toString());
      }
    }
    
    return { 
      success: true, 
      jobId: jobId, 
      queuePosition: queuePosition,
      emailStatus: emailStatus,
      pdfSaved: pdfSaved
    };
    
  } catch (error) {
    Logger.log('createJob error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function getJobs() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    if (!jobsSheet) {
      return { success: true, jobs: [] };
    }
    
    const data = jobsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return { success: true, jobs: [] };
    }
    
    const headers = data[0].map(h => h.toString().toLowerCase().replace(/\s/g, ''));
    const jobs = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const job = {};
      headers.forEach((header, index) => {
        job[header] = row[index];
      });
      jobs.push(job);
    }
    
    return { success: true, jobs: jobs };
    
  } catch (error) {
    Logger.log('getJobs error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function triageJob(jobId, urgency, complexity, workNotes) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    const rowIndex = findJobRow_(jobsSheet, jobId);
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Update: Status=triaged, Urgency, Complexity, WorkNotes, UpdatedAt
    jobsSheet.getRange(rowIndex, 15).setValue('triaged');     // Status
    jobsSheet.getRange(rowIndex, 16).setValue(urgency || 'medium');      // Urgency
    jobsSheet.getRange(rowIndex, 17).setValue(complexity || 'moderate'); // Complexity
    jobsSheet.getRange(rowIndex, 18).setValue(workNotes || '');          // WorkNotes
    jobsSheet.getRange(rowIndex, 20).setValue(new Date().toISOString()); // UpdatedAt
    
    return { success: true };
    
  } catch (error) {
    Logger.log('triageJob error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function updateJobStatus(jobId, status) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    const rowIndex = findJobRow_(jobsSheet, jobId);
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Update Status and UpdatedAt
    jobsSheet.getRange(rowIndex, 15).setValue(status);
    jobsSheet.getRange(rowIndex, 20).setValue(new Date().toISOString());
    
    // If starting repair, add StartedAt column
    if (status === 'in-progress') {
      // Check if StartedAt column exists (column 21)
      const headers = jobsSheet.getRange(1, 1, 1, 25).getValues()[0];
      let startedAtCol = headers.indexOf('StartedAt') + 1;
      if (startedAtCol === 0) {
        startedAtCol = headers.filter(h => h !== '').length + 1;
        jobsSheet.getRange(1, startedAtCol).setValue('StartedAt');
      }
      jobsSheet.getRange(rowIndex, startedAtCol).setValue(new Date().toISOString());
    }
    
    return { success: true };
    
  } catch (error) {
    Logger.log('updateJobStatus error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function completeJob(jobId, pdfBase64, workNotes) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    const rowIndex = findJobRow_(jobsSheet, jobId);
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    const now = new Date().toISOString();
    
    // Update Status
    jobsSheet.getRange(rowIndex, 15).setValue('completed');
    jobsSheet.getRange(rowIndex, 20).setValue(now);
    
    // Add CompletedAt
    const headers = jobsSheet.getRange(1, 1, 1, 25).getValues()[0];
    let completedAtCol = headers.indexOf('CompletedAt') + 1;
    if (completedAtCol === 0) {
      completedAtCol = headers.filter(h => h !== '').length + 1;
      jobsSheet.getRange(1, completedAtCol).setValue('CompletedAt');
    }
    jobsSheet.getRange(rowIndex, completedAtCol).setValue(now);
    
    // Update work notes if provided
    if (workNotes) {
      jobsSheet.getRange(rowIndex, 18).setValue(workNotes);
    }
    
    // Get job data for email
    const rowData = jobsSheet.getRange(rowIndex, 1, 1, 20).getValues()[0];
    const jobData = {
      jobId: rowData[0],
      firstName: rowData[1],
      lastName: rowData[2],
      email: rowData[3],
      phone: rowData[4],
      bikeBrand: rowData[6],
      bikeModel: rowData[7],
      serviceType: rowData[11]
    };
    
    // Save completion PDF to Drive
    if (pdfBase64) {
      try {
        savePdfToDrive_(pdfBase64, `CompletionReport_${jobId}.pdf`, jobId);
      } catch (pdfError) {
        Logger.log('Completion PDF save error: ' + pdfError.toString());
      }
    }
    
    // Send completion email
    let emailSent = false;
    if (jobData.email && jobData.email.includes('@')) {
      try {
        sendCompletionEmail_(jobData);
        emailSent = true;
      } catch (emailError) {
        Logger.log('Completion email error: ' + emailError.toString());
      }
    }
    
    return { success: true, emailSent: emailSent };
    
  } catch (error) {
    Logger.log('completeJob error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function archiveJob(jobId) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    let archiveSheet = ss.getSheetByName(CONFIG.SHEETS.ARCHIVE);
    
    // Create Archive sheet if needed
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet(CONFIG.SHEETS.ARCHIVE);
      const headers = jobsSheet.getRange(1, 1, 1, jobsSheet.getLastColumn()).getValues();
      archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    }
    
    const rowIndex = findJobRow_(jobsSheet, jobId);
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Copy row to archive
    const rowData = jobsSheet.getRange(rowIndex, 1, 1, jobsSheet.getLastColumn()).getValues();
    archiveSheet.appendRow(rowData[0]);
    
    // Delete from jobs
    jobsSheet.deleteRow(rowIndex);
    
    return { success: true };
    
  } catch (error) {
    Logger.log('archiveJob error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function archiveAllCompleted() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    let archiveSheet = ss.getSheetByName(CONFIG.SHEETS.ARCHIVE);
    
    if (!archiveSheet) {
      archiveSheet = ss.insertSheet(CONFIG.SHEETS.ARCHIVE);
      const headers = jobsSheet.getRange(1, 1, 1, jobsSheet.getLastColumn()).getValues();
      archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    }
    
    const data = jobsSheet.getDataRange().getValues();
    const statusCol = 14; // Status column (0-indexed)
    let archivedCount = 0;
    
    // Find completed jobs (iterate backwards to avoid row shift issues)
    for (let i = data.length - 1; i > 0; i--) {
      if (data[i][statusCol] === 'completed') {
        archiveSheet.appendRow(data[i]);
        jobsSheet.deleteRow(i + 1);
        archivedCount++;
      }
    }
    
    return { success: true, archivedCount: archivedCount };
    
  } catch (error) {
    Logger.log('archiveAllCompleted error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

function cancelJob(jobId, reason) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const jobsSheet = ss.getSheetByName(CONFIG.SHEETS.JOBS);
    
    const rowIndex = findJobRow_(jobsSheet, jobId);
    if (rowIndex === -1) {
      return { success: false, error: 'Job not found' };
    }
    
    // Get job data for email
    const rowData = jobsSheet.getRange(rowIndex, 1, 1, 20).getValues()[0];
    const jobData = {
      jobId: rowData[0],
      firstName: rowData[1],
      lastName: rowData[2],
      email: rowData[3],
      bikeBrand: rowData[6],
      bikeModel: rowData[7]
    };
    
    // Delete the job
    jobsSheet.deleteRow(rowIndex);
    
    // Send cancellation email
    let emailSent = false;
    if (jobData.email && jobData.email.includes('@')) {
      try {
        sendCancellationEmail_(jobData, reason);
        emailSent = true;
      } catch (emailError) {
        Logger.log('Cancellation email error: ' + emailError.toString());
      }
    }
    
    return { success: true, emailSent: emailSent };
    
  } catch (error) {
    Logger.log('cancelJob error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

// ===== HELPER FUNCTIONS =====

function findJobRow_(sheet, jobId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === jobId) {
      return i + 1; // Return 1-indexed row number
    }
  }
  return -1;
}

// ===== PDF TO DRIVE =====

function savePdfToDrive_(base64Data, fileName, jobId) {
  try {
    // Decode base64 to blob
    const decodedData = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedData, 'application/pdf', fileName);
    
    // Get or create folder
    let folder;
    if (CONFIG.DRIVE_FOLDER_ID) {
      folder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
    } else {
      // Create a default folder if not configured
      const folders = DriveApp.getFoldersByName('Granny Gear PDFs');
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder('Granny Gear PDFs');
      }
    }
    
    // Check if file already exists and delete it
    const existingFiles = folder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
    
    // Save file
    const file = folder.createFile(blob);
    Logger.log('PDF saved: ' + file.getUrl());
    
    return file.getUrl();
    
  } catch (error) {
    Logger.log('savePdfToDrive_ error: ' + error.toString());
    throw error;
  }
}

// ===== EMAIL FUNCTIONS =====

function sendJobConfirmationEmail_(data, jobId, queuePosition) {
  const subject = `[${CONFIG.SHOP_NAME}] Service Request Confirmed - ${jobId}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #29ABE2 0%, #1a8bc2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-style: italic; font-weight: 900;">grannygear</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Service Request Confirmation</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Hi ${data.firstName},</h2>
        <p style="color: #666;">Thank you for bringing your bike to Granny Gear! Your service request has been received.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #29ABE2;">
          <h3 style="margin-top: 0; color: #1a1a1a;">Job Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #666;">Job ID:</td><td style="padding: 8px 0; font-weight: bold;">${jobId}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Bike:</td><td style="padding: 8px 0;">${data.bikeBrand} ${data.bikeModel} (${data.bikeType})</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Service:</td><td style="padding: 8px 0;">${data.serviceType}</td></tr>
            <tr><td style="padding: 8px 0; color: #666;">Needed by:</td><td style="padding: 8px 0;">${data.neededByText || 'Not specified'}</td></tr>
          </table>
        </div>
        
        <div style="background: #FFF200; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #1a1a1a;">Queue Position</p>
          <p style="margin: 5px 0 0 0; font-size: 32px; font-weight: bold; color: #1a1a1a;">#${queuePosition}</p>
        </div>
        
        <p style="color: #666; font-size: 14px;">We'll notify you when your bike is ready for collection.</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          ${CONFIG.SHOP_NAME}<br>
          ${CONFIG.SHOP_WEBSITE}<br>
          ${CONFIG.SHOP_PHONE} | ${CONFIG.SHOP_CELL}<br>
          ${CONFIG.SHOP_EMAIL}
        </p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function sendCompletionEmail_(jobData) {
  const subject = `[${CONFIG.SHOP_NAME}] Your Bike is Ready! - ${jobData.jobId}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-style: italic; font-weight: 900;">grannygear</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Service Complete!</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Hi ${jobData.firstName},</h2>
        <p style="color: #666;">Great news! Your bike service is complete and ready for collection.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="margin-top: 0; color: #1a1a1a;">Your Bike</h3>
          <p style="margin: 0; font-size: 18px; font-weight: bold;">${jobData.bikeBrand} ${jobData.bikeModel}</p>
          <p style="margin: 5px 0 0 0; color: #666;">Service: ${jobData.serviceType}</p>
          <p style="margin: 5px 0 0 0; color: #666;">Job ID: ${jobData.jobId}</p>
        </div>
        
        <div style="background: #d4edda; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 24px;">✅ Ready for Collection</p>
        </div>
        
        <p style="color: #666;">Please bring this email or your Job ID when collecting your bike.</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          ${CONFIG.SHOP_NAME}<br>
          ${CONFIG.SHOP_WEBSITE}<br>
          ${CONFIG.SHOP_PHONE} | ${CONFIG.SHOP_CELL}<br>
          ${CONFIG.SHOP_EMAIL}
        </p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: jobData.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function sendCancellationEmail_(jobData, reason) {
  const subject = `[${CONFIG.SHOP_NAME}] Service Request Cancelled - ${jobData.jobId}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ED1C24 0%, #c91620 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-style: italic; font-weight: 900;">grannygear</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Service Request Cancelled</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Hi ${jobData.firstName},</h2>
        <p style="color: #666;">Your service request has been cancelled.</p>
        
        <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #ED1C24;">
          <h3 style="margin-top: 0; color: #1a1a1a;">Cancelled Job</h3>
          <p style="margin: 0;"><strong>Job ID:</strong> ${jobData.jobId}</p>
          <p style="margin: 5px 0 0 0;"><strong>Bike:</strong> ${jobData.bikeBrand} ${jobData.bikeModel}</p>
          ${reason ? `<p style="margin: 15px 0 0 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
        </div>
        
        <p style="color: #666;">If you have any questions, please contact us.</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center;">
          ${CONFIG.SHOP_NAME}<br>
          ${CONFIG.SHOP_WEBSITE}<br>
          ${CONFIG.SHOP_PHONE} | ${CONFIG.SHOP_CELL}<br>
          ${CONFIG.SHOP_EMAIL}
        </p>
      </div>
    </div>
  `;
  
  MailApp.sendEmail({
    to: jobData.email,
    subject: subject,
    htmlBody: htmlBody
  });
}

// ===== TEST FUNCTIONS =====

function testGetJobs() {
  const result = getJobs();
  Logger.log(JSON.stringify(result, null, 2));
}

function testReserveJobId() {
  const result = reserveJobId();
  Logger.log(JSON.stringify(result, null, 2));
}
