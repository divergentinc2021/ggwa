/* ===== GRANNY GEAR WORKSHOP - COMMON UTILITIES ===== */

// ===== API CONFIGURATION =====
// Try proxy first, fallback to direct Apps Script if proxy fails
const API_PROXY_URL = '/api/proxy';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyhSpACfq5hYN88C4yd7YX7FEpXRjv9gA9gX6Qb9J1qp35B0IOpvl107HcT3KDFXFRx/exec';

// Google Sheets ID and Drive Folder ID (for reference)
const SPREADSHEET_ID = '1LI9lVHqDvCvJDS3gCJDc5L_x4NGf4NSS-7A572h_x2U';
const DRIVE_FOLDER_ID = '1GIaVT0A6AuGvMrgcI047eBqG0HKj4ld_';

// Track if proxy is available
let useProxy = true;

// ===== LOADING OVERLAY =====
function showLoading(show = true) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('active', show);
    }
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== DATE UTILITIES =====
function formatDate(date) {
    return date.toLocaleDateString('en-ZA', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateTime(date) {
    return date.toLocaleDateString('en-ZA', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60);
    
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
}

// ===== VALIDATION UTILITIES =====
function validateEmail(email) {
    const pattern = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
}

function validatePhone(phone) {
    const digitsOnly = phone.replace(/\s/g, '');
    const pattern = /^0[0-9]{9}$/;
    return pattern.test(digitsOnly);
}

function formatPhoneNumber(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    if (value.length > 10) {
        value = value.substring(0, 10);
    }
    if (value.length > 6) {
        value = value.substring(0, 3) + ' ' + value.substring(3, 6) + ' ' + value.substring(6);
    } else if (value.length > 3) {
        value = value.substring(0, 3) + ' ' + value.substring(3);
    }
    input.value = value;
}

// ===== API CALLS (with automatic fallback) =====
/**
 * Make API calls with automatic proxy/direct fallback
 * @param {string} action - The action to call (verifyPin, createJob, getJobs, etc.)
 * @param {object} data - The data to send
 * @returns {Promise<object>} - The response
 */
async function apiCall(action, data = {}) {
    const payload = {
        action: action,
        ...data
    };
    
    // Try proxy first if enabled
    if (useProxy) {
        try {
            const response = await fetch(API_PROXY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                return response.json();
            }
            
            // Proxy failed - try direct connection
            console.warn('Proxy failed, falling back to direct Apps Script');
            useProxy = false;
        } catch (error) {
            console.warn('Proxy not available, using direct Apps Script:', error.message);
            useProxy = false;
        }
    }
    
    // Direct Apps Script call (fallback or default)
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain', // Apps Script requires this for CORS
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        return response.json();
    } catch (error) {
        console.error('Direct API call failed:', error);
        throw new Error(`Connection failed: ${error.message}`);
    }
}

// ===== OFFLINE DETECTION =====
function updateOnlineStatus() {
    const banner = document.getElementById('offlineBanner');
    if (banner) {
        banner.classList.toggle('active', !navigator.onLine);
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// ===== PWA INSTALLATION =====
let deferredPrompt = null;

function initPWA() {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered:', registration.scope);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    }
    
    // Handle install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Check if user has dismissed before
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        if (!dismissed) {
            showInstallBanner();
        }
    });
    
    // Handle successful install
    window.addEventListener('appinstalled', () => {
        console.log('PWA installed');
        hideInstallBanner();
        deferredPrompt = null;
    });
    
    // Check initial online status
    updateOnlineStatus();
}

function showInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner && deferredPrompt) {
        banner.classList.add('active');
    }
}

function hideInstallBanner() {
    const banner = document.getElementById('pwaInstallBanner');
    if (banner) {
        banner.classList.remove('active');
    }
}

async function installPWA() {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log('Install outcome:', outcome);
    deferredPrompt = null;
    hideInstallBanner();
}

function dismissPWABanner() {
    hideInstallBanner();
    localStorage.setItem('pwa_install_dismissed', 'true');
}

// ===== LOCAL STORAGE UTILITIES =====
function saveToLocal(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('LocalStorage save error:', e);
        return false;
    }
}

function loadFromLocal(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('LocalStorage load error:', e);
        return null;
    }
}

function removeFromLocal(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error('LocalStorage remove error:', e);
        return false;
    }
}

// ===== SESSION MANAGEMENT =====
function checkOperatorAuth() {
    const auth = sessionStorage.getItem('gg_operator_auth');
    const authTime = sessionStorage.getItem('gg_auth_time');
    
    // Session expires after 8 hours
    if (auth === 'true' && authTime) {
        const elapsed = Date.now() - parseInt(authTime);
        const eightHours = 8 * 60 * 60 * 1000;
        
        if (elapsed < eightHours) {
            return true;
        } else {
            // Expired
            sessionStorage.removeItem('gg_operator_auth');
            sessionStorage.removeItem('gg_auth_time');
        }
    }
    return false;
}

function setOperatorAuth() {
    sessionStorage.setItem('gg_operator_auth', 'true');
    sessionStorage.setItem('gg_auth_time', Date.now().toString());
}

function clearOperatorAuth() {
    sessionStorage.removeItem('gg_operator_auth');
    sessionStorage.removeItem('gg_auth_time');
}

// ===== FORM DATA UTILITIES =====
function collectFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    
    const formData = new FormData(form);
    const data = {};
    
    formData.forEach((value, key) => {
        data[key] = value;
    });
    
    return data;
}

// ===== MECHANICS LIST =====
const MECHANICS = ['Mike', 'Johan', 'Sipho', 'Thandi'];

// ===== SERVICE CHECKLIST ITEMS =====
const SERVICE_CHECKLIST = {
    stage1: [
        { id: 'chk1', label: 'Check drivetrain wear' },
        { id: 'chk2', label: 'Re-lube chain & adjust all working parts' },
        { id: 'chk3', label: 'Check & adjust brakes' },
        { id: 'chk4', label: 'Check & adjust gears' },
        { id: 'chk5', label: 'Check headset' },
        { id: 'chk6', label: 'Check bottom bracket for minor adjustment' },
        { id: 'chk7', label: 'Minor true of wheels' },
        { id: 'chk8', label: 'Check tyre pressure & condition' },
        { id: 'chk9', label: 'Check seat clamp tension' },
        { id: 'chk10', label: 'Check head stem tension' },
        { id: 'chk11', label: 'Check wheel nuts, quick releases or thru-axles' },
        { id: 'chk12', label: 'Check all accessory mounting bolts' },
        { id: 'chk13', label: 'Check pedal axles' },
        { id: 'chk14', label: 'Check crank bolts' },
        { id: 'chk15', label: 'Check suspension/pivot bolts' },
        { id: 'chk16', label: 'Test ride' },
        { id: 'chk17', label: 'Clean & de-grease bike' }
    ],
    stage2: [
        { id: 'chk18', label: 'Remove wheel axles, re-grease & replace' },
        { id: 'chk19', label: 'Remove headset bearings, re-grease & replace' },
        { id: 'chk20', label: 'Remove, replace & adjust brake cables - inner/outer cables inc' },
        { id: 'chk21', label: 'Remove, replace & adjust gear cables - inner/outer cables inc' },
        { id: 'chk22', label: 'Remove pedal axles & re-lube' },
        { id: 'chk23', label: 'Bleed brakes Front & Rear' },
        { id: 'chk24', label: 'Wrap new bar tape - bar tape not included' },
        { id: 'chk25', label: 'Fork Service (Basic)' },
        { id: 'chk26', label: 'Shock Service (air can)' },
        { id: 'chk27', label: 'Tyre sealant top-up' }
    ]
};

// Service type preset selections
const SERVICE_PRESETS = {
    'Basic': [1, 2, 3, 4, 5, 8, 16],
    'Standard': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    'Major': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 27],
    'Pre-Race': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 23, 25, 26, 27]
};

// ===== BIKE BRANDS =====
const BIKE_BRANDS = [
    'Specialized', 'Trek', 'Giant', 'Cannondale', 'Scott',
    'Merida', 'Santa Cruz', 'Pivot', 'BMC', 'Other'
];