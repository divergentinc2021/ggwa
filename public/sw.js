/* ===== GRANNY GEAR WORKSHOP - SERVICE WORKER ===== */

const CACHE_NAME = 'grannygear-v5';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/booking.html',
    '/cart.html',
    '/booking',
    '/cart',
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

// Install event - cache static assets with redirect following
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                // Use Promise.allSettled to cache individually and continue on failures
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        fetch(url, { redirect: 'follow' })
                            .then(response => {
                                if (response && response.status === 200) {
                                    return cache.put(url, response);
                                }
                                console.warn(`Failed to cache ${url}: status ${response.status}`);
                            })
                            .catch(err => console.warn(`Failed to cache ${url}:`, err.message))
                    )
                );
            })
            .then(() => {
                console.log('Cache installation complete');
                return self.skipWaiting();
            })
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

// Fetch event - network first, cache fallback
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
                        JSON.stringify({ error: 'Offline' }),
                        { status: 503, headers: { 'Content-Type': 'application/json' } }
                    );
                })
        );
        return;
    }
    
    // Network first, cache fallback
    event.respondWith(
        fetch(request, { redirect: 'follow' })
            .then((response) => {
                // Cache successful responses
                if (response && response.status === 200 && isCacheable(request.url)) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone).catch(() => {});
                    });
                }
                return response;
            })
            .catch(() => {
                // Network failed - serve from cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        
                        // HTML offline fallback
                        if (request.headers.get('Accept')?.includes('text/html')) {
                            return caches.match('/');
                        }
                        
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle messages
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data?.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('Cache cleared');
        });
    }
});
