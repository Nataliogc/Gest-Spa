// Horario común de salas: admite el formato guardado por Personal y el antiguo.
(function (root) {
    function roomClosureReason(date, start, duration, config = {}) {
        const closed = (config.closedDates || []).find(item => (typeof item === 'string' ? item : item.date) === date);
        if (closed) return closed.reason || 'Cierre del centro';
        const weekday = new Date(date + 'T12:00:00').getDay();
        const key = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][weekday];
        const hours = config.hours?.schedule || config.hours || {};
        const day = hours[key];
        if (day && !day.enabled) return 'Sala cerrada este día';
        // Compatibilidad con el horario por defecto del formulario de salas.
        const shifts = day ? (day.shifts || []) : [{ start: '10:00', end: weekday === 0 ? '15:00' : '22:00' }];
        const minutes = time => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m; };
        const ranges = shifts.map(s => [minutes(s.start), minutes(s.end)]).sort((a, b) => a[0] - b[0]);
        let coveredUntil = start;
        for (const [from, to] of ranges) {
            if (from <= coveredUntil && to > coveredUntil) coveredUntil = to;
        }
        return coveredUntil >= start + duration ? '' : 'Fuera del horario de apertura';
    }
    root.roomClosureReason = roomClosureReason;
    if (typeof module !== 'undefined') module.exports = { roomClosureReason };
})(typeof window !== 'undefined' ? window : globalThis);
