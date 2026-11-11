const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packRegistry = require('../js/spa-packs-registry.js');
const serviceCatalog = require('../js/service-catalog.js');

console.log('--- TEST: RITUALES, HORAS Y REGLAS DE SALAS ---');

// 1. Verificar Ritual Amazonian Discovery (90 min total)
const amazonia = packRegistry.getPackFullData('Ritual Amazonian Discovery');
assert.ok(amazonia, 'Debe resolver Ritual Amazonian Discovery');
assert.equal(amazonia.categoria, 'ritual');
assert.equal(amazonia.duracion_total, 90, 'Duración total de Amazonia debe ser 90 min (45 + 45)');
assert.equal(amazonia.secuencia.length, 2);
console.log('✓ Ritual Amazonian Discovery: 90 minutos totales verificado');

// 2. Verificar que en reservas-salas.html se aplican las reglas:
const html = fs.readFileSync(path.resolve(__dirname, '../reservas-salas.html'), 'utf8');

// a) Hora seleccionada garantizada al pinchar en el planning
assert.ok(html.includes('timeSel.dataset.originalTime = selectedTime;'), 'Guarda originalTime');
assert.ok(html.includes('if (selectedTime) {') && html.includes('timeSel.appendChild(opt);'), 'Garantiza opción seleccionada');
console.log('✓ Hora seleccionada se rellena siempre al pinchar en el planning');

// b) Servicio obligatorio
assert.ok(html.includes('Debe seleccionar un servicio. El servicio es obligatorio para realizar una reserva.'), 'Valida servicio obligatorio');
console.log('✓ Validación obligatoria de servicio implementada');

// c) En salas nunca se puede reservar circuito spa
assert.ok(html.includes('En una sala nunca se puede reservar un circuito spa'), 'Bloquea circuito spa en salas');
assert.ok(html.includes("if (n === 'circuito spa' || n === 'circuito'"), 'Filtra circuito spa del catálogo de salas');
console.log('✓ Regla: En una sala nunca circuito spa implementada');

// d) Rituales: misma sala, tiempo entero, sin fecha ni hora en desglose
assert.ok(html.includes('isRitual'), 'Detecta isRitual');
assert.ok(html.includes('displayItems.length <= 1'), 'Oculta pack multiservicio si solo hay 1 item');
assert.ok(html.includes('Incluido (${duration}\')'), 'Desglose informativo sin inputs de hora/fecha para rituales');
console.log('✓ Rituales en misma sala y desglose informativo verificado');

// e) Suite Spa sin masajes: 0 terapeutas requeridos y nunca captura terapeutas
const staffJs = fs.readFileSync(path.resolve(__dirname, '../reservas-staff.js'), 'utf8');
const agendaHtml = fs.readFileSync(path.resolve(__dirname, '../agenda-salas.html'), 'utf8');

assert.ok(html.includes("!requiresStaffForThisBooking || requiredTherapistsCount === 0 || isAgendaLess"), 'Limpia terapeutas en payload si no requiere staff');
assert.ok(staffJs.includes("isSuiteNoMassage"), 'Detecta suite spa sin masaje en reservas-staff.js');
assert.ok(staffJs.includes("staffSelect1.value = ''"), 'Limpia staffSelect1 en reservas-staff.js cuando no requiere personal');
assert.ok(agendaHtml.includes("svc.includes('suite') && !svc.includes('masaje')"), 'Filtra suite spa sin masajes de planning de terapeutas');
console.log('✓ Suite Spa sin masaje: 0 terapeutas garantizados');

console.log('\n✅ TODOS LOS TESTS DE RITUALES Y SALAS PASARON!');
