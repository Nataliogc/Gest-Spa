(function () {
    const progress = document.getElementById('manual-load-progress');
    const status = document.getElementById('manual-load-status');
    const badge = document.getElementById('manual-version-status');
    const retry = document.getElementById('manual-load-retry');
    const update = document.getElementById('manual-load-update');
    const localVersion = document.querySelector('meta[name="manual-version"]').content;
    let checking = false;
    async function checkVersion() {
        if (checking) return;
        checking = true;
        retry.hidden = true;
        update.hidden = true;
        progress.value = 1;
        status.textContent = '1/3 · Contenido cargado. Comprobando historial…';
        badge.textContent = 'COMPROBANDO';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const count = document.querySelectorAll('.manual-release').length;
            if (!count) throw new Error('Historial no disponible');
            progress.value = 2;
            status.textContent = `2/3 · ${count} actualizaciones cargadas. Comprobando versión publicada…`;
            const response = await fetch('version.json', { cache: 'no-store', signal: controller.signal });
            if (!response.ok) throw new Error('No se pudo consultar la versión');
            const remote = await response.json();
            if (!/^\d+\.\d+\.\d+$/.test(remote.version)) throw new Error('Versión no válida');
            progress.value = 3;
            if (remote.version === localVersion) {
                badge.textContent = 'VERSIÓN COMPROBADA';
                status.textContent = `3/3 · Manual cargado y comprobado · v${localVersion} · ${count} actualizaciones registradas.`;
            } else {
                badge.textContent = 'VERSIONES DIFERENTES';
                status.textContent = `3/3 · Esta copia es v${localVersion}; la aplicación publica v${remote.version}. Recarga el manual para comprobar la actualización.`;
                const url = new URL(window.location.href);
                url.searchParams.set('v', remote.version);
                url.searchParams.set('reload', Date.now());
                update.href = url.href;
                update.textContent = 'Cargar manual publicado';
                update.hidden = false;
            }
        } catch (error) {
            badge.textContent = 'SIN VERIFICAR';
            status.textContent = `Manual v${localVersion} disponible. No se ha podido comprobar la actualización. Revisa la conexión y reintenta.`;
            retry.hidden = false;
        } finally {
            clearTimeout(timeout);
            checking = false;
        }
    }
    retry.addEventListener('click', checkVersion);
    window.addEventListener('online', checkVersion);
    checkVersion();
})();
