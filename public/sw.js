/* ===== GRANNY GEAR WORKSHOP - SERVICE WORKER ===== */

const CACHE_NAME = 'grannygear-v1';
const STATIC_ASSETS = [
    '/index.html',
    '/booking.html',
    '/cart.html',
    '/css/styles.css',
    '/js/common.js',
    '/js/booking.js',
    '/js/cart.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/favicon-32.png'
];

// Helper function to check if URL is cacheable
function isCacheable(url) {
    const parsedUrl = new URL(url);
    
    // Only cache HTTP/HTTPS URLs from our own origin
    if (!parsedUrl.protocol.startsWith('http')) {
        return false;
    }
    
    // Skip chrome-extension and other special schemes
    if (parsedUrl.protocol === 'chrome-extension:' || 
        parsedUrl.protocol === 'moz-extension:' ||
        parsedUrl.protocol === 'safari-extension:') {
        return false;
    }
    
    // Skip API calls
    if (parsedUrl.pathname.startsWith('/api/')) {
        return false;
    }
    
    // Skip external URLs (optional - only cache same-origin)
    if (parsedUrl.origin !== self.location.origin) {
        return false;
    }
    
    return true;
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((error) => {
                console.error('Cache installation failed:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip non-cacheable URLs
    if (!isCacheable(request.url)) {
        return;
    }
    
    const url = new URL(request.url);
    
    // Skip API calls - always go to network
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request, { redirect: 'follow' })
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Offline - cannot reach server' }),
                        { 
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }
    
    // For static assets - cache first, network fallback
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached version and update in background
                    fetchAndCache(request);
                    return cachedResponse;
                }
                
                // Not in cache - fetch from network
                return fetchAndCache(request);
            })
            .catch((error) => {
                console.error('Fetch error:', error);
                // Offline fallback for HTML pages
                if (request.headers.get('Accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
                return new Response('Offline', { status: 503 });
            })
    );
});

// Helper function to fetch and cache
async function fetchAndCache(request) {
    try {
        // Fetch with proper redirect mode
        const networkResponse = await fetch(request, { 
            redirect: 'follow',
            credentials: 'same-origin'
        });
        
        // Only cache successful responses
        if (networkResponse && networkResponse.status === 200 && isCacheable(request.url)) {
            const responseClone = networkResponse.clone();
            
            // Cache asynchronously without blocking
            caches.open(CACHE_NAME)
                .then((cache) => {
                    cache.put(request, responseClone)
                        .catch((error) => {
                            console.warn('Failed to cache:', request.url, error);
                        });
                })
                .catch((error) => {
                    console.warn('Failed to open cache:', error);
                });
        }
        
        return networkResponse;
    } catch (error) {
        console.error('Network fetch failed:', error);
        
        // Try to serve from cache as fallback
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Last resort - return error
        if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/index.html') || new Response('Offline', { status: 503 });
        }
        
        throw error;
    }
}

// Handle messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('Cache cleared');
        });
    }
});

// Background sync for offline job submissions
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-jobs') {
        event.waitUntil(syncPendingJobs());
    }
});

async function syncPendingJobs() {
    // Get pending jobs from IndexedDB
    // This would be implemented if full offline support is needed
    console.log('Syncing pending jobs...');
}