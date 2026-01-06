// Service Worker for Zenith Manager PWA
const CACHE_NAME = 'zenith-manager-v9';
const urlsToCache = [
    './',
    './index.html',
    './reservas.html',
    './personal.html',
    './catalogo.html',
    './styles.css',
    './js/app-core.js',
    './js/dashboard.js',
    './js/config.js',
    './js/bonos.js',
    './bonos.html',
    './configuracion.html',
    './personal.js',
    './reservas-staff.js',
    './firebase-config.js',
    './zenith-logo.png',
    './zenith-icon.png',
    './logo-spa.jpg'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.log('Cache install error:', err);
            })
    );
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
            .catch(() => {
                // Fallback for offline
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            })
    );
});
