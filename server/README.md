# Granny Gear Server Files

Files to be deployed to the web server at `grannygear.co.za`.

## `/api/sendmail.php`

Email API endpoint that allows the Google Apps Script backend to send emails from `info@grannygear.co.za` instead of the Gmail account running the script.

### Deployment

1. Upload `sendmail.php` to `https://grannygear.co.za/api/sendmail.php`
2. Ensure the file has proper permissions (644)
3. Test with the `testEmailApi()` function in Apps Script

### Features

- Sends HTML emails with proper headers
- Supports CC/BCC recipients
- **PDF attachment support** (v1.1) - accepts base64-encoded attachments
- CORS configured for Apps Script and PWA origins
- API key authentication
- Works with native PHP `mail()` or PHPMailer (SMTP)

### API Request Format

```json
{
  "apiKey": "grannygear-workshop-2026-secure",
  "to": "customer@example.com",
  "subject": "Your Service Request",
  "body": "<html>...</html>",
  "replyTo": "info@grannygear.co.za",
  "bcc": ["info@grannygear.co.za"],
  "attachment": {
    "base64": "JVBERi0xLjQK...",
    "filename": "ServiceTicket_GG-001.pdf",
    "mimeType": "application/pdf"
  }
}
```

### Configuration

Edit these constants at the top of the file:

| Constant | Description |
|----------|-------------|
| `API_KEY` | Must match the key in Apps Script `CONFIG.EMAIL_API.API_KEY` |
| `FROM_EMAIL` | Sender email address |
| `FROM_NAME` | Sender display name |
| `USE_SMTP` | Set `true` to use PHPMailer with SMTP |
| `SMTP_*` | SMTP server settings (if using PHPMailer) |

### Changelog

- **v1.1** (2026-01-20): Added PDF attachment support for both `mail()` and PHPMailer
- **v1.0**: Initial release with basic HTML email support
