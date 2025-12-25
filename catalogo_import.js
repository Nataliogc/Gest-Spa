// -----------------------------------------------------------------------------
// SCRIPT DE IMPORTACIÓN DE CATÁLOGO 2025 (Fuente Maestra)
// -----------------------------------------------------------------------------
// Adaptado del objeto CATALOGO proporcionado por el usuario.

const RAW_CATALOGO = [
    /* =========================
       SPA · CIRCUITO
    ========================= */
    { categoria: "Spa", subcategoria: "Circuito", nombre: "Circuito SPA", duracion: "60 min", precio: 25, descripcion: "Circuito de hidroterapia con contrastes de temperatura, chorros a presión, sauna y baño de vapor." },
    { categoria: "Spa", subcategoria: "Bonos", nombre: "Bono 5 Circuitos SPA", duracion: "60 min", precio: 110, descripcion: "Bono de cinco accesos al circuito spa." },
    { categoria: "Spa", subcategoria: "Bonos", nombre: "Bono 10 Circuitos SPA", duracion: "60 min", precio: 190, descripcion: "Bono de diez accesos al circuito spa." },

    /* =========================
       PROGRAMAS PARA COMPARTIR
    ========================= */
    { categoria: "Programas", subcategoria: "Suite Spa", nombre: "Suite SPA Privada", duracion: "60 min", precio: 100, descripcion: "Spa privado con hidromasaje, cascada de agua, sauna, baño de vapor y zona relax.", personas: "1-2" },
    { categoria: "Programas", subcategoria: "Parejas", nombre: "Encuentro Romántico", duracion: "90 min", precio: 150, descripcion: "Suite spa privada y masaje corporal de 30 minutos para dos personas.", personas: 2 },
    { categoria: "Programas", subcategoria: "Balneoterapia", nombre: "Relax Oriental", duracion: "90 min", precio: 50, descripcion: "Baño de hidromasaje con cromoterapia y masaje relajante.", personas: 1 },
    { categoria: "Programas", subcategoria: "Balneoterapia", nombre: "Relax Oriental (2 personas)", duracion: "90 min", precio: 90, descripcion: "Baño de hidromasaje con cromoterapia y masaje relajante.", personas: 2 },

    /* =========================
       COMPLEMENTOS
    ========================= */
    { categoria: "Complementos", nombre: "Plato de fruta", precio: 20 },
    { categoria: "Complementos", nombre: "Botella de cava", precio: 20 },
    { categoria: "Complementos", nombre: "Botella de vino", precio: 20 },
    { categoria: "Complementos", nombre: "Benjamín", precio: 10 },
    { categoria: "Complementos", nombre: "Vino 3/4", precio: 10 },
    { categoria: "Complementos", nombre: "Ramo de flores", precio: 30 },

    /* =========================
       EXPERIENCIAS
    ========================= */
    { categoria: "Experiencias", nombre: "Experiencia Relax Total", duracion: "90 min", precio: 50, descripcion: "Circuito spa más masaje de 30 minutos.", personas: 1 },
    { categoria: "Experiencias", nombre: "Especial Parejas", duracion: "120 min", precio: 150, descripcion: "Envoltura corporal, masaje craneo-facial, masaje corporal completo y circuito spa.", personas: 2 },
    { categoria: "Experiencias", nombre: "SPA y Sabores", duracion: "60 min", precio: 45, descripcion: "Circuito spa más comida o cena en restaurante.", personas: 1 },

    /* =========================
       PROGRAMAS CON ALOJAMIENTO
    ========================= */
    { categoria: "Alojamiento", nombre: "Sueño para Dos", precio: 140, descripcion: "Alojamiento, circuito spa, cena y desayuno.", personas: 2 },
    { categoria: "Alojamiento", nombre: "Fantasía para Dos", precio: 165, descripcion: "Alojamiento, circuito spa, masaje VIP 30 minutos y desayuno.", personas: 2 },
    { categoria: "Alojamiento", nombre: "Aventura para Dos", precio: 190, descripcion: "Alojamiento, suite spa privada, cava y desayuno.", personas: 2 },

    /* =========================
       RITUALES CORPORALES
    ========================= */
    { categoria: "Rituales", nombre: "Indian Ritual", precio: 110 },
    { categoria: "Rituales", nombre: "Amazonian Discovery", precio: 100 },
    { categoria: "Rituales", nombre: "Asian Journey (ella)", precio: 90 },
    { categoria: "Rituales", nombre: "Asian Journey (él)", precio: 90 },
    { categoria: "Rituales", nombre: "Chocolaterapia", precio: 110 },
    { categoria: "Rituales", nombre: "Baño Cítrico", precio: 120 },

    /* =========================
       MASAJES
    ========================= */
    { categoria: "Masajes", nombre: "Masaje Relax 30'", precio: 32 },
    { categoria: "Masajes", nombre: "Masaje Relax 60'", precio: 52 },
    { categoria: "Masajes", nombre: "Masaje a 4 manos 60'", precio: 90 },
    { categoria: "Masajes", nombre: "Masaje en Pareja 30'", precio: 75 },
    { categoria: "Masajes", nombre: "Masaje en Pareja 60'", precio: 115 },
    { categoria: "Masajes", nombre: "Quiromasaje Espalda 30'", precio: 40 },
    { categoria: "Masajes", nombre: "Piernas Cansadas 30'", precio: 35 },
    { categoria: "Masajes", nombre: "Cráneo-facial y espalda 30'", precio: 35 },
    { categoria: "Masajes", nombre: "Masaje Pomaikai 30'", precio: 40 },
    { categoria: "Masajes", nombre: "Masaje Balinés 30'", precio: 40 },
    { categoria: "Masajes", nombre: "Masaje Bambú 30'", precio: 40 },
    { categoria: "Masajes", nombre: "Masaje Piedras Volcánicas 30'", precio: 45 },

    /* =========================
       ENVOLTURAS
    ========================= */
    { categoria: "Envolturas", nombre: "Vitamina C", precio: 40 },
    { categoria: "Envolturas", nombre: "Cereza", precio: 35 },
    { categoria: "Envolturas", nombre: "Chocolate", precio: 35 },
    { categoria: "Envolturas", nombre: "Oro", precio: 40 },

    /* =========================
       BELLEZA FACIAL
    ========================= */
    { categoria: "Facial", nombre: "Higiene facial básica", precio: 40 },
    { categoria: "Facial", nombre: "Higiene facial con ultrasonidos", precio: 40 },
    { categoria: "Facial", nombre: "Higiene facial The Cure", precio: 70 },
    { categoria: "Facial", nombre: "Timexpert Hydraluronic", precio: 65 },
    { categoria: "Facial", nombre: "Citrus Vita-Essence", precio: 65 },

    /* =========================
       TECNOLOGÍA ESTÉTICA
    ========================= */
    { categoria: "Radiofrecuencia", nombre: "RF Dual Pro (sesión)", precio: 49.9 },
    { categoria: "Radiofrecuencia", nombre: "RF Dual Pro Bono 5+1", precio: 250 },
    { categoria: "Corporal", nombre: "Radiofrecuencia corporal (sesión)", precio: 49.9 },
    { categoria: "Corporal", nombre: "Radiofrecuencia corporal Bono 5+1", precio: 250 },

    /* =========================
       PRESOTERAPIA
    ========================= */
    { categoria: "Presoterapia", nombre: "Sesión", precio: 15 },
    { categoria: "Presoterapia", nombre: "Bono 5", precio: 60 },
    { categoria: "Presoterapia", nombre: "Bono 10", precio: 100 },

    /* =========================
       IMAGEN Y ESTÉTICA
    ========================= */
    { categoria: "Fotodepilación", nombre: "Brazos", precio: 35 },
    { categoria: "Fotodepilación", nombre: "Zonas pequeñas", precio: 20 },
    { categoria: "Fotodepilación", nombre: "Abdomen / glúteos / ingles / axilas", precio: 30 },
    { categoria: "Fotodepilación", nombre: "Pecho o espalda", precio: 40 },
    { categoria: "Fotodepilación", nombre: "Medias piernas", precio: 35 },
    { categoria: "Fotodepilación", nombre: "Piernas enteras", precio: 60 },

    { categoria: "Rayos UVA", nombre: "Sesión", precio: 4.5 },
    { categoria: "Rayos UVA", nombre: "Bono 10", precio: 40 },

    { categoria: "Maquillaje", nombre: "Novia", precio: 95 },
    { categoria: "Maquillaje", nombre: "Día", precio: 25 },
    { categoria: "Maquillaje", nombre: "Fiesta", precio: 35 },
    { categoria: "Maquillaje", nombre: "Novias", precio: 50 },
    { categoria: "Maquillaje", nombre: "Hombre", precio: 20 },

    { categoria: "Manicura", nombre: "Básica", precio: 12 },
    { categoria: "Manicura", nombre: "Parafina", precio: 25 },
    { categoria: "Manicura", nombre: "Francesa", precio: 16 },
    { categoria: "Pedicura", nombre: "Básica", precio: 20 },
    { categoria: "Pedicura", nombre: "Francesa", precio: 25 }
];

// Función Helper para mapear categorías del usuario a las del sistema (App.js)
function mapearCategoria(item) {
    const cat = item.categoria.toLowerCase();
    const sub = (item.subcategoria || "").toLowerCase();
    const nombre = item.nombre.toLowerCase();

    // 1. SPA / CIRCUITOS
    if (cat === 'spa') {
        if (sub === 'bonos') return 'bono_circuito';
        return 'circuito';
    }

    // 2. PROGRAMAS / PAREJAS / SUITES
    if (cat === 'programas') {
        if (sub.includes('suite') || item.nombre.includes('Suite')) return 'suite_privada';
        if (sub.includes('parejas') || item.nombre.includes('Parejas') || item.personas === 2) return 'pack_pareja';
        return 'suite_privada'; // Fallback
    }

    // 3. EXPERIENCIAS
    if (cat === 'experiencias') {
        if (nombre.includes('sabores')) return 'pack_comida';
        if (nombre.includes('parejas')) return 'pack_pareja';
        return 'suite_privada'; // Relax Total
    }

    // 4. ALOJAMIENTO
    if (cat === 'alojamiento') return 'pack_hotel';

    // 5. TRATAMIENTOS DE BELLEZA
    if (cat === 'rituales') return 'ritual';
    if (cat === 'masajes') return 'masaje';
    if (cat === 'envolturas') return 'envoltura';

    // 6. FACIAL / CORPORAL
    if (cat === 'facial') return 'facial';
    if (cat === 'radiofrecuencia') return 'facial'; // RF Dual suele ser facial, pero validamos
    if (cat === 'corporal') return 'corporal';
    if (cat === 'presoterapia') return 'corporal';

    // 7. DEPILACIÓN / UVA
    if (cat === 'fotodepilación') return 'depilacion';
    if (cat === 'rayos uva') return 'uva';

    // 8. ESTETICA
    if (cat === 'maquillaje') return 'maquillaje';
    if (cat === 'manicura' || cat === 'pedicura') return 'manicura';

    // 9. COMPLEMENTOS
    if (cat === 'complementos') return 'complemento';

    return 'otros';
}

function parseDuracion(duracionStr) {
    if (!duracionStr) return 0;
    if (typeof duracionStr === 'number') return duracionStr;
    const match = duracionStr.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

// Generar array final para Firestore
const datosCatalogo = RAW_CATALOGO.map(item => ({
    nombre: item.nombre,
    precio: item.precio,
    duracion: parseDuracion(item.duracion),
    categoria: mapearCategoria(item),
    descripcion: item.descripcion || "",
    // Campos extra opcionales que podríamos guardar
    raw_category: item.categoria,
    raw_subcategory: item.subcategoria
}));

async function importarCatalogo() {
    if (!confirm(`¿RE-IMPORTAR Catálogo MAESTRO usando la nueva estructura (${datosCatalogo.length} items)?`)) return;

    console.log("Iniciando importación maestra...", datosCatalogo);
    const status = document.getElementById("import-status");
    if (status) { status.style.display = "block"; status.textContent = "⏳ Procesando datos maestros..."; }

    const batch = db.batch();
    let count = 0;
    const createdIds = new Set();

    const cleanId = (str) => str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    datosCatalogo.forEach(item => {
        let id = cleanId(item.nombre);
        // Evitar duplicados de ID si hay nombres idénticos
        if (createdIds.has(id)) { id = id + '-' + count; }
        createdIds.add(id);

        const docRef = db.collection("spa_services").doc(id);

        batch.set(docRef, {
            ...item,
            active: true,
            last_updated: new Date().toISOString()
        });
        count++;
    });

    try {
        await batch.commit();
        const msg = `✅ Éxito: ${count} servicios sincronizados con la Fuente Maestra.`;
        console.log(msg);
        if (status) status.textContent = msg;
        alert(msg);
        if (typeof cargarCatalogoFirestore === 'function') cargarCatalogoFirestore();
    } catch (err) {
        console.error("❌ ERROR importando:", err);
        if (status) status.textContent = "❌ Error: " + err.message;
        alert("Error al importar. Ver consola.");
    }
}
