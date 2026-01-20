/* ===== GRANNY GEAR WORKSHOP - SERVICE WORKER ===== */

const CACHE_NAME = 'grannygear-v2';
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
    
    if (!parsedUrl.protocol.startsWith('http')) {
        return false;
    }
    
    if (parsedUrl.protocol === 'chrome-extension:' || 
        parsedUrl.protocol === 'moz-extension:' ||
        parsedUrl.protocol === 'safari-extension:') {
        return false;
    }
    
    if (parsedUrl.pathname.startsWith('/api/')) {
        return false;
    }
    
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
    
    if (request.method !== 'GET') {
        return;
    }
    
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
    
    // For static assets - network first, cache fallback for offline
    event.respondWith(
        fetch(request, { redirect: 'follow' })
            .then((response) => {
                // Cache successful responses
                if (response && response.status === 200 && isCacheable(request.url)) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseClone);
                        });
                }
                return response;
            })
            .catch((error) => {
                // Network failed - try cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // If HTML page offline, try the .html version
                        if (request.headers.get('Accept')?.includes('text/html')) {
                            if (!url.pathname.endsWith('.html')) {
                                return caches.match(url.pathname + '.html')
                                    .then(r => r || caches.match('/index.html'));
                            }
                            return caches.match('/index.html');
                        }
                        
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

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
    console.log('Syncing pending jobs...');
}
