const CACHE_NAME = 'clawdesk-v3';
const STATIC_ASSETS = [
  '/',
  '/trading',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icons/clawdesk-mark.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Never cache auth-related requests
  if (url.pathname.includes('/api/auth') || 
      url.pathname.includes('/signin') || 
      url.pathname.includes('/signup') ||
      url.pathname.includes('/login')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Network-first for API calls and HTML pages
  if (event.request.url.includes('/api/') || 
      event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Don't cache HTML responses
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache-first for static assets only
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
