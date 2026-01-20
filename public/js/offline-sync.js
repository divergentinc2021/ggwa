/* ===== GRANNY GEAR WORKSHOP - OFFLINE SYNC MODULE ===== */

/**
 * Offline Data Sync for PWA
 * - Saves job submissions to IndexedDB when offline
 * - Syncs pending jobs when internet returns
 * - Handles job ID reservation and sequencing
 */

const OfflineSync = {
  DB_NAME: 'GrannyGearOfflineDB',
  DB_VERSION: 1,
  STORE_NAME: 'pendingJobs',
  CACHE_STORE: 'dataCache',
  
  db: null,
  syncInProgress: false,
  
  // ===== DATABASE INITIALIZATION =====
  
  /**
   * Initialize IndexedDB
   */
  async init() {
    if (this.db) return this.db;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => {
        console.error('[OfflineSync] IndexedDB error:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        debugLog('IndexedDB initialized');
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for pending job submissions
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { 
            keyPath: 'localId', 
            autoIncrement: true 
          });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          debugLog('Created pendingJobs store');
        }
        
        // Store for cached data (jobs list, config, etc.)
        if (!db.objectStoreNames.contains(this.CACHE_STORE)) {
          const cacheStore = db.createObjectStore(this.CACHE_STORE, { 
            keyPath: 'key' 
          });
          debugLog('Created dataCache store');
        }
      };
    });
  },
  
  // ===== PENDING JOBS MANAGEMENT =====
  
  /**
   * Save a job submission for later sync
   * @param {object} jobData - The job form data
   * @returns {Promise<number>} - Local ID of saved job
   */
  async savePendingJob(jobData) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const pendingJob = {
        jobData: jobData,
        status: 'pending', // pending, syncing, synced, failed
        createdAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        reservedJobId: null // Will be filled when we get online
      };
      
      const request = store.add(pendingJob);
      
      request.onsuccess = () => {
        debugLog('Saved pending job with localId:', request.result);
        this.updatePendingBadge();
        resolve(request.result);
      };
      
      request.onerror = () => {
        console.error('[OfflineSync] Error saving pending job:', request.error);
        reject(request.error);
      };
    });
  },
  
  /**
   * Get all pending jobs
   * @returns {Promise<Array>}
   */
  async getPendingJobs() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('status');
      const request = index.getAll('pending');
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Get count of pending jobs
   * @returns {Promise<number>}
   */
  async getPendingCount() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('status');
      const request = index.count('pending');
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Update a pending job's status
   * @param {number} localId 
   * @param {object} updates 
   */
  async updatePendingJob(localId, updates) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const getRequest = store.get(localId);
      
      getRequest.onsuccess = () => {
        const job = getRequest.result;
        if (!job) {
          reject(new Error('Job not found'));
          return;
        }
        
        Object.assign(job, updates);
        const putRequest = store.put(job);
        
        putRequest.onsuccess = () => resolve(job);
        putRequest.onerror = () => reject(putRequest.error);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  },
  
  /**
   * Delete a pending job (after successful sync)
   * @param {number} localId 
   */
  async deletePendingJob(localId) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(localId);
      
      request.onsuccess = () => {
        debugLog('Deleted pending job:', localId);
        this.updatePendingBadge();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // ===== DATA CACHE MANAGEMENT =====
  
  /**
   * Cache data for offline use
   * @param {string} key - Cache key (e.g., 'jobs', 'config')
   * @param {any} data - Data to cache
   */
  async cacheData(key, data) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.CACHE_STORE], 'readwrite');
      const store = transaction.objectStore(this.CACHE_STORE);
      
      const cacheEntry = {
        key: key,
        data: data,
        cachedAt: new Date().toISOString()
      };
      
      const request = store.put(cacheEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  
  /**
   * Get cached data
   * @param {string} key 
   * @returns {Promise<any>}
   */
  async getCachedData(key) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.CACHE_STORE], 'readonly');
      const store = transaction.objectStore(this.CACHE_STORE);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  },
  
  // ===== SYNC OPERATIONS =====
  
  /**
   * Sync all pending jobs to the server
   */
  async syncPendingJobs() {
    if (this.syncInProgress) {
      debugLog('Sync already in progress, skipping');
      return;
    }
    
    if (!navigator.onLine) {
      debugLog('Still offline, cannot sync');
      return;
    }
    
    this.syncInProgress = true;
    debugLog('Starting sync of pending jobs...');
    
    try {
      const pendingJobs = await this.getPendingJobs();
      debugLog(`Found ${pendingJobs.length} pending jobs to sync`);
      
      if (pendingJobs.length === 0) {
        this.syncInProgress = false;
        return;
      }
      
      // Show sync notification
      this.showSyncNotification(pendingJobs.length);
      
      let syncedCount = 0;
      let failedCount = 0;
      
      for (const job of pendingJobs) {
        try {
          // Update status to syncing
          await this.updatePendingJob(job.localId, { status: 'syncing' });
          
          // First, reserve a job ID from the server
          debugLog('Reserving job ID for localId:', job.localId);
          const reserveResult = await apiCall('reserveJobId');
          
          if (!reserveResult.success) {
            throw new Error('Failed to reserve job ID');
          }
          
          const jobId = reserveResult.jobId;
          debugLog('Got job ID:', jobId);
          
          // Add the job ID to the job data
          const jobDataWithId = {
            ...job.jobData,
            jobId: jobId
          };
          
          // Submit the job
          debugLog('Submitting job:', jobId);
          const submitResult = await apiCall('submitJob', jobDataWithId);
          
          if (submitResult.success) {
            // Success! Delete from pending
            await this.deletePendingJob(job.localId);
            syncedCount++;
            debugLog('Successfully synced job:', jobId);
          } else {
            throw new Error(submitResult.error || 'Submit failed');
          }
          
        } catch (error) {
          console.error('[OfflineSync] Failed to sync job:', job.localId, error);
          failedCount++;
          
          // Update with error info
          await this.updatePendingJob(job.localId, {
            status: 'pending', // Reset to pending for retry
            attempts: (job.attempts || 0) + 1,
            lastError: error.message
          });
        }
      }
      
      // Show result notification
      this.showSyncResultNotification(syncedCount, failedCount);
      
      debugLog(`Sync complete: ${syncedCount} synced, ${failedCount} failed`);
      
    } catch (error) {
      console.error('[OfflineSync] Sync error:', error);
    } finally {
      this.syncInProgress = false;
      this.updatePendingBadge();
    }
  },
  
  // ===== UI HELPERS =====
  
  /**
   * Update the pending jobs badge in UI
   */
  async updatePendingBadge() {
    try {
      const count = await this.getPendingCount();
      const badge = document.getElementById('pendingJobsBadge');
      
      if (badge) {
        if (count > 0) {
          badge.textContent = count;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      }
      
      // Also update any pending jobs indicator
      const indicator = document.getElementById('pendingJobsIndicator');
      if (indicator) {
        indicator.style.display = count > 0 ? 'block' : 'none';
        const text = indicator.querySelector('.pending-text');
        if (text) {
          text.textContent = `${count} job${count !== 1 ? 's' : ''} waiting to sync`;
        }
      }
    } catch (error) {
      console.error('[OfflineSync] Error updating badge:', error);
    }
  },
  
  /**
   * Show sync in progress notification
   * @param {number} count 
   */
  showSyncNotification(count) {
    showToast(`Syncing ${count} offline job${count !== 1 ? 's' : ''}...`, 'info', 3000);
  },
  
  /**
   * Show sync result notification
   * @param {number} synced 
   * @param {number} failed 
   */
  showSyncResultNotification(synced, failed) {
    if (synced > 0 && failed === 0) {
      showToast(`✓ ${synced} job${synced !== 1 ? 's' : ''} synced successfully!`, 'success', 4000);
    } else if (synced > 0 && failed > 0) {
      showToast(`${synced} synced, ${failed} failed - will retry`, 'warning', 4000);
    } else if (failed > 0) {
      showToast(`Failed to sync ${failed} job${failed !== 1 ? 's' : ''} - will retry`, 'error', 4000);
    }
  },
  
  // ===== EVENT LISTENERS =====
  
  /**
   * Set up online/offline event listeners
   */
  setupEventListeners() {
    // When coming back online, trigger sync
    window.addEventListener('online', () => {
      debugLog('Back online! Triggering sync...');
      // Small delay to ensure network is stable
      setTimeout(() => this.syncPendingJobs(), 2000);
    });
    
    // When going offline, update UI
    window.addEventListener('offline', () => {
      debugLog('Gone offline');
      this.updatePendingBadge();
    });
    
    // Initial badge update
    this.updatePendingBadge();
    
    // Try to sync on page load if online
    if (navigator.onLine) {
      setTimeout(() => this.syncPendingJobs(), 3000);
    }
    
    debugLog('OfflineSync event listeners set up');
  }
};

// ===== MODIFIED JOB SUBMISSION FUNCTION =====

/**
 * Submit a job with offline support
 * @param {object} jobData - The job form data
 * @returns {Promise<object>} - Result with success status
 */
async function submitJobWithOfflineSupport(jobData) {
  // If online, try normal submission
  if (navigator.onLine) {
    try {
      debugLog('Online - attempting direct submission');
      
      // Reserve job ID first
      const reserveResult = await apiCall('reserveJobId');
      if (!reserveResult.success) {
        throw new Error('Failed to reserve job ID');
      }
      
      // Add job ID to data
      jobData.jobId = reserveResult.jobId;
      
      // Submit
      const result = await apiCall('submitJob', jobData);
      
      if (result.success) {
        return {
          success: true,
          jobId: result.jobId,
          queuePosition: result.queuePosition,
          mode: 'online'
        };
      } else {
        throw new Error(result.error || 'Submission failed');
      }
      
    } catch (error) {
      console.error('[submitJob] Online submission failed:', error);
      
      // If online submission fails, save offline
      debugLog('Online submission failed, saving offline');
      return await saveJobOffline(jobData);
    }
  } else {
    // Offline - save locally
    debugLog('Offline - saving locally');
    return await saveJobOffline(jobData);
  }
}

/**
 * Save job for offline sync
 * @param {object} jobData 
 * @returns {Promise<object>}
 */
async function saveJobOffline(jobData) {
  try {
    const localId = await OfflineSync.savePendingJob(jobData);
    
    return {
      success: true,
      localId: localId,
      mode: 'offline',
      message: 'Job saved offline - will sync when connected'
    };
  } catch (error) {
    console.error('[saveJobOffline] Error:', error);
    return {
      success: false,
      error: error.message,
      mode: 'offline'
    };
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  OfflineSync.init().then(() => {
    OfflineSync.setupEventListeners();
  });
});
