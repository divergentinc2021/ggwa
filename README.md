# Granny Gear Workshop Management System

A Progressive Web App (PWA) for bike shop workshop management. Handles customer intake, job tracking, and service completion workflows.

**Live URL**: https://ggwa.pages.dev (will be https://grannygear.co.za)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE PAGES                            │
│                     ggwa.pages.dev                              │
│                                                                 │
│  public/                                                        │
│  ├── index.html          Landing page (New Job / Cart Manager)  │
│  ├── booking.html        4-step booking wizard                  │
│  ├── cart.html           Kanban job management board            │
│  ├── css/styles.css      All styles + offline banner            │
│  ├── js/                                                        │
│  │   ├── common.js       API calls, utilities, debug logging    │
│  │   ├── booking.js      Booking form, client-side PDF          │
│  │   └── cart.js         Kanban board, job management           │
│  ├── sw.js               Service Worker v7 (network-first)      │
│  ├── manifest.json       PWA manifest                           │
│  └── icons/              App icons (192px, 512px)               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GOOGLE APPS SCRIPT                            │
│                   (Backend API)                                 │
│                                                                 │
│  appsscript/Code.gs                                             │
│  ├── Job CRUD (create, read, update, archive)                   │
│  ├── PIN verification                                           │
│  ├── Job ID generation (GG-001, GG-002...)                      │
│  └── Email dispatch (via PHP API)                               │
│                                                                 │
│  Database: Google Sheets                                        │
│  ├── Jobs          Active jobs                                  │
│  ├── Archive       Completed/cancelled jobs                     │
│  ├── Config        Settings (PIN, job counter)                  │
│  └── AuditLog      Action history                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ Email with PDF attachments
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GRANNYGEAR.CO.ZA                              │
│                   (Email Server)                                │
│                                                                 │
│  server/api/sendmail.php                                        │
│  ├── Sends from: info@grannygear.co.za                          │
│  ├── Supports HTML emails                                       │
│  ├── Supports PDF attachments (base64)                          │
│  └── CC/BCC support                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### Customer Booking (booking.html)
- 4-step wizard: Customer Info → Bike Details → Service Selection → Confirmation
- Real-time form validation
- Client-side PDF ticket generation (jsPDF)
- Email confirmation with PDF attachment
- Queue position display

### Workshop Management (cart.html)
- Kanban board: Pending → Triaged → In Progress → Completed
- Drag-and-drop job cards
- Job triage (urgency, complexity, assignment)
- Work notes and status updates
- Completion reports with PDF
- Archive completed jobs

### PWA Capabilities
- Installable on mobile/desktop
- Offline indicator banner
- Service worker caching (network-first strategy)
- App shortcuts for quick access

---

## Project Structure

```
grannygear-workshop/
├── public/                 # Frontend (Cloudflare Pages)
│   ├── index.html
│   ├── booking.html
│   ├── cart.html
│   ├── css/styles.css
│   ├── js/
│   │   ├── common.js
│   │   ├── booking.js
│   │   └── cart.js
│   ├── sw.js
│   ├── manifest.json
│   ├── _redirects          # Cloudflare clean URL redirects
│   └── icons/
├── appsscript/             # Google Apps Script backend
│   └── Code.gs
├── server/                 # Self-hosted PHP components
│   ├── api/
│   │   └── sendmail.php    # Email API with PDF support
│   └── README.md
├── MIGRATION.md            # Guide for future self-hosting
└── README.md               # This file
```

---

## Configuration

### 1. Google Apps Script (appsscript/Code.gs)

Update the CONFIG object:

```javascript
const CONFIG = {
  SPREADSHEET_NAME: 'GrannyGear_Workshop_DB',
  SHOP_EMAIL: 'info@grannygear.co.za',
  SHOP_NAME: 'Granny Gear',
  OPERATOR_PIN: '1234',  // Change in production!
  MECHANICS: ['Mike', 'Johan', 'Sipho', 'Thandi'],
  LOGO_URL: 'https://ggwa.pages.dev/icons/icon-192.png',
  
  EMAIL_API: {
    ENDPOINT: 'https://grannygear.co.za/api/sendmail.php',
    API_KEY: 'grannygear-workshop-2026-secure',
    FROM_EMAIL: 'info@grannygear.co.za',
    FROM_NAME: 'Granny Gear',
    ENABLED: true
  }
};
```

Deploy as Web App:
1. Open Apps Script editor
2. Deploy → New deployment → Web app
3. Execute as: Me | Who has access: Anyone
4. Copy the deployment URL

### 2. Frontend (public/js/common.js)

Update the API endpoint:

```javascript
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

### 3. Email Server (server/api/sendmail.php)

Upload to `grannygear.co.za/api/sendmail.php` and ensure:
- API_KEY matches Apps Script config
- PHP mail() or PHPMailer is configured

---

## Deployment

### Frontend (Cloudflare Pages)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages deploy public --project-name=ggwa
```

Or connect GitHub repo to Cloudflare Pages for auto-deploy.

### Backend (Apps Script)

1. Copy `appsscript/Code.gs` to Apps Script editor
2. Run `initialSetup()` once to create spreadsheet
3. Deploy as Web App
4. Copy deployment URL to frontend config

### Email API

1. Upload `server/api/sendmail.php` to web server
2. Test with `testEmailApi()` function in Apps Script

---

## API Reference

### Apps Script Endpoints

All calls use POST to the Apps Script Web App URL with JSON body:

| Action | Description | Parameters |
|--------|-------------|------------|
| `verifyPin` | Verify operator PIN | `pin` |
| `reserveJobId` | Generate next job ID | - |
| `submitJob` | Create new job | `jobData` object |
| `getAllJobs` | Get all active jobs | - |
| `getJobById` | Get single job | `jobId` |
| `updateJobStatus` | Change status | `jobId`, `status`, `updates` |
| `updateJobTriage` | Update triage | `jobId`, `urgency`, `complexity`, `workNotes`, `assignedTo` |
| `archiveJob` | Move to archive | `jobId` |
| `cancelJob` | Cancel job | `jobId`, `reason` |

### Email API (sendmail.php)

```json
POST /api/sendmail.php
{
  "apiKey": "grannygear-workshop-2026-secure",
  "to": "customer@example.com",
  "subject": "Your Service Request",
  "body": "<html>...</html>",
  "bcc": ["info@grannygear.co.za"],
  "attachment": {
    "base64": "JVBERi0xLjQ...",
    "filename": "ServiceTicket.pdf",
    "mimeType": "application/pdf"
  }
}
```

---

## Google Sheets Structure

### Jobs Sheet
| Column | Type | Description |
|--------|------|-------------|
| JobID | String | GG-001, GG-002, etc. |
| Status | Enum | pending, triaged, in-progress, completed |
| CreatedAt | DateTime | Job creation timestamp |
| FirstName, LastName | String | Customer name |
| Email, Phone | String | Contact info |
| BikeBrand, BikeModel, BikeType | String | Bike details |
| ServiceType | String | Basic, Standard, Major, Pre-Race |
| Checklist | JSON | Array of service items |
| Description | String | Customer notes |
| Urgency | Enum | low, medium, high |
| Complexity | Enum | simple, moderate, complex |
| AssignedTo | String | Mechanic name |
| WorkNotes | String | Mechanic notes |

### Config Sheet
| Key | Value |
|-----|-------|
| LastJobNumber | Auto-incrementing counter |
| OperatorPIN | Workshop access PIN |

---

## Development

```bash
# Clone repo
git clone https://github.com/yourusername/grannygear-workshop.git
cd grannygear-workshop

# Serve locally (any static server)
npx serve public

# Or use Python
cd public && python -m http.server 8080
```

---

## Future: Self-Hosted Migration

See `MIGRATION.md` for complete guide to migrate from Google Apps Script + Sheets to a fully self-hosted PHP + MySQL solution. This includes:

- MySQL database schema
- PHP API endpoints
- Server-side PDF generation (Dompdf)
- Data migration scripts

---

## Links

| Resource | URL |
|----------|-----|
| Live App | https://ggwa.pages.dev |
| Google Sheet | [GrannyGear_Workshop_DB](https://docs.google.com/spreadsheets/d/1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U) |
| Apps Script | [Deployment](https://script.google.com/macros/s/AKfycbyhSpACfq5hYN88C4yd7YX7FEpXRjv9gA9gX6Qb9J1qp35B0IOpvl107HcT3KDFXFRx/exec) |

---

## Changelog

### 2026-01-20
- Added PDF attachment support to email API
- Updated logo URL to Cloudflare Pages CDN
- Fixed offline banner CSS issue
- All emails now send from info@grannygear.co.za

### 2026-01-19
- Service Worker v7 with network-first strategy
- Clean URL support with _redirects
- Debug logging in common.js

---

## License

Private - Granny Gear © 2026
