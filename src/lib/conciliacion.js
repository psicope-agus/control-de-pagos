// =========================================================
// Conciliación con comprobantes (texto pegado desde el PDF)
// =========================================================
// El PDF que emite la institución lista, fila por fila:
//   N° Comp.  Comprobante  Fecha  Hora  Profesional  Paciente
// El nombre del profesional es siempre el mismo (el tuyo), así que se usa
// como separador para aislar el nombre del paciente en cada fila.

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/**
 * Parsea el texto pegado del comprobante.
 * @param {string} texto - texto completo pegado por el usuario
 * @param {string} nombreProfesional - tal como aparece en el PDF, ej "ARRASCAETA AGUSTINA DOLORES"
 * @returns {Array<{fecha: string, hora: string, pacienteRaw: string}>}
 */
export function parsearComprobante(texto, nombreProfesional) {
  const profesionalNorm = nombreProfesional.trim().toUpperCase().replace(/\s+/g, ' ')
  const filas = []
  const lineas = texto.split('\n')

  // acepta fecha dd/mm/yyyy y hora hh:mm en cualquier lugar de la línea,
  // seguidas del resto de la línea (profesional + paciente)
  const re = /(\d{2})\/(\d{2})\/(\d{4}).*?(\d{1,2}:\d{2})\s+(.+)$/

  for (const lineaOriginal of lineas) {
    const linea = lineaOriginal.trim()
    if (!linea) continue
    const m = linea.match(re)
    if (!m) continue
    const [, dd, mm, yyyy, hora, resto] = m
    const restoNorm = resto.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!restoNorm.startsWith(profesionalNorm)) continue // línea que no corresponde a una fila de turno
    const pacienteRaw = restoNorm.slice(profesionalNorm.length).trim()
    if (!pacienteRaw) continue
    filas.push({
      fecha: `${yyyy}-${mm}-${dd}`,
      hora,
      pacienteRaw,
    })
  }
  return filas
}

/**
 * Compara el nombre de un paciente del sistema contra el nombre crudo del PDF
 * (formato "APELLIDO NOMBRE" en mayúsculas, orden de palabras variable).
 */
export function nombresCoinciden(nombreSistema, nombrePdfRaw) {
  const normalizar = (s) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean).sort().join(' ')
  return normalizar(nombreSistema) === normalizar(nombrePdfRaw)
}

/**
 * Agrupa las filas parseadas por paciente (nombre crudo) y por mes/año,
 * y cuenta cuántos turnos aparecen en el comprobante en ese período.
 */
export function agruparPorPacienteYMes(filas) {
  const grupos = new Map()
  for (const f of filas) {
    const [anio, mes] = f.fecha.split('-')
    const key = `${f.pacienteRaw}__${anio}-${mes}`
    if (!grupos.has(key)) {
      grupos.set(key, { pacienteRaw: f.pacienteRaw, anio: Number(anio), mes: Number(mes), fechas: [] })
    }
    grupos.get(key).fechas.push(f.fecha)
  }
  return Array.from(grupos.values()).map((g) => ({ ...g, cantidad: g.fechas.length, fechas: g.fechas.sort() }))
}

export function nombreMesConciliacion(mes) {
  return MESES_ES[mes - 1]
}
