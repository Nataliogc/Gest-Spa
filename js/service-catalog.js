(function (root) {
    'use strict';
    const nameOf = item => item.name || item.nombre || '';
    const active = item => item.active !== false && !item.deleted;
    function normalize(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/['’′]/g, '').replace(/\b(minutos|min|mins)\b/g, '')
            .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    }
    function identity(item) {
        const name = normalize(nameOf(item));
        const suffix = name.match(/\s(\d+)$/);
        return {
            base: suffix ? name.slice(0, suffix.index) : name,
            duration: Number(item.duration ?? item.duracion) || (suffix ? Number(suffix[1]) : 0),
            pax: Number(item.pax_max ?? item.pax) || 0
        };
    }
    function resolve(value, master = [], catalog = []) {
        const item = typeof value === 'string' ? { name: value } : value || {};
        const candidates = master.filter(active);
        const ref = item.master_item_id || item.item_id;
        if (ref) return candidates.find(m => m.id === ref) || null;
        const key = normalize(nameOf(item));
        const exact = candidates.filter(m => normalize(nameOf(m)) === key ||
            (Array.isArray(m.aliases) && m.aliases.some(a => normalize(a) === key)));
        const meta = identity(item);
        const compatible = m => {
            const other = identity(m);
            return (!meta.duration || !other.duration || meta.duration === other.duration) &&
                (!meta.pax || !other.pax || meta.pax === other.pax);
        };
        const matches = exact.filter(compatible);
        if (matches.length === 1) return matches[0];
        if (exact.length) return null; // Never guess between different master records.
        const equivalents = candidates.filter(m => {
            const other = identity(m);
            return meta.duration > 0 && meta.base === other.base && meta.duration === other.duration && compatible(m);
        });
        if (equivalents.length === 1) return equivalents[0];
        // A legacy name without minutes needs unambiguous catalog metadata.
        if (typeof value === 'string') {
            const legacy = catalog.filter(c => active(c) && normalize(nameOf(c)) === key);
            const resolved = legacy.map(c => resolve(c, master)).filter(Boolean);
            if (resolved.length === legacy.length && resolved.length && resolved.every(m => m === resolved[0])) return resolved[0];
        }
        return null;
    }
    function space(value) {
        return normalize(value).replace(/^sala /, '').replace('suite spa', 'suite')
            .replace(/^cabinauno$/, 'cabina1').replace(/^cabinados$/, 'cabina2').replace(/^cabinatres$/, 'cabina3')
            .replace(/^chon$/, 'cabina1').replace(/^mar$/, 'cabina2').replace(/^mari$/, 'cabina3');
    }
    function spacesOf(item) {
        const values = item.allowedSpaces ?? item.espacios ?? (item.space ? [item.space] : []);
        return Array.isArray(values) ? values.map(space) : [];
    }
    function allows(item, room) {
        const code = space(room);
        if (!code || code === 'cabinas' || code === 'cabina') return true;
        const spaces = spacesOf(item);
        if (spaces.length === 0) return true;
        const isCabina = /^cabina\d+$/.test(code);
        return spaces.includes(code) || (isCabina && spaces.includes('cabina')) || (code === 'cabina' && spaces.some(s => /^cabina\d+$/.test(s)));
    }
    function build(master = [], catalog = [], packs = [], room = '') {
        const packMasters = new Set(packs.filter(active).map(pack =>
            resolve(pack.nombre.replace(/^PACK\s*[-:—–]\s*/i, ''), master, catalog)).filter(Boolean));
        const individuals = master.filter(m => active(m) && m.agenda_required !== false &&
            !packMasters.has(m) &&
            m.pack_only !== true && m.standalone !== false && allows(m, room) &&
            !['hotel', 'restaurante', 'gimnasio'].includes(normalize(m.category || m.categoria)));
        const result = individuals.map(m => ({
            nombre: nameOf(m), masterItemId: m.id || '',
            precio: Number(m.price_pax ?? m.price ?? m.precio ?? 0),
            pax_max: Number(m.pax_max ?? m.pax) || 1,
            duracion: Number(m.duration ?? m.duracion) || 0,
            required_therapists: m.required_therapists,
            espacio: m.space || '', allowedSpaces: spacesOf(m),
            categoria: m.category || m.categoria || '', source: 'master'
        }));
        // Packs keep their commercial price and sequence, even when they also
        // have a master record. They must not appear again as individuals.
        const seen = new Set();
        for (const pack of packs) {
            if (!active(pack)) continue;
            const key = normalize(pack.nombre);
            if (!seen.has(key)) { seen.add(key); result.push(pack); }
        }
        return result;
    }
    root.SpaServiceCatalog = { normalize, resolve, build, allows, space, spacesOf };
    if (typeof module !== 'undefined') module.exports = root.SpaServiceCatalog;
})(typeof window !== 'undefined' ? window : globalThis);
