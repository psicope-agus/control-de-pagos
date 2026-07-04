import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DIAS_SEMANA } from '../lib/liquidacion'

export default function Turnos() {
  const [pacientes, setPacientes] = useState([])
  const [pacienteId, setPacienteId] = useState('')
  const [turnos, setTurnos] = useState([])
  const [nuevo, setNuevo] = useState({ dia_semana: 1, hora_inicio: '09:00', modulos: 1, minutos_por_modulo: 60 })

  useEffect(() => {
    supabase.from('pacientes').select('*').eq('activo', true).order('nombre').then(({ data }) => {
      setPacientes(data ?? [])
      if (data?.length) setPacienteId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (!pacienteId) return
    cargarTurnos()
  }, [pacienteId])

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*').eq('paciente_id', pacienteId).order('dia_semana').order('hora_inicio')
    setTurnos(data ?? [])
  }

  async function agregarTurno(e) {
    e.preventDefault()
    await supabase.from('turnos').insert({ ...nuevo, paciente_id: pacienteId })
    setNuevo({ dia_semana: 1, hora_inicio: '09:00', modulos: 1, minutos_por_modulo: 60 })
    cargarTurnos()
  }

  async function eliminarTurno(id) {
    await supabase.from('turnos').delete().eq('id', id)
    cargarTurnos()
  }

  async function toggleActivo(t) {
    await supabase.from('turnos').update({ activo: !t.activo }).eq('id', t.id)
    cargarTurnos()
  }

  const totalModulosSemana = turnos.filter((t) => t.activo).reduce((a, t) => a + t.modulos, 0)

  return (
    <div>
      <div className="topbar">
        <h1>Turnos semanales</h1>
      </div>

      <div className="card">
        <div className="field" style={{ maxWidth: 340 }}>
          <label>Paciente</label>
          <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}>
            {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>

      {pacienteId && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Agregar turno</h3>
            <form onSubmit={agregarTurno} className="grid cols-4">
              <div className="field">
                <label>Día</label>
                <select value={nuevo.dia_semana} onChange={(e) => setNuevo({ ...nuevo, dia_semana: Number(e.target.value) })}>
                  {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Hora de inicio</label>
                <input type="time" value={nuevo.hora_inicio} onChange={(e) => setNuevo({ ...nuevo, hora_inicio: e.target.value })} required />
              </div>
              <div className="field">
                <label>Módulos seguidos</label>
                <input type="number" min={1} value={nuevo.modulos} onChange={(e) => setNuevo({ ...nuevo, modulos: Number(e.target.value) })} required />
              </div>
              <div className="field">
                <label>Minutos por módulo</label>
                <input type="number" min={5} step={5} value={nuevo.minutos_por_modulo} onChange={(e) => setNuevo({ ...nuevo, minutos_por_modulo: Number(e.target.value) })} required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary" type="submit">+ Agregar turno</button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="topbar" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Horario actual</h3>
              <span className="muted">{totalModulosSemana} módulos/semana activos</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Día</th><th>Hora</th><th>Módulos</th><th>Min/módulo</th><th>Estado</th><th></th>
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.id}>
                    <td>{DIAS_SEMANA[t.dia_semana]}</td>
                    <td>{t.hora_inicio}</td>
                    <td>{t.modulos}</td>
                    <td>{t.minutos_por_modulo}</td>
                    <td>
                      <span className={`pill ${t.activo ? 'pill-green' : 'pill-gray'}`} style={{ cursor: 'pointer' }} onClick={() => toggleActivo(t)}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td><button className="btn btn-danger" onClick={() => eliminarTurno(t.id)}>Eliminar</button></td>
                  </tr>
                ))}
                {turnos.length === 0 && <tr><td colSpan={6} className="muted">Este paciente no tiene turnos cargados.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
