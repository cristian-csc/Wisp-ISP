import { useEffect, useState, useCallback } from 'react'
import { Plus, X, MessageCircle, AlertTriangle, TrendingUp, ChevronDown } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

const hoy = new Date()
const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
const fechaHoy = hoy.toISOString().split('T')[0]

const METODO_COLORS = {
  efectivo:      'bg-green-50 text-green-600 border border-green-200',
  yape:          'bg-purple-50 text-purple-600 border border-purple-200',
  plin:          'bg-blue-50 text-blue-600 border border-blue-200',
  transferencia: 'bg-orange-50 text-orange-600 border border-orange-200',
}

const inputCls = "w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-sm text-[#1C1C1C] placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700] transition-colors"

function getDiasAtraso(cliente) {
  if (!cliente.fecha_vencimiento) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const venc = new Date(cliente.fecha_vencimiento + 'T00:00:00')
  if (venc >= today) return 0
  return Math.floor((today - venc) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

function ModalPago({ clienteInicial = null, mesInicial = mesActual, onClose, onSaved }) {
  const [busqueda, setBusqueda]   = useState(clienteInicial?.nombre || '')
  const [resultados, setResultados] = useState([])
  const [clienteSel, setClienteSel] = useState(clienteInicial)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({
    mes_pagado:  mesInicial,
    fecha_pago:  fechaHoy,
    monto:       clienteInicial?.plan?.precio || '',
    metodo_pago: 'efectivo',
    referencia:  '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!busqueda || clienteSel) return
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/clientes', { params: { search: busqueda, per_page: 8 } })
        setResultados(data.items)
      } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [busqueda, clienteSel])

  function seleccionar(c) {
    setClienteSel(c)
    setBusqueda(c.nombre)
    setResultados([])
    if (c.plan?.precio) set('monto', c.plan.precio)
  }

  function limpiar() {
    setClienteSel(null)
    setBusqueda('')
    setResultados([])
    set('monto', '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!clienteSel) return toast.error('Seleccione un cliente')
    if (!form.monto || !form.mes_pagado || !form.fecha_pago) return toast.error('Complete todos los campos')
    setSaving(true)
    try {
      await api.post('/pagos', {
        cliente_id:  clienteSel.id,
        monto:       parseFloat(form.monto),
        mes_pagado:  form.mes_pagado,
        fecha_pago:  form.fecha_pago,
        metodo_pago: form.metodo_pago,
        referencia:  form.referencia || null,
        estado:      'pagado',
      })
      toast.success(`Pago registrado — ${clienteSel.nombre}`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE9E0]">
          <h3 className="font-bold text-[#1C1C1C]">Registrar Pago</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C]"><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="relative">
            <label className="text-xs text-[#5A5A6A] mb-1 block">Cliente <span className="text-red-400">*</span></label>
            <div className="relative">
              <input
                className={inputCls + (clienteSel ? ' border-green-400' : '')}
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); if (clienteSel) limpiar() }}
                placeholder="Buscar por nombre, usuario PPPoE..."
                autoComplete="off"
              />
              {clienteSel && (
                <button type="button" onClick={limpiar} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9A9AAA] hover:text-[#1C1C1C]">
                  <X size={14}/>
                </button>
              )}
            </div>
            {resultados.length > 0 && !clienteSel && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-[#E5E0D5] rounded-xl shadow-lg overflow-hidden">
                {resultados.map(c => (
                  <button key={c.id} type="button" onClick={() => seleccionar(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-[#FAF7F0] border-b border-[#F0EBE0] last:border-0">
                    <p className="text-sm text-[#1C1C1C] font-medium">{c.nombre}</p>
                    <p className="text-xs text-[#5A5A6A]">{c.usuario_pppoe} — {c.zona?.nombre} — S/{c.plan?.precio}/mes</p>
                  </button>
                ))}
              </div>
            )}
            {clienteSel && (
              <div className="mt-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
                <p className="text-xs text-green-600 font-medium">{clienteSel.nombre}</p>
                <p className="text-xs text-[#5A5A6A]">{clienteSel.usuario_pppoe} · {clienteSel.zona?.nombre} · Plan {clienteSel.plan?.codigo}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#5A5A6A] mb-1 block">Mes a pagar <span className="text-red-400">*</span></label>
              <input type="month" className={inputCls} value={form.mes_pagado} onChange={e => set('mes_pagado', e.target.value)}/>
            </div>
            <div>
              <label className="text-xs text-[#5A5A6A] mb-1 block">Monto (S/) <span className="text-red-400">*</span></label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="50.00"/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#5A5A6A] mb-1 block">Fecha de pago <span className="text-red-400">*</span></label>
              <input type="date" className={inputCls} value={form.fecha_pago} onChange={e => set('fecha_pago', e.target.value)}/>
            </div>
            <div>
              <label className="text-xs text-[#5A5A6A] mb-1 block">Método</label>
              <select className={inputCls} value={form.metodo_pago} onChange={e => set('metodo_pago', e.target.value)}>
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Referencia / Comprobante</label>
            <input className={inputCls} value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Nro. operación (opcional)"/>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm border border-[#D8D2C5] rounded-xl text-[#5A5A6A] hover:text-[#1C1C1C]">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50">
              {saving ? 'Registrando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Pagos() {
  const [sinPago, setSinPago]       = useState([])
  const [pagos, setPagos]           = useState([])
  const [totalPagos, setTotalPagos] = useState(0)
  const [pagesPagos, setPagesPagos] = useState(1)
  const [pagePagos, setPagePagos]   = useState(1)
  const [mesFilter, setMesFilter]   = useState(mesActual)
  const [zonaFiltro, setZonaFiltro] = useState('')
  const [zonas, setZonas]           = useState([])
  const [vista, setVista]           = useState('vencidos')
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(false)
  const [clienteRapido, setClienteRapido] = useState(null)
  const [dashStats, setDashStats]   = useState(null)
  const [enviandoMasivo, setEnviandoMasivo] = useState(false)
  const [progresoMasivo, setProgresoMasivo] = useState({ actual: 0, total: 0 })

  useEffect(() => {
    api.get('/zonas').then(r => setZonas(r.data)).catch(() => {})
    api.get('/dashboard/stats').then(r => setDashStats(r.data)).catch(() => {})
  }, [])

  const fetchSinPago = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/pagos/clientes-sin-pago', {
        params: { mes: mesFilter },
      })
      let filtered = data
      if (zonaFiltro) filtered = data.filter(c => String(c.zona_id) === String(zonaFiltro))
      setSinPago(filtered)
    } finally {
      setLoading(false)
    }
  }, [mesFilter, zonaFiltro])

  const fetchPagos = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page: pagePagos, per_page: 20 }
      if (mesFilter) params.mes = mesFilter
      const { data } = await api.get('/pagos', { params })
      setPagos(data.items)
      setTotalPagos(data.total)
      setPagesPagos(data.pages)
    } finally {
      setLoading(false)
    }
  }, [pagePagos, mesFilter])

  useEffect(() => {
    if (vista === 'vencidos' || vista === 'pendientes') fetchSinPago()
    else fetchPagos()
  }, [vista, fetchSinPago, fetchPagos])

  function onPagoSaved() {
    fetchSinPago()
    fetchPagos()
  }

  async function enviarAviso(clienteId) {
    try {
      await api.post(`/whatsapp/aviso-cobro/${clienteId}`)
      toast.success('Aviso enviado por WhatsApp')
    } catch {
      toast.error('Error al enviar aviso (¿WhatsApp conectado?)')
    }
  }

  function abrirPagoRapido(cliente) {
    setClienteRapido(cliente)
    setModal(true)
  }

  async function enviarAvisosMasivo(clientes, confirmMsg) {
    if (!clientes.length) return toast('No hay clientes a quién avisar', { icon: 'ℹ️' })
    if (!confirm(confirmMsg)) return

    setEnviandoMasivo(true)
    setProgresoMasivo({ actual: 0, total: clientes.length })

    let enviados = 0
    let errores  = 0

    for (let i = 0; i < clientes.length; i++) {
      setProgresoMasivo({ actual: i + 1, total: clientes.length })
      try {
        await api.post(`/whatsapp/aviso-cobro/${clientes[i].id}`)
        enviados++
      } catch {
        errores++
      }
      if (i < clientes.length - 1) {
        await new Promise(r => setTimeout(r, 8000 + Math.floor(Math.random() * 7000)))
      }
    }

    setEnviandoMasivo(false)
    setProgresoMasivo({ actual: 0, total: 0 })

    if (errores === 0) toast.success(`✓ ${enviados} avisos enviados correctamente`)
    else toast(`${enviados} enviados, ${errores} fallidos`, { icon: '⚠️' })
  }

  const totalPendiente = sinPago.reduce((s, c) => s + (c.plan?.precio || 0), 0)
  const recaudacionMes = dashStats?.ingresos_mes_actual || 0
  const totalEsperado  = recaudacionMes + totalPendiente
  const pctRecaudado   = totalEsperado > 0 ? Math.round((recaudacionMes / totalEsperado) * 100) : 0

  const [y, m] = mesFilter.split('-').map(Number)
  const mesNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m - 1]

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[#1C1C1C]">Gestión de Pagos</h1>
          <p className="text-[#5A5A6A] text-sm mt-0.5">Supervisión de ingresos y control de morosidad en tiempo real.</p>
        </div>
        <button
          onClick={() => { setClienteRapido(null); setModal(true) }}
          className="flex items-center gap-2 bg-[#FFD700] text-[#1C1C1C] font-bold px-4 py-2.5 rounded-xl hover:bg-yellow-400 transition-colors text-sm"
        >
          <Plus size={16}/> Nuevo Pago
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total pendiente */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E0D5] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Total Pendiente</p>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#F97316" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[#1C1C1C]">S/ {totalPendiente.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p>
          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
            <TrendingUp size={11}/> {sinPago.length} clientes en mora
          </p>
        </div>

        {/* Clientes en mora */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E0D5] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Clientes en Mora</p>
            <div className="w-9 h-9 rounded-xl bg-yellow-50 border border-yellow-100 flex items-center justify-center">
              <AlertTriangle size={18} className="text-yellow-500"/>
            </div>
          </div>
          <p className="text-2xl font-black text-[#1C1C1C]">{sinPago.length}</p>
          <p className="text-xs text-[#9A9AAA] mt-1">{mesNombre} {y}</p>
        </div>

        {/* Recaudación esperada */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E0D5] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Recaudación Esperada (Mes)</p>
            <div className="w-9 h-9 rounded-xl bg-[#FFD700]/20 border border-[#FFD700]/30 flex items-center justify-center">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
          </div>
          <p className="text-2xl font-black text-[#1C1C1C]">S/ {totalEsperado.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</p>
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-[#9A9AAA] mb-1">
              <span>{pctRecaudado}% recaudado hasta la fecha</span>
            </div>
            <div className="h-1.5 bg-[#EDE9E0] rounded-full overflow-hidden">
              <div className="h-full bg-[#FFD700] rounded-full transition-all" style={{ width: `${pctRecaudado}%` }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Filters + tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wide">
          Filtrar por:
        </div>

        <div className="relative">
          <select
            value={zonaFiltro}
            onChange={e => { setZonaFiltro(e.target.value) }}
            className="appearance-none bg-white border border-[#E5E0D5] rounded-xl pl-3 pr-7 py-2 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700] cursor-pointer"
          >
            <option value="">Todas las Zonas</option>
            {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9A9AAA] pointer-events-none"/>
        </div>

        <div className="relative">
          <select
            value={mesFilter}
            onChange={e => setMesFilter(e.target.value)}
            className="appearance-none bg-white border border-[#E5E0D5] rounded-xl pl-3 pr-7 py-2 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700] cursor-pointer"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(); d.setMonth(d.getMonth() - i)
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              const label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' })
              return <option key={val} value={val}>{label}</option>
            })}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9A9AAA] pointer-events-none"/>
        </div>

        <div className="ml-auto flex items-center bg-[#EDE9E0] rounded-xl p-0.5">
          <button
            onClick={() => setVista('vencidos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              vista === 'vencidos' ? 'bg-white text-red-600 shadow-sm' : 'text-[#5A5A6A] hover:text-[#1C1C1C]'
            }`}
          >
            VENCIDOS
          </button>
          <button
            onClick={() => setVista('pendientes')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              vista === 'pendientes' ? 'bg-white text-orange-500 shadow-sm' : 'text-[#5A5A6A] hover:text-[#1C1C1C]'
            }`}
          >
            PENDIENTES
          </button>
          <button
            onClick={() => setVista('puntuales')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              vista === 'puntuales' ? 'bg-white text-green-600 shadow-sm' : 'text-[#5A5A6A] hover:text-[#1C1C1C]'
            }`}
          >
            AL DÍA
          </button>
          <button
            onClick={() => setVista('historial')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              vista === 'historial' ? 'bg-white text-[#1C1C1C] shadow-sm' : 'text-[#5A5A6A] hover:text-[#1C1C1C]'
            }`}
          >
            HISTORIAL
          </button>
        </div>
      </div>

      {/* VENCIDOS VIEW */}
      {vista === 'vencidos' && (
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EDE9E0] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-red-600 uppercase tracking-wide">Clientes Vencidos</h2>
              <span className="text-[10px] font-bold bg-red-50 border border-red-200 text-red-500 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {sinPago.filter(c => getDiasAtraso(c) > 0).length} Con Atraso
              </span>
            </div>
            {sinPago.length > 0 && (
              <button
                onClick={() => enviarAvisosMasivo(
                sinPago.filter(c => getDiasAtraso(c) > 0),
                `¿Enviar aviso de cobro a ${sinPago.filter(c => getDiasAtraso(c) > 0).length} clientes vencidos?\n\nSe enviará 1 mensaje cada 8-15 segundos para proteger tu cuenta de WhatsApp.`
              )}
                disabled={enviandoMasivo}
                className="flex items-center gap-1.5 text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-xl hover:bg-green-100 border border-green-200 transition-colors font-semibold disabled:opacity-60 disabled:cursor-wait"
              >
                {enviandoMasivo ? (
                  <>
                    <div className="w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full animate-spin"/>
                    Enviando {progresoMasivo.actual}/{progresoMasivo.total}...
                  </>
                ) : (
                  <>
                    <MessageCircle size={13}/> Avisar a todos por WhatsApp
                  </>
                )}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE9E0] bg-[#FAFAF8]">
                  {['Cliente', 'Plan', 'Fecha Venc.', 'Días Atraso', 'Monto', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-[#9A9AAA]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin"/>
                      Cargando...
                    </div>
                  </td></tr>
                ) : sinPago.filter(c => getDiasAtraso(c) > 0).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-green-600 font-medium">
                    ✓ Sin clientes vencidos en {mesNombre}
                  </td></tr>
                ) : sinPago.filter(c => getDiasAtraso(c) > 0).map(c => {
                  const initials = (c.nombre || '').slice(0, 2).toUpperCase()
                  const dias = getDiasAtraso(c)
                  const monto = c.plan?.precio || 0
                  return (
                    <tr key={c.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#FFD700]/20 border border-[#FFD700]/40 flex items-center justify-center shrink-0">
                            <span className="text-xs font-black text-[#1C1C1C]">{initials}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-[#1C1C1C]">{c.nombre}</p>
                            <p className="text-[10px] text-[#9A9AAA] font-mono">
                              ID: #{String(c.id).padStart(5, '0')} {c.ip_estatica ? `| ${c.ip_estatica}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.plan ? (
                          <span className="text-xs font-bold bg-[#FAF7F0] border border-[#E5E0D5] text-[#5A5A6A] px-2.5 py-1 rounded-lg uppercase tracking-wide">
                            {c.plan.codigo || c.plan.nombre}
                          </span>
                        ) : <span className="text-[#D8D2C5] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#5A5A6A] text-xs">{c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {dias === 0 ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-500">
                            <span className="w-2 h-2 rounded-full shrink-0 bg-blue-400"/>
                            Pendiente
                          </span>
                        ) : (
                          <span className={`flex items-center gap-1.5 text-xs font-semibold ${dias > 10 ? 'text-red-500' : 'text-orange-500'}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dias > 10 ? 'bg-red-500' : 'bg-orange-400'}`}/>
                            {dias} días
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold text-sm ${monto >= 100 ? 'text-red-500' : 'text-[#1C1C1C]'}`}>
                          S/ {monto.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => abrirPagoRapido(c)}
                            className="text-xs bg-[#FFD700] text-[#1C1C1C] font-bold px-3 py-1.5 rounded-lg hover:bg-yellow-400 transition-colors whitespace-nowrap uppercase tracking-wide"
                          >
                            Registrar Pago
                          </button>
                          <button
                            onClick={() => enviarAviso(c.id)}
                            className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg hover:bg-green-100 transition-colors font-semibold whitespace-nowrap"
                            title="Enviar aviso por WhatsApp"
                          >
                            <MessageCircle size={12}/> WhatsApp
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sinPago.filter(c => getDiasAtraso(c) > 0).length > 0 && (
            <div className="px-5 py-3 border-t border-[#EDE9E0] bg-[#FAFAF8]">
              <p className="text-xs text-[#9A9AAA]">
                {sinPago.filter(c => getDiasAtraso(c) > 0).length} clientes vencidos ·{' '}
                <span className="text-blue-500">{sinPago.filter(c => getDiasAtraso(c) === 0).length} pendientes de vencer</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* PENDIENTES VIEW */}
      {vista === 'pendientes' && (
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EDE9E0] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-orange-500 uppercase tracking-wide">Por Cobrar este Mes</h2>
              <span className="text-[10px] font-bold bg-orange-50 border border-orange-200 text-orange-500 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {sinPago.filter(c => getDiasAtraso(c) === 0).length} Clientes
              </span>
            </div>
            {sinPago.filter(c => getDiasAtraso(c) === 0).length > 0 && (
              <button
                onClick={() => enviarAvisosMasivo(
                sinPago.filter(c => getDiasAtraso(c) === 0),
                `¿Avisar a ${sinPago.filter(c => getDiasAtraso(c) === 0).length} clientes que su pago está por vencer?\n\nSe enviará 1 mensaje cada 8-15 segundos.`
              )}
                disabled={enviandoMasivo}
                className="flex items-center gap-1.5 text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl hover:bg-orange-100 border border-orange-200 transition-colors font-semibold disabled:opacity-60 disabled:cursor-wait"
              >
                {enviandoMasivo
                  ? <><div className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin"/> Enviando {progresoMasivo.actual}/{progresoMasivo.total}...</>
                  : <><MessageCircle size={13}/> Avisar a todos por WhatsApp</>
                }
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE9E0] bg-[#FAFAF8]">
                  {['Cliente', 'Plan', 'Vence el', 'Días Restantes', 'Monto', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-[#9A9AAA]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin"/>
                      Cargando...
                    </div>
                  </td></tr>
                ) : sinPago.filter(c => getDiasAtraso(c) === 0).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-green-600 font-medium">
                    ✓ Todos los clientes vigentes ya pagaron en {mesNombre}
                  </td></tr>
                ) : sinPago.filter(c => getDiasAtraso(c) === 0).map(c => {
                  const initials = (c.nombre || '').slice(0, 2).toUpperCase()
                  const monto    = c.plan?.precio || 0
                  const venc     = c.fecha_vencimiento
                    ? new Date(c.fecha_vencimiento + 'T00:00:00')
                    : null
                  const hoy      = new Date(); hoy.setHours(0, 0, 0, 0)
                  const diasRest = venc ? Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24)) : null
                  return (
                    <tr key={c.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
                            <span className="text-xs font-black text-orange-600">{initials}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-[#1C1C1C]">{c.nombre}</p>
                            <p className="text-[10px] text-[#9A9AAA] font-mono">
                              #{String(c.id).padStart(5, '0')} {c.ip_estatica ? `| ${c.ip_estatica}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.plan ? (
                          <span className="text-xs font-bold bg-[#FAF7F0] border border-[#E5E0D5] text-[#5A5A6A] px-2.5 py-1 rounded-lg uppercase tracking-wide">
                            {c.plan.codigo || c.plan.nombre}
                          </span>
                        ) : <span className="text-[#D8D2C5] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#5A5A6A] text-xs">
                          {venc ? venc.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {diasRest !== null ? (
                          <span className={`text-xs font-semibold flex items-center gap-1.5 ${diasRest <= 3 ? 'text-orange-500' : 'text-[#5A5A6A]'}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${diasRest <= 3 ? 'bg-orange-400' : 'bg-[#C8C2B5]'}`}/>
                            {diasRest === 0 ? 'Vence hoy' : `${diasRest} días`}
                          </span>
                        ) : <span className="text-[#D8D2C5] text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-sm text-[#1C1C1C]">S/ {monto.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => abrirPagoRapido(c)}
                            className="text-xs bg-[#FFD700] text-[#1C1C1C] font-bold px-3 py-1.5 rounded-lg hover:bg-yellow-400 transition-colors whitespace-nowrap uppercase tracking-wide"
                          >
                            Registrar Pago
                          </button>
                          <button
                            onClick={() => enviarAviso(c.id)}
                            className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1.5 rounded-lg hover:bg-orange-100 transition-colors font-semibold whitespace-nowrap"
                            title="Enviar aviso por WhatsApp"
                          >
                            <MessageCircle size={12}/> WhatsApp
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {sinPago.filter(c => getDiasAtraso(c) === 0).length > 0 && (
            <div className="px-5 py-3 border-t border-[#EDE9E0] bg-[#FAFAF8]">
              <p className="text-xs text-[#9A9AAA]">
                Clientes vigentes que aún no han pagado {mesNombre} — puedes registrar pagos anticipados aquí
              </p>
            </div>
          )}
        </div>
      )}

      {/* AL DÍA / PUNTUALES VIEW */}
      {vista === 'puntuales' && (
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EDE9E0] flex items-center gap-3">
            <h2 className="text-sm font-bold text-green-600 uppercase tracking-wide">Clientes Puntuales</h2>
            <span className="text-[10px] font-bold bg-green-50 border border-green-200 text-green-600 px-2.5 py-0.5 rounded-full uppercase tracking-wide">
              {pagos.length} Pagaron este mes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE9E0] bg-[#FAFAF8]">
                  {['Cliente', 'Plan', 'Fecha de Pago', 'Monto', 'Método'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-12 text-[#9A9AAA]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin"/>
                      Cargando...
                    </div>
                  </td></tr>
                ) : pagos.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-[#9A9AAA]">
                    Sin pagos registrados en {mesNombre}
                  </td></tr>
                ) : pagos.map(p => {
                  const initials = ((p.cliente?.nombre || '')).slice(0, 2).toUpperCase()
                  return (
                    <tr key={p.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-green-100 border border-green-200 flex items-center justify-center shrink-0">
                            <span className="text-xs font-black text-green-700">{initials}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-[#1C1C1C]">{p.cliente?.nombre || `#${p.cliente_id}`}</p>
                            <p className="text-[10px] text-[#9A9AAA]">Mes: {p.mes_pagado}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
                          Al día
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#5A5A6A] text-xs">{formatDate(p.fecha_pago)}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-green-600 text-sm">S/ {Number(p.monto).toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg capitalize ${METODO_COLORS[p.metodo_pago] || 'bg-[#FAF7F0] text-[#5A5A6A] border border-[#E5E0D5]'}`}>
                          {p.metodo_pago}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {pagesPagos > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#EDE9E0]">
              <span className="text-xs text-[#9A9AAA]">Página {pagePagos} de {pagesPagos}</span>
              <div className="flex gap-2">
                <button onClick={() => setPagePagos(p => Math.max(1, p - 1))} disabled={pagePagos === 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 bg-white">Anterior</button>
                <button onClick={() => setPagePagos(p => Math.min(pagesPagos, p + 1))} disabled={pagePagos === pagesPagos}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 bg-white">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HISTORIAL VIEW */}
      {vista === 'historial' && (
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EDE9E0] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-[#1C1C1C] uppercase tracking-wide">Registro de Pagos</h2>
              <span className="text-[10px] font-bold bg-[#FAF7F0] border border-[#E5E0D5] text-[#5A5A6A] px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                {totalPagos} Registros
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EDE9E0] bg-[#FAFAF8]">
                  {['Cliente', 'Mes', 'Fecha', 'Monto', 'Método', 'Referencia', 'Estado'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-[#9A9AAA]">Cargando...</td></tr>
                ) : pagos.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-[#9A9AAA]">
                    <p className="mb-2">Sin pagos registrados</p>
                    <button onClick={() => { setClienteRapido(null); setModal(true) }} className="text-[#FFD700] text-sm underline">
                      Registrar primer pago
                    </button>
                  </td></tr>
                ) : pagos.map(p => (
                  <tr key={p.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                    <td className="px-4 py-3 text-[#1C1C1C] font-medium">{p.cliente?.nombre || `#${p.cliente_id}`}</td>
                    <td className="px-4 py-3 text-[#5A5A6A] font-mono text-xs">{p.mes_pagado}</td>
                    <td className="px-4 py-3 text-[#5A5A6A] text-xs whitespace-nowrap">{formatDate(p.fecha_pago)}</td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-[#1C1C1C] bg-[#FFD700]/20 px-2 py-0.5 rounded-lg text-xs">S/ {Number(p.monto).toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg capitalize ${METODO_COLORS[p.metodo_pago] || 'bg-[#FAF7F0] text-[#5A5A6A] border border-[#E5E0D5]'}`}>
                        {p.metodo_pago}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9AAA] text-xs">{p.referencia || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${
                        p.estado === 'pagado' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'
                      }`}>{p.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagesPagos > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[#EDE9E0]">
              <span className="text-xs text-[#9A9AAA]">Página {pagePagos} de {pagesPagos}</span>
              <div className="flex gap-2">
                <button onClick={() => setPagePagos(p => Math.max(1, p - 1))} disabled={pagePagos === 1}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 bg-white">Anterior</button>
                <button onClick={() => setPagePagos(p => Math.min(pagesPagos, p + 1))} disabled={pagePagos === pagesPagos}
                  className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 bg-white">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {modal && (
        <ModalPago
          clienteInicial={clienteRapido}
          mesInicial={mesFilter}
          onClose={() => { setModal(false); setClienteRapido(null) }}
          onSaved={onPagoSaved}
        />
      )}
    </div>
  )
}
