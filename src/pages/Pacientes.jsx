import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DIAS_SEMANA } from '../lib/liquidacion'

const SERVICIOS = [
  { value: 'inclusion_escolar', label: 'Inclusión escolar' },
  { value: 'tratamiento', label: 'Tratamiento / Rehabilitación' },
]

const MINUTOS_POR_MODULO_DEFAULT = 45

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // objeto paciente o null
  const [mostrarForm, setMostrarForm] = useState(false)
  const [turnosAbiertos, setTurnosAbiertos] = useState(null) // id del paciente cuyos turnos se están mostrando

  async function cargar() {
    setLoading(true)
    const { data, error } = await supabase.from('pacientes').select('*').order('nombre')
    if (!error) setPacientes(data)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function guardar(paciente) {
    if (paciente.id) {
      await supabase.from('pacientes').update(paciente).eq('id', paciente.id)
      setMostrarForm(false)
      setEditando(null)
      cargar()
    } else {
      const { data } = await supabase.from('pacientes').insert(paciente).select().single()
      setMostrarForm(false)
      setEditando(null)
      await cargar()
      // al crear un paciente nuevo, abrimos directo su panel de turnos para cargarlos en el momento
      if (data) setTurnosAbiertos(data.id)
    }
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar este paciente? También se eliminarán sus turnos y asistencias.')) return
    await supabase.from('pacientes').delete().eq('id', id)
    cargar()
  }

  return (
    <div>
      <div className="topbar">
        <h1>Pacientes</h1>
        <button className="btn btn-primary" onClick={() => { setEditando({ nombre: '', servicio: 'tratamiento', activo: true }); setMostrarForm(true) }}>
          + Nuevo paciente
        </button>
      </div>

      {mostrarForm && (
        <div className="card">
          <FormPaciente
            paciente={editando}
            onCancel={() => { setMostrarForm(false); setEditando(null) }}
            onSave={guardar}
          />
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Servicio</th>
                <th>Inicio</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pacientes.map((p) => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{SERVICIOS.find((s) => s.value === p.servicio)?.label ?? p.servicio}</td>
                  <td>{p.fecha_inicio ?? '—'}</td>
                  <td>
                    <span className={`pill ${p.activo ? 'pill-green' : 'pill-gray'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  </td>
                  <td>
                    <button className="btn btn-outline" style={{ marginRight: 6 }} onClick={() => setTurnosAbiertos(turnosAbiertos === p.id ? null : p.id)}>
                      {turnosAbiertos === p.id ? 'Ocultar turnos' : 'Turnos'}
                    </button>
                    <button className="btn btn-outline" style={{ marginRight: 6 }} onClick={() => { setEditando(p); setMostrarForm(true) }}>Editar</button>
                    <button className="btn btn-danger" onClick={() => eliminar(p.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {pacientes.map((p) => turnosAbiertos === p.id && (
                <tr key={`turnos-${p.id}`}>
                  <td colSpan={5} style={{ background: '#fafaf7' }}>
                    <TurnosDePaciente pacienteId={p.id} />
                  </td>
                </tr>
              ))}
              {pacientes.length === 0 && (
                <tr><td colSpan={5} className="muted">Todavía no hay pacientes cargados.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function TurnosDePaciente({ pacienteId }) {
  const [turnos, setTurnos] = useState([])
  const [nuevo, setNuevo] = useState({ dia_semana: 1, hora_inicio: '09:00', modulos: 1 })

  async function cargarTurnos() {
    const { data } = await supabase.from('turnos').select('*').eq('paciente_id', pacienteId).order('dia_semana').order('hora_inicio')
    setTurnos(data ?? [])
  }
  useEffect(() => { cargarTurnos() }, [pacienteId])

  async function agregarTurno(e) {
    e.preventDefault()
    await supabase.from('turnos').insert({ ...nuevo, minutos_por_modulo: MINUTOS_POR_MODULO_DEFAULT, paciente_id: pacienteId })
    setNuevo({ dia_semana: 1, hora_inicio: '09:00', modulos: 1 })
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

  return (
    <div style={{ padding: '10px 4px' }}>
      <form onSubmit={agregarTurno} className="grid cols-3" style={{ marginBottom: 14 }}>
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
        <div style={{ gridColumn: '1 / -1' }}>
          <button className="btn btn-primary" type="submit">+ Agregar turno</button>
        </div>
      </form>

      <table>
        <thead><tr><th>Día</th><th>Hora</th><th>Módulos</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {turnos.map((t) => (
            <tr key={t.id}>
              <td>{DIAS_SEMANA[t.dia_semana]}</td>
              <td>{t.hora_inicio}</td>
              <td>{t.modulos}</td>
              <td>
                <span className={`pill ${t.activo ? 'pill-green' : 'pill-gray'}`} style={{ cursor: 'pointer' }} onClick={() => toggleActivo(t)}>
                  {t.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td><button className="btn btn-danger" onClick={() => eliminarTurno(t.id)}>Eliminar</button></td>
            </tr>
          ))}
          {turnos.length === 0 && <tr><td colSpan={5} className="muted">Sin turnos cargados todavía.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

function FormPaciente({ paciente, onCancel, onSave }) {
  const [form, setForm] = useState(paciente)

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }}>
      <div className="grid cols-2">
        <div className="field">
          <label>Nombre completo</label>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        </div>
        <div className="field">
          <label>Servicio</label>
          <select value={form.servicio} onChange={(e) => setForm({ ...form, servicio: e.target.value })}>
            {SERVICIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Fecha de inicio</label>
          <input type="date" value={form.fecha_inicio ?? ''} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={form.activo ? '1' : '0'} onChange={(e) => setForm({ ...form, activo: e.target.value === '1' })}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Notas</label>
        <textarea rows={2} value={form.notas ?? ''} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ marginRight: 8 }}>Guardar</button>
      <button type="button" className="btn btn-outline" onClick={onCancel}>Cancelar</button>
    </form>
  )
}
