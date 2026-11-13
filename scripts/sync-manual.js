const fs = require('fs');
const path = require('path');

function syncManual(root = path.resolve(__dirname, '..')) {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
    const log = fs.readFileSync(path.join(root, 'REGISTRO_VERSIONES.md'), 'utf8');
    const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    
    const entries = [...log.matchAll(/^### \[v(\d+\.\d+\.\d+)\] - ([^\r\n]+)\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)]
        .map(([, number, date, body]) => ({ 
            number, 
            date, 
            description: body.match(/^- \*\*Descripci[oó]n:\*\* (.+)$/m)?.[1] || [...body.matchAll(/^  - (.+)$/gm)].map(match => match[1]).join(' ') || 'Sin detalle registrado para esta versión.' 
        }))
        .filter(entry => entry.description)
        .sort((a, b) => {
            const av = a.number.split('.').map(Number), bv = b.number.split('.').map(Number);
            return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
        });

    if (!entries.some(entry => entry.number === version.version)) {
        throw new Error('Faltan las novedades de la versión actual en REGISTRO_VERSIONES.md');
    }

    const file = path.join(root, 'manual-usuario.html');
    let html = fs.readFileSync(file, 'utf8');

    // Generar tarjetas de versiones para el Anexo final
    const cards = entries.map(entry => `
        <article class="manual-release" style="background:white; border:1px solid #e2e8f0; padding:14px; border-radius:8px; margin-top:10px;">
            <div style="font-weight:700; color:#1e293b; font-size:0.9rem; margin-bottom:4px;">
                <span style="background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:4px; font-size:0.8rem; margin-right:6px;">v${escape(entry.number)}</span> 
                ${escape(entry.date.trim())}
            </div>
            <p style="margin:0; font-size:0.85rem; color:#475569;">${escape(entry.description.trim())}</p>
        </article>`).join('\n');

    if (html.includes('<!-- AUTO-RELEASES:START -->')) {
        html = html.replace(/<!-- AUTO-RELEASES:START -->[\s\S]*?<!-- AUTO-RELEASES:END -->/, `<!-- AUTO-RELEASES:START -->\n<div style="max-height:480px; overflow-y:auto; padding-right:8px; margin-top:10px;">\n${cards}\n</div>\n<!-- AUTO-RELEASES:END -->`);
    }

    html = html.replace(/(<span id="manual-dynamic-date">)[^<]*(<\/span>)/, `$1Actualizado el ${version.lastUpdated} · v${version.version}$2`);
    html = html.replace(/(<meta name="manual-version" content=")[^"]*(">)/, '$1' + version.version + '$2');

    // Sincronizar guías operativas si existen marcadores
    const guidePath = path.join(root, 'templates', 'manual-paygold.html');
    if (fs.existsSync(guidePath) && html.includes('<!-- AUTO-GUIDES:START -->')) {
        const guide = fs.readFileSync(guidePath, 'utf8');
        html = html.replace(/<!-- AUTO-GUIDES:START -->[\s\S]*?<!-- AUTO-GUIDES:END -->/, '<!-- AUTO-GUIDES:START -->\n' + guide + '\n<!-- AUTO-GUIDES:END -->');
    }

    fs.writeFileSync(file, html, 'utf8');
    console.log(`[MANUAL] Sincronizado con v${version.version}`);
}

if (require.main === module) syncManual();
module.exports = { syncManual };
