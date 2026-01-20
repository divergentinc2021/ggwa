# Migration Guide: Self-Hosted Granny Gear Workshop

> **Purpose**: This document provides complete specifications for migrating from Google Apps Script + Sheets to a fully self-hosted PHP + MySQL solution. Feed this to Claude when ready to implement.

---

## Current Architecture (Before Migration)

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Cloudflare Pages   │────▶│  Google Apps Script │────▶│   Google Sheets     │
│  (Frontend PWA)     │     │  (API Backend)      │     │   (Database)        │
│  ggwa.pages.dev     │     │                     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │
         │
         ▼
┌─────────────────────┐
│  grannygear.co.za   │
│  /api/sendmail.php  │  ◀── Email already self-hosted!
└─────────────────────┘
```

## Target Architecture (After Migration)

```
┌─────────────────────────────────────────────────────────────────┐
│                    grannygear.co.za                             │
│                                                                 │
│  /                      (Frontend - static files from public/)  │
│  /api/jobs.php          (Job CRUD operations)                   │
│  /api/auth.php          (PIN verification)                      │
│  /api/pdf.php           (Server-side PDF generation)            │
│  /api/sendmail.php      (Email - already exists!)               │
│                                                                 │
│  MySQL Database         (Replaces Google Sheets)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### MySQL Tables

```sql
-- Main jobs table (replaces Google Sheets "Jobs" tab)
CREATE TABLE jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(20) NOT NULL UNIQUE,          -- GG-001, GG-002, etc.
    status ENUM('pending', 'triaged', 'in-progress', 'completed', 'cancelled') DEFAULT 'pending',
    
    -- Customer info
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    board_number VARCHAR(50),
    
    -- Bike info
    bike_brand VARCHAR(100),
    bike_model VARCHAR(100),
    bike_type VARCHAR(50),                       -- MTB, Road, Hybrid, etc.
    
    -- Service info
    needed_by DATE,
    needed_by_text VARCHAR(100),                 -- "In 3 Days", "ASAP", etc.
    service_type VARCHAR(50),                    -- Basic, Standard, Major, Pre-Race
    checklist JSON,                              -- ["Clean bike", "Check brakes", ...]
    description TEXT,
    
    -- Triage info
    urgency ENUM('low', 'medium', 'high') DEFAULT 'medium',
    complexity ENUM('simple', 'moderate', 'complex') DEFAULT 'moderate',
    assigned_to VARCHAR(100),
    work_notes TEXT,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    
    -- Indexes
    INDEX idx_status (status),
    INDEX idx_job_id (job_id),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Archive table (replaces Google Sheets "Archive" tab)
CREATE TABLE jobs_archive (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(20) NOT NULL,
    status VARCHAR(20),
    
    -- All same fields as jobs table
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    board_number VARCHAR(50),
    bike_brand VARCHAR(100),
    bike_model VARCHAR(100),
    bike_type VARCHAR(50),
    needed_by DATE,
    needed_by_text VARCHAR(100),
    service_type VARCHAR(50),
    checklist JSON,
    description TEXT,
    urgency VARCHAR(20),
    complexity VARCHAR(20),
    assigned_to VARCHAR(100),
    work_notes TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    started_at DATETIME,
    completed_at DATETIME,
    
    -- Archive specific
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archive_reason VARCHAR(255),
    
    INDEX idx_job_id (job_id),
    INDEX idx_archived (archived_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Config table (replaces Google Sheets "Config" tab)
CREATE TABLE config (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value VARCHAR(255) NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initial config data
INSERT INTO config (config_key, config_value) VALUES
('last_job_number', '0'),
('operator_pin', '1234'),
('shop_name', 'Granny Gear'),
('shop_email', 'info@grannygear.co.za');

-- Audit log (replaces Google Sheets "AuditLog" tab)
CREATE TABLE audit_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(50) NOT NULL,
    job_id VARCHAR(20),
    user VARCHAR(100),
    details TEXT,
    INDEX idx_timestamp (timestamp DESC),
    INDEX idx_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## PHP API Endpoints

### File Structure

```
grannygear.co.za/
├── index.html              (copy from public/)
├── booking.html
├── cart.html
├── css/
├── js/
├── icons/
├── manifest.json
├── sw.js
├── api/
│   ├── config.php          (DB connection, constants)
│   ├── auth.php            (PIN verification)
│   ├── jobs.php            (CRUD operations)
│   ├── pdf.php             (PDF generation)
│   └── sendmail.php        (Already exists!)
└── vendor/                 (Composer - Dompdf, etc.)
```

### /api/config.php

```php
<?php
/**
 * Database configuration and shared utilities
 */

define('DB_HOST', 'localhost');
define('DB_NAME', 'grannygear_workshop');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');

define('SHOP_NAME', 'Granny Gear');
define('SHOP_EMAIL', 'info@grannygear.co.za');
define('API_KEY', 'grannygear-workshop-2026-secure');

// CORS headers
function cors() {
    $allowed = ['https://grannygear.co.za', 'https://www.grannygear.co.za'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowed)) {
        header("Access-Control-Allow-Origin: $origin");
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Content-Type: application/json');
    
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// Database connection
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
            DB_USER,
            DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
    }
    return $pdo;
}

// JSON response helper
function respond($code, $data) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
```

### /api/auth.php

```php
<?php
/**
 * PIN verification endpoint
 * 
 * POST /api/auth.php
 * Body: { "action": "verifyPin", "pin": "1234" }
 */

require_once 'config.php';
cors();

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

if ($action === 'verifyPin') {
    $pin = $input['pin'] ?? '';
    
    $db = getDB();
    $stmt = $db->prepare("SELECT config_value FROM config WHERE config_key = 'operator_pin'");
    $stmt->execute();
    $stored = $stmt->fetchColumn();
    
    respond(200, [
        'success' => true,
        'valid' => ($pin === $stored)
    ]);
}

respond(400, ['success' => false, 'error' => 'Invalid action']);
```

### /api/jobs.php

```php
<?php
/**
 * Job CRUD operations
 * 
 * Actions:
 * - reserveJobId: Generate next job ID
 * - submitJob: Create new job
 * - getAllJobs: Get all active jobs
 * - getJobById: Get single job
 * - updateStatus: Change job status
 * - triageJob: Update triage details
 * - archiveJob: Move to archive
 * - cancelJob: Cancel and archive
 */

require_once 'config.php';
cors();

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? $_GET['action'] ?? '';

$db = getDB();

switch ($action) {
    
    case 'reserveJobId':
        // Get and increment last job number
        $db->beginTransaction();
        $stmt = $db->query("SELECT config_value FROM config WHERE config_key = 'last_job_number' FOR UPDATE");
        $lastNum = (int)$stmt->fetchColumn();
        $newNum = $lastNum + 1;
        $db->exec("UPDATE config SET config_value = '$newNum' WHERE config_key = 'last_job_number'");
        $db->commit();
        
        $jobId = 'GG-' . str_pad($newNum, 3, '0', STR_PAD_LEFT);
        respond(200, ['success' => true, 'jobId' => $jobId]);
        break;
        
    case 'submitJob':
        $jobId = $input['jobId'] ?? null;
        
        // Generate job ID if not provided
        if (!$jobId) {
            $db->beginTransaction();
            $stmt = $db->query("SELECT config_value FROM config WHERE config_key = 'last_job_number' FOR UPDATE");
            $lastNum = (int)$stmt->fetchColumn();
            $newNum = $lastNum + 1;
            $db->exec("UPDATE config SET config_value = '$newNum' WHERE config_key = 'last_job_number'");
            $db->commit();
            $jobId = 'GG-' . str_pad($newNum, 3, '0', STR_PAD_LEFT);
        }
        
        $stmt = $db->prepare("
            INSERT INTO jobs (
                job_id, first_name, last_name, email, phone, board_number,
                bike_brand, bike_model, bike_type, needed_by, needed_by_text,
                service_type, checklist, description
            ) VALUES (
                :job_id, :first_name, :last_name, :email, :phone, :board_number,
                :bike_brand, :bike_model, :bike_type, :needed_by, :needed_by_text,
                :service_type, :checklist, :description
            )
        ");
        
        $stmt->execute([
            ':job_id' => $jobId,
            ':first_name' => $input['firstName'] ?? '',
            ':last_name' => $input['lastName'] ?? '',
            ':email' => $input['email'] ?? '',
            ':phone' => $input['phone'] ?? '',
            ':board_number' => $input['boardNumber'] ?? '',
            ':bike_brand' => $input['bikeBrand'] ?? '',
            ':bike_model' => $input['bikeModel'] ?? '',
            ':bike_type' => $input['bikeType'] ?? '',
            ':needed_by' => $input['neededBy'] ?? null,
            ':needed_by_text' => $input['neededByText'] ?? '',
            ':service_type' => $input['serviceType'] ?? '',
            ':checklist' => json_encode($input['checklist'] ?? []),
            ':description' => $input['description'] ?? ''
        ]);
        
        // Calculate queue position
        $stmt = $db->query("SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'triaged')");
        $queuePosition = (int)$stmt->fetchColumn();
        
        // Log action
        logAction($db, 'JOB_SUBMITTED', $jobId, 'Customer', $input['firstName'] . ' ' . $input['lastName']);
        
        respond(200, [
            'success' => true,
            'jobId' => $jobId,
            'queuePosition' => $queuePosition
        ]);
        break;
        
    case 'getAllJobs':
        $stmt = $db->query("
            SELECT * FROM jobs 
            WHERE status != 'cancelled'
            ORDER BY created_at DESC
        ");
        $jobs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Convert checklist JSON to array
        foreach ($jobs as &$job) {
            $job['checklist'] = json_decode($job['checklist'], true) ?? [];
            // Convert snake_case to camelCase for frontend compatibility
            $job = convertToCamelCase($job);
        }
        
        respond(200, ['success' => true, 'jobs' => $jobs]);
        break;
        
    case 'getJobById':
        $jobId = $input['jobId'] ?? $_GET['jobId'] ?? '';
        $stmt = $db->prepare("SELECT * FROM jobs WHERE job_id = ?");
        $stmt->execute([$jobId]);
        $job = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($job) {
            $job['checklist'] = json_decode($job['checklist'], true) ?? [];
            $job = convertToCamelCase($job);
            respond(200, ['success' => true, 'job' => $job]);
        } else {
            respond(404, ['success' => false, 'error' => 'Job not found']);
        }
        break;
        
    case 'updateStatus':
        $jobId = $input['jobId'] ?? '';
        $newStatus = $input['status'] ?? '';
        
        $updates = ['status' => $newStatus, 'updated_at' => date('Y-m-d H:i:s')];
        
        if ($newStatus === 'in-progress') {
            $updates['started_at'] = date('Y-m-d H:i:s');
        }
        if ($newStatus === 'completed') {
            $updates['completed_at'] = date('Y-m-d H:i:s');
        }
        
        $setParts = [];
        $params = [];
        foreach ($updates as $key => $value) {
            $setParts[] = "$key = ?";
            $params[] = $value;
        }
        $params[] = $jobId;
        
        $stmt = $db->prepare("UPDATE jobs SET " . implode(', ', $setParts) . " WHERE job_id = ?");
        $stmt->execute($params);
        
        logAction($db, 'STATUS_CHANGED', $jobId, $input['assignedTo'] ?? 'System', "Status: $newStatus");
        
        respond(200, ['success' => true]);
        break;
        
    case 'triageJob':
        $jobId = $input['jobId'] ?? '';
        
        $stmt = $db->prepare("
            UPDATE jobs SET
                status = 'triaged',
                urgency = ?,
                complexity = ?,
                work_notes = ?,
                assigned_to = ?,
                updated_at = NOW()
            WHERE job_id = ?
        ");
        $stmt->execute([
            $input['urgency'] ?? 'medium',
            $input['complexity'] ?? 'moderate',
            $input['workNotes'] ?? '',
            $input['assignedTo'] ?? '',
            $jobId
        ]);
        
        logAction($db, 'JOB_TRIAGED', $jobId, $input['assignedTo'] ?? 'Operator', 'Job triaged');
        
        respond(200, ['success' => true]);
        break;
        
    case 'archiveJob':
        $jobId = $input['jobId'] ?? '';
        
        // Copy to archive
        $stmt = $db->prepare("
            INSERT INTO jobs_archive 
            SELECT *, NOW(), 'Completed - Archived' FROM jobs WHERE job_id = ?
        ");
        $stmt->execute([$jobId]);
        
        // Delete from jobs
        $stmt = $db->prepare("DELETE FROM jobs WHERE job_id = ?");
        $stmt->execute([$jobId]);
        
        logAction($db, 'JOB_ARCHIVED', $jobId, 'System', 'Job moved to archive');
        
        respond(200, ['success' => true]);
        break;
        
    case 'cancelJob':
        $jobId = $input['jobId'] ?? '';
        $reason = $input['reason'] ?? 'No reason provided';
        
        // Update status and copy to archive
        $stmt = $db->prepare("UPDATE jobs SET status = 'cancelled' WHERE job_id = ?");
        $stmt->execute([$jobId]);
        
        $stmt = $db->prepare("
            INSERT INTO jobs_archive 
            SELECT *, NOW(), ? FROM jobs WHERE job_id = ?
        ");
        $stmt->execute(["Cancelled: $reason", $jobId]);
        
        // Delete from jobs
        $stmt = $db->prepare("DELETE FROM jobs WHERE job_id = ?");
        $stmt->execute([$jobId]);
        
        logAction($db, 'JOB_CANCELLED', $jobId, 'Operator', "Reason: $reason");
        
        respond(200, ['success' => true]);
        break;
        
    default:
        respond(400, ['success' => false, 'error' => 'Invalid action']);
}

// Helper functions
function logAction($db, $action, $jobId, $user, $details) {
    $stmt = $db->prepare("INSERT INTO audit_log (action, job_id, user, details) VALUES (?, ?, ?, ?)");
    $stmt->execute([$action, $jobId, $user, $details]);
}

function convertToCamelCase($array) {
    $result = [];
    foreach ($array as $key => $value) {
        $camelKey = lcfirst(str_replace('_', '', ucwords($key, '_')));
        $result[$camelKey] = $value;
    }
    return $result;
}
```

### /api/pdf.php

```php
<?php
/**
 * Server-side PDF generation using Dompdf
 * 
 * GET /api/pdf.php?type=ticket&jobId=GG-001
 * GET /api/pdf.php?type=completion&jobId=GG-001
 * 
 * Install: composer require dompdf/dompdf
 */

require_once 'config.php';
require_once '../vendor/autoload.php';

use Dompdf\Dompdf;
use Dompdf\Options;

$type = $_GET['type'] ?? 'ticket';
$jobId = $_GET['jobId'] ?? '';

if (!$jobId) {
    http_response_code(400);
    die('Missing jobId');
}

// Get job data
$db = getDB();
$stmt = $db->prepare("SELECT * FROM jobs WHERE job_id = ?");
$stmt->execute([$jobId]);
$job = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$job) {
    // Try archive
    $stmt = $db->prepare("SELECT * FROM jobs_archive WHERE job_id = ?");
    $stmt->execute([$jobId]);
    $job = $stmt->fetch(PDO::FETCH_ASSOC);
}

if (!$job) {
    http_response_code(404);
    die('Job not found');
}

// Calculate queue position (for ticket)
$stmt = $db->query("SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'triaged')");
$queuePosition = (int)$stmt->fetchColumn();

// Generate HTML based on type
if ($type === 'completion') {
    $html = generateCompletionHTML($job);
    $filename = "GrannyGear_CompletionReport_{$jobId}.pdf";
} else {
    $html = generateTicketHTML($job, $queuePosition);
    $filename = "GrannyGear_ServiceTicket_{$jobId}.pdf";
}

// Generate PDF
$options = new Options();
$options->set('isHtml5ParserEnabled', true);
$options->set('isRemoteEnabled', true);

$dompdf = new Dompdf($options);
$dompdf->loadHtml($html);
$dompdf->setPaper('A4', 'portrait');
$dompdf->render();

// Output options
$output = $_GET['output'] ?? 'download';

if ($output === 'base64') {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'base64' => base64_encode($dompdf->output()),
        'filename' => $filename
    ]);
} else {
    $dompdf->stream($filename, ['Attachment' => true]);
}

// HTML Templates
function generateTicketHTML($job, $queuePosition) {
    $checklist = json_decode($job['checklist'], true) ?? [];
    $checklistHtml = implode('', array_map(fn($item) => "<div class='checklist-item'>✓ $item</div>", $checklist));
    
    return <<<HTML
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
            .header { background: linear-gradient(135deg, #29ABE2, #1E8BBB); padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 10px 0; font-size: 24px; font-style: italic; text-transform: lowercase; }
            .job-id { background: #1A1A1A; color: white; display: inline-block; padding: 8px 20px; border-radius: 6px; font-size: 18px; font-weight: bold; margin: 15px 0; }
            .content { padding: 30px; }
            .section { background: #F8F9FA; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
            .section h3 { margin: 0 0 15px; color: #1A1A1A; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #29ABE2; padding-bottom: 8px; }
            .row { margin-bottom: 8px; }
            .label { color: #666; display: inline-block; width: 100px; }
            .value { color: #333; font-weight: 500; }
            .service-banner { background: #29ABE2; color: white; padding: 12px 20px; border-radius: 8px; font-size: 16px; font-weight: bold; margin-bottom: 20px; }
            .checklist { columns: 2; }
            .checklist-item { break-inside: avoid; padding: 4px 0; font-size: 12px; color: #333; }
            .queue-box { background: #FFF200; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px; }
            .queue-box .number { font-size: 48px; font-weight: bold; color: #1A1A1A; }
            .footer { background: #1A1A1A; color: #999; padding: 20px; text-align: center; font-size: 11px; margin-top: 30px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>grannygear!</h1>
            <div style="font-size: 12px;">SERVICE TICKET</div>
        </div>
        
        <div style="text-align: center;">
            <div class="job-id">{$job['job_id']}</div>
        </div>
        
        <div class="content">
            <div class="section">
                <h3>Customer Details</h3>
                <div class="row"><span class="label">Name:</span><span class="value">{$job['first_name']} {$job['last_name']}</span></div>
                <div class="row"><span class="label">Phone:</span><span class="value">{$job['phone']}</span></div>
                <div class="row"><span class="label">Email:</span><span class="value">{$job['email']}</span></div>
            </div>
            
            <div class="section">
                <h3>Bicycle</h3>
                <div class="row"><span class="label">Brand:</span><span class="value">{$job['bike_brand']}</span></div>
                <div class="row"><span class="label">Model:</span><span class="value">{$job['bike_model']}</span></div>
                <div class="row"><span class="label">Type:</span><span class="value">{$job['bike_type']}</span></div>
                <div class="row"><span class="label">Needed By:</span><span class="value">{$job['needed_by_text']}</span></div>
            </div>
            
            <div class="service-banner">SERVICE TYPE: {$job['service_type']}</div>
            
            <div class="section">
                <h3>Service Checklist</h3>
                <div class="checklist">{$checklistHtml}</div>
            </div>
            
            <div class="queue-box">
                <div class="number">#{$queuePosition}</div>
                <div>Your position in the queue</div>
            </div>
        </div>
        
        <div class="footer">
            Granny Gear | www.grannygear.co.za | info@grannygear.co.za<br>
            +27 21 001 0221 | +27 65 507 0829
        </div>
    </body>
    </html>
    HTML;
}

function generateCompletionHTML($job) {
    // Similar structure with green theme and completion details
    // ... (implement similar to ticket but with completion info)
    return "<!-- Completion HTML template -->";
}
```

---

## Frontend Changes

### Update /js/common.js

Replace Apps Script URL with PHP endpoints:

```javascript
// OLD (Apps Script)
// const API_URL = 'https://script.google.com/macros/s/.../exec';

// NEW (Self-hosted PHP)
const API_BASE = '/api';

// API wrapper functions
async function apiCall(endpoint, action, data = {}) {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
    });
    return response.json();
}

// Specific functions
async function verifyPin(pin) {
    return apiCall('auth.php', 'verifyPin', { pin });
}

async function reserveJobId() {
    return apiCall('jobs.php', 'reserveJobId');
}

async function submitJob(jobData) {
    return apiCall('jobs.php', 'submitJob', jobData);
}

async function getAllJobs() {
    const result = await apiCall('jobs.php', 'getAllJobs');
    return result.jobs || [];
}

async function updateJobStatus(jobId, status, updates = {}) {
    return apiCall('jobs.php', 'updateStatus', { jobId, status, ...updates });
}

// PDF generation - now server-side
async function generateServiceTicketPDF(jobId) {
    const response = await fetch(`${API_BASE}/pdf.php?type=ticket&jobId=${jobId}&output=base64`);
    return response.json();
}
```

---

## Migration Checklist

### Phase 1: Database Setup
- [ ] Create MySQL database `grannygear_workshop`
- [ ] Run schema SQL to create tables
- [ ] Insert initial config values
- [ ] Test database connection

### Phase 2: PHP API
- [ ] Create `/api/config.php`
- [ ] Create `/api/auth.php` - test PIN verification
- [ ] Create `/api/jobs.php` - test CRUD operations
- [ ] Install Dompdf: `composer require dompdf/dompdf`
- [ ] Create `/api/pdf.php` - test PDF generation
- [ ] Update `/api/sendmail.php` to use new PDF endpoint

### Phase 3: Frontend Updates
- [ ] Update `common.js` API endpoints
- [ ] Test booking form submission
- [ ] Test cart/kanban operations
- [ ] Test PDF generation and email

### Phase 4: Data Migration
- [ ] Export Google Sheets data to CSV
- [ ] Import to MySQL using script or phpMyAdmin
- [ ] Verify data integrity

### Phase 5: DNS & Go Live
- [ ] Upload frontend files to server root
- [ ] Test all functionality on grannygear.co.za
- [ ] Update Cloudflare DNS if needed
- [ ] Disable Apps Script endpoint

---

## Data Export from Google Sheets

Run this in Apps Script to export current data:

```javascript
function exportToJSON() {
  const ss = SpreadsheetApp.openById('YOUR_SHEET_ID');
  const jobs = ss.getSheetByName('Jobs').getDataRange().getValues();
  const archive = ss.getSheetByName('Archive').getDataRange().getValues();
  
  // Convert to JSON
  const headers = jobs[0];
  const jobsData = jobs.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  
  Logger.log(JSON.stringify(jobsData, null, 2));
}
```

---

## Estimated Timeline

| Task | Duration |
|------|----------|
| Database setup | 1 hour |
| PHP API development | 4-6 hours |
| PDF generation | 2-3 hours |
| Frontend updates | 1-2 hours |
| Testing | 2-3 hours |
| Data migration | 1 hour |
| **Total** | **~12-16 hours** |

---

## Notes for Claude

When implementing this migration:

1. **Start with database** - Get schema created and tested first
2. **Build API incrementally** - One endpoint at a time, test each
3. **Keep Apps Script running** - Don't disable until PHP is proven
4. **Frontend changes are minimal** - Just swap API URLs
5. **Email already works** - sendmail.php just needs PDF integration
6. **Test thoroughly** - Each workflow: booking → triage → complete → archive
