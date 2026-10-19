import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Save, Edit, X, Wifi, WifiOff,
  MessageCircle, Phone, MapPin, User, Shield,
  TrendingUp, AlertCircle, Package, Clock, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Circle, Download,
  CreditCard, Trash2,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

const MESES_CORTO = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

/* Color palette for avatars based on name */
const AVATAR_PALETTE = [
  'bg-teal-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500',
]
function avatarColor(name = '') {
  const sum = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length]
}

const ESTADO_BADGE = {
  activo:     'bg-green-50 text-green-600 border border-green-200',
  suspendido: 'bg-yellow-50 text-yellow-600 border border-yellow-200',
  anulado:    'bg-red-50 text-red-500 border border-red-200',
}

const METHOD_BADGE = {
  efectivo:      'bg-gray-100 text-gray-600',
  yape:          'bg-purple-100 text-purple-700',
  plin:          'bg-blue-100 text-blue-700',
  transferencia: 'bg-indigo-100 text-indigo-700',
}

/* ── Calendario / Service Status Tracker ─────────────────────────── */
function CalendarioPagos({ clienteId, planPrecio, modalMes, setModalMes, onPaymentSaved }) {
  const [calendario, setCalendario] = useState([])
  const [anio, setAnio]             = useState(new Date().getFullYear())
  const [monto, setMonto]           = useState(planPrecio || '')
  const [metodo, setMetodo]         = useState('efectivo')
  const [notas, setNotas]           = useState('')
  const [referencia, setReferencia] = useState('')
  const [fechaPago, setFechaPago]   = useState(new Date().toISOString().split('T')[0])
  const [loadingCal, setLoadingCal] = useState(false)
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (modalMes) {
      setMonto(planPrecio || '')
      setNotas('')
      setReferencia('')
      setFechaPago(new Date().toISOString().split('T')[0])
    }
  }, [modalMes, planPrecio])

  const fetchCal = useCallback(() => {
    setLoadingCal(true)
    api.get(`/clientes/${clienteId}/calendario-pagos`, { params: { anio } })
      .then(r => setCalendario(r.data))
      .finally(() => setLoadingCal(false))
  }, [clienteId, anio])

  useEffect(() => { fetchCal() }, [fetchCal])
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchCal() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchCal])

  const pagados     = calendario.filter(m => m.estado === 'pagado').length
  const vencidos    = calendario.filter(m => m.estado === 'vencido').length
  const cortes_temp = calendario.filter(m => m.estado === 'corte_temporal').length
  const hoyMes      = new Date().getMonth()
  const hoyAnio     = new Date().getFullYear()

  async function registrarPago() {
    if (!monto) return
    setSaving(true)
    try {
      await api.post('/pagos', {
        cliente_id: clienteId,
        monto: parseFloat(monto),
        mes_pagado: modalMes,
        fecha_pago: fechaPago,
        metodo_pago: metodo,
        referencia: referencia || null,
        estado: 'pagado',
        notas: notas || null,
      })
      toast.success('Pago registrado')
      setModalMes(null)
      fetchCal()
      if (onPaymentSaved) onPaymentSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar')
    } finally { setSaving(false) }
  }

  async function registrarCorte() {
    setSaving(true)
    try {
      await api.post('/pagos', {
        cliente_id: clienteId, monto: 0,
        mes_pagado: modalMes,
        fecha_pago: new Date().toISOString().split('T')[0],
        metodo_pago: 'efectivo', estado: 'corte_temporal',
        notas: 'Corte temporal solicitado por el cliente',
      })
      toast.success('Mes marcado como corte temporal')
      setModalMes(null)
      fetchCal()
      if (onPaymentSaved) onPaymentSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar')
    } finally { setSaving(false) }
  }

  function MesIcon({ estado }) {
    if (estado === 'pagado') return <CheckCircle size={22} className="text-green-500" />
    if (estado === 'vencido') return <XCircle size={22} className="text-red-500" />
    if (estado === 'pendiente') return <XCircle size={22} className="text-orange-400" />
    if (estado === 'corte_temporal') return <AlertTriangle size={20} className="text-yellow-500" />
    return <Circle size={20} className="text-[#C8C2B5]" />
  }

  const bgMes = {
    pagado:         'bg-green-50 border-green-200',
    pendiente:      'bg-orange-50 border-orange-300 cursor-pointer hover:bg-orange-100',
    vencido:        'bg-red-50 border-red-300 cursor-pointer hover:bg-red-100',
    corte_temporal: 'bg-yellow-50 border-yellow-300',
    futuro:         'bg-white border-[#E5E0D5] cursor-pointer hover:bg-blue-50 hover:border-blue-200',
    no_aplica:      'bg-[#FAF7F0] border-[#EDE9E0]',
  }

  return (
    <div>
      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-green-600">{pagados}</p>
          <p className="text-xs text-green-500 font-medium mt-0.5">Pagados</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-red-500">{vencidos}</p>
          <p className="text-xs text-red-400 font-medium mt-0.5">Vencidos</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-yellow-600">{cortes_temp}</p>
          <p className="text-xs text-yellow-500 font-medium mt-0.5">C. Temporal</p>
        </div>
      </div>

      {/* Year nav */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[#9A9AAA]">Toca un mes para registrar pago</p>
        <div className="flex items-center gap-1.5">
          <button onClick={fetchCal} disabled={loadingCal} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#F0EBE0] text-[#9A9AAA] hover:text-[#1C1C1C] disabled:opacity-40 transition-colors">
            <RefreshCw size={12} className={loadingCal ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setAnio(a => a - 1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#F0EBE0] text-[#5A5A6A] hover:text-[#1C1C1C] text-xs font-bold">◀</button>
          <span className="text-sm font-black text-[#1C1C1C] w-12 text-center">{anio}</span>
          <button onClick={() => setAnio(a => a + 1)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#F0EBE0] text-[#5A5A6A] hover:text-[#1C1C1C] text-xs font-bold">▶</button>
        </div>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {calendario.map((item, i) => {
          const clickable = item.estado === 'pendiente' || item.estado === 'vencido' || item.estado === 'futuro'
          const isCurrent = i === hoyMes && anio === hoyAnio
          return (
            <button
              key={item.mes}
              onClick={() => clickable && setModalMes(item.mes)}
              disabled={!clickable}
              title={`${MESES_LARGO[i]} — ${item.estado}`}
              className={`border rounded-xl py-2.5 flex flex-col items-center gap-1 transition-all ${bgMes[item.estado] || bgMes.futuro} ${isCurrent ? 'ring-2 ring-[#FFD700] ring-offset-1' : ''}`}
            >
              <span className="text-[9px] font-black text-[#9A9AAA] tracking-wider">{MESES_CORTO[i]}</span>
              <MesIcon estado={item.estado} />
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3 text-xs text-[#9A9AAA]">
        <span className="flex items-center gap-1.5"><CheckCircle size={12} className="text-green-500" />Pagado</span>
        <span className="flex items-center gap-1.5"><XCircle size={12} className="text-red-500" />Vencido</span>
        <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-yellow-500" />Corte temporal</span>
        <span className="flex items-center gap-1.5"><XCircle size={12} className="text-orange-400" />Pendiente</span>
        <span className="flex items-center gap-1.5"><Circle size={12} className="text-[#C8C2B5]" />Futuro</span>
      </div>

      {/* Payment modal */}
      {modalMes && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[#1C1C1C]">
                {MESES_LARGO[parseInt(modalMes.split('-')[1]) - 1]} {modalMes.split('-')[0]}
              </h3>
              <button onClick={() => setModalMes(null)} className="text-[#9A9AAA] hover:text-[#1C1C1C]"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Monto (S/)</label>
                <input type="number" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
                  className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#FFD700] transition-colors" placeholder="50.00" />
              </div>
              <div>
                <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Fecha de pago</label>
                <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)}
                  className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#FFD700] transition-colors" />
              </div>
            </div>
            <div>
              <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Método</label>
              <select value={metodo} onChange={e => setMetodo(e.target.value)}
                className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#FFD700]">
                <option value="efectivo">Efectivo</option>
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Referencia (opcional)</label>
              <input value={referencia} onChange={e => setReferencia(e.target.value)}
                className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#FFD700]"
                placeholder="N° operación, código Yape..." />
            </div>
            <div>
              <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Observación (opcional)</label>
              <input value={notas} onChange={e => setNotas(e.target.value)}
                className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm focus:outline-none focus:border-[#FFD700]"
                placeholder="Ej: Pago puntual" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalMes(null)} className="flex-1 py-2.5 text-sm border border-[#E5E0D5] rounded-xl text-[#9A9AAA] hover:text-[#1C1C1C] font-medium">Cancelar</button>
              <button onClick={registrarPago} disabled={saving}
                className="flex-1 py-2.5 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Registrar Pago'}
              </button>
            </div>
            <div className="border-t border-[#EDE9E0] pt-3">
              <p className="text-xs text-[#9A9AAA] mb-2">¿El cliente pidió corte temporal este mes?</p>
              <button onClick={registrarCorte} disabled={saving}
                className="w-full py-2 text-sm border border-yellow-300 text-yellow-600 rounded-xl hover:bg-yellow-50 disabled:opacity-50">
                Marcar como Corte Temporal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Payment History Table ─────────────────────────────────────────── */
function PaymentHistory({ clienteId, clienteNombre }) {
  const [pagos, setPagos]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)

  const fetchPagos = useCallback(() => {
    setLoading(true)
    api.get('/pagos', { params: { cliente_id: clienteId, per_page: 100 } })
      .then(r => setPagos(r.data.items || []))
      .finally(() => setLoading(false))
  }, [clienteId])

  useEffect(() => { fetchPagos() }, [fetchPagos])

  async function deletePago(id) {
    if (!window.confirm('¿Eliminar este pago?')) return
    setDeleting(id)
    try {
      await api.delete(`/pagos/${id}`)
      toast.success('Pago eliminado')
      fetchPagos()
    } catch { toast.error('Error al eliminar') }
    finally { setDeleting(null) }
  }

  function exportCSV() {
    const headers = ['Mes', 'Fecha', 'Monto (S/)', 'Metodo', 'Observacion']
    const rows = pagos.map(p => [
      p.mes_pagado,
      p.fecha_pago,
      p.monto?.toFixed(2),
      p.metodo_pago,
      `"${(p.notas || '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `pagos_${(clienteNombre || 'cliente').replace(/\s+/g, '_')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const MESES_NOMBRE_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-[#1C1C1C] uppercase tracking-widest">Payment History</h3>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs font-semibold text-[#FFD700] hover:text-yellow-500 transition-colors">
          <Download size={13} /> Download CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EDE9E0]">
              {['Month', 'Date', 'Amount', 'Method', 'Observation', 'Action'].map(h => (
                <th key={h} className="text-left py-2 px-2 text-[10px] font-semibold text-[#9A9AAA] uppercase tracking-widest whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8"><div className="w-5 h-5 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
            ) : pagos.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-[#9A9AAA] py-8 text-sm">Sin pagos registrados</td></tr>
            ) : (
              pagos.map(p => {
                const mesIdx = parseInt(p.mes_pagado?.split('-')[1]) - 1
                const mesNombre = MESES_NOMBRE_LARGO[mesIdx] || p.mes_pagado
                const fechaFmt  = p.fecha_pago
                  ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
                const metodoBadge = METHOD_BADGE[p.metodo_pago] || 'bg-gray-100 text-gray-600'
                return (
                  <tr key={p.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                    <td className="py-3 px-2 font-medium text-[#1C1C1C]">{mesNombre}</td>
                    <td className="py-3 px-2 text-[#5A5A6A] whitespace-nowrap">{fechaFmt}</td>
                    <td className="py-3 px-2 font-bold text-[#1C1C1C]">S/ {p.monto?.toFixed(2)}</td>
                    <td className="py-3 px-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${metodoBadge}`}>
                        {(p.metodo_pago || 'efectivo').charAt(0).toUpperCase() + (p.metodo_pago || 'efectivo').slice(1)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-[#9A9AAA] italic text-xs max-w-[140px] truncate">
                      {p.notas ? `"${p.notas}"` : '—'}
                    </td>
                    <td className="py-3 px-2">
                      <button
                        onClick={() => deletePago(p.id)}
                        disabled={deleting === p.id}
                        className="p-1.5 rounded-lg text-[#C8C2B5] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main ClienteDetalle ─────────────────────────────────────────── */
export default function ClienteDetalle() {
  const { id } = useParams()
  const [cliente, setCliente]         = useState(null)
  const [historial, setHistorial]     = useState([])
  const [editing, setEditing]         = useState(false)
  const [form, setForm]               = useState({})
  const [saving, setSaving]           = useState(false)
  const [modalMes, setModalMes]       = useState(null)
  const [modalProroga, setModalProroga] = useState(false)
  const [fechaProroga, setFechaProroga] = useState('')
  const [savingProroga, setSavingProroga] = useState(false)
  const [planes, setPlanes]           = useState([])
  const [pppoeStatus, setPppoeStatus] = useState(null)
  const [loadingPppoe, setLoadingPppoe] = useState(false)
  const [pagosTotal, setPagosTotal]   = useState(0)
  const [pagosRefKey, setPagosRefKey] = useState(0)
  const [modalReset, setModalReset]   = useState(null) // 'pin' | 'password'
  const [resetVal, setResetVal]       = useState('')
  const [savingReset, setSavingReset] = useState(false)

  function fetchCliente() {
    api.get(`/clientes/${id}`).then(r => { setCliente(r.data); setForm(r.data) })
    api.get(`/clientes/${id}/historial`).then(r => setHistorial(r.data))
  }

  function fetchTotal() {
    api.get('/pagos', { params: { cliente_id: id, per_page: 100 } })
      .then(r => {
        const total = (r.data.items || []).reduce((s, p) => s + (p.monto || 0), 0)
        setPagosTotal(total)
      })
      .catch(() => {})
  }

  function fetchPppoeStatus() {
    setLoadingPppoe(true)
    api.get(`/clientes/${id}/pppoe-status`)
      .then(r => setPppoeStatus(r.data))
      .catch(() => setPppoeStatus({ conectado: false, error: 'Error al consultar' }))
      .finally(() => setLoadingPppoe(false))
  }

  useEffect(() => { api.get('/planes').then(r => setPlanes(r.data)).catch(() => {}) }, [])
  useEffect(() => { fetchCliente(); fetchPppoeStatus(); fetchTotal() }, [id])

  function onPaymentSaved() {
    fetchCliente()
    fetchTotal()
    setPagosRefKey(k => k + 1)
  }

  async function guardar() {
    setSaving(true)
    try {
      await api.put(`/clientes/${id}`, {
        nombre: form.nombre, telefono: form.telefono,
        telefono_whatsapp: form.telefono_whatsapp, direccion: form.direccion,
        password_pppoe: form.password_pppoe, ip_estatica: form.ip_estatica,
        plan_id: form.plan_id ?? form.plan?.id,
        estado: form.estado, notas: form.notas,
        tipo_conexion: form.tipo_conexion, tiene_tv: form.tiene_tv,
        fecha_instalacion: form.fecha_instalacion || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        estado_equipo: form.estado_equipo,
        equipo_marca: form.equipo_marca, equipo_modelo: form.equipo_modelo,
        equipo_serial: form.equipo_serial, equipo_descripcion: form.equipo_descripcion,
        equipo_fecha_entrega: form.equipo_fecha_entrega || null,
        equipo_valor: form.equipo_valor ? parseFloat(form.equipo_valor) : null,
      })
      toast.success('Cliente actualizado')
      setEditing(false)
      fetchCliente()
    } catch { toast.error('Error al actualizar') }
    finally { setSaving(false) }
  }

  async function toggleEstado() {
    try {
      if (cliente.estado === 'activo') {
        await api.post(`/clientes/${id}/cortar`)
        toast.success('Servicio cortado')
      } else {
        await api.post(`/clientes/${id}/reactivar`)
        toast.success('Servicio reactivado')
      }
      fetchCliente()
    } catch { toast.error('Error al cambiar estado') }
  }

  async function enviarAviso(tipo) {
    try {
      await api.post(`/whatsapp/aviso-${tipo}/${id}`)
      toast.success('Aviso enviado por WhatsApp')
    } catch { toast.error('Error (¿WhatsApp conectado?)') }
  }

  async function guardarProroga() {
    if (!fechaProroga) return toast.error('Selecciona una fecha')
    setSavingProroga(true)
    try {
      await api.put(`/clientes/${id}`, { fecha_vencimiento: fechaProroga })
      toast.success(`Prórroga aplicada hasta ${fechaProroga}`)
      setModalProroga(false)
      fetchCliente()
    } catch { toast.error('Error al guardar prórroga') }
    finally { setSavingProroga(false) }
  }

  async function resetearCampo() {
    if (!resetVal.trim()) return
    if (modalReset === 'pin' && (resetVal.length !== 4 || !/^\d{4}$/.test(resetVal)))
      return toast.error('El PIN debe ser 4 dígitos numéricos')
    setSavingReset(true)
    try {
      const payload = modalReset === 'pin'
        ? { pin_app: resetVal }
        : { password_pppoe: resetVal }
      await api.put(`/clientes/${id}`, payload)
      toast.success(modalReset === 'pin' ? 'PIN de app actualizado' : 'Contraseña PPPoE actualizada')
      setModalReset(null)
      setResetVal('')
      fetchCliente()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al actualizar')
    } finally { setSavingReset(false) }
  }

  if (!cliente) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const inp = "w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700] transition-colors"

  const initials    = cliente.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarBg    = avatarColor(cliente.nombre)
  const clienteId   = `TUX-${String(id).padStart(4, '0')}-${initials}`

  const diasRestantes = cliente.fecha_vencimiento
    ? Math.ceil((new Date(cliente.fecha_vencimiento + 'T12:00:00') - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const nextExpiry = cliente.fecha_vencimiento
    ? new Date(cliente.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'long' })
    : null

  const HIST_COLOR = {
    activacion: 'bg-green-500', corte: 'bg-red-500',
    pago: 'bg-[#FFD700]', cambio_plan: 'bg-blue-500', nota: 'bg-[#9A9AAA]',
  }

  const currentMes  = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  return (
    <>
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[#9A9AAA] font-medium">
        <Link to="/clientes" className="hover:text-[#5A5A6A] flex items-center gap-1 transition-colors">
          <ArrowLeft size={13} /> Clientes
        </Link>
        <span className="text-[#D8D2C5]">›</span>
        <span className="text-[#1C1C1C] font-bold">{cliente.nombre}</span>
      </div>

      {/* ── HEADER CARD ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5">
        <div className="flex items-start gap-4 flex-wrap">
          {/* Avatar */}
          <div className={`w-14 h-14 rounded-2xl ${avatarBg} flex items-center justify-center shrink-0`}>
            <span className="text-lg font-black text-white">{initials}</span>
          </div>

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-[#1C1C1C]">{cliente.nombre}</h1>
              <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wide ${ESTADO_BADGE[cliente.estado]}`}>
                {cliente.estado}
              </span>
              {pppoeStatus?.conectado && (
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-green-50 text-green-600 border border-green-200 uppercase">
                  Online
                </span>
              )}
            </div>
            <p className="text-[#9A9AAA] text-sm mt-0.5">
              {clienteId} &nbsp;|&nbsp; IP: {cliente.ip_estatica || '—'} &nbsp;|&nbsp; {cliente.zona?.nombre}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => setModalMes(currentMes)}
              className="flex items-center gap-2 bg-[#FFD700] text-[#1C1C1C] font-bold px-4 py-2.5 rounded-xl hover:bg-yellow-400 transition-colors text-sm shadow-sm">
              <CreditCard size={16} /> Registrar Nuevo Pago
            </button>
            <button onClick={() => { setFechaProroga(cliente.fecha_vencimiento || ''); setModalProroga(true) }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-white text-[#5A5A6A] hover:text-[#1C1C1C] border border-[#E5E0D5] hover:border-[#C8C2B5] transition-colors">
              <Clock size={15} /> Prórroga
            </button>
            <button onClick={() => enviarAviso(cliente.estado === 'activo' ? 'cobro' : 'corte')}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 transition-colors">
              <MessageCircle size={15} /> WhatsApp
            </button>
            <button onClick={toggleEstado}
              className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                cliente.estado === 'activo'
                  ? 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                  : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'
              }`}>
              {cliente.estado === 'activo' ? <><WifiOff size={15} /> Cortar</> : <><Wifi size={15} /> Reactivar</>}
            </button>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-white text-[#9A9AAA] border border-[#E5E0D5] hover:text-[#1C1C1C]">
                  <X size={15} /> Cancelar
                </button>
                <button onClick={guardar} disabled={saving}
                  className="flex items-center gap-1.5 bg-[#1C1C1C] text-white font-bold px-4 py-2.5 rounded-xl text-sm hover:bg-[#374151] disabled:opacity-50">
                  <Save size={15} /> {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-white text-[#5A5A6A] border border-[#E5E0D5] hover:text-[#1C1C1C] hover:border-[#C8C2B5]">
                <Edit size={15} /> Editar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 3 INFO CARDS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Current Plan */}
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5">
          <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-bold mb-3">Current Plan</p>
          <p className="text-xl font-black text-[#1C1C1C] leading-tight">{cliente.plan?.nombre || '—'}</p>
          {cliente.plan && (
            <p className="text-sm text-[#9A9AAA] mt-1.5">
              ↓{cliente.plan.bajada_mbps} / ↑{cliente.plan.subida_mbps} Mbps &middot; S/ {cliente.plan.precio}/mes
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-3">
            <span className={`w-2 h-2 rounded-full ${pppoeStatus?.conectado ? 'bg-green-500' : 'bg-[#C8C2B5]'}`} />
            <span className="text-xs text-[#9A9AAA]">
              {loadingPppoe ? 'Verificando...' : pppoeStatus?.conectado ? 'Residential Broadband' : 'Link Offline'}
            </span>
          </div>
        </div>

        {/* Total Paid */}
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5">
          <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-bold mb-3">Total Paid</p>
          <p className="text-3xl font-black text-[#1C1C1C]">S/ {pagosTotal.toFixed(2)}</p>
          <p className="text-sm text-[#9A9AAA] mt-1.5">Lifetime revenue</p>
        </div>

        {/* Next Expiry */}
        <div className={`rounded-2xl border shadow-sm p-5 ${diasRestantes !== null && diasRestantes <= 7 ? 'bg-red-50 border-red-200' : diasRestantes !== null && diasRestantes <= 15 ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-[#E5E0D5]'}`}>
          <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-bold mb-3">Next Expiry</p>
          {nextExpiry ? (
            <>
              <p className="text-2xl font-black text-[#1C1C1C]">{nextExpiry}</p>
              {diasRestantes !== null && (
                <p className={`text-sm mt-1.5 font-medium flex items-center gap-1 ${
                  diasRestantes < 0 ? 'text-red-500' : diasRestantes <= 7 ? 'text-red-500' : diasRestantes <= 15 ? 'text-yellow-600' : 'text-[#9A9AAA]'
                }`}>
                  {diasRestantes <= 15 && <AlertCircle size={13} />}
                  {diasRestantes < 0 ? `Vencido hace ${Math.abs(diasRestantes)} días` : `${diasRestantes} días restantes`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-[#C8C2B5]">Sin fecha de vencimiento</p>
          )}
          <p className="text-xs text-[#9A9AAA] mt-2">Service renewal date</p>
        </div>
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* LEFT: Tracker + Payment History */}
        <div className="lg:col-span-2 space-y-4 order-1">

          {/* Service Status Tracker */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm">
            <div className="px-5 py-4 border-b border-[#EDE9E0]">
              <h2 className="text-xs font-bold text-[#1C1C1C] uppercase tracking-widest">Service Status Tracker (12 Months)</h2>
            </div>
            <div className="p-5">
              <CalendarioPagos
                clienteId={+id}
                planPrecio={cliente.plan?.precio}
                modalMes={modalMes}
                setModalMes={setModalMes}
                onPaymentSaved={onPaymentSaved}
              />
            </div>
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm">
            <div className="px-5 py-4 border-b border-[#EDE9E0]">
              <h2 className="text-xs font-bold text-[#1C1C1C] uppercase tracking-widest">Payment History</h2>
            </div>
            <div className="p-5" key={pagosRefKey}>
              <PaymentHistory clienteId={+id} clienteNombre={cliente.nombre} />
            </div>
          </div>
        </div>

        {/* RIGHT: Details + Historial */}
        <div className="space-y-4 order-2">

          {/* PPPoE Status */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold text-[#9A9AAA] uppercase tracking-widest">Estado PPPoE</p>
              <button onClick={fetchPppoeStatus} disabled={loadingPppoe}
                className="text-[#C8C2B5] hover:text-[#9A9AAA] transition-colors disabled:opacity-40">
                <RefreshCw size={13} className={loadingPppoe ? 'animate-spin' : ''} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {loadingPppoe
                ? <div className="w-2.5 h-2.5 rounded-full bg-[#C8C2B5] animate-pulse" />
                : pppoeStatus?.conectado
                  ? <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                  : <div className="w-2.5 h-2.5 rounded-full bg-red-400" />}
              <p className="text-sm font-bold text-[#1C1C1C]">
                {loadingPppoe ? 'Consultando...' : pppoeStatus?.conectado ? 'Sesión Activa' : 'Sin Sesión'}
              </p>
            </div>
            {pppoeStatus?.conectado && (
              <div className="mt-2 space-y-0.5">
                {pppoeStatus.ip_remota && <p className="text-xs text-[#9A9AAA] font-mono">{pppoeStatus.ip_remota}</p>}
                {pppoeStatus.uptime && <p className="text-xs text-[#9A9AAA]">Uptime: {pppoeStatus.uptime}</p>}
              </div>
            )}
          </div>

          {/* Personal data */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDE9E0] flex items-center gap-2">
              <User size={13} className="text-[#FFD700]" />
              <span className="text-[10px] font-bold text-[#1C1C1C] uppercase tracking-widest">Datos personales</span>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: 'Nombre', key: 'nombre', icon: User },
                { label: 'Teléfono', key: 'telefono', icon: Phone },
                { label: 'WhatsApp', key: 'telefono_whatsapp', icon: MessageCircle },
                { label: 'Dirección', key: 'direccion', icon: MapPin },
              ].map(({ label, key, icon: Icon }) => (
                <div key={key} className="flex items-start gap-3">
                  <Icon size={13} className="text-[#C8C2B5] mt-2.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">{label}</p>
                    {editing ? (
                      <input className={inp} value={form[key] || ''} onChange={e => setForm(f => ({...f, [key]: e.target.value}))} />
                    ) : (
                      <p className="text-sm text-[#1C1C1C]">{cliente[key] || <span className="text-[#C8C2B5]">—</span>}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connection */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDE9E0] flex items-center gap-2">
              <Shield size={13} className="text-[#FFD700]" />
              <span className="text-[10px] font-bold text-[#1C1C1C] uppercase tracking-widest">Conexión</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">Usuario PPPoE</p>
                <p className="text-sm text-[#1C1C1C] font-mono bg-[#FAF7F0] px-2 py-1.5 rounded-lg border border-[#E5E0D5]">{cliente.usuario_pppoe}</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-[#9A9AAA] font-semibold uppercase tracking-wide">Contraseña PPPoE</p>
                  <button onClick={() => { setResetVal(''); setModalReset('password') }}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1">
                    <RefreshCw size={10} /> Cambiar
                  </button>
                </div>
                {editing ? (
                  <input className={inp} value={form.password_pppoe || ''} onChange={e => setForm(f => ({...f, password_pppoe: e.target.value}))} />
                ) : (
                  <p className="text-sm text-[#1C1C1C] font-mono bg-[#FAF7F0] px-2 py-1.5 rounded-lg border border-[#E5E0D5]">{cliente.password_pppoe}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-[#9A9AAA] font-semibold uppercase tracking-wide">PIN App Móvil</p>
                  <button onClick={() => { setResetVal(''); setModalReset('pin') }}
                    className="text-[10px] font-bold text-[#FFD700] hover:text-yellow-500 flex items-center gap-1">
                    <RefreshCw size={10} /> Resetear PIN
                  </button>
                </div>
                <p className="text-sm text-[#9A9AAA] bg-[#FAF7F0] px-2 py-1.5 rounded-lg border border-[#E5E0D5]">
                  {cliente.pin_app ? '••••' : <span className="text-[#C8C2B5] italic">Sin PIN configurado</span>}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">IP Estática</p>
                {editing ? (
                  <input className={inp} value={form.ip_estatica || ''} onChange={e => setForm(f => ({...f, ip_estatica: e.target.value}))} />
                ) : (
                  <p className="text-sm text-[#1C1C1C] font-mono bg-[#FAF7F0] px-2 py-1.5 rounded-lg border border-[#E5E0D5]">{cliente.ip_estatica || '—'}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">Instalación</p>
                  {editing ? (
                    <input type="date" className={inp + ' text-xs'} value={form.fecha_instalacion || ''} onChange={e => setForm(f => ({...f, fecha_instalacion: e.target.value}))} />
                  ) : (
                    <p className="text-xs text-[#1C1C1C]">{cliente.fecha_instalacion ? new Date(cliente.fecha_instalacion + 'T12:00:00').toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'}) : '—'}</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">Vencimiento</p>
                  {editing ? (
                    <input type="date" className={inp + ' text-xs'} value={form.fecha_vencimiento || ''} onChange={e => setForm(f => ({...f, fecha_vencimiento: e.target.value}))} />
                  ) : (
                    <p className={`text-xs font-semibold ${diasRestantes !== null && diasRestantes < 0 ? 'text-red-500' : 'text-[#1C1C1C]'}`}>
                      {cliente.fecha_vencimiento ? new Date(cliente.fecha_vencimiento + 'T12:00:00').toLocaleDateString('es-PE', {day:'2-digit', month:'short', year:'numeric'}) : '—'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">Estado</p>
                  {editing ? (
                    <select className={inp + ' text-xs py-1'} value={form.estado} onChange={e => setForm(f => ({...f, estado: e.target.value}))}>
                      <option value="activo">Activo</option>
                      <option value="suspendido">Suspendido</option>
                      <option value="anulado">Anulado</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-bold ${ESTADO_BADGE[cliente.estado]}`}>{cliente.estado}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Plan */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDE9E0] flex items-center gap-2">
              <TrendingUp size={13} className="text-[#FFD700]" />
              <span className="text-[10px] font-bold text-[#1C1C1C] uppercase tracking-widest">Plan y servicio</span>
            </div>
            <div className="p-4 space-y-3">
              {editing ? (
                <select className={inp} value={form.plan_id ?? form.plan?.id ?? ''} onChange={e => setForm(f => ({...f, plan_id: parseInt(e.target.value)}))}>
                  {planes.map(p => <option key={p.id} value={p.id}>{p.nombre} — S/ {p.precio}/mes</option>)}
                </select>
              ) : (
                <div className="bg-[#FAF7F0] rounded-xl p-3 border border-[#E5E0D5]">
                  <p className="text-sm font-bold text-[#1C1C1C]">{cliente.plan?.nombre}</p>
                  <p className="text-lg font-black text-[#FFD700] mt-0.5">S/ {cliente.plan?.precio}<span className="text-xs text-[#9A9AAA] font-normal">/mes</span></p>
                  <p className="text-xs text-[#9A9AAA] mt-0.5">↓{cliente.plan?.bajada_mbps} Mbps / ↑{cliente.plan?.subida_mbps} Mbps</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#FAF7F0] rounded-xl p-3 border border-[#E5E0D5]">
                  <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1.5">Conexión</p>
                  {editing ? (
                    <select className="w-full bg-white border border-[#E5E0D5] rounded-lg px-2 py-1 text-xs text-[#1C1C1C] focus:outline-none focus:border-[#FFD700]"
                      value={form.tipo_conexion || 'inalambrico'} onChange={e => setForm(f => ({...f, tipo_conexion: e.target.value}))}>
                      <option value="inalambrico">Inalámbrico</option>
                      <option value="fibra_optica">Fibra Óptica</option>
                    </select>
                  ) : (
                    <p className="text-xs text-[#1C1C1C] font-medium">
                      {cliente.tipo_conexion === 'fibra_optica' ? '🔵 Fibra Óptica' : '📡 Inalámbrico'}
                    </p>
                  )}
                </div>
                <div className="bg-[#FAF7F0] rounded-xl p-3 border border-[#E5E0D5]">
                  <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1.5">Servicio TV</p>
                  {editing ? (
                    <button type="button" onClick={() => setForm(f => ({...f, tiene_tv: !f.tiene_tv}))}
                      className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${form.tiene_tv ? 'text-[#FFD700]' : 'text-[#C8C2B5]'}`}>
                      <span className={`relative inline-flex w-8 h-4 rounded-full transition-colors shrink-0 ${form.tiene_tv ? 'bg-[#FFD700]' : 'bg-[#D8D2C5]'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${form.tiene_tv ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                      {form.tiene_tv ? 'Sí' : 'No'}
                    </button>
                  ) : (
                    <p className={`text-xs font-semibold ${cliente.tiene_tv ? 'text-[#FFD700]' : 'text-[#C8C2B5]'}`}>
                      {cliente.tiene_tv ? '✓ Incluye TV' : '✗ Sin TV'}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1 uppercase tracking-wide">Notas</p>
                {editing ? (
                  <textarea className={inp + ' resize-none'} rows={2} value={form.notas || ''} onChange={e => setForm(f => ({...f, notas: e.target.value}))} placeholder="Observaciones..." />
                ) : (
                  <p className="text-sm text-[#5A5A6A]">{cliente.notas || <span className="text-[#C8C2B5]">Sin notas</span>}</p>
                )}
              </div>
            </div>
          </div>

          {/* Equipo */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDE9E0] flex items-center gap-2">
              <Package size={13} className="text-[#FFD700]" />
              <span className="text-[10px] font-bold text-[#1C1C1C] uppercase tracking-widest">Equipo entregado</span>
              {!editing && cliente.estado_equipo && cliente.estado_equipo !== 'sin_equipo' && (
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-lg font-semibold ${
                  cliente.estado_equipo === 'prestado' ? 'bg-yellow-50 text-yellow-600'
                  : 'bg-green-50 text-green-600'
                }`}>{cliente.estado_equipo}</span>
              )}
            </div>
            <div className="p-4">
              {editing ? (
                <div className="space-y-3">
                  <select className={inp} value={form.estado_equipo || 'sin_equipo'} onChange={e => setForm(f => ({...f, estado_equipo: e.target.value}))}>
                    <option value="sin_equipo">Sin equipo</option>
                    <option value="prestado">Prestado</option>
                    <option value="comprado">Comprado</option>
                  </select>
                  {form.estado_equipo !== 'sin_equipo' && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Marca', key: 'equipo_marca' },
                        { label: 'Modelo', key: 'equipo_modelo' },
                        { label: 'Serial', key: 'equipo_serial' },
                        { label: 'Valor S/', key: 'equipo_valor', type: 'number' },
                      ].map(f => (
                        <div key={f.key}>
                          <p className="text-[10px] text-[#9A9AAA] font-semibold mb-1">{f.label}</p>
                          <input type={f.type || 'text'} step="0.01"
                            className={inp} value={form[f.key] || ''}
                            onChange={e => setForm(fr => ({...fr, [f.key]: e.target.value}))} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : cliente.estado_equipo && cliente.estado_equipo !== 'sin_equipo' ? (
                <div className="space-y-2">
                  {[
                    { label: 'Marca', val: cliente.equipo_marca },
                    { label: 'Modelo', val: cliente.equipo_modelo },
                    { label: 'Serial', val: cliente.equipo_serial },
                    { label: 'Valor', val: cliente.equipo_valor ? `S/ ${cliente.equipo_valor.toFixed(2)}` : null },
                  ].filter(r => r.val).map(r => (
                    <div key={r.label} className="flex items-center justify-between">
                      <span className="text-xs text-[#9A9AAA]">{r.label}</span>
                      <span className="text-xs text-[#1C1C1C] font-medium">{r.val}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#C8C2B5] text-center py-3">Sin equipo registrado</p>
              )}
            </div>
          </div>

          {/* Historial */}
          <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-[#EDE9E0] flex items-center gap-2">
              <AlertCircle size={13} className="text-[#FFD700]" />
              <span className="text-[10px] font-bold text-[#1C1C1C] uppercase tracking-widest">Actividad</span>
              <span className="ml-auto text-xs bg-[#FAF7F0] text-[#9A9AAA] border border-[#E5E0D5] px-2 py-0.5 rounded-full">{historial.length}</span>
            </div>
            <div className="overflow-y-auto max-h-80">
              {historial.length === 0 ? (
                <p className="text-[#9A9AAA] text-xs text-center py-8">Sin actividad registrada</p>
              ) : (
                <div className="p-4 space-y-3">
                  {historial.map(h => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${HIST_COLOR[h.tipo] || 'bg-[#C8C2B5]'}`} />
                        <div className="w-px flex-1 bg-[#EDE9E0] mt-1" />
                      </div>
                      <div className="flex-1 pb-3">
                        <p className="text-xs text-[#9A9AAA]">
                          {new Date(h.creado_en).toLocaleString('es-PE', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'})}
                        </p>
                        <p className="text-sm text-[#1C1C1C] mt-0.5 leading-snug">{h.descripcion}</p>
                        <span className={`inline-block mt-1 text-xs px-1.5 py-0.5 rounded font-medium ${
                          h.tipo === 'pago' ? 'bg-yellow-50 text-yellow-600'
                          : h.tipo === 'activacion' ? 'bg-green-50 text-green-600'
                          : h.tipo === 'corte' ? 'bg-red-50 text-red-500'
                          : 'bg-[#FAF7F0] text-[#9A9AAA]'
                        }`}>{h.tipo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>

    {/* Modal Reset Contraseña / PIN */}
    {modalReset && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1C1C1C] flex items-center gap-2">
              <RefreshCw size={16} className="text-blue-400" />
              {modalReset === 'pin' ? 'Resetear PIN App' : 'Cambiar Contraseña PPPoE'}
            </h3>
            <button onClick={() => setModalReset(null)} className="text-[#9A9AAA] hover:text-[#1C1C1C]"><X size={16} /></button>
          </div>
          <p className="text-xs text-[#9A9AAA]">
            {modalReset === 'pin'
              ? 'El cliente usará este PIN de 4 dígitos para ingresar a la app móvil.'
              : 'La nueva contraseña se actualizará en la base de datos y en el router MikroTik.'}
          </p>
          <div>
            <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">
              {modalReset === 'pin' ? 'Nuevo PIN (4 dígitos)' : 'Nueva contraseña'}
            </label>
            <input
              type={modalReset === 'pin' ? 'number' : 'text'}
              maxLength={modalReset === 'pin' ? 4 : 100}
              value={resetVal}
              onChange={e => setResetVal(modalReset === 'pin' ? e.target.value.slice(0, 4) : e.target.value)}
              placeholder={modalReset === 'pin' ? '1234' : 'nueva_contraseña'}
              className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-[#1C1C1C] text-sm font-mono focus:outline-none focus:border-[#FFD700] transition-colors"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModalReset(null)} className="flex-1 py-2.5 text-sm border border-[#E5E0D5] rounded-xl text-[#9A9AAA] hover:text-[#1C1C1C]">Cancelar</button>
            <button onClick={resetearCampo} disabled={savingReset || !resetVal.trim()}
              className="flex-1 py-2.5 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1">
              <Save size={14} /> {savingReset ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal Prórroga */}
    {modalProroga && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#1C1C1C] flex items-center gap-2">
              <Clock size={16} className="text-blue-400" /> Dar Prórroga
            </h3>
            <button onClick={() => setModalProroga(false)} className="text-[#9A9AAA] hover:text-[#1C1C1C]"><X size={16} /></button>
          </div>

          {cliente.fecha_vencimiento && (
            <div className="bg-[#FAF7F0] rounded-xl px-4 py-2 text-xs text-[#9A9AAA] border border-[#E5E0D5]">
              Vencimiento actual: <span className="text-[#1C1C1C] font-semibold">{cliente.fecha_vencimiento}</span>
            </div>
          )}

          <div>
            <label className="text-xs text-[#9A9AAA] font-semibold mb-1 block">Nueva fecha de vencimiento</label>
            <input type="date"
              className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2.5 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700]"
              value={fechaProroga} onChange={e => setFechaProroga(e.target.value)}
              min={new Date().toISOString().split('T')[0]} />
          </div>

          <div className="flex gap-2 flex-wrap">
            {[7, 10, 15, 30].map(dias => (
              <button key={dias} type="button"
                onClick={() => {
                  const base = fechaProroga ? new Date(fechaProroga + 'T00:00:00') : new Date()
                  base.setDate(base.getDate() + dias)
                  setFechaProroga(base.toISOString().split('T')[0])
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-[#FAF7F0] border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] hover:border-[#C8C2B5] transition-colors">
                +{dias} días
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setModalProroga(false)} className="flex-1 py-2.5 text-sm border border-[#E5E0D5] rounded-xl text-[#9A9AAA] hover:text-[#1C1C1C]">Cancelar</button>
            <button onClick={guardarProroga} disabled={savingProroga}
              className="flex-1 py-2.5 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1">
              <Save size={14} /> {savingProroga ? 'Guardando...' : 'Aplicar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
