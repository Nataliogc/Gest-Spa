const fs = require('fs');
const path = require('path');

function syncManual(root = path.resolve(__dirname, '..')) {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
    const log = fs.readFileSync(path.join(root, 'REGISTRO_VERSIONES.md'), 'utf8');
    const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const entries = [...log.matchAll(/^### \[v(\d+\.\d+\.\d+)\] - ([^\r\n]+)\r?\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)]
        .map(([, number, date, body]) => ({ number, date, description: body.match(/^- \*\*Descripci[oó]n:\*\* (.+)$/m)?.[1] }))
        .filter(entry => entry.description)
        .sort((a, b) => {
            const av = a.number.split('.').map(Number), bv = b.number.split('.').map(Number);
            return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
        });
    if (!entries.some(entry => entry.number === version.version)) throw new Error('Faltan las novedades de la versión actual en REGISTRO_VERSIONES.md');
    const file = path.join(root, 'manual-usuario.html');
    let html = fs.readFileSync(file, 'utf8');
    if (!html.includes('<!-- AUTO-RELEASES:START -->') || !html.includes('<!-- AUTO-RELEASES:END -->')) throw new Error('Faltan los marcadores del manual');
    const cards = entries.slice(0, 12).map(entry => `<article class="manual-release" style="background:white;padding:12px;border-radius:8px;margin-top:10px"><b>v${escape(entry.number)} · ${escape(entry.date.trim())}</b><p>${escape(entry.description.trim())}</p></article>`).join('\n');
    html = html.replace(/<!-- AUTO-RELEASES:START -->[\s\S]*?<!-- AUTO-RELEASES:END -->/, `<!-- AUTO-RELEASES:START -->\n<h2>Novedades y mejoras</h2>\n${cards}\n<!-- AUTO-RELEASES:END -->`)
        .replace(/(<span id="manual-dynamic-date">)[^<]*(<\/span>)/, `$1Actualizado el ${version.lastUpdated} · v${version.version}$2`);
    fs.writeFileSync(file, html, 'utf8');
    console.log(`[MANUAL] Sincronizado con v${version.version}`);
}

if (require.main === module) syncManual();
module.exports = { syncManual };
