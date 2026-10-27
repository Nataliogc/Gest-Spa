// Firebase Configuration for Cumbria Bienestar Spa Manager - PRODUCCIÓN
const firebaseConfig = {
    apiKey: "AIzaSyBhEbjopBY41V5rExPbsgkZMQueRIQIk",
    authDomain: "gest-spa.firebaseapp.com",
    projectId: "gest-spa",
    storageBucket: "gest-spa.appspot.com",
    messagingSenderId: "982069965360",
    appId: "1:982069965360:web:f10b51551ed913c506b3f5",
    measurementId: "G-QPSQ57XC27"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
window.db = firebase.firestore();

// Evita errores de conexión en entorno local (file://)
window.db.settings({ experimentalAutoDetectLongPolling: true, merge: true });

console.log("Firebase Initialized - Mode: Dynamic Sync (Long Polling)");

// --- CONTROL DE VERSIÓN GLOBAL ÚNICA ---
window.GEST_SPA_VERSION = 'v2.0.0';
window.GEST_SPA_UPDATE_DATE = '27/10/2026';

function initGlobalVersionBadge() {
    try {
        const existingBadges = document.querySelectorAll('.global-version-badge');
        if (existingBadges.length > 0) {
            existingBadges.forEach(b => {
                b.textContent = window.GEST_SPA_VERSION;
                b.title = `Gest-Spa / Zenith Manager ${window.GEST_SPA_VERSION} (${window.GEST_SPA_UPDATE_DATE})`;
            });
            return;
        }

        const logoImgs = document.querySelectorAll('img[src*="logo-spa"], img[alt*="Cumbria Bienestar"]');
        logoImgs.forEach(img => {
            const parent = img.parentElement;
            if (parent && !parent.querySelector('.global-version-badge')) {
                const badge = document.createElement('span');
                badge.className = 'global-version-badge';
                badge.title = `Gest-Spa / Zenith Manager ${window.GEST_SPA_VERSION} (${window.GEST_SPA_UPDATE_DATE})`;
                badge.textContent = window.GEST_SPA_VERSION;
                img.insertAdjacentElement('afterend', badge);
            }
        });
    } catch (e) {
        console.warn("Version badge render notice:", e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGlobalVersionBadge);
} else {
    initGlobalVersionBadge();
}
