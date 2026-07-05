import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { nombreMes, DIAS_SEMANA, ultimoDiaDelMes } from '../lib/liquidacion'

const ESTADOS = [
  { value: 'presente', label: 'Presente', pill: 'pill-green' },
  { value: 'ausente_aviso', label: 'Ausente con aviso', pill: 'pill-gray' },
  { value: 'ausente_sin_aviso', label: 'Ausente sin aviso', pill: 'pill-red' },
  { value: 'no_firmado', label: 'No se firmó', pill: 'pill-amber' },
]

function fechasDelMesPorDia(anio, mes, diaSemana) {
  const fechas = []
  const totalDias = new Date(anio, mes, 0).getDate()
  for (let d = 1; d <= totalDias; d++) {
    const f = new Date(anio, mes - 1, d)
    if (f.getDay() === diaSemana) fechas.push(f.toISOString().slice(0, 10))
  }
  return fechas
}

export default function Asistencia() {
  const hoy = new Date()
  const [pacientes, setPacientes] = useState([])
  const [pacienteId, setPacienteId] = useState('')
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [turnos, setTurnos] = useState([])
  const [feriados, setFeriados] = useState([])
  const [asistencias, setAsistencias] = useState({}) // key: turnoId_fecha -> row

  useEffect(() => {
    supabase.from('pacientes').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setPacientes(data ?? [])
      if (data?.length) setPacienteId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!pacienteId) return
    cargarTodo()
  }, [pacienteId, anio, mes])

  async function cargarTodo() {
    const { data: t } = await supabase.from('turnos').select('*').eq('paciente_id', pacienteId).eq('activo', true)
    setTurnos(t ?? [])

    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const hasta = ultimoDiaDelMes(anio, mes)
    const { data: f } = await supabase.from('feriados').select('*').gte('fecha', desde).lte('fecha', hasta).eq('afecta_cobro', true)
    setFeriados(f ?? [])

    const { data: a } = await supabase.from('asistencias').select('*').eq('paciente_id', pacienteId).gte('fecha', desde).lte('fecha', hasta)
    const map = {}
    ;(a ?? []).forEach((row) => { map[`${row.turno_id}_${row.fecha}`] = row })
    setAsistencias(map)
  }

  const sesiones = useMemo(() => {
    const feriadosSet = new Set(feriados.map((f) => f.fecha))
    const list = []
    for (const turno of turnos) {
      for (const fecha of fechasDelMesPorDia(anio, mes, turno.dia_semana)) {
        list.push({ turno, fecha, esFeriado: feriadosSet.has(fecha) })
      }
    }
    return list.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  }, [turnos, feriados, anio, mes])

  async function marcar(turnoId, fecha, estado) {
    const key = `${turnoId}_${fecha}`
    const existente = asistencias[key]
    const turno = turnos.find((t) => t.id === turnoId)
    const payload = { paciente_id: pacienteId, turno_id: turnoId, fecha, estado, modulos: existente?.modulos ?? turno.modulos }
    const { data } = await supabase.from('asistencias').upsert(payload, { onConflict: 'paciente_id,turno_id,fecha' }).select().single()
    setAsistencias({ ...asistencias, [key]: data })
  }

  const resumen = useMemo(() => {
    let presente = 0, ausenteAviso = 0, ausenteSinAviso = 0, noFirmado = 0, feriado = 0
    for (const s of sesiones) {
      if (s.esFeriado) { feriado += s.turno.modulos; continue }
      const a = asistencias[`${s.turno.id}_${s.fecha}`]
      const estado = a?.estado ?? 'presente'
      const modulos = a?.modulos ?? s.turno.modulos
      if (estado === 'presente') presente += modulos
      else if (estado === 'ausente_aviso') ausenteAviso += modulos
      else if (estado === 'ausente_sin_aviso') ausenteSinAviso += modulos
      else if (estado === 'no_firmado') noFirmado += modulos
    }
    const facturables = presente + ausenteSinAviso + noFirmado
    return { presente, ausenteAviso, ausenteSinAviso, noFirmado, feriado, facturables }
  }, [sesiones, asistencias])

  return (
    <div>
      <div className="topbar">
        <h1>Asistencia — {nombreMes(mes)} {anio}</h1>
      </div>

      <div className="card">
        <div className="grid cols-3">
          <div className="field">
            <label>Paciente</label>
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
              {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
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
        </div>
      </div>

      <div className="card">
        <div className="grid cols-4" style={{ textAlign: 'center' }}>
          <Stat label="Módulos facturables" value={resumen.facturables} highlight />
          <Stat label="Ausente con aviso (no cobra)" value={resumen.ausenteAviso} />
          <Stat label="Feriado / no laborable" value={resumen.feriado} />
          <Stat label="No se firmó" value={resumen.noFirmado} />
        </div>
      </div>

      <div className="card">
        {turnos.length === 0 ? (
          <p className="muted">Este paciente no tiene turnos activos cargados. Cargalos en la sección Turnos.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Fecha</th><th>Día</th><th>Turno</th><th>Módulos</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {sesiones.map((s) => {
                const key = `${s.turno.id}_${s.fecha}`
                const a = asistencias[key]
                const estado = a?.estado ?? 'presente'
                return (
                  <tr key={key}>
                    <td>{s.fecha}</td>
                    <td>{DIAS_SEMANA[s.turno.dia_semana]}</td>
                    <td>{s.turno.hora_inicio} · {s.turno.modulos} mód.</td>
                    <td>{a?.modulos ?? s.turno.modulos}</td>
                    <td>
                      {s.esFeriado ? (
                        <span className="pill pill-amber">Feriado / no laborable</span>
                      ) : (
                        <select value={estado} onChange={(e) => marcar(s.turno.id, s.fecha, e.target.value)} style={{ width: 200 }}>
                          {ESTADOS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: highlight ? 'var(--brand)' : 'var(--ink)' }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  )
}
