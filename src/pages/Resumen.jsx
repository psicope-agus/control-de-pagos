import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nombreMes } from '../lib/liquidacion'

export default function Resumen() {
  const [pagos, setPagos] = useState([])
  const [pacientes, setPacientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [anioFiltro, setAnioFiltro] = useState('todos')
  const [detalleAbierto, setDetalleAbierto] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const [{ data: p }, { data: pag }] = await Promise.all([
      supabase.from('pacientes').select('*'),
      supabase.from('pagos').select('*').order('anio').order('mes'),
    ])
    setPacientes(p ?? [])
    setPagos(pag ?? [])
    setLoading(false)
  }

  const aniosDisponibles = useMemo(() => {
    const set = new Set(pagos.map((p) => p.anio))
    return Array.from(set).sort()
  }, [pagos])

  const pagosFiltrados = useMemo(() => {
    if (anioFiltro === 'todos') return pagos
    return pagos.filter((p) => p.anio === Number(anioFiltro))
  }, [pagos, anioFiltro])

  const resumenPorPaciente = useMemo(() => {
    const map = new Map()
    for (const pago of pagosFiltrados) {
      if (!map.has(pago.paciente_id)) {
        map.set(pago.paciente_id, { paciente_id: pago.paciente_id, pagado: 0, adeudado: 0, meses: [] })
      }
      const entry = map.get(pago.paciente_id)
      const monto = Number(pago.monto_total) || 0
      if (pago.estado === 'completado') entry.pagado += monto
      else entry.adeudado += monto
      entry.meses.push(pago)
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, paciente: pacientes.find((p) => p.id === e.paciente_id), total: e.pagado + e.adeudado }))
      .sort((a, b) => (a.paciente?.nombre ?? '').localeCompare(b.paciente?.nombre ?? ''))
  }, [pagosFiltrados, pacientes])

  const totales = useMemo(() => resumenPorPaciente.reduce(
    (acc, r) => ({ pagado: acc.pagado + r.pagado, adeudado: acc.adeudado + r.adeudado }),
    { pagado: 0, adeudado: 0 }
  ), [resumenPorPaciente])

  return (
    <div>
      <div className="topbar"><h1>Resumen por paciente</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Suma todos los meses cargados en la sección Pagos. "Pagado" son los meses marcados como
        Completado; "Adeudado" son los marcados como Pendiente o Sin comenzar.
      </p>

      <div className="card">
        <div className="grid cols-3">
          <div className="field">
            <label>Período</label>
            <select value={anioFiltro} onChange={(e) => setAnioFiltro(e.target.value)}>
              <option value="todos">Todos los años</option>
              {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <div className="muted">Total pagado</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--brand)' }}>${totales.pagado.toLocaleString('es-AR')}</div>
          </div>
          <div>
            <div className="muted">Total adeudado</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--red)' }}>${totales.adeudado.toLocaleString('es-AR')}</div>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <p className="muted">Cargando…</p> : (
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Total trabajado</th>
                <th>Pagado</th>
                <th>Adeudado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resumenPorPaciente.map((r) => (
                <React.Fragment key={r.paciente_id}>
                  <tr>
                    <td>{r.paciente?.nombre ?? '(paciente eliminado)'}</td>
                    <td>${r.total.toLocaleString('es-AR')}</td>
                    <td style={{ color: 'var(--brand)', fontWeight: 600 }}>${r.pagado.toLocaleString('es-AR')}</td>
                    <td style={{ color: r.adeudado > 0 ? 'var(--red)' : 'var(--ink-soft)', fontWeight: 600 }}>${r.adeudado.toLocaleString('es-AR')}</td>
                    <td>
                      <button className="btn btn-outline" onClick={() => setDetalleAbierto(detalleAbierto === r.paciente_id ? null : r.paciente_id)}>
                        {detalleAbierto === r.paciente_id ? 'Ocultar' : 'Detalle por mes'}
                      </button>
                    </td>
                  </tr>
                  {detalleAbierto === r.paciente_id && (
                    <tr>
                      <td colSpan={5} style={{ background: '#fafaf7' }}>
                        <table style={{ margin: '8px 0' }}>
                          <thead><tr><th>Mes</th><th>Módulos</th><th>Monto</th><th>Estado</th></tr></thead>
                          <tbody>
                            {r.meses.sort((a, b) => a.anio - b.anio || a.mes - b.mes).map((m) => (
                              <tr key={m.id}>
                                <td>{nombreMes(m.mes)} {m.anio}</td>
                                <td>{m.modulos_facturables}</td>
                                <td>${Number(m.monto_total).toLocaleString('es-AR')}</td>
                                <td>
                                  <span className={`pill ${m.estado === 'completado' ? 'pill-green' : m.estado === 'pendiente' ? 'pill-amber' : 'pill-gray'}`}>
                                    {m.estado === 'completado' ? 'Pagado' : m.estado === 'pendiente' ? 'Pendiente' : 'Sin comenzar'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {resumenPorPaciente.length === 0 && <tr><td colSpan={5} className="muted">Todavía no hay pagos cargados en el período seleccionado.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
