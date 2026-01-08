/**
 * Generador de PDFs para Bonos Regalo
 * Utiliza jsPDF para generar el PDF programáticamente
 * Diseño PREMIUM "Cumbria Spa" V8 (FINAL CON ICONO IMAGEN)
 * - Icono Sobre: Imagen PNG (Imagenes/icono-sobre.png)
 * - Texto saneado
 * - Items dinámicos
 * - Fallback imágenes robusto
 */

// ... (Auxiliares igual) ...
function parseFechaSegura(input) {
    if (!input) return new Date();
    if (typeof input === 'object' && input.seconds) return new Date(input.seconds * 1000);
    if (input instanceof Date && !isNaN(input)) return input;
    const str = String(input).trim();
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(str)) {
        const parts = str.split(/[\/\-]/);
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    const isoDate = new Date(str);
    if (!isNaN(isoDate)) return isoDate;
    return new Date();
}

function cargarImagen(url) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 4000);
        const img = new Image();
        img.onload = () => {
            clearTimeout(timeout);
            try {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > 2000) {
                    const ratio = 2000 / width;
                    width = 2000;
                    height = height * ratio;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 0.8)); // PNG para transparencia si icon
            } catch (e) { resolve(null); }
        };
        img.onerror = () => { clearTimeout(timeout); resolve(null); };
        img.src = url;
    });
}

function drawVectorLogo(doc, x, y, w, h) {
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    const cx = x + w / 2; const cy = y + h / 2 - 5;
    doc.setDrawColor(191, 164, 111); doc.setLineWidth(0.8); doc.circle(cx, cy, 18);
    doc.setLineWidth(0.3); doc.circle(cx, cy, 16);
    doc.setFont('times', 'bold'); doc.setFontSize(28); doc.setTextColor(26, 43, 60);
    doc.text('CS', cx, cy + 3, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    doc.text('C U M B R I A   B I E N E S T A R', cx, cy + 25, { align: 'center' });
    doc.setDrawColor(191, 164, 111); doc.line(cx - 20, cy + 30, cx + 20, cy + 30);
}

async function generarPDFBono(datos, download = true) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const darkPrimary = '#1a2b3c'; const gold = '#bfa46f';
        const textDark = '#333333'; const textLight = '#666666';

        // CARGA DE RECURSOS (Paralelo)
        // Usamos variables globales pre-cargadas en js/images_data.js si existen
        const mainImagePromise = (typeof MAIN_IMG_B64 !== 'undefined') ? Promise.resolve(MAIN_IMG_B64) : cargarImagen('Imagenes/710.JPG');
        const logoPromise = cargarImagen('logo-spa.jpg');
        const iconPromise = (typeof ICON_B64 !== 'undefined') ? Promise.resolve(ICON_B64) : cargarImagen('Imagenes/icono-sobre.png');

        let [mainImageData, logoData, iconData] = await Promise.all([mainImagePromise, logoPromise, iconPromise]);

        let finalMainImage = mainImageData;
        let useLogoAsMain = false;
        if (!finalMainImage && logoData) {
            finalMainImage = logoData;
            useLogoAsMain = true;
        }

        // === HEADER ===
        doc.setFillColor(darkPrimary); doc.rect(0, 0, 210, 25, 'F');
        doc.setDrawColor(gold); doc.setLineWidth(1); doc.line(0, 24.5, 210, 24.5);
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal'); doc.setFontSize(15);
        doc.text('CUMBRIA SPA & HOTEL', 105, 17, { align: 'center' });

        let y = 35;

        // === ICONO SOBRE (IMAGEN) ===
        // Antes era dibujo vectorial, ahora imagen
        // Tamaño solicitado: "un pelin mas grande que el sobre" (antes 10x7, pondremos 16x11)
        if (iconData) {
            const iw = 40; // Mas ancho para el banner pequeño
            const ih = 26;
            doc.addImage(iconData, 'PNG', 105 - iw / 2, y, iw, ih);
            y += ih + 5;
        } else {
            // Fallback vectorial si no carga la imagen
            doc.setDrawColor(gold); doc.setLineWidth(0.5);
            doc.line(100, y, 110, y); doc.line(100, y + 6, 110, y + 6);
            doc.line(100, y, 100, y + 6); doc.line(110, y, 110, y + 6);
            doc.line(100, y, 105, y + 3); doc.line(110, y, 105, y + 3); doc.line(105, y, 105, y + 6);
            y += 10;
        }

        doc.setFontSize(14); doc.setTextColor(darkPrimary); doc.setFont('helvetica', 'bold');
        doc.text(`¡${datos.nombre || 'Cliente'} te ha regalado un bono!`, 105, y, { align: 'center' });
        y += 6;
        doc.setFontSize(8); doc.setTextColor(textLight); doc.setFont('helvetica', 'normal');
        doc.text('Si necesitamos contactar contigo lo haremos a través del correo electrónico', 105, y, { align: 'center' });
        y += 8;

        // === MENSAJE ===
        const safeQuote = (datos.mensaje || "Disfruta de tu experiencia").replace(/❤/g, '<3');
        doc.setFontSize(10); doc.setTextColor(textDark); doc.setFont('helvetica', 'italic');
        const quoteLines = doc.splitTextToSize(safeQuote, 140);
        const boxHeight = (quoteLines.length * 5) + 10;

        doc.setFillColor(252, 252, 252); doc.roundedRect(30, y, 150, boxHeight, 2, 2, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(gold); doc.text('“', 35, y + 8);
        doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(textDark);
        doc.text(quoteLines, 105, y + 8, { align: 'center' });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(gold);
        doc.text('”', 170, y + 8 + ((quoteLines.length - 1) * 5));
        y += boxHeight + 8;

        // === IMAGEN PRINCIPAL ===
        const imgW = 140; const imgH = 75; const imgX = 35;
        if (finalMainImage) {
            try {
                if (useLogoAsMain) {
                    doc.setFillColor(250, 250, 250); doc.rect(imgX, y, imgW, imgH, 'F');
                    const lw = 60; const lh = 40; const lx = 105 - lw / 2; const ly = y + (imgH - lh) / 2;
                    doc.addImage(finalMainImage, 'JPEG', lx, ly, lw, lh);
                } else {
                    doc.addImage(finalMainImage, 'JPEG', imgX, y, imgW, imgH);
                }
                doc.setDrawColor(240, 240, 240); doc.rect(imgX, y, imgW, imgH);
            } catch (e) { drawVectorLogo(doc, imgX, y, imgW, imgH); }
        } else { drawVectorLogo(doc, imgX, y, imgW, imgH); }
        y += imgH + 8;

        // === CÓDIGO ===
        doc.setDrawColor(gold); doc.setLineWidth(0.4); doc.setLineDashPattern([1, 1], 0);
        doc.roundedRect(70, y, 70, 16, 1, 1); doc.setLineDashPattern([], 0);
        doc.setFontSize(8); doc.setTextColor(textLight); doc.text('CÓDIGO', 105, y + 4, { align: 'center' });
        doc.setFontSize(14); doc.setTextColor(darkPrimary); doc.setFont('helvetica', 'bold');
        doc.text(`${datos.codigo}`, 105, y + 12, { align: 'center' });
        y += 24;

        // === INFO PRODUCTO ===
        doc.setFontSize(14); doc.setTextColor(darkPrimary); doc.setFont('helvetica', 'bold');
        const tit = (datos.producto || 'Experiencia Spa').split(' - ')[0];
        doc.text(tit, 25, y);
        y += 6;

        doc.setFontSize(9); doc.setTextColor(textDark); doc.setFont('helvetica', 'normal');
        // Usar descripción del catálogo si existe, sino genérica
        const desc = datos.descripcion_larga || "Circuito spa completo con tratamientos exclusivos. Disfruta de la máxima relajación y gastronomía en nuestro centro.";
        // LIMPIEZA TEXTO
        const cleanPDFText = (str) => {
            if (!str) return "";
            return String(str).replace(/[^\x20-\x7E\xA0-\xFF\u20AC]/g, "").trim();
        };
        doc.text(doc.splitTextToSize(cleanPDFText(desc), 160), 25, y);
        y += 12;

        // === INCLUYE / DETALLES ===
        const items = datos.items_incluidos || [];
        const itemsHeight = Math.max(25, (items.length * 5) + 15);
        doc.setFillColor(248, 248, 248); doc.rect(20, y, 170, itemsHeight, 'F');

        let iy = y + 6;
        doc.setFontSize(9);

        doc.setFont('helvetica', 'bold'); doc.text('Incluye:', 30, iy);
        doc.setFont('helvetica', 'normal');

        if (items.length > 0) {
            items.forEach((it, idx) => {
                let nombreItem = typeof it === 'string' ? it : (it.name || it.producto || it.nombre || 'Servicio');
                nombreItem = cleanPDFText(nombreItem);
                if (!nombreItem) nombreItem = "Servicio";
                doc.text(`• ${nombreItem}`, 30, iy + 5 + (idx * 5));
            });
        } else {
            doc.text(`• ${cleanPDFText(datos.producto)}`, 30, iy + 5);
        }

        doc.setFont('helvetica', 'bold'); doc.text('Ubicación:', 120, iy);
        doc.setFont('helvetica', 'normal');
        doc.text('Cumbria Bienestar', 120, iy + 5);
        doc.text('Ciudad Real', 120, iy + 10);

        doc.setFont('helvetica', 'bold'); doc.text('Válido hasta:', 120, iy + 18);
        doc.setFont('helvetica', 'normal');
        doc.text(datos.valido_hasta || 'Consultar', 145, iy + 18);


        // === PÁGINA 2 ===
        doc.addPage();
        doc.setFillColor(darkPrimary); doc.rect(0, 0, 210, 15, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(10);
        doc.text('TÉRMINOS Y CONDICIONES', 105, 10, { align: 'center' });

        let y2 = 30;
        doc.setTextColor(darkPrimary); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
        doc.text('Condiciones de Uso', 25, y2);
        doc.setDrawColor(gold); doc.line(25, y2 + 2, 80, y2 + 2);
        y2 += 10;

        doc.setTextColor(textDark); doc.setFontSize(9); doc.setFont('helvetica', 'normal');

        const condicionesTexto = [
            "1. Validez y Caducidad",
            // TEXTO ACTUALIZADO
            "En su bono tiene la fecha de caducidad. Una vez caducado, no podrá realizarse el servicio ni se reembolsará el importe. Si el bono caduca, por cortesía se permitirá su uso hasta el final del mes de vencimiento.",
            "2. Reservas",
            "Es imprescindible reservar cita previa llamando al 926 27 00 04 o en la recepción del Spa. Tenga su bono a mano para facilitar el código. No se aceptan reservas por correo electrónico.",
            "3. Política de Cancelación",
            "Las cancelaciones o modificaciones deben realizarse con al menos 24 horas de antelación. De lo contrario, el bono quedará anulado.",
            "4. Puntualidad",
            "Se ruega máxima puntualidad. En caso de retraso, el tiempo del tratamiento se reducirá para no perjudicar a las citas posteriores, sin reducción de precio.",
            "5. Salud y Normativa",
            "Avise de cualquier condición física, embarazo o alergia al reservar. El acceso al Spa es para mayores de 12 años. El uso de gorro y chanclas es obligatorio.",
            "6. Hotel (si aplica)",
            "Los bonos con estancia están sujetos a la disponibilidad del hotel."
        ];

        condicionesTexto.forEach((texto) => {
            // Limpieza texto condiciones también por seguridad
            const txt = cleanPDFText(texto);
            if (txt.match(/^\d\./)) {
                y2 += 6; doc.setFont('helvetica', 'bold'); doc.text(txt, 25, y2); y2 += 5;
                doc.setFont('helvetica', 'normal');
            } else {
                const lines = doc.splitTextToSize(txt, 160);
                doc.text(lines, 25, y2);
                y2 += (lines.length * 5) + 2;
            }
        });

        doc.setDrawColor(200); doc.line(20, 275, 190, 275);
        doc.setFontSize(8); doc.setTextColor(150);
        doc.text('Cumbria Bienestar · Ciudad Real · www.cumbriabienestar.es', 105, 280, { align: 'center' });

        if (download) doc.save(`bono-${datos.codigo}.pdf`);
        return download ? null : doc.output('blob');

    } catch (e) {
        console.error(e);
        throw e;
    }
}

// ... Resto Wrappers iguales ...
async function descargarBonoPDF(codigoBono, mensajePersonalizado, itemsOverride = null) {
    try {
        const bono = state.bonos.find(b => b.bono === codigoBono);
        if (!bono) throw new Error('Bono no encontrado');
        let fechaCompra = parseFechaSegura(bono.fecha_compra || bono.fecha);
        const fechaValidez = new Date(fechaCompra);
        fechaValidez.setFullYear(fechaValidez.getFullYear() + 1);
        const validoHasta = fechaValidez.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

        let itemsIncluidos = [];
        const sourceItems = (itemsOverride && itemsOverride.length > 0) ? itemsOverride : (bono.items_desglosados || []);

        if (sourceItems.length > 0) {
            itemsIncluidos = sourceItems.map(i => {
                const name = i.name || i.producto || i.nombre || 'Servicio';
                const sessions = parseInt(i.sessions || i.sesiones || 1);
                const pax = parseInt(i.pax || 1);

                let label = name;
                if (sessions > 1) label += ` (${sessions} Sesiones)`;
                if (pax > 1) label += ` x ${pax} Personas`;

                return label;
            });
        } else {
            itemsIncluidos = [bono.producto || 'Experiencia Spa'];
        }

        const datos = {
            codigo: bono.bono || bono.codigo,
            nombre: bono.cliente || 'Cliente',
            producto: bono.producto || 'Experiencia Spa',
            items_incluidos: itemsIncluidos,
            descripcion_larga: bono.descripcion || null,
            valido_hasta: validoHasta,
            mensaje: mensajePersonalizado
        };
        showToast('Generando PDF...', 'info');
        await generarPDFBono(datos, true);
        showToast('PDF generado', 'success');
    } catch (error) { console.error(error); showToast('Error: ' + error.message, 'error'); }
}

async function descargarBonoPDFActual() {
    const c = document.getElementById('vm-code').value;
    const m = document.getElementById('vm-mensaje').value;
    const itemsActuales = (state.editingVoucherItems && state.editingVoucherItems.length > 0) ? state.editingVoucherItems : null;
    if (c) await descargarBonoPDF(c, m, itemsActuales);
}

async function generarBonoPDFParaEmail(codigoBono) { return null; }
