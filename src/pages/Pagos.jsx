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
  const [liquidaciones, setLiquidaciones] = useState([])
  const [pagosGuardados, setPagosGuardados] = useState({})
  const [loading, setLoading] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(null)
  const [estadosDelAnio, setEstadosDelAnio] = useState({})

  useEffect(() => { calcular() }, [anio, mes])
  useEffect(() => { cargarEstadosDelAnio() }, [anio])

  async function cargarEstadosDelAnio() {
    const { data } = await supabase.from('pagos').select('mes, estado').eq('anio', anio)
    const porMes = {}
    for (let m = 1; m <= 12; m++) {
      const filas = (data ?? []).filter((p) => p.mes === m)
      if (filas.length === 0) porMes[m] = 'vacio'
      else if (filas.every((f) => f.estado === 'completado')) porMes[m] = 'completado'
      else porMes[m] = 'parcial'
    }
    setEstadosDelAnio(porMes)
  }

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
    cargarEstadosDelAnio()
  }

  const totalMes = useMemo(() => liquidaciones.reduce((acc, r) => acc + (r.liq.monto_total ?? 0), 0), [liquidaciones])
  const totalLiquidado = useMemo(
    () => Object.values(pagosGuardados).filter((p) => p.estado === 'completado').reduce((acc, p) => acc + (Number(p.monto_total) || 0), 0),
    [pagosGuardados]
  )
  const totalPendiente = totalMes - totalLiquidado

  const { pendientes, pagados } = useMemo(() => {
    const pendientes = []
    const pagados = []
    for (const r of liquidaciones) {
      const estado = pagosGuardados[r.paciente.id]?.estado ?? 'pendiente'
      if (estado === 'completado') pagados.push(r)
      else pendientes.push(r)
    }
    return { pendientes, pagados }
  }, [liquidaciones, pagosGuardados])

  return (
    <div>
      <div className="topbar"><h1>Pagos</h1></div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <MenuMeses anio={anio} setAnio={setAnio} mes={mes} setMes={setMes} estados={estadosDelAnio} hoy={hoy} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <Total label="Total a liquidar" valor={totalMes} color="var(--brand)" />
              <Total label="Total liquidado" valor={totalLiquidado} color="#245a3a" />
              <Total label="Pendiente de cobrar" valor={totalPendiente} color={totalPendiente > 0.009 ? 'var(--red)' : 'var(--ink-soft)'} />
            </div>
          </div>

          {loading ? (
            <div className="card"><p className="muted">Calculando…</p></div>
          ) : (
            <>
              <SeccionPacientes
                titulo="Pendientes de cobro"
                colorTitulo="var(--amber)"
                filas={pendientes}
                vacio="No hay pacientes pendientes de cobro este mes. 🎉"
                pagosGuardados={pagosGuardados}
                guardarLiquidacion={guardarLiquidacion}
                detalleAbierto={detalleAbierto}
                setDetalleAbierto={setDetalleAbierto}
              />
              <SeccionPacientes
                titulo="Pagados"
                colorTitulo="#245a3a"
                filas={pagados}
                vacio="Todavía no marcaste ningún pago como completado este mes."
                pagosGuardados={pagosGuardados}
                guardarLiquidacion={guardarLiquidacion}
                detalleAbierto={detalleAbierto}
                setDetalleAbierto={setDetalleAbierto}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Total({ label, valor, color }) {
  return (
    <div>
      <div className="muted">{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>
        ${valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
      </div>
    </div>
  )
}

function MenuMeses({ anio, setAnio, mes, setMes, estados, hoy }) {
  const colorPorEstado = { completado: '#2f5b4f', parcial: '#c97b2e', vacio: '#d8d4cb' }

  return (
    <div style={{ width: 190, flexShrink: 0 }}>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button className="btn btn-outline" onClick={() => setAnio(anio - 1)} style={{ padding: '3px 10px' }}>‹</button>
          <strong style={{ fontSize: '1.05rem' }}>{anio}</strong>
          <button className="btn btn-outline" onClick={() => setAnio(anio + 1)} style={{ padding: '3px 10px' }}>›</button>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const activo = m === mes
            const esHoy = anio === hoy.getFullYear() && m === hoy.getMonth() + 1
            return (
              <button
                key={m}
                onClick={() => setMes(m)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', borderRadius: 8, border: 'none', textAlign: 'left',
                  background: activo ? 'var(--brand-light)' : 'transparent',
                  fontWeight: activo ? 700 : 500,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontSize: '0.92rem',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorPorEstado[estados[m] ?? 'vacio'], flexShrink: 0 }} />
                {nombreMes(m)}
                {esHoy && <span className="muted" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>hoy</span>}
              </button>
            )
          })}
        </nav>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: '0.76rem' }} className="muted">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorPorEstado.completado, display: 'inline-block' }} /> Todo cobrado
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorPorEstado.parcial, display: 'inline-block' }} /> Parcial
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorPorEstado.vacio, display: 'inline-block' }} /> Sin cargar
          </div>
        </div>
      </div>
    </div>
  )
}

function SeccionPacientes({ titulo, colorTitulo, filas, vacio, pagosGuardados, guardarLiquidacion, detalleAbierto, setDetalleAbierto }) {
  const subtotal = filas.reduce((acc, r) => acc + (r.liq.monto_total ?? 0), 0)
  return (
    <div className="card">
      <div className="topbar" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: colorTitulo }}>{titulo} <span className="muted" style={{ fontWeight: 400, fontSize: '0.85rem' }}>({filas.length})</span></h3>
        {filas.length > 0 && <span className="muted">Subtotal: ${subtotal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>}
      </div>
      {filas.length === 0 ? (
        <p className="muted">{vacio}</p>
      ) : (
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
            {filas.map(({ paciente, liq }) => {
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
                      <select value={estado} onChange={(e) => guardarLiquidacion(paciente, liq, e.target.value)} style={{ width: 150 }}>
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
          </tbody>
        </table>
      )}
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
