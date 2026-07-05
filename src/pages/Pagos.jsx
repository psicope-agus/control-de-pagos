import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion, nombreMes, ultimoDiaDelMes } from '../lib/liquidacion'

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
    const hasta = ultimoDiaDelMes(anio, mes)

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
  const totalLiquidado = useMemo(
    () => Object.values(pagosGuardados).filter((p) => p.estado === 'completado').reduce((acc, p) => acc + (Number(p.monto_total) || 0), 0),
    [pagosGuardados]
  )
  const totalPendiente = totalMes - totalLiquidado

  const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1

  function irMesAnterior() {
    if (mes === 1) { setMes(12); setAnio(anio - 1) } else { setMes(mes - 1) }
  }
  function irMesSiguiente() {
    if (mes === 12) { setMes(1); setAnio(anio + 1) } else { setMes(mes + 1) }
  }
  function irHoy() {
    setAnio(hoy.getFullYear())
    setMes(hoy.getMonth() + 1)
  }

  return (
    <div>
      <div className="topbar">
        <h1>Pagos</h1>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-outline" onClick={irMesAnterior} aria-label="Mes anterior" style={{ padding: '9px 14px', fontSize: '1.1rem' }}>‹</button>
            <div style={{ minWidth: 190, textAlign: 'center' }}>
              <div className="display" style={{ fontSize: '1.4rem' }}>{nombreMes(mes)} {anio}</div>
            </div>
            <button className="btn btn-outline" onClick={irMesSiguiente} aria-label="Mes siguiente" style={{ padding: '9px 14px', fontSize: '1.1rem' }}>›</button>
            {!esMesActual && (
              <button className="btn btn-outline" onClick={irHoy} style={{ marginLeft: 4 }}>Hoy</button>
            )}
            <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 90, marginLeft: 8 }}>
              {Array.from({ length: 7 }, (_, i) => hoy.getFullYear() - 3 + i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 28 }}>
            <div>
              <div className="muted">Total a liquidar</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand)' }}>
                ${totalMes.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="muted">Total liquidado</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#245a3a' }}>
                ${totalLiquidado.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="muted">Pendiente de cobrar</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: totalPendiente > 0.009 ? 'var(--red)' : 'var(--ink-soft)' }}>
                ${totalPendiente.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
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
                <th>Horas (informativo)</th>
                <th>Valor por módulo</th>
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
