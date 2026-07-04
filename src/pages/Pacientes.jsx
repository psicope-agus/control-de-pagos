import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SERVICIOS = [
  { value: 'inclusion_escolar', label: 'Inclusión escolar' },
  { value: 'tratamiento', label: 'Tratamiento / Rehabilitación' },
]

export default function Pacientes() {
  const [pacientes, setPacientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState(null) // objeto paciente o null
  const [mostrarForm, setMostrarForm] = useState(false)

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
    } else {
      await supabase.from('pacientes').insert(paciente)
    }
    setMostrarForm(false)
    setEditando(null)
    cargar()
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
                    <button className="btn btn-outline" style={{ marginRight: 6 }} onClick={() => { setEditando(p); setMostrarForm(true) }}>Editar</button>
                    <button className="btn btn-danger" onClick={() => eliminar(p.id)}>Eliminar</button>
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
