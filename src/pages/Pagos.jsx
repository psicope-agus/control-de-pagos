import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion, nombreMes } from '../lib/liquidacion'

const ESTADOS_PAGO = [
  { value: 'sin_comenzar', label: 'Sin comenzar', pill: 'pill-gray' },
  { value: 'pendiente', label: 'Pendiente', pill: 'pill-amber' },
  { value: 'completado', label: 'Completado', pill: 'pill-green' },
]

export default function Pagos() {
  const hoy = new Date()
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [pacientes, setPacientes] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [feriados, setFeriados] = useState([])
  const [liquidaciones, setLiquidaciones] = useState([])
  const [pagosGuardados, setPagosGuardados] = useState({})
  const [loading, setLoading] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(null)

  useEffect(() => { calcular() }, [anio, mes])

  async function calcular() {
    setLoading(true)
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-31`

    const [{ data: pac }, { data: tar }, { data: fer }] = await Promise.all([
      supabase.from('pacientes').select('*').eq('activo', true).order('nombre'),
      supabase.from('tarifas').select('*'),
      supabase.from('feriados').select('*').gte('fecha', desde).lte('fecha', hasta).eq('afecta_cobro', true),
    ])
    setPacientes(pac ?? [])
    setTarifas(tar ?? [])
    setFeriados(fer ?? [])

    const { data: pagos } = await supabase.from('pagos').select('*').eq('anio', anio).eq('mes', mes)
    const mapPagos = {}
    ;(pagos ?? []).forEach((p) => { mapPagos[p.paciente_id] = p })
    setPagosGuardados(mapPagos)

    const resultados = []
    for (const paciente of pac ?? []) {
      const { data: turnos } = await supabase.from('turnos').select('*').eq('paciente_id', paciente.id).eq('activo', true)
      const { data: asistencias } = await supabase.from('asistencias').select('*').eq('paciente_id', paciente.id).gte('fecha', desde).lte('fecha', hasta)
      const liq = calcularLiquidacion({ paciente, turnos: turnos ?? [], feriados: fer ?? [], asistencias: asistencias ?? [], tarifas: tar ?? [], anio, mes })
      resultados.push({ paciente, liq })
    }
    setLiquidaciones(resultados)
    setLoading(false)
  }

  async function guardarLiquidacion(paciente, liq, estado) {
    const payload = {
      paciente_id: paciente.id,
      anio, mes,
      modulos_facturables: liq.modulos_facturables,
      horas_facturables: liq.horas_facturables,
      valor_hora: liq.valor_hora ?? 0,
      monto_total: liq.monto_total ?? 0,
      estado,
    }
    await supabase.from('pagos').upsert(payload, { onConflict: 'paciente_id,anio,mes' })
    calcular()
  }

  const totalMes = useMemo(() => liquidaciones.reduce((acc, r) => acc + (r.liq.monto_total ?? 0), 0), [liquidaciones])

  return (
    <div>
      <div className="topbar">
        <h1>Pagos — {nombreMes(mes)} {anio}</h1>
      </div>

      <div className="card">
        <div className="grid cols-3">
          <div className="field">
            <label>Mes</label>
            <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Año</label>
            <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div>
              <div className="muted">Total a liquidar el mes</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--brand)' }}>
                ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? <p className="muted">Calculando…</p> : (
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Servicio</th>
                <th>Módulos facturables</th>
                <th>Horas</th>
                <th>Valor hora</th>
                <th>Monto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liquidaciones.map(({ paciente, liq }) => {
                const pagoGuardado = pagosGuardados[paciente.id]
                const estado = pagoGuardado?.estado ?? 'pendiente'
                return (
                  <React.Fragment key={paciente.id}>
                    <tr>
                      <td>{paciente.nombre}</td>
                      <td>{paciente.servicio === 'inclusion_escolar' ? 'Inclusión escolar' : 'Tratamiento'}</td>
                      <td>{liq.modulos_facturables}</td>
                      <td>{liq.horas_facturables}</td>
                      <td>{liq.valor_hora != null ? `$${Number(liq.valor_hora).toLocaleString('es-AR')}` : <span className="pill pill-red">Sin tarifa</span>}</td>
                      <td style={{ fontWeight: 700 }}>{liq.monto_total != null ? `$${liq.monto_total.toLocaleString('es-AR')}` : '—'}</td>
                      <td>
                        <select
                          value={estado}
                          onChange={(e) => guardarLiquidacion(paciente, liq, e.target.value)}
                          style={{ width: 150 }}
                        >
                          {ESTADOS_PAGO.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-outline" onClick={() => setDetalleAbierto(detalleAbierto === paciente.id ? null : paciente.id)}>
                          {detalleAbierto === paciente.id ? 'Ocultar' : 'Detalle'}
                        </button>
                      </td>
                    </tr>
                    {detalleAbierto === paciente.id && (
                      <tr>
                        <td colSpan={8} style={{ background: '#fafaf7' }}>
                          <DetalleSesiones detalle={liq.detalle} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {liquidaciones.length === 0 && <tr><td colSpan={8} className="muted">No hay pacientes activos.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function DetalleSesiones({ detalle }) {
  if (!detalle.length) return <p className="muted">Sin sesiones programadas este mes.</p>
  return (
    <table style={{ margin: '8px 0' }}>
      <thead><tr><th>Fecha</th><th>Módulos</th><th>Estado</th><th>¿Cobra?</th><th>Motivo</th></tr></thead>
      <tbody>
        {detalle.map((d, i) => (
          <tr key={i}>
            <td>{d.fecha}</td>
            <td>{d.modulos}</td>
            <td>{d.estado}</td>
            <td>{d.cobra ? <span className="pill pill-green">Sí</span> : <span className="pill pill-gray">No</span>}</td>
            <td className="muted">{d.motivo ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
