const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function padZero(n) {
    return n < 10 ? '0' + n : String(n);
}

function getTodayFormatted() {
    const d = new Date();
    return `${padZero(d.getDate())}/${padZero(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function getTodayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

function getChangedFiles() {
    try {
        const out = execSync('git status --porcelain', { encoding: 'utf8' });
        const files = out.split('\n')
            .filter(line => line.length > 3)
            .map(line => line.slice(3).trim())
            .filter(f => !f.startsWith('REGISTRO_') && !f.endsWith('.log') && !f.startsWith('.gemini'));
        return Array.from(new Set(files));
    } catch {
        return [];
    }
}

function run() {
    const type = process.argv[2] || 'patch'; // patch, minor, major
    const customDesc = process.argv[3] || 'Mejora continua del sistema Gest-Spa';
    const rootDir = path.resolve(__dirname, '..');
    const registroPath = path.join(rootDir, 'REGISTRO_VERSIONES.md');

    if (!fs.existsSync(registroPath)) {
        console.error('No se encontró REGISTRO_VERSIONES.md en', registroPath);
        process.exit(1);
    }

    let registroContent = fs.readFileSync(registroPath, 'utf8');

    // 1. Extraer versión actual
    const versionMatch = registroContent.match(/\|\s*\*\*Versión Global del Sistema\*\*\s*\|\s*\*\*`v(\d+)\.(\d+)\.(\d+)`\*\*/);
    if (!versionMatch) {
        console.error('No se pudo encontrar la versión actual en REGISTRO_VERSIONES.md');
        process.exit(1);
    }

    let major = parseInt(versionMatch[1], 10);
    let minor = parseInt(versionMatch[2], 10);
    let patch = parseInt(versionMatch[3], 10);

    if (type === 'major') {
        major += 1;
        minor = 0;
        patch = 0;
    } else if (type === 'minor') {
        minor += 1;
        patch = 0;
    } else {
        patch += 1;
    }

    const currentVersionStr = `v${versionMatch[1]}.${versionMatch[2]}.${versionMatch[3]}`;
    const newVersionStr = `v${major}.${minor}.${patch}`;
    const dateFormatted = getTodayFormatted();

    console.log(`[BUMP-VERSION] Gest-Spa: Incrementando versión: ${currentVersionStr} -> ${newVersionStr} (${dateFormatted})`);

    // 2. Archivos modificados
    const changedFiles = getChangedFiles();
    const changedFilesStr = changedFiles.length > 0 
        ? changedFiles.map(f => `\`${f}\``).join(', ') 
        : 'Módulos del sistema';

    // 3. Actualizar REGISTRO_VERSIONES.md cabecera
    registroContent = registroContent.replace(
        /(\|\s*\*\*Versión Global del Sistema\*\*\s*\|\s*\*\*`)v\d+\.\d+\.\d+(`\*\*)/,
        `$1${newVersionStr}$2`
    );
    registroContent = registroContent.replace(
        /(\|\s*\*\*Fecha de Última Actualización\*\*\s*\|\s*\*\*)[^\*]+(\*\*)/,
        `$1${dateFormatted}$2`
    );

    // 4. Insertar entrada en historial si existe sección
    const historyMarker = '## 📝 Historial Unificado de Versiones\n\n';
    const newEntry = `### [${newVersionStr}] - ${dateFormatted}\n- **Tipo:** ${type.toUpperCase()}\n- **Archivos:** ${changedFilesStr}\n- **Descripción:** ${customDesc}\n\n`;

    if (registroContent.includes(historyMarker)) {
        registroContent = registroContent.replace(historyMarker, historyMarker + newEntry);
    } else {
        registroContent += `\n${newEntry}`;
    }

    fs.writeFileSync(registroPath, registroContent, 'utf8');
    console.log(`[BUMP-VERSION] REGISTRO_VERSIONES.md actualizado.`);

    // 4.1 Sincronizar version.json y package.json
    const vJsonPath = path.join(rootDir, 'version.json');
    if (fs.existsSync(vJsonPath)) {
        fs.writeFileSync(vJsonPath, JSON.stringify({ version: `${major}.${minor}.${patch}`, lastUpdated: dateFormatted }, null, 2), 'utf8');
    }
    const pkgJsonPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            pkg.version = `${major}.${minor}.${patch}`;
            fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2), 'utf8');
        } catch (e) {
            console.warn('[BUMP-VERSION] Error actualizando package.json:', e);
        }
    }

    // 4.2 Sincronizar firebase-config.js
    const fbConfigPath = path.join(rootDir, 'firebase-config.js');
    if (fs.existsSync(fbConfigPath)) {
        try {
            let fbContent = fs.readFileSync(fbConfigPath, 'utf8');
            fbContent = fbContent.replace(/window\.GEST_SPA_VERSION\s*=\s*['"][^'"]+['"];/, `window.GEST_SPA_VERSION = '${newVersionStr}';`);
            fbContent = fbContent.replace(/window\.GEST_SPA_UPDATE_DATE\s*=\s*['"][^'"]+['"];/, `window.GEST_SPA_UPDATE_DATE = '${dateFormatted}';`);
            fs.writeFileSync(fbConfigPath, fbContent, 'utf8');
            console.log(`[BUMP-VERSION] firebase-config.js sincronizado a ${newVersionStr}.`);
        } catch (e) {
            console.warn('[BUMP-VERSION] Error actualizando firebase-config.js:', e);
        }
    }

    // 5. Actualizar todos los archivos .html que contienen global-version-badge
    const files = fs.readdirSync(rootDir);
    let countHtml = 0;

    files.forEach(file => {
        if (!file.endsWith('.html')) return;
        const fullPath = path.join(rootDir, file);
        let html = fs.readFileSync(fullPath, 'utf8');

        let modified = false;
        // Reemplazar badge de version
        const badgeRegex = /(class="global-version-badge"[^>]*>)[^<]*(<\/span>)/g;
        if (badgeRegex.test(html)) {
            html = html.replace(badgeRegex, `$1${newVersionStr}$2`);
            modified = true;
        }

        // Reemplazar title con versión
        const titleRegex = /(title="Gest-Spa \/ Zenith Manager\s+)v\d+\.\d+\.\d+(\s*\([^)]*\)")/g;
        if (titleRegex.test(html)) {
            html = html.replace(titleRegex, `$1${newVersionStr} (${dateFormatted})"`);
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(fullPath, html, 'utf8');
            countHtml++;
        }
    });

    console.log(`[BUMP-VERSION] ✅ ${countHtml} archivos HTML actualizados con la versión ${newVersionStr}.`);
}

run();
