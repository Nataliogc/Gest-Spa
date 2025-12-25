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
window.db.settings({ experimentalForceLongPolling: true });

console.log("Firebase Initialized - Mode: Dynamic Sync (Long Polling)");
