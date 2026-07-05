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

  async function
