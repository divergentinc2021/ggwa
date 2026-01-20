# Offline Mode Implementation Guide

> **Purpose**: This document provides complete specifications for implementing full offline data persistence and sync capabilities. Feed this to Claude when ready to implement.

---

## Current State

### What Works Offline Now
- ✅ PWA is installable
- ✅ Static assets cached (HTML, CSS, JS, icons)
- ✅ Offline banner shows when disconnected
- ✅ Service Worker v7 with network-first strategy

### What Doesn't Work Offline
- ❌ Cannot submit new bookings (requires API)
- ❌ Cannot view existing jobs (data not cached)
- ❌ Cannot update job status
- ❌ No local data persistence
- ❌ No background sync when reconnected

---

## Target Offline Capabilities

### For Customers (booking.html)
1. Fill out booking form while offline
2. Form data saved locally (IndexedDB)
3. Visual indicator: "Booking will be submitted when online"
4. Auto-submit when connection restored
5. Notification of successful submission

### For Workshop (cart.html)
1. View cached job list (last synced state)
2. Update job status while offline (queued locally)
3. Add work notes while offline
4. Visual indicator showing pending sync count
5. Auto-sync when connection restored
6. Conflict resolution for concurrent edits

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER                                  │
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│  │  booking.js │     │   cart.js   │     │  common.js  │       │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                             ▼                                   │
│                    ┌─────────────────┐                          │
│                    │  OfflineManager │  ◀── New module          │
│                    │   (offline.js)  │                          │
│                    └────────┬────────┘                          │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              ▼              ▼              ▼                    │
│     ┌─────────────┐  ┌───────────┐  ┌───────────────┐          │
│     │  IndexedDB  │  │  Service  │  │  Background   │          │
│     │  (storage)  │  │  Worker   │  │  Sync API     │          │
│     └─────────────┘  └───────────┘  └───────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ When online
                              ▼
                    ┌─────────────────┐
                    │  Apps Script /  │
                    │  PHP API        │
                    └─────────────────┘
```

---

## IndexedDB Schema

### Database: `GrannyGearOffline`

```javascript
const DB_NAME = 'GrannyGearOffline';
const DB_VERSION = 1;

const STORES = {
  // Pending bookings waiting to sync
  pendingBookings: {
    keyPath: 'localId',
    indexes: [
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'syncStatus', keyPath: 'syncStatus' }
    ]
  },
  
  // Cached jobs from server
  cachedJobs: {
    keyPath: 'jobid',
    indexes: [
      { name: 'status', keyPath: 'status' },
      { name: 'updatedAt', keyPath: 'updatedat' }
    ]
  },
  
  // Pending job updates waiting to sync
  pendingUpdates: {
    keyPath: 'localId',
    indexes: [
      { name: 'jobId', keyPath: 'jobId' },
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'syncStatus', keyPath: 'syncStatus' }
    ]
  },
  
  // Sync metadata
  syncMeta: {
    keyPath: 'key'
  }
};
```

### Data Structures

```javascript
// Pending Booking
{
  localId: 'local_1705123456789',      // Generated locally
  createdAt: '2026-01-20T10:30:00Z',
  syncStatus: 'pending',                // pending | syncing | synced | failed
  syncAttempts: 0,
  lastSyncError: null,
  reservedJobId: 'GG-045',              // If ID was reserved while online
  data: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '082 123 4567',
    bikeBrand: 'Trek',
    bikeModel: 'Marlin 7',
    bikeType: 'MTB',
    neededBy: '2026-01-25',
    neededByText: 'In 5 Days',
    serviceType: 'Standard',
    checklist: ['Clean bike', 'Check brakes'],
    description: 'Gears not shifting smoothly',
    pdfBase64: null                     // Generated on sync
  }
}

// Cached Job
{
  jobid: 'GG-042',
  status: 'in-progress',
  createdat: '2026-01-18T09:00:00Z',
  updatedat: '2026-01-19T14:30:00Z',
  firstname: 'Jane',
  lastname: 'Smith',
  // ... all job fields
  _localVersion: 3,                     // For conflict detection
  _cachedAt: '2026-01-20T08:00:00Z'
}

// Pending Update
{
  localId: 'update_1705123456789',
  jobId: 'GG-042',
  createdAt: '2026-01-20T10:45:00Z',
  syncStatus: 'pending',
  action: 'updateStatus',               // updateStatus | triage | addNote
  payload: {
    status: 'completed',
    workNotes: 'Replaced chain and adjusted derailleurs'
  },
  previousState: {                      // For conflict resolution
    status: 'in-progress',
    updatedat: '2026-01-19T14:30:00Z'
  }
}

// Sync Metadata
{
  key: 'lastFullSync',
  value: '2026-01-20T08:00:00Z'
}
{
  key: 'reservedJobIds',
  value: ['GG-046', 'GG-047', 'GG-048']  // Pre-reserved IDs for offline use
}
```

---

## Core Implementation: offline.js

```javascript
/**
 * Granny Gear - Offline Manager
 * Handles IndexedDB storage, sync queue, and background sync
 */

class OfflineManager {
  constructor() {
    this.db = null;
    this.dbName = 'GrannyGearOffline';
    this.dbVersion = 1;
    this.syncInProgress = false;
  }

  // ==================== DATABASE SETUP ====================
  
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Offline] Database initialized');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Pending bookings store
        if (!db.objectStoreNames.contains('pendingBookings')) {
          const store = db.createObjectStore('pendingBookings', { keyPath: 'localId' });
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('syncStatus', 'syncStatus');
        }
        
        // Cached jobs store
        if (!db.objectStoreNames.contains('cachedJobs')) {
          const store = db.createObjectStore('cachedJobs', { keyPath: 'jobid' });
          store.createIndex('status', 'status');
          store.createIndex('updatedAt', 'updatedat');
        }
        
        // Pending updates store
        if (!db.objectStoreNames.contains('pendingUpdates')) {
          const store = db.createObjectStore('pendingUpdates', { keyPath: 'localId' });
          store.createIndex('jobId', 'jobId');
          store.createIndex('createdAt', 'createdAt');
          store.createIndex('syncStatus', 'syncStatus');
        }
        
        // Sync metadata store
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'key' });
        }
      };
    });
  }

  // ==================== BOOKING OPERATIONS ====================
  
  async saveBookingOffline(bookingData, reservedJobId = null) {
    const localId = 'local_' + Date.now();
    
    const record = {
      localId,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
      syncAttempts: 0,
      lastSyncError: null,
      reservedJobId,
      data: bookingData
    };
    
    await this._put('pendingBookings', record);
    this.updatePendingBadge();
    
    return { success: true, localId, offline: true };
  }
  
  async getPendingBookings() {
    return this._getAll('pendingBookings');
  }
  
  async markBookingSynced(localId, serverJobId) {
    await this._delete('pendingBookings', localId);
    this.updatePendingBadge();
  }

  // ==================== JOB CACHE OPERATIONS ====================
  
  async cacheJobs(jobs) {
    const tx = this.db.transaction('cachedJobs', 'readwrite');
    const store = tx.objectStore('cachedJobs');
    await store.clear();
    
    for (const job of jobs) {
      job._cachedAt = new Date().toISOString();
      await store.put(job);
    }
    
    await this._put('syncMeta', {
      key: 'lastFullSync',
      value: new Date().toISOString()
    });
  }
  
  async getCachedJobs() {
    return this._getAll('cachedJobs');
  }

  // ==================== PENDING UPDATES ====================
  
  async queueJobUpdate(jobId, action, payload, previousState) {
    const localId = 'update_' + Date.now();
    
    const record = {
      localId,
      jobId,
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
      action,
      payload,
      previousState
    };
    
    await this._put('pendingUpdates', record);
    await this.updateCachedJob(jobId, payload);
    this.updatePendingBadge();
    
    return { success: true, localId, offline: true };
  }
  
  async getPendingUpdates() {
    return this._getAll('pendingUpdates');
  }

  // ==================== JOB ID RESERVATION ====================
  
  async reserveJobIds(count = 5) {
    if (!navigator.onLine) return [];
    
    const ids = [];
    for (let i = 0; i < count; i++) {
      try {
        const result = await window.apiCall('reserveJobId');
        if (result.success && result.jobId) {
          ids.push(result.jobId);
        }
      } catch (e) {
        break;
      }
    }
    
    if (ids.length > 0) {
      const existing = await this.getReservedJobIds();
      await this._put('syncMeta', {
        key: 'reservedJobIds',
        value: [...existing, ...ids]
      });
    }
    
    return ids;
  }
  
  async getNextReservedJobId() {
    const meta = await this._get('syncMeta', 'reservedJobIds');
    const ids = meta?.value || [];
    
    if (ids.length === 0) return null;
    
    const nextId = ids.shift();
    await this._put('syncMeta', { key: 'reservedJobIds', value: ids });
    
    return nextId;
  }

  // ==================== SYNC OPERATIONS ====================
  
  async syncAll() {
    if (this.syncInProgress || !navigator.onLine) return;
    
    this.syncInProgress = true;
    
    try {
      await this.syncPendingBookings();
      await this.syncPendingUpdates();
      await this.refreshJobCache();
      
      const reservedIds = await this.getReservedJobIds();
      if (reservedIds.length < 3) {
        await this.reserveJobIds(5);
      }
      
      this.showNotification('Sync complete', 'success');
    } catch (error) {
      this.showNotification('Sync failed: ' + error.message, 'error');
    } finally {
      this.syncInProgress = false;
    }
  }
  
  async syncPendingBookings() {
    const pending = await this.getPendingBookings();
    
    for (const booking of pending) {
      try {
        const jobData = { ...booking.data };
        if (booking.reservedJobId) {
          jobData.jobId = booking.reservedJobId;
        }
        
        const result = await window.apiCall('submitJob', jobData);
        
        if (result.success) {
          await this.markBookingSynced(booking.localId, result.jobId);
        }
      } catch (error) {
        console.error('[Offline] Booking sync failed:', booking.localId, error);
      }
    }
  }
  
  async syncPendingUpdates() {
    const pending = await this.getPendingUpdates();
    pending.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    for (const update of pending) {
      try {
        const result = await window.apiCall(update.action, {
          jobId: update.jobId,
          ...update.payload
        });
        
        if (result.success) {
          await this._delete('pendingUpdates', update.localId);
          this.updatePendingBadge();
        }
      } catch (error) {
        console.error('[Offline] Update sync failed:', update.localId, error);
      }
    }
  }
  
  async refreshJobCache() {
    if (!navigator.onLine) return;
    
    try {
      const jobs = await window.apiCall('getAllJobs');
      if (Array.isArray(jobs)) {
        await this.cacheJobs(jobs);
      }
    } catch (error) {
      console.error('[Offline] Failed to refresh job cache:', error);
    }
  }

  // ==================== UI HELPERS ====================
  
  async updatePendingBadge() {
    const bookings = await this.getPendingBookings();
    const updates = await this.getPendingUpdates();
    const total = bookings.length + updates.length;
    
    const badge = document.getElementById('offline-pending-badge');
    if (badge) {
      badge.textContent = total;
      badge.style.display = total > 0 ? 'inline-flex' : 'none';
    }
    
    window.dispatchEvent(new CustomEvent('offlinePendingChanged', {
      detail: { bookings: bookings.length, updates: updates.length, total }
    }));
  }
  
  showNotification(message, type = 'info') {
    console.log('[Offline]', type, message);
    // Integrate with existing notification system
  }
  
  async getSyncStatus() {
    const lastSync = await this._get('syncMeta', 'lastFullSync');
    const pendingBookings = await this.getPendingBookings();
    const pendingUpdates = await this.getPendingUpdates();
    const reservedIds = await this.getReservedJobIds();
    
    return {
      lastSync: lastSync?.value || null,
      pendingBookings: pendingBookings.length,
      pendingUpdates: pendingUpdates.length,
      reservedJobIds: reservedIds.length,
      isOnline: navigator.onLine
    };
  }

  // ==================== LOW-LEVEL DB HELPERS ====================
  
  async _get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  async _put(storeName, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async _delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  async updateCachedJob(jobId, updates) {
    const job = await this._get('cachedJobs', jobId);
    if (job) {
      Object.assign(job, updates);
      job.updatedat = new Date().toISOString();
      await this._put('cachedJobs', job);
    }
  }
  
  async getReservedJobIds() {
    const meta = await this._get('syncMeta', 'reservedJobIds');
    return meta?.value || [];
  }
}

// Initialize global instance
window.offlineManager = new OfflineManager();

document.addEventListener('DOMContentLoaded', async () => {
  await window.offlineManager.init();
  if (navigator.onLine) {
    window.offlineManager.syncAll();
  }
});

window.addEventListener('online', () => {
  window.offlineManager.syncAll();
});
```

---

## Integration Changes

### booking.js - Submit Handler

```javascript
async function submitBooking(formData) {
  if (!navigator.onLine) {
    const reservedJobId = await window.offlineManager.getNextReservedJobId();
    const result = await window.offlineManager.saveBookingOffline(formData, reservedJobId);
    showOfflineConfirmation(result.localId, reservedJobId);
    return result;
  }
  
  try {
    const result = await apiCall('submitJob', formData);
    window.offlineManager.refreshJobCache();
    return result;
  } catch (error) {
    // Network error - save offline
    const reservedJobId = await window.offlineManager.getNextReservedJobId();
    return window.offlineManager.saveBookingOffline(formData, reservedJobId);
  }
}
```

### cart.js - Load Jobs

```javascript
async function loadJobs() {
  let jobs = [];
  
  if (navigator.onLine) {
    try {
      jobs = await apiCall('getAllJobs');
      await window.offlineManager.cacheJobs(jobs);
    } catch (error) {
      jobs = await window.offlineManager.getCachedJobs();
      showCacheWarning();
    }
  } else {
    jobs = await window.offlineManager.getCachedJobs();
    showCacheWarning();
  }
  
  renderJobs(jobs);
}
```

### cart.js - Update Status

```javascript
async function updateJobStatus(jobId, newStatus, updates = {}) {
  const currentJob = await window.offlineManager.getCachedJob(jobId);
  const previousState = { status: currentJob?.status, updatedat: currentJob?.updatedat };
  
  if (!navigator.onLine) {
    const result = await window.offlineManager.queueJobUpdate(
      jobId, 'updateStatus', { status: newStatus, ...updates }, previousState
    );
    moveJobCard(jobId, newStatus);
    showOfflineIndicator(jobId);
    return result;
  }
  
  try {
    const result = await apiCall('updateJobStatus', { jobId, status: newStatus, ...updates });
    if (result.success) {
      await window.offlineManager.updateCachedJob(jobId, { status: newStatus, ...updates });
    }
    return result;
  } catch (error) {
    return window.offlineManager.queueJobUpdate(
      jobId, 'updateStatus', { status: newStatus, ...updates }, previousState
    );
  }
}
```

---

## CSS for Offline UI

```css
/* Pending sync badge */
.pending-badge {
  background: var(--warning-orange);
  color: white;
  border-radius: 50%;
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
}

/* Cache warning banner */
.cache-warning {
  background: var(--warning-orange);
  color: white;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  gap: 12px;
}

/* Job card pending sync indicator */
.job-card.pending-sync {
  border-left: 4px solid var(--warning-orange);
  position: relative;
}

.job-card.pending-sync::after {
  content: '⏳';
  position: absolute;
  top: 8px;
  right: 8px;
  animation: pulse 1.5s infinite;
}

/* Offline confirmation */
.offline-confirmation {
  text-align: center;
  padding: 40px 20px;
}

.offline-confirmation .icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.offline-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  margin-top: 20px;
}

.offline-status .pulse-dot {
  width: 8px;
  height: 8px;
  background: var(--warning-orange);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

---

## Testing Checklist

### Offline Booking
- [ ] Form saves to IndexedDB when offline
- [ ] Shows offline confirmation with local ID
- [ ] Uses reserved job ID if available
- [ ] Auto-syncs when back online
- [ ] Pending badge shows count
- [ ] Email sent after sync completes

### Offline Cart
- [ ] Shows cached jobs when offline
- [ ] Cache warning banner visible
- [ ] Status changes queued locally
- [ ] Pending indicator on affected cards
- [ ] Syncs when back online
- [ ] UI updates after sync

### Sync Engine
- [ ] Auto-sync on reconnect
- [ ] Manual sync button works
- [ ] Failed syncs retry
- [ ] Job ID reservation refills
- [ ] Conflict detection works

### Edge Cases
- [ ] Multiple bookings while offline
- [ ] Browser closed with pending data
- [ ] Very long offline period
- [ ] Concurrent edits (conflict)

---

## Implementation Order

| Phase | Tasks | Est. Hours |
|-------|-------|------------|
| 1 | IndexedDB setup, basic offline.js | 3-4 |
| 2 | Booking offline save + sync | 2-3 |
| 3 | Job cache + offline cart view | 3-4 |
| 4 | Pending updates + sync | 3-4 |
| 5 | UI indicators + polish | 2-3 |
| 6 | Testing + edge cases | 3-4 |
| **Total** | | **~16-20** |

---

## Notes for Claude

1. **Start with IndexedDB** - Get storage working first, then add sync
2. **Test offline mode** - Chrome DevTools → Network → Offline
3. **Inspect IndexedDB** - Chrome DevTools → Application → IndexedDB
4. **Optimistic UI** - Update UI immediately, sync in background
5. **Error boundaries** - Never lose user data on errors
6. **Console logging** - Prefix with `[Offline]` for easy filtering
7. **Gradual rollout** - Can feature-flag offline mode initially
