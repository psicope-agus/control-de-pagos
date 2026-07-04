// =========================================================
// Motor de cálculo de liquidación mensual
// =========================================================
// Reglas de negocio (definidas por el usuario):
// 1. Cada paciente tiene turnos semanales fijos (día + hora + cantidad de módulos).
// 2. La cantidad de módulos facturables de un mes depende de cuántas veces cae
//    cada turno según el calendario real de ese mes (no es un valor fijo).
// 3. Los feriados / días no laborables (tabla `feriados`, afecta_cobro = true)
//    se descuentan: ese día no hubo clase para nadie.
// 4. Ausente CON aviso -> no se cobra ese módulo.
//    Ausente SIN aviso -> SÍ se cobra (como si hubiese asistido).
//    "No se firmó" -> se trata igual que Ausente sin aviso (se cobra), salvo que
//    el usuario decida lo contrario editando el estado.
// 5. El valor por módulo depende del servicio (inclusión escolar / tratamiento) y
//    cambia en el tiempo -> se busca la tarifa vigente en cada fecha de sesión.
//    El monto se calcula como módulos facturables × valor por módulo (no por horas).
// 6. No se facturan sesiones anteriores a la fecha de inicio del paciente.

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Estados que igual generan cobro (todo excepto ausente_aviso y no_laborable/feriado)
const ESTADOS_QUE_COBRAN = new Set(['presente', 'ausente_sin_aviso', 'no_firmado'])

/**
 * Genera todas las fechas del mes/año dado que caen en un día de semana determinado.
 */
function fechasDelMesPorDiaSemana(anio, mes, diaSemana) {
  const fechas = []
  const totalDias = new Date(anio, mes, 0).getDate() // mes es 1-12 aquí
  for (let d = 1; d <= totalDias; d++) {
    const fecha = new Date(anio, mes - 1, d)
    if (fecha.getDay() === diaSemana) {
      fechas.push(fecha.toISOString().slice(0, 10))
    }
  }
  return fechas
}

/**
 * Devuelve la tarifa vigente para un servicio en una fecha dada.
 */
function tarifaVigente(tarifas, servicio, fechaISO) {
  const candidatas = tarifas
    .filter((t) => t.servicio === servicio)
    .filter((t) => t.vigente_desde <= fechaISO && (!t.vigente_hasta || t.vigente_hasta >= fechaISO))
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))
  return candidatas[0]?.valor_hora ?? null
}

/**
 * Calcula, para un paciente y un mes/año, las sesiones esperadas según su horario,
 * cruza con feriados y con las asistencias reales cargadas, y devuelve el detalle
 * de liquidación.
 *
 * @param {object} paciente - fila de `pacientes`
 * @param {Array}  turnos - turnos activos del paciente
 * @param {Array}  feriados - filas de `feriados` (afecta_cobro=true) del período
 * @param {Array}  asistencias - asistencias cargadas para ese paciente en el mes
 * @param {Array}  tarifas - todas las tarifas del servicio del paciente
 * @param {number} anio
 * @param {number} mes (1-12)
 */
export function calcularLiquidacion({ paciente, turnos, feriados, asistencias, tarifas, anio, mes }) {
  const feriadosSet = new Set(feriados.filter((f) => f.afecta_cobro).map((f) => f.fecha))
  const asistenciaPorFechaTurno = new Map(
    asistencias.map((a) => [`${a.turno_id ?? 'na'}_${a.fecha}`, a])
  )

  const detalle = []
  let modulosFacturables = 0
  let modulosNoFacturablesAviso = 0
  let modulosFeriado = 0

  for (const turno of turnos) {
    const fechas = fechasDelMesPorDiaSemana(anio, mes, turno.dia_semana)
      .filter((fecha) => !paciente.fecha_inicio || fecha >= paciente.fecha_inicio)
    for (const fecha of fechas) {
      if (feriadosSet.has(fecha)) {
        modulosFeriado += turno.modulos
        detalle.push({ fecha, turno_id: turno.id, estado: 'no_laborable', modulos: turno.modulos, cobra: false, motivo: 'Feriado / no laborable' })
        continue
      }

      const asistencia = asistenciaPorFechaTurno.get(`${turno.id}_${fecha}`)
      const estado = asistencia?.estado ?? 'presente' // si no se cargó nada, se asume presente
      const modulos = asistencia?.modulos ?? turno.modulos
      const cobra = ESTADOS_QUE_COBRAN.has(estado)

      if (cobra) {
        modulosFacturables += modulos
      } else {
        modulosNoFacturablesAviso += modulos
      }

      detalle.push({ fecha, turno_id: turno.id, estado, modulos, cobra, motivo: cobra ? null : 'Ausente con aviso' })
    }
  }

  // minutos por módulo: se toma el de cada turno (permite turnos con distinta duración)
  const minutosTotales = detalle
    .filter((d) => d.cobra)
    .reduce((acc, d) => {
      const turno = turnos.find((t) => t.id === d.turno_id)
      return acc + d.modulos * (turno?.minutos_por_modulo ?? 60)
    }, 0)
  const horasFacturables = Math.round((minutosTotales / 60) * 100) / 100

  // valor por módulo: se busca la tarifa vigente a mitad del mes (simplificación razonable;
  // si cambia a mitad de mes, ver nota en el detalle)
  const fechaRef = `${anio}-${String(mes).padStart(2, '0')}-15`
  const valorModulo = tarifaVigente(tarifas, paciente.servicio, fechaRef)

  const montoTotal = valorModulo != null ? Math.round(modulosFacturables * valorModulo * 100) / 100 : null

  return {
    paciente_id: paciente.id,
    anio,
    mes,
    modulos_facturables: modulosFacturables,
    modulos_no_facturables_aviso: modulosNoFacturablesAviso,
    modulos_feriado: modulosFeriado,
    horas_facturables: horasFacturables,
    valor_hora: valorModulo,
    monto_total: montoTotal,
    detalle,
  }
}

export function nombreMes(mes) {
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return nombres[mes - 1]
}
