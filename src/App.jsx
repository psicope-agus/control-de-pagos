import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login.jsx'
import Pacientes from './pages/Pacientes.jsx'
import Turnos from './pages/Turnos.jsx'
import Asistencia from './pages/Asistencia.jsx'
import Pagos from './pages/Pagos.jsx'
import Feriados from './pages/Feriados.jsx'
import Tarifas from './pages/Tarifas.jsx'
import Conciliacion from './pages/Conciliacion.jsx'
import Resumen from './pages/Resumen.jsx'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = cargando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div style={{ padding: 40 }}>Cargando…</div>
  if (!session) return <Login />

  return (
    <HashRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">Consultorio</div>
          <nav>
            <NavLink to="/pacientes" className={({ isActive }) => (isActive ? 'active' : '')}>Pacientes</NavLink>
            <NavLink to="/turnos" className={({ isActive }) => (isActive ? 'active' : '')}>Turnos</NavLink>
            <NavLink to="/asistencia" className={({ isActive }) => (isActive ? 'active' : '')}>Asistencia</NavLink>
            <NavLink to="/pagos" className={({ isActive }) => (isActive ? 'active' : '')}>Pagos</NavLink>
            <NavLink to="/resumen" className={({ isActive }) => (isActive ? 'active' : '')}>Resumen</NavLink>
            <NavLink to="/tarifas" className={({ isActive }) => (isActive ? 'active' : '')}>Tarifas</NavLink>
            <NavLink to="/feriados" className={({ isActive }) => (isActive ? 'active' : '')}>Feriados</NavLink>
            <NavLink to="/conciliacion" className={({ isActive }) => (isActive ? 'active' : '')}>Conciliación</NavLink>
            <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 20 }}>Cerrar sesión</button>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/pacientes" replace />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/turnos" element={<Turnos />} />
            <Route path="/asistencia" element={<Asistencia />} />
            <Route path="/pagos" element={<Pagos />} />
            <Route path="/resumen" element={<Resumen />} />
            <Route path="/tarifas" element={<Tarifas />} />
            <Route path="/feriados" element={<Feriados />} />
            <Route path="/conciliacion" element={<Conciliacion />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
