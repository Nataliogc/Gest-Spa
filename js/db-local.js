/**
 * db-local.js - Motor de Base de Datos Local (IndexedDB via Dexie.js)
 * Proporciona una capa de persistencia inmediata para evitar bloqueos por cuota de Firestore.
 */

// Variable global para la instancia (accesible via window.dbLocal una vez cargada)
window.dbLocal = null;

let _dbReadyPromise = null;

function initNativeDb() {
    if (window.dbLocal) return window.dbLocal;

    // Check robusto: typeof es seguro para variables no declaradas
    if (typeof Dexie === 'undefined') {
        console.warn("⚠️ initNativeDb: Dexie no está disponible aún. Retornando null.");
        return null;
    }

    try {
        const db = new Dexie("ZenithLocalDB");

        // Definir esquema profesional
        db.version(1).stores({
            bonos: '++id, bono, cliente, email, estado, *searchTokens, updatedAt, syncStatus, lastSyncAt',
            reservas: '++id, date, time, customer, service, syncStatus, updatedAt',
            config: 'key, value'
        });

        window.dbLocal = db;
        console.log("📦 ZenithLocalDB (Dexie) inicializado correctamente.");
        return db;
    } catch (e) {
        console.error("❌ Error inicializando Dexie (pero Dexie existía):", e);
        return null;
    }
}

function ensureDb() {
    // Si ya hay promesa de carga en curso, retornarla
    if (_dbReadyPromise) return _dbReadyPromise;

    // Si Dexie ya existe, intentar inicializar inmediatamente
    if (typeof Dexie !== 'undefined') {
        const db = initNativeDb();
        if (db) {
            _dbReadyPromise = Promise.resolve(db);
            return _dbReadyPromise;
        }
    }

    // Si no, iniciar carga asíncrona del script
    console.log("⏳ Cargando Dexie desde CDN asíncronamente...");
    _dbReadyPromise = new Promise((resolve, reject) => {
        // Doble check por si se cargó mientras iniciábamos
        if (typeof Dexie !== 'undefined') {
            resolve(initNativeDb());
            return;
        }

        const script = document.createElement('script');
        // Usar versión específica (v3) para evitar breaking changes de v4 @latest
        script.src = "https://unpkg.com/dexie@3.2.4/dist/dexie.min.js";

        script.onload = () => {
            console.log("✅ Dexie CDN cargado.");
            resolve(initNativeDb());
        };
        script.onerror = (e) => {
            console.error("❌ Error FATAL cargando Dexie CDN", e);
            reject(e);
        };
        document.head.appendChild(script);
    });

    return _dbReadyPromise;
}

// Iniciar proceso de carga inmediatamente
ensureDb();


// --- UTILIDADES DE BONOS ---
window.apiLocal = {
    async _getDb() {
        return ensureDb();
    },

    // BONOS
    async saveBono(bonoData) {
        const db = await this._getDb();
        if (!db) throw new Error("LocalDB not available");

        // Check if exists by 'bono' to update instead of insert
        // Usamos toArray por si hay duplicados huérfanos que el primer cleanup no pilló
        const existing = await db.bonos.where('bono').equals(bonoData.bono).toArray();

        const data = {
            ...bonoData,
            updatedAt: new Date().toISOString(),
            syncStatus: bonoData.syncStatus || 'pending'
        };

        if (existing.length > 0) {
            data.id = existing[0].id; // Usar el ID del primero para el 'put' (update)

            // Borrar otros duplicados si existen (limpieza en caliente)
            if (existing.length > 1) {
                const idsToDelete = existing.slice(1).map(x => x.id);
                await db.bonos.bulkDelete(idsToDelete);
            }
        }

        return await db.bonos.put(data);
    },

    async getBonos() {
        const db = await this._getDb();
        if (!db) return [];
        return await db.bonos.orderBy('updatedAt').reverse().toArray();
    },

    async getBonoByCode(code) {
        const db = await this._getDb();
        if (!db) return null;
        // Priorizar el más reciente si hay duplicados por código (limpieza reactiva)
        const all = await db.bonos.where('bono').equals(code).toArray();
        if (all.length === 0) return null;
        if (all.length === 1) return all[0];
        return all.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
    },

    // RESERVAS
    async saveReserva(reservaData) {
        const db = await this._getDb();
        if (!db) throw new Error("LocalDB not available");
        const data = {
            ...reservaData,
            updatedAt: new Date().toISOString(),
            syncStatus: reservaData.syncStatus || 'pending'
        };
        return await db.reservas.put(data);
    },

    async getReservasByDate(dateStr) {
        const db = await this._getDb();
        if (!db) return [];
        return await db.reservas.where('date').equals(dateStr).toArray();
    },

    // GENERAL
    async markSynced(table, id, firestoreId) {
        const db = await this._getDb();
        if (!db) return;

        // Dexie update necesita la clave primaria
        // Si 'id' es la clave de Dexie (numérica), bien. 
        // Si 'id' es string (Guid), depende del esquema.
        // Esquema: '++id' (auto-increment numérico). 
        // PERO saveBono hace put(data). Si data tiene id=... lo usa.
        // Asumimos que saveBono recibe {id: 123, ...} si viene de local.

        return await db[table].update(id, {
            syncStatus: 'synced',
            lastSyncAt: new Date().toISOString(),
            firestoreId: firestoreId
        });
    },

    async getPendingSync(table) {
        const db = await this._getDb();
        if (!db) return [];
        return await db[table].where('syncStatus').equals('pending').toArray();
    }
};
