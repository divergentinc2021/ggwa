<?php
/**
 * Granny Gear - Email API Endpoint
 * =================================
 * Place this file on your web server (e.g., grannygear.co.za/api/sendmail.php)
 * 
 * Requirements:
 * - PHP 7.4+ with mail() function enabled
 * - OR PHPMailer for SMTP (recommended)
 * 
 * Usage from Google Apps Script:
 * UrlFetchApp.fetch('https://grannygear.co.za/api/sendmail.php', {
 *   method: 'POST',
 *   contentType: 'application/json',
 *   payload: JSON.stringify({ ... })
 * });
 * 
 * CHANGELOG:
 * v1.1 (2026-01-20) - Added PDF attachment support
 * v1.0 (2025-xx-xx) - Initial version
 */

// ============ CONFIGURATION ============
define('API_KEY', 'grannygear-workshop-2026-secure'); // Change this!
define('FROM_EMAIL', 'info@grannygear.co.za');
define('FROM_NAME', 'Granny Gear');
define('REPLY_TO', 'info@grannygear.co.za');

// SMTP Configuration (optional - for PHPMailer)
define('USE_SMTP', false); // Set to true if using SMTP
define('SMTP_HOST', 'mail.grannygear.co.za');
define('SMTP_PORT', 587);
define('SMTP_USER', 'info@grannygear.co.za');
define('SMTP_PASS', 'your-smtp-password');

// Allowed origins (CORS)
$allowedOrigins = [
    'https://script.google.com',
    'https://script.googleusercontent.com',
    'https://grannygear.co.za',
    'https://www.grannygear.co.za',
    'https://ggwa.pages.dev'  // Cloudflare Pages PWA
];

// ============ CORS HEADERS ============
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins) || strpos($origin, 'script.google') !== false) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ============ MAIN LOGIC ============

// Only accept POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, 'Method not allowed');
}

// Get and validate input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    respond(400, 'Invalid JSON payload');
}

// Validate API key
$apiKey = $input['apiKey'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
    respond(401, 'Invalid API key');
}

// Required fields
$required = ['to', 'subject', 'body'];
foreach ($required as $field) {
    if (empty($input[$field])) {
        respond(400, "Missing required field: $field");
    }
}

// Extract email data
$to = sanitizeEmail($input['to']);
$subject = sanitizeString($input['subject']);
$body = $input['body']; // HTML allowed
$replyTo = sanitizeEmail($input['replyTo'] ?? REPLY_TO);
$cc = isset($input['cc']) ? array_map('sanitizeEmail', (array)$input['cc']) : [];
$bcc = isset($input['bcc']) ? array_map('sanitizeEmail', (array)$input['bcc']) : [];

// Extract attachment if provided (NEW in v1.1)
$attachment = null;
if (!empty($input['attachment']) && !empty($input['attachment']['base64'])) {
    $attachment = [
        'data' => base64_decode($input['attachment']['base64']),
        'filename' => $input['attachment']['filename'] ?? 'attachment.pdf',
        'mimeType' => $input['attachment']['mimeType'] ?? 'application/pdf'
    ];
}

// Validate email
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    respond(400, 'Invalid recipient email');
}

// Send email
try {
    if (USE_SMTP && class_exists('PHPMailer\PHPMailer\PHPMailer')) {
        $result = sendWithPHPMailer($to, $subject, $body, $replyTo, $cc, $bcc, $attachment);
    } else {
        $result = sendWithMail($to, $subject, $body, $replyTo, $cc, $bcc, $attachment);
    }
    
    if ($result) {
        respond(200, 'Email sent successfully', [
            'sent' => true, 
            'to' => $to,
            'hasAttachment' => !empty($attachment)
        ]);
    } else {
        respond(500, 'Failed to send email');
    }
} catch (Exception $e) {
    error_log("Granny Gear Email Error: " . $e->getMessage());
    respond(500, 'Email error: ' . $e->getMessage());
}

// ============ FUNCTIONS ============

/**
 * Send email using PHP's native mail() function
 * Supports HTML body and optional PDF attachment
 */
function sendWithMail($to, $subject, $body, $replyTo, $cc, $bcc, $attachment = null) {
    $boundary = md5(uniqid(time()));
    
    $headers = [];
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'From: ' . FROM_NAME . ' <' . FROM_EMAIL . '>';
    $headers[] = 'Reply-To: ' . $replyTo;
    
    if (!empty($cc)) {
        $headers[] = 'Cc: ' . implode(', ', $cc);
    }
    if (!empty($bcc)) {
        $headers[] = 'Bcc: ' . implode(', ', $bcc);
    }
    
    $headers[] = 'X-Mailer: GrannyGear-Workshop/1.1';
    
    // If no attachment, send simple HTML email
    if (empty($attachment)) {
        $headers[] = 'Content-type: text/html; charset=UTF-8';
        return mail($to, $subject, $body, implode("\r\n", $headers));
    }
    
    // With attachment: use multipart MIME
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
    
    // Build multipart message
    $message = "--{$boundary}\r\n";
    $message .= "Content-Type: text/html; charset=UTF-8\r\n";
    $message .= "Content-Transfer-Encoding: 7bit\r\n\r\n";
    $message .= $body . "\r\n\r\n";
    
    // Add attachment
    $message .= "--{$boundary}\r\n";
    $message .= "Content-Type: {$attachment['mimeType']}; name=\"{$attachment['filename']}\"\r\n";
    $message .= "Content-Disposition: attachment; filename=\"{$attachment['filename']}\"\r\n";
    $message .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $message .= chunk_split(base64_encode($attachment['data'])) . "\r\n";
    
    // End boundary
    $message .= "--{$boundary}--";
    
    return mail($to, $subject, $message, implode("\r\n", $headers));
}

/**
 * Send email using PHPMailer (SMTP)
 * Supports HTML body and optional PDF attachment
 */
function sendWithPHPMailer($to, $subject, $body, $replyTo, $cc, $bcc, $attachment = null) {
    // Requires: composer require phpmailer/phpmailer
    // Or manual include of PHPMailer files
    
    require_once 'vendor/autoload.php'; // Adjust path as needed
    
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    // SMTP settings
    $mail->isSMTP();
    $mail->Host = SMTP_HOST;
    $mail->SMTPAuth = true;
    $mail->Username = SMTP_USER;
    $mail->Password = SMTP_PASS;
    $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port = SMTP_PORT;
    
    // Recipients
    $mail->setFrom(FROM_EMAIL, FROM_NAME);
    $mail->addAddress($to);
    $mail->addReplyTo($replyTo);
    
    foreach ($cc as $ccAddr) {
        $mail->addCC($ccAddr);
    }
    foreach ($bcc as $bccAddr) {
        $mail->addBCC($bccAddr);
    }
    
    // Add attachment if provided (NEW in v1.1)
    if (!empty($attachment)) {
        $mail->addStringAttachment(
            $attachment['data'],
            $attachment['filename'],
            'base64',
            $attachment['mimeType']
        );
    }
    
    // Content
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $body;
    $mail->AltBody = strip_tags($body);
    
    return $mail->send();
}

function sanitizeEmail($email) {
    return filter_var(trim($email), FILTER_SANITIZE_EMAIL);
}

function sanitizeString($str) {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}

function respond($code, $message, $data = []) {
    http_response_code($code);
    echo json_encode(array_merge([
        'success' => $code === 200,
        'message' => $message,
        'timestamp' => date('c')
    ], $data));
    exit;
}

// ============ LOGGING (Optional) ============
function logEmail($to, $subject, $success, $hasAttachment = false) {
    $logFile = __DIR__ . '/email_log.txt';
    $attachmentFlag = $hasAttachment ? ' [+PDF]' : '';
    $entry = date('Y-m-d H:i:s') . " | " . ($success ? 'OK' : 'FAIL') . " | To: $to | Subject: $subject{$attachmentFlag}\n";
    file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);
}
