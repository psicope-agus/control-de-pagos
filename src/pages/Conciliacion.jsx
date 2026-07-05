import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion } from '../lib/liquidacion'
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
    const { filas, descartadas: desc } = parsearComprobante(texto, nombreProfesional)
    setDescartadas(desc)
    const grupos = agruparPorPacienteYMes(filas)

    const { data: pacientes } = await supabase.from('pacientes').select('*')
    const { data: tarifas } = await supabase.from('tarifas').select('*')

    const salida = []
    for (const g of grupos) {
      const paciente = (pacientes ?? []).find((p) => nombresCoinciden(p.nombre, g.pacienteRaw))

      if (!paciente) {
        salida.push({ ...g, paciente: null, sistema: null })
        continue
      }

      const desde = `${g.anio}-${String(g.mes).padStart(2, '0')}-01`
      const hasta = `${g.anio}-${String(g.mes).padStart(2, '0')}-31`
      const [{ data: turnos }, { data: feriados }, { data: asistencias }] = await Promise.all([
        supabase.from('turnos').select('*').eq('paciente_id', paciente.id).eq('activo', true),
        supabase.from('feriados').select('*').gte('fecha', desde).lte('fecha', hasta).eq('afecta_cobro', true),
        supabase.from('asistencias').select('*').eq('paciente_id', paciente.id).gte('fecha', desde).lte('fecha', hasta),
      ])

      if (!turnos || turnos.length === 0) {
        salida.push({ ...g, paciente, sistema: null, sinTurnos: true })
        continue
      }

      const liq = calcularLiquidacion({ paciente, turnos: turnos ?? [], feriados: feriados ?? [], asistencias: asistencias ?? [], tarifas: tarifas ?? [], anio: g.anio, mes: g.mes })
      const fechasSistema = liq.detalle.filter((d) => d.cobra).map((d) => d.fecha).sort()

      const soloEnComprobante = g.fechas.filter((f) => !fechasSistema.includes(f))
      const soloEnSistema = fechasSistema.filter((f) => !g.fechas.includes(f))

      salida.push({ ...g, paciente, sistema: { modulos: liq.modulos_facturables, fechas: fechasSistema, soloEnComprobante, soloEnSistema } })
    }

    setResultados(salida.sort((a, b) => (a.paciente?.nombre ?? a.pacienteRaw).localeCompare(b.paciente?.nombre ?? b.pacienteRaw)))
    setLoading(false)
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
                        {r.paciente && !r.sinTurnos && (
                          <button className="btn btn-outline" onClick={() => setDetalleAbierto(detalleAbierto === i ? null : i)}>
                            {detalleAbierto === i ? 'Ocultar' : 'Detalle'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {!r.paciente && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ background: '#fafaf7' }}>
                          No se encontró ningún paciente activo cuyo nombre coincida con "{r.pacienteRaw}". Revisá que
                          esté bien escrito en la sección Pacientes (no importa el orden de palabras ni mayúsculas).
                        </td>
                      </tr>
                    )}
                    {r.sinTurnos && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ background: '#fafaf7' }}>
                          {r.paciente.nombre} no tiene turnos activos cargados, así que el sistema no puede calcular
                          nada para comparar. Cargale sus turnos en la sección Pacientes o Turnos.
                        </td>
                      </tr>
                    )}
                    {detalleAbierto === i && r.sistema && (
                      <tr>
                        <td colSpan={6} style={{ background: '#fafaf7' }}>
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
