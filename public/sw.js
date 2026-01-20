/* ===== GRANNY GEAR WORKSHOP - SERVICE WORKER v7 ===== */

const CACHE_NAME = 'grannygear-v7';
const STATIC_ASSETS = [
    '/',
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
    try {
        const parsedUrl = new URL(url);
        
        if (!parsedUrl.protocol.startsWith('http')) return false;
        if (parsedUrl.pathname.startsWith('/api/')) return false;
        if (parsedUrl.origin !== self.location.origin) return false;
        
        return true;
    } catch (e) {
        return false;
    }
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing v7...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                console.log('[SW] Caching static assets');
                
                for (const url of STATIC_ASSETS) {
                    try {
                        // Fetch without cache to get fresh content
                        const response = await fetch(url, { 
                            cache: 'no-store',
                            redirect: 'follow' 
                        });
                        
                        if (response.ok) {
                            await cache.put(url, response.clone());
                            console.log(`[SW] Cached: ${url}`);
                        } else {
                            console.warn(`[SW] Failed to cache ${url}: ${response.status}`);
                        }
                    } catch (err) {
                        console.warn(`[SW] Error caching ${url}:`, err.message);
                    }
                }
                
                console.log('[SW] Cache complete');
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches and take control immediately
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating v7...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Now controlling all clients');
                return self.clients.claim();
            })
    );
});

// Fetch event - TRUE network-first for HTML, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
    const { request } = event;
    
    // Only handle GET requests
    if (request.method !== 'GET') return;
    
    // Skip non-cacheable URLs
    if (!isCacheable(request.url)) return;
    
    const url = new URL(request.url);
    
    // Skip API calls entirely - let them go direct to network
    if (url.pathname.startsWith('/api/')) {
        return; // Don't intercept, let browser handle normally
    }
    
    // Check if this is an HTML page request
    const isHTMLRequest = request.headers.get('Accept')?.includes('text/html') ||
                          url.pathname === '/' ||
                          url.pathname === '/booking' ||
                          url.pathname === '/cart';
    
    if (isHTMLRequest) {
        // HTML pages: Network-first with cache fallback
        event.respondWith(networkFirstWithCacheFallback(request));
    } else {
        // Static assets: Stale-while-revalidate
        event.respondWith(staleWhileRevalidate(request));
    }
});

// Network-first strategy for HTML pages
async function networkFirstWithCacheFallback(request) {
    const cache = await caches.open(CACHE_NAME);
    
    try {
        console.log('[SW] Fetching (network-first):', request.url);
        
        // Try network with no-cache to avoid 304 issues
        const networkResponse = await fetch(request, {
            cache: 'no-store',
            redirect: 'follow'
        });
        
        // Only use successful responses
        if (networkResponse.ok) {
            console.log('[SW] Network success:', request.url);
            // Cache the fresh response
            cache.put(request, networkResponse.clone()).catch(() => {});
            return networkResponse;
        }
        
        // Network returned error status - try cache
        console.log('[SW] Network error status:', networkResponse.status);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log('[SW] Serving from cache after network error:', request.url);
            return cachedResponse;
        }
        
        // No cache, return the error response
        return networkResponse;
        
    } catch (error) {
        // Network completely failed (offline)
        console.log('[SW] Network failed, trying cache:', request.url);
        
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            console.log('[SW] Serving from cache (offline):', request.url);
            return cachedResponse;
        }
        
        // Try to serve index as fallback for HTML
        const indexResponse = await cache.match('/');
        if (indexResponse) {
            console.log('[SW] Serving index fallback');
            return indexResponse;
        }
        
        // Nothing available
        return new Response('Offline - page not cached', { 
            status: 503,
            headers: { 'Content-Type': 'text/html' }
        });
    }
}

// Stale-while-revalidate for static assets
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Start network fetch in background
    const networkPromise = fetch(request, { cache: 'no-store' })
        .then(response => {
            if (response.ok) {
                cache.put(request, response.clone()).catch(() => {});
            }
            return response;
        })
        .catch(() => null);
    
    // Return cached version immediately if available
    if (cachedResponse) {
        // Update cache in background
        networkPromise;
        return cachedResponse;
    }
    
    // No cache - wait for network
    const networkResponse = await networkPromise;
    if (networkResponse) {
        return networkResponse;
    }
    
    return new Response('Asset not available', { status: 503 });
}

// Handle messages
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data?.type === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME).then(() => {
            console.log('[SW] Cache cleared');
        });
    }
    if (event.data?.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

console.log('[SW] Service Worker script loaded - v7');
