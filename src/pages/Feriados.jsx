import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TIPOS = [
  { value: 'feriado_fijo', label: 'Feriado fijo' },
  { value: 'feriado_trasladable', label: 'Feriado trasladable' },
  { value: 'no_laborable', label: 'Día no laborable' },
]

export default function Feriados() {
  const [feriados, setFeriados] = useState([])
  const [anioFiltro, setAnioFiltro] = useState(new Date().getFullYear())
  const [nuevo, setNuevo] = useState({ fecha: '', descripcion: '', tipo: 'feriado_fijo', afecta_cobro: true })

  async function cargar() {
    const { data } = await supabase.from('feriados').select('*')
      .gte('fecha', `${anioFiltro}-01-01`).lte('fecha', `${anioFiltro}-12-31`)
      .order('fecha')
    setFeriados(data ?? [])
  }
  useEffect(() => { cargar() }, [anioFiltro])

  async function agregar(e) {
    e.preventDefault()
    await supabase.from('feriados').insert(nuevo)
    setNuevo({ fecha: '', descripcion: '', tipo: 'feriado_fijo', afecta_cobro: true })
    cargar()
  }

  async function eliminar(id) {
    await supabase.from('feriados').delete().eq('id', id)
    cargar()
  }

  return (
    <div>
      <div className="topbar"><h1>Calendario de feriados (Argentina)</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        Los feriados trasladables cambian por decreto cada año: cargá manualmente el calendario de cada año
        antes de liquidar. 2026 ya viene precargado desde el esquema SQL.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Agregar feriado / día no laborable</h3>
        <form onSubmit={agregar} className="grid cols-4">
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} required />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} required />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}>
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>¿No se cobra ese día?</label>
            <select value={nuevo.afecta_cobro ? '1' : '0'} onChange={(e) => setNuevo({ ...nuevo, afecta_cobro: e.target.value === '1' })}>
              <option value="1">Sí, descontar de la liquidación</option>
              <option value="0">No, se cobra igual</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary" type="submit">+ Agregar</button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="field" style={{ maxWidth: 160, marginBottom: 12 }}>
          <label>Año</label>
          <input type="number" value={anioFiltro} onChange={(e) => setAnioFiltro(Number(e.target.value))} />
        </div>
        <table>
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Afecta cobro</th><th></th></tr></thead>
          <tbody>
            {feriados.map((f) => (
              <tr key={f.id}>
                <td>{f.fecha}</td>
                <td>{f.descripcion}</td>
                <td>{TIPOS.find((t) => t.value === f.tipo)?.label ?? f.tipo}</td>
                <td><span className={`pill ${f.afecta_cobro ? 'pill-amber' : 'pill-gray'}`}>{f.afecta_cobro ? 'No se cobra' : 'Se cobra igual'}</span></td>
                <td><button className="btn btn-danger" onClick={() => eliminar(f.id)}>Eliminar</button></td>
              </tr>
            ))}
            {feriados.length === 0 && <tr><td colSpan={5} className="muted">No hay feriados cargados para {anioFiltro}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
