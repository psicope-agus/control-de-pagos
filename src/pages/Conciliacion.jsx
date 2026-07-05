import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { calcularLiquidacion } from '../lib/liquidacion'
import { parsearComprobante, agruparPorPacienteYMes, nombresCoinciden, nombreMesConciliacion } from '../lib/conciliacion'

const CLAVE_LOCAL = 'conciliacion_borrador'

export default function Conciliacion() {
  const [nombreProfesional, setNombreProfesional] = useState('ARRASCAETA AGUSTINA DOLORES')
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState(null)
  const [descartadas, setDescartadas] = useState([])
  const [loading, setLoading] = useState(false)
  const [detalleAbierto, setDetalleAbierto] = useState(null)
  const [verDescartadas, setVerDescartadas] = useState(false)
  const [historial, setHistorial] = useState([])
  const [mensajeGuardado, setMensajeGuardado] = useState('')
  const [error, setError] = useState('')
  const [registrados, setRegistrados] = useState({})

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_LOCAL)
    if (guardado) {
      try {
        const { texto: t, nombreProfesional: n } = JSON.parse(guardado)
        if (t) setTexto(t)
        if (n) setNombreProfesional(n)
      } catch { /* ignorar borrador corrupto */ }
    }
    cargarHistorial()
  }, [])

  useEffect(() => {
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify({ texto, nombreProfesional }))
  }, [texto, nombreProfesional])

  async function cargarHistorial() {
    const { data } = await supabase.from('conciliaciones').select('id, nombre_profesional, created_at, resultados').order('created_at', { ascending: false }).limit(20)
    setHistorial(data ?? [])
  }

  async function procesar() {
    setLoading(true)
    setMensajeGuardado('')
    setError('')
    try {
      const { filas, descartadas: desc } = parsearComprobante(texto, nombreProfesional)
      setDescartadas(desc)
      const grupos = agruparPorPacienteYMes(filas)

      if (grupos.length === 0) {
        setResultados([])
        setError('No se pudo identificar ninguna fila válida en el texto pegado. Revisá el detalle de líneas no interpretadas más abajo.')
        return
      }

      const { data: pacientes, error: errPacientes } = await supabase.from('pacientes').select('*')
      if (errPacientes) throw new Error('Error al leer pacientes: ' + errPacientes.message)
      const { data: tarifas, error: errTarifas } = await supabase.from('tarifas').select('*')
      if (errTarifas) throw new Error('Error al leer tarifas: ' + errTarifas.message)

      const salida = []
      for (const g of grupos) {
        const paciente = (pacientes ?? []).find((p) => nombresCoinciden(p.nombre, g.pacienteRaw))

        if (!paciente) {
          salida.push({ ...g, paciente: null, sistema: null })
          continue
        }

        const desde = `${g.anio}-${String(g.mes).padStart(2, '0')}-01`
        const hasta = `${g.anio}-${String(g.mes).padStart(2, '0')}-31`
        const [rTurnos, rFeriados, rAsistencias] = await Promise.all([
          supabase.from('turnos').select('*').eq('paciente_id', paciente.id).eq('activo', true),
          supabase.from('feriados').select('*').gte('fecha', desde).lte('fecha', hasta).eq('afecta_cobro', true),
          supabase.from('asistencias').select('*').eq('paciente_id', paciente.id).gte('fecha', desde).lte('fecha', hasta),
        ])
        if (rTurnos.error) throw new Error(`Error al leer turnos de ${paciente.nombre}: ` + rTurnos.error.message)
        if (rFeriados.error) throw new Error('Error al leer feriados: ' + rFeriados.error.message)
        if (rAsistencias.error) throw new Error(`Error al leer asistencias de ${paciente.nombre}: ` + rAsistencias.error.message
