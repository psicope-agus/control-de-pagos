import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SERVICIOS = [
  { value: 'inclusion_escolar', label: 'Inclusión escolar' },
  { value: 'tratamiento', label: 'Tratamiento / Rehabilitación' },
]

export default function Tarifas() {
  const [tarifas, setTarifas] = useState([])
  const [nuevo, setNuevo] = useState({ servicio: 'tratamiento', valor_hora: '', vigente_desde: new Date().toISOString().slice(0, 10) })

  async function cargar() {
    const { data } = await supabase.from('tarifas').select('*').order('vigente_desde', { ascending: false })
    setTarifas(data ?? [])
  }
  useEffect(() => { cargar() }, [])

  async function agregar(e) {
    e.preventDefault()
    // cierra automáticamente la tarifa anterior del mismo servicio (vigente_hasta = día antes)
    const anteriores = tarifas.filter((t) => t.servicio === nuevo.servicio && !t.vigente_hasta)
    for (const anterior of anteriores) {
      const diaAntes = new Date(nuevo.vigente_desde)
      diaAntes.setDate(diaAntes.getDate() - 1)
      await supabase.from('tarifas').update({ vigente_hasta: diaAntes.toISOString().slice(0, 10) }).eq('id', anterior.id)
    }
    await supabase.from('tarifas').insert({ ...nuevo, valor_hora: Number(nuevo.valor_hora) })
    setNuevo({ servicio: nuevo.servicio, valor_hora: '', vigente_desde: new Date().toISOString().slice(0, 10) })
    cargar()
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta tarifa?')) return
    await supabase.from('tarifas').delete().eq('id', id)
    cargar()
  }

  return (
    <div>
      <div className="topbar"><h1>Tarifas</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 20 }}>
        El valor por módulo depende del servicio y cambia con el tiempo. Al agregar una tarifa nueva para un servicio,
        la anterior se cierra automáticamente el día previo.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Nueva tarifa</h3>
        <form onSubmit={agregar} className="grid cols-3">
          <div className="field">
            <label>Servicio</label>
            <select value={nuevo.servicio} onChange={(e) => setNuevo({ ...nuevo, servicio: e.target.value })}>
              {SERVICIOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Valor por módulo ($)</label>
            <input type="number" step="0.01" value={nuevo.valor_hora} onChange={(e) => setNuevo({ ...nuevo, valor_hora: e.target.value })} required />
          </div>
          <div className="field">
            <label>Vigente desde</label>
            <input type="date" value={nuevo.vigente_desde} onChange={(e) => setNuevo({ ...nuevo, vigente_desde: e.target.value })} required />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="btn btn-primary" type="submit">+ Agregar tarifa</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table>
          <thead><tr><th>Servicio</th><th>Valor por módulo</th><th>Vigente desde</th><th>Vigente hasta</th><th></th></tr></thead>
          <tbody>
            {tarifas.map((t) => (
              <tr key={t.id}>
                <td>{SERVICIOS.find((s) => s.value === t.servicio)?.label}</td>
                <td>${Number(t.valor_hora).toLocaleString('es-AR')}</td>
                <td>{t.vigente_desde}</td>
                <td>{t.vigente_hasta ?? <span className="pill pill-green">Vigente</span>}</td>
                <td><button className="btn btn-danger" onClick={() => eliminar(t.id)}>Eliminar</button></td>
              </tr>
            ))}
            {tarifas.length === 0 && <tr><td colSpan={5} className="muted">No hay tarifas cargadas todavía.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
