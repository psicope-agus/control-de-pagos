// =========================================================
// Motor de cálculo de liquidación mensual
// =========================================================
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/**
 * Devuelve la fecha (formato ISO yyyy-mm-dd) del último día real de un mes/año dado,
 * ya sea que tenga 28, 29, 30 o 31 días.
 */
export function ultimoDiaDelMes(anio, mes) {
  const dia = new Date(anio, mes, 0).getDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const ESTADOS_QUE_COBRAN = new Set(['presente', 'ausente_sin_aviso', 'no_firmado'])

function fechasDelMesPorDiaSemana(anio, mes, diaSemana) {
  const fechas = []
  const totalDias = new Date(anio, mes, 0).getDate()
  for (let d = 1; d <= totalDias; d++) {
    const fecha = new Date(anio, mes - 1, d)
    if (fecha.getDay() === diaSemana) {
      fechas.push(fecha.toISOString().slice(0, 10))
    }
  }
  return fechas
}

function tarifaVigente(tarifas, servicio, fechaISO) {
  const candidatas = tarifas
    .filter((t) => t.servicio === servicio)
    .filter((t) => t.vigente_desde <= fechaISO && (!t.vigente_hasta || t.vigente_hasta >= fechaISO))
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))
  return candidatas[0]?.valor_hora ?? null
}

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
      const estado = asistencia?.estado ?? 'presente'
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

  const minutosTotales = detalle
    .filter((d) => d.cobra)
    .reduce((acc, d) => {
      const turno = turnos.find((t) => t.id === d.turno_id)
      return acc + d.modulos * (turno?.minutos_por_modulo ?? 60)
    }, 0)
  const horasFacturables = Math.round((minutosTotales / 60) * 100) / 100

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
