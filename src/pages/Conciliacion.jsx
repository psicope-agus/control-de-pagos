import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion, ultimoDiaDelMes } from '../lib/liquidacion'
import { parsearComprobante, agruparPorPacienteYMes, nombresCoinciden, nombreMesConciliacion } from '../lib/conciliacion'

const CLAVE_LOCAL = 'conciliacion_borrador'

export default function Conciliacion() {
  const [nombreProfesional, setNombreProfesional] = useState('ARRASCAETA AGUSTINA DOLORES')
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [descartadas, setDescartadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(null)
  const [verDescartadas, setVerDescartadas] = useState(false)
  const [historial, setHistorial] = useState([])
  const [mensajeGuardado, setMensajeGuardado] = useState('')
  const [error, setError] = useState('')
  const [registrados, setRegistrados] = useState({})

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_LOCAL)
    if (guardado) {
      try {
        const { texto: t, nombreProfesional: n } = JSON.parse(guardado)
        if (t) setTexto(t)
        if (n) setNombreProfesional(n)
      } catch { /* ignorar borrador corrupto */ }
    }
    cargarHistorial()
  }, [])

  useEffect(() => {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ texto, nombreProfesional }))
  }, [texto, nombreProfesional])

  async function cargarHistorial() {
    const { data } = await supabase.from('conciliaciones').select('id, nombre_profesional, created_at, resultados').order('created_at', { ascending: false }).limit(20)
    setHistorial(data ?? [])
  }

  async function procesar() {
    setLoading(true)
    setMensajeGuardado('')
    setError('')
    try {
      const { filas, descartadas: desc } = parsearComprobante(texto, nombreProfesional)
      setDescartadas(desc)
      const grupos = agruparPorPacienteYMes(filas)

      if (grupos.length === 0) {
        setResultados([])
        setError('No se pudo identificar ninguna fila válida en el texto pegado. Revisá el detalle de líneas no interpretadas más abajo.')
        return
      }

      const { data: pacientes, error: errPacientes } = await supabase.from('pacientes').select('*')
      if (errPacientes) throw new Error('Error al leer pacientes: ' + errPacientes.message)
      const { data: tarifas, error: errTarifas } = await supabase.from('tarifas').select('*')
      if (errTarifas) throw new Error('Error al leer tarifas: ' + errTarifas.message)

      const salida = []
      for (const g of grupos) {
        const paciente = (pacientes ?? []).find((p) => nombresCoinciden(p.nombre, g.pacienteRaw))

        if (!paciente) {
          salida.push({ ...g, paciente: null, sistema: null })
          continue
        }

        const desde = `${g.anio}-${String(g.mes).padStart(2, '0')}-01`
        const hasta = ultimoDiaDelMes(g.anio, g.mes)
        const [rTurnos, rFeriados, rAsistencias] = await Promise.all([
          supabase.from('turnos').select('*').eq('paciente_id', paciente.id).eq('activo', true),
          supabase.from('feriados').select('*').gte('fecha', desde).lte('fecha', hasta).eq('afecta_cobro', true),
          supabase.from('asistencias').select('*').eq('paciente_id', paciente.id).gte('fecha', desde).lte('fecha', hasta),
        ])
        if (rTurnos.error) throw new Error(`Error al leer turnos de ${paciente.nombre}: ` + rTurnos.error.message)
        if (rFeriados.error) throw new Error('Error al leer feriados: ' + rFeriados.error.message)
        if (rAsistencias.error) throw new Error(`Error al leer asistencias de ${paciente.nombre}: ` + rAsistencias.error.message)

        const turnos = rTurnos.data ?? []
        const feriados = rFeriados.data ?? []
        const asistencias = rAsistencias.data ?? []

        if (turnos.length === 0) {
          salida.push({ ...g, paciente, sistema: null, sinTurnos: true })
          continue
        }

        const liq = calcularLiquidacion({ paciente, turnos, feriados, asistencias, tarifas: tarifas ?? [], anio: g.anio, mes: g.mes })
        const fechasSistema = liq.detalle.filter((d) => d.cobra).map((d) => d.fecha).sort()

        const soloEnComprobante = g.fechas.filter((f) => !fechasSistema.includes(f))
        const soloEnSistema = fechasSistema.filter((f) => !g.fechas.includes(f))

        salida.push({
          ...g,
          paciente,
          sistema: {
            modulos: liq.modulos_facturables,
            horas: liq.horas_facturables,
            valorModulo: liq.valor_hora,
            montoTotal: liq.monto_total,
            fechas: fechasSistema,
            soloEnComprobante,
            soloEnSistema,
          },
        })
      }

      setResultados(salida.sort((a, b) => (a.paciente?.nombre ?? a.pacienteRaw).localeCompare(b.paciente?.nombre ?? b.pacienteRaw)))
    } catch (e) {
      console.error(e)
      setError(e.message || 'Ocurrió un error inesperado al comparar. Revisá la consola del navegador (F12) para más detalle.')
    } finally {
      setLoading(false)
    }
  }

  async function guardarEnHistorial() {
    if (!resultados) return
    const { error } = await supabase.from('conciliaciones').insert({
      nombre_profesional: nombreProfesional,
      texto,
      resultados,
    })
    if (error) {
      setMensajeGuardado('Ocurrió un error al guardar: ' + error.message)
    } else {
      setMensajeGuardado('Guardado en el historial correctamente.')
      cargarHistorial()
    }
  }

  async function registrarEnPagos(r, estado) {
    if (!r.paciente || !r.sistema) return
    const { data: existente } = await supabase.from('pagos').select('*').eq('paciente_id', r.paciente.id).eq('anio', r.anio).eq('mes', r.mes).maybeSingle()
    if (existente) {
      const ok = confirm(`Ya hay un pago cargado para ${r.paciente.nombre} en ${nombreMesConciliacion(r.mes)} ${r.anio} (estado: ${existente.estado}, monto $${Number(existente.monto_total).toLocaleString('es-AR')}). ¿Querés sobreescribirlo con los datos de esta conciliación?`)
      if (!ok) return
    }
    await supabase.from('pagos').upsert({
      paciente_id: r.paciente.id,
      anio: r.anio,
      mes: r.mes,
      modulos_facturables: r.sistema.modulos,
      horas_facturables: r.sistema.horas,
      valor_hora: r.sistema.valorModulo ?? 0,
      monto_total: r.sistema.montoTotal ?? 0,
      estado,
      notas: `Registrado desde Conciliación el ${new Date().toLocaleDateString('es-AR')}.`,
    }, { onConflict: 'paciente_id,anio,mes' })
    setRegistrados({ ...registrados, [`${r.paciente.id}_${r.anio}_${r.mes}`]: true })
  }

  async function registrarTodosLosCoincidentes() {
    const coincidentes = (resultados ?? []).filter((r) => r.paciente && r.sistema && !r.sinTurnos &&
      r.sistema.soloEnComprobante.length === 0 && r.sistema.soloEnSistema.length === 0 && r.cantidad === r.sistema.modulos)
    if (coincidentes.length === 0) {
      alert('No hay ningún mes que coincida exactamente para registrar en lote.')
      return
    }
    const ok = confirm(`Se van a registrar ${coincidentes.length} mes(es) en Pagos con estado "Completado" (se sobreescribe cualquier pago existente para esos meses). ¿Continuar?`)
    if (!ok) return
    for (const r of coincidentes) {
      await supabase.from('pagos').upsert({
        paciente_id: r.paciente.id,
        anio: r.anio,
        mes: r.mes,
        modulos_facturables: r.sistema.modulos,
        horas_facturables: r.sistema.horas,
        valor_hora: r.sistema.valorModulo ?? 0,
        monto_total: r.sistema.montoTotal ?? 0,
        estado: 'completado',
        notas: `Registrado desde Conciliación (lote) el ${new Date().toLocaleDateString('es-AR')}.`,
      }, { onConflict: 'paciente_id,anio,mes' })
      setRegistrados((prev) => ({ ...prev, [`${r.paciente.id}_${r.anio}_${r.mes}`]: true }))
    }
    setMensajeGuardado(`Se registraron ${coincidentes.length} mes(es) en Pagos.`)
  }

  function limpiarBorrador() {
    if (!confirm('¿Borrar el texto pegado y empezar de nuevo?')) return
    setTexto('')
    setResultados(null)
    setDescartadas([])
    localStorage.removeItem(CLAVE_LOCAL)
  }

  return (
    <div>
      <div className="topbar"><h1>Conciliación de comprobantes</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Pegá el texto del comprobante que te envían y lo comparamos contra lo que calculó el sistema,
        paciente por paciente. Lo que vayas escribiendo se guarda solo en este navegador, así que si
        cambiás de pantalla no se pierde.
      </p>

      <div className="card">
        <div className="field">
          <label>Nombre del profesional tal como aparece en el comprobante</label>
          <input value={nombreProfesional} onChange={(e) => setNombreProfesional(e.target.value)} />
        </div>
        <div className="field">
          <label>Texto del comprobante</label>
          <textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pegá aquí el texto copiado del PDF…" />
        </div>
        <button className="btn btn-primary" onClick={procesar} disabled={!texto.trim() || loading} style={{ marginRight: 8 }}>
          {loading ? 'Comparando…' : 'Comparar con el sistema'}
        </button>
        <button className="btn btn-outline" onClick={limpiarBorrador}>Limpiar</button>
        {error && (
          <p style={{ color: 'var(--red)', marginTop: 12, marginBottom: 0 }}>⚠️ {error}</p>
        )}
      </div>

      {descartadas.length > 0 && (
        <div className="card" style={{ borderColor: '#e6c9c1' }}>
          <button className="btn btn-outline" onClick={() => setVerDescartadas(!verDescartadas)}>
            {verDescartadas ? 'Ocultar' : 'Ver'} {descartadas.length} línea(s) que no se pudieron interpretar
          </button>
          {verDescartadas && (
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Línea original</th><th>Motivo</th></tr></thead>
              <tbody>
                {descartadas.map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{d.linea}</td>
                    <td className="muted">{d.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {resultados && (
        <div className="card">
          <div className="topbar" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Resultado de la comparación</h3>
            <div>
              <button className="btn btn-outline" onClick={registrarTodosLosCoincidentes} style={{ marginRight: 8 }}>
                Registrar todos los que coinciden en Pagos
              </button>
              <button className="btn btn-primary" onClick={guardarEnHistorial}>Guardar en historial</button>
            </div>
          </div>
          {mensajeGuardado && <p className="muted" style={{ marginTop: -6 }}>{mensajeGuardado}</p>}
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Mes</th>
                <th>Según comprobante</th>
                <th>Según sistema</th>
                <th>Coincide</th>
                <th>Registrar en Pagos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r, i) => {
                const nombre = r.paciente?.nombre ?? `${r.pacienteRaw} (no encontrado en el sistema)`
                const coincide = r.sistema && r.sistema.soloEnComprobante.length === 0 && r.sistema.soloEnSistema.length === 0 && r.cantidad === r.sistema.modulos
                return (
                  <React.Fragment key={i}>
                    <tr>
                      <td>{nombre}</td>
                      <td>{nombreMesConciliacion(r.mes)} {r.anio}</td>
                      <td>{r.cantidad}</td>
                      <td>{r.sistema ? r.sistema.modulos : '—'}</td>
                      <td>
                        {!r.paciente ? (
                          <span className="pill pill-red">No encontrado</span>
                        ) : r.sinTurnos ? (
                          <span className="pill pill-red">Sin turnos cargados</span>
                        ) : coincide ? (
                          <span className="pill pill-green">Coincide</span>
                        ) : (
                          <span className="pill pill-amber">Revisar</span>
                        )}
                      </td>
                      <td>
                        {r.paciente && r.sistema && !r.sinTurnos && (
                          <FilaRegistrar
                            registrado={registrados[`${r.paciente.id}_${r.anio}_${r.mes}`]}
                            onRegistrar={(estado) => registrarEnPagos(r, estado)}
                          />
                        )}
                      </td>
                      <td>
                        {r.paciente && !r.sinTurnos && (
                          <button className="btn btn-outline" onClick={() => setDetalleAbierto(detalleAbierto === i ? null : i)}>
                            {detalleAbierto === i ? 'Ocultar' : 'Detalle'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {!r.paciente && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ background: '#fafaf7' }}>
                          No se encontró ningún paciente activo cuyo nombre coincida con "{r.pacienteRaw}". Revisá que
                          esté bien escrito en la sección Pacientes (no importa el orden de palabras ni mayúsculas).
                        </td>
                      </tr>
                    )}
                    {r.sinTurnos && (
                      <tr>
                        <td colSpan={7} className="muted" style={{ background: '#fafaf7' }}>
                          {r.paciente.nombre} no tiene turnos activos cargados, así que el sistema no puede calcular
                          nada para comparar. Cargale sus turnos en la sección Pacientes o Turnos.
                        </td>
                      </tr>
                    )}
                    {detalleAbierto === i && r.sistema && (
                      <tr>
                        <td colSpan={7} style={{ background: '#fafaf7' }}>
                          <div style={{ padding: '10px 4px' }}>
                            {r.sistema.soloEnComprobante.length > 0 && (
                              <p><strong>Están en el comprobante pero no en el sistema:</strong> {r.sistema.soloEnComprobante.join(', ')}</p>
                            )}
                            {r.sistema.soloEnSistema.length > 0 && (
                              <p><strong>Están en el sistema pero no en el comprobante:</strong> {r.sistema.soloEnSistema.join(', ')}</p>
                            )}
                            {r.sistema.soloEnComprobante.length === 0 && r.sistema.soloEnSistema.length === 0 && (
                              <p className="muted">Las fechas coinciden exactamente.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Historial guardado</h3>
        {historial.length === 0 ? (
          <p className="muted">Todavía no guardaste ninguna conciliación.</p>
        ) : (
          <table>
            <thead><tr><th>Fecha</th><th>Profesional</th><th>Pacientes comparados</th></tr></thead>
            <tbody>
              {historial.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString('es-AR')}</td>
                  <td>{h.nombre_profesional}</td>
                  <td>{Array.isArray(h.resultados) ? h.resultados.length : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function FilaRegistrar({ registrado, onRegistrar }) {
  const [estado, setEstado] = useState('completado')

  if (registrado) {
    return <span className="pill pill-green">Registrado ✓</span>
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ width: 120 }}>
        <option value="completado">Completado</option>
        <option value="pendiente">Pendiente</option>
      </select>
      <button className="btn btn-outline" onClick={() => onRegistrar(estado)}>Registrar</button>
    </div>
  )
}
