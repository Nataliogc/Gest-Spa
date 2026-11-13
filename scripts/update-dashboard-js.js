const fs = require('fs');

let content = fs.readFileSync('js/dashboard.js', 'utf8');

const target = `        // 8. SIN CARGO / GRATUITA\r\n        else if (totalPrice === 0 || c.sin_cargo) {`;

const replacement = `        // 8. PAQUETE / PACK ORIGEN (Tratamiento incluido dentro de un paquete)\r\n        const packOriginName = c.pack_origen || c.parent_service || c.pack_name\r\n            || (c.is_pack_element && c.parent_name)\r\n            || ((window.SpaServiceCatalog && typeof window.SpaServiceCatalog.findParentPacks === 'function')\r\n                ? window.SpaServiceCatalog.findParentPacks(c.servicio, window.allServices || [], window.SPA_PACKS_REGISTRY)[0]\r\n                : null);\r\n        const isPackIncluded = !!(c.is_pack_element || c.parent_id || c.pack_origen || (totalPrice === 0 && packOriginName));\r\n\r\n        if (isPackIncluded) {\r\n            const packTitle = packOriginName || 'Pack multiservicio';\r\n            paymentBadgeHtml = \`\r\n                <span title="Tratamiento incluido en paquete: \${packTitle}" style="display:inline-flex; align-items:center; gap:3px; background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:2px 6px; border-radius:6px; font-size:0.68rem; font-weight:700; white-space:nowrap;">\r\n                    <i class="fas fa-box" style="color:#ea580c;"></i> PACK · \${packTitle}\r\n                </span>\`;\r\n        }\r\n        // 9. SIN CARGO / GRATUITA\r\n        else if (totalPrice === 0 || c.sin_cargo) {`;

if (!content.includes(target)) {
    console.error('Target not found in js/dashboard.js');
    process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync('js/dashboard.js', content, 'utf8');
console.log('Successfully updated js/dashboard.js');
