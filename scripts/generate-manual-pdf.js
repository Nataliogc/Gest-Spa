/**
 * scripts/generate-manual-pdf.js
 * Script de automatización para generar o actualizar el PDF del Manual de Usuario
 * Uso: node scripts/generate-manual-pdf.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const htmlFile = path.join(rootDir, 'manual-usuario.html');
const pdfFile = path.join(rootDir, 'Manual_Usuario_Gest_Spa.pdf');

console.log('==================================================');
console.log('GENERANDO MANUAL DE USUARIO EN PDF ACTUALIZADO...');
console.log('Origen:', htmlFile);
console.log('Destino:', pdfFile);
console.log('==================================================');

if (!fs.existsSync(htmlFile)) {
    console.error('Error: No se encontró el archivo HTML del manual en:', htmlFile);
    process.exit(1);
}

// Buscar ejecutables disponibles
const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];

let browserPath = chromePaths.find(p => fs.existsSync(p));

if (!browserPath) {
    console.error('Error: No se encontró Google Chrome o Microsoft Edge en las rutas estándar.');
    process.exit(1);
}

console.log('Utilizando navegador:', browserPath);

try {
    const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
    const cmd = `Start-Process -FilePath '${browserPath}' -ArgumentList '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=\\"${pdfFile}\\"', '${fileUrl}' -Wait`;

    execSync(`powershell -Command "${cmd}"`, { stdio: 'inherit' });

    if (fs.existsSync(pdfFile)) {
        const stats = fs.statSync(pdfFile);
        console.log('✓ PDF generado con éxito!');
        console.log(`Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
        console.log(`Ubicación: ${pdfFile}`);
    } else {
        console.error('Error: El proceso finalizó pero el archivo PDF no fue creado.');
    }
} catch (err) {
    console.error('Error durante la generación del PDF:', err.message);
    process.exit(1);
}
