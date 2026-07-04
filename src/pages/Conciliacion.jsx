import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion } from '../lib/liquidacion'
import { parsearComprobante, agruparPorPacienteYMes, nombresCoinciden, nombreMesConciliacion } from '../lib/conciliacion'

export default function Conciliacion() {
  const [nombreProfesional, setNombreProfesional] = useState('ARRASCAETA AGUSTINA DOLORES')
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(null)

  async function procesar() {
    setLoading(true)
    const filas = parsearComprobante(texto, nombreProfesional)
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

      const liq = calcularLiquidacion({ paciente, turnos: turnos ?? [], feriados: feriados ?? [], asistencias: asistencias ?? [], tarifas: tarifas ?? [], anio: g.anio, mes: g.mes })
      const fechasSistema = liq.detalle.filter((d) => d.cobra).map((d) => d.fecha).sort()

      const soloEnComprobante = g.fechas.filter((f) => !fechasSistema.includes(f))
      const soloEnSistema = fechasSistema.filter((f) => !g.fechas.includes(f))

      salida.push({ ...g, paciente, sistema: { modulos: liq.modulos_facturables, fechas: fechasSistema, soloEnComprobante, soloEnSistema } })
    }

    setResultados(salida.sort((a, b) => (a.paciente?.nombre ?? a.pacienteRaw).localeCompare(b.paciente?.nombre ?? b.pacienteRaw)))
    setLoading(false)
  }

  return (
    <div>
      <div className="topbar"><h1>Conciliación de comprobantes</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Pegá el texto del comprobante que te envían (podés seleccionar y copiar el texto directamente
        del PDF) y lo comparamos contra lo que calculó el sistema, paciente por paciente.
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
        <button className="btn btn-primary" onClick={procesar} disabled={!texto.trim() || loading}>
          {loading ? 'Comparando…' : 'Comparar con el sistema'}
        </button>
      </div>

      {resultados && (
        <div className="card">
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
                const nombre = r.paciente?.nombre ?? `⚠️ ${r.pacienteRaw} (no encontrado en el sistema)`
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
                        ) : coincide ? (
                          <span className="pill pill-green">Coincide</span>
                        ) : (
                          <span className="pill pill-amber">Revisar</span>
                        )}
                      </td>
                      <td>
                        {r.paciente && (
                          <button className="btn btn-outline" onClick={() => setDetalleAbierto(detalleAbierto === i ? null : i)}>
                            {detalleAbierto === i ? 'Ocultar' : 'Detalle'}
                          </button>
                        )}
                      </td>
                    </tr>
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
    </div>
  )
}
