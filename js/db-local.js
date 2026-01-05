/**
 * db-local.js - Motor de Base de Datos Local (IndexedDB via Dexie.js)
 * Proporciona una capa de persistencia inmediata para evitar bloqueos por cuota de Firestore.
 */

// Importar Dexie desde CDN si no existe
if (typeof Dexie === 'undefined') {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/dexie@latest/dist/dexie.js";
    document.head.appendChild(script);
}

const dbLocal = new Dexie("ZenithLocalDB");

// Definir esquema profesional
dbLocal.version(1).stores({
    bonos: '++id, bono, cliente, email, estado, *searchTokens, updatedAt, syncStatus, lastSyncAt',
    reservas: '++id, date, time, customer, service, syncStatus, updatedAt',
    config: 'key, value'
});


// --- UTILIDADES DE BONOS ---
window.apiLocal = {
    // BONOS
    async saveBono(bonoData) {
        const data = {
            ...bonoData,
            updatedAt: new Date().toISOString(),
            syncStatus: bonoData.syncStatus || 'pending'
        };
        return await dbLocal.bonos.put(data);
    },

    async getBonos() {
        return await dbLocal.bonos.orderBy('updatedAt').reverse().toArray();
    },

    async getBonoByCode(code) {
        return await dbLocal.bonos.where('bono').equals(code).first();
    },

    // RESERVAS
    async saveReserva(reservaData) {
        const data = {
            ...reservaData,
            updatedAt: new Date().toISOString(),
            syncStatus: reservaData.syncStatus || 'pending'
        };
        return await dbLocal.reservas.put(data);
    },

    async getReservasByDate(dateStr) {
        return await dbLocal.reservas.where('date').equals(dateStr).toArray();
    },

    // GENERAL
    async markSynced(table, id, firestoreId) {
        return await dbLocal[table].update(id, {
            syncStatus: 'synced',
            lastSyncAt: new Date().toISOString(),
            firestoreId: firestoreId
        });
    },

    async getPendingSync(table) {
        return await dbLocal[table].where('syncStatus').equals('pending').toArray();
    }
};

console.log("📦 ZenithLocalDB (Dexie) inicializado.");
