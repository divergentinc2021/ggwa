# Granny Gear Workshop Management System

A PWA (Progressive Web App) for bike shop workshop management, hosted on Cloudflare Pages with Google Apps Script backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE PAGES                            │
│  (Static Hosting - HTML/CSS/JS/PWA)                             │
│                                                                 │
│  public/                                                        │
│  ├── index.html      (Lobby - New Job / Cart Manager)           │
│  ├── booking.html    (4-step booking wizard)                    │
│  ├── cart.html       (Kanban job management)                    │
│  ├── css/styles.css  (All styles)                               │
│  ├── js/                                                        │
│  │   ├── common.js   (Shared utilities, API calls)              │
│  │   ├── booking.js  (Booking form logic, PDF generation)       │
│  │   └── cart.js     (Cart management, PDF generation)          │
│  ├── manifest.json   (PWA manifest)                             │
│  ├── sw.js           (Service worker for offline)               │
│  └── icons/          (PWA icons)                                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ API Calls (CORS-enabled)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   GOOGLE APPS SCRIPT                            │
│  (Backend - API, Database, Email, Storage)                      │
│                                                                 │
│  Features:                                                      │
│  ├── PIN Verification                                           │
│  ├── Job CRUD (Google Sheets)                                   │
│  ├── Email Notifications (MailApp)                              │
│  │   ├── Booking confirmation                                   │
│  │   ├── Job completion                                         │
│  │   └── Job cancellation                                       │
│  └── PDF Storage (Google Drive)                                 │
│      ├── Service tickets                                        │
│      └── Completion reports                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

| Feature | Apps Script Advantage |
|---------|----------------------|
| **Google Sheets** | Native integration via `SpreadsheetApp` |
| **Email** | Free email via `MailApp` (no SMTP setup) |
| **Google Drive** | Direct PDF upload via `DriveApp` |
| **Authentication** | Simple PIN stored in config |
| **Cost** | 100% free (within quotas) |
| **Deployment** | One-click deploy as Web App |

## Configuration

### Apps Script (Backend)

1. Open `appsscript/Code.gs`
2. Update the CONFIG object:
   ```javascript
   const CONFIG = {
     SPREADSHEET_ID: 'your-spreadsheet-id',
     OPERATOR_PIN: '1234',
     DRIVE_FOLDER_ID: 'your-drive-folder-id',
     // ...
   };
   ```
3. Deploy as Web App:
   - Deploy > New deployment > Web app
   - Execute as: Me
   - Who has access: Anyone
   - Copy the Web App URL

### Frontend (Cloudflare Pages)

1. Update `public/js/common.js`:
   ```javascript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
   ```

2. Deploy to Cloudflare:
   ```bash
   npm install
   npm run deploy
   ```

## API Actions

The frontend calls Apps Script with these actions:

| Action | Description |
|--------|-------------|
| `verifyPin` | Verify operator PIN |
| `reserveJobId` | Generate next Job ID |
| `createJob` | Create new job + email + save PDF |
| `getJobs` | Get all active jobs |
| `triageJob` | Update job triage details |
| `updateStatus` | Change job status |
| `completeJob` | Mark complete + email + save PDF |
| `archiveJob` | Move to Archive sheet |
| `archiveAllCompleted` | Archive all completed jobs |
| `cancelJob` | Cancel + email notification |

## Google Sheets Structure

### Jobs Sheet
| Column | Description |
|--------|-------------|
| JobId | GG-001, GG-002, etc. |
| FirstName, LastName | Customer details |
| Email, Phone, BoardNumber | Contact info |
| BikeBrand, BikeModel, BikeType | Bike details |
| NeededBy, NeededByText | Due date |
| ServiceType | Basic/Standard/Major/Pre-Race |
| Checklist | JSON array of services |
| Description | Customer notes |
| Status | pending/triaged/in-progress/completed |
| Urgency | low/medium/high |
| Complexity | simple/moderate/complex |
| WorkNotes | Mechanic notes |
| CreatedAt, UpdatedAt | Timestamps |

### Config Sheet
| Key | Value |
|-----|-------|
| LastJobNumber | Auto-incrementing counter |

### Archive Sheet
Same structure as Jobs (completed jobs moved here)

## PWA Features

- ✅ Installable on mobile/desktop
- ✅ Offline-capable (cached assets)
- ✅ App shortcuts (New Job, Cart Manager)
- ✅ Works without internet (queue operations)

## Google Drive Structure

```
Granny Gear PDFs/
├── ServiceTicket_GG-001.pdf
├── ServiceTicket_GG-002.pdf
├── CompletionReport_GG-001.pdf
└── ...
```

## Development

```bash
# Install dependencies
npm install

# Run local dev server
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Files Summary

| File | Purpose |
|------|---------|
| `public/index.html` | Lobby (entry point) |
| `public/booking.html` | 4-step booking wizard |
| `public/cart.html` | Job cart manager (Kanban) |
| `public/js/common.js` | Shared utilities, API wrapper |
| `public/js/booking.js` | Booking form logic |
| `public/js/cart.js` | Cart management logic |
| `public/css/styles.css` | All styles |
| `public/sw.js` | Service worker |
| `public/manifest.json` | PWA manifest |
| `appsscript/Code.gs` | Apps Script backend |

## Links

- **Google Sheet**: https://docs.google.com/spreadsheets/d/1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U
- **Google Drive Folder**: https://drive.google.com/drive/folders/1GIaVT0A6AuGvMrgcI047eBqG0HKj4ld_
- **Apps Script Web App**: https://script.google.com/macros/s/AKfycbyhSpACfq5hYN88C4yd7YX7FEpXRjv9gA9gX6Qb9J1qp35B0IOpvl107HcT3KDFXFRx/exec
