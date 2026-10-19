import { useEffect, useRef, useState } from 'react'
import {
  Globe, Edit, Trash2, X, Save, Plus,
  Router, Shield, Copy, Check, Activity, Terminal,
} from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

const inputCls = "w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-sm text-[#1C1C1C] placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700] transition-colors"

const ZONA_EMPTY = {
  nombre: '', ip_lan: '', usuario_mikrotik: '', password_mikrotik: '',
  ip_wireguard: '', wg_public_key: '', router_mikrotik: '', ip_router: '', descripcion: '', tiendas_pago: '',
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE9E0]">
          <h3 className="font-bold text-[#1C1C1C]">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#FAF7F0]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ZonaForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!form.nombre || !form.ip_wireguard) return toast.error('Nombre e IP túnel WireGuard son obligatorios')
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs text-[#5A5A6A] mb-1 block">Nombre de zona <span className="text-red-400">*</span></label>
        <input className={inputCls} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Cabanillas" />
      </div>

      <div className="border-t border-[#EDE9E0] pt-3">
        <p className="text-xs font-semibold text-[#FFD700] mb-2 uppercase tracking-wide">MikroTik</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">IP LAN MikroTik</label>
            <input className={inputCls} value={form.ip_lan || ''} onChange={e => set('ip_lan', e.target.value)} placeholder="192.168.80.1" />
          </div>
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Usuario MikroTik</label>
            <input className={inputCls} value={form.usuario_mikrotik || ''} onChange={e => set('usuario_mikrotik', e.target.value)} placeholder="tuxtell-api" />
          </div>
        </div>
        <div className="mt-2">
          <label className="text-xs text-[#5A5A6A] mb-1 block">Contraseña MikroTik</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              className={inputCls + ' pr-16'}
              value={form.password_mikrotik || ''}
              onChange={e => set('password_mikrotik', e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPwd(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#9A9AAA] hover:text-[#1C1C1C] px-1"
            >
              {showPwd ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-[#EDE9E0] pt-3">
        <p className="text-xs font-semibold text-[#FFD700] mb-2 uppercase tracking-wide">WireGuard</p>
        <div>
          <label className="text-xs text-[#5A5A6A] mb-1 block">IP túnel WireGuard <span className="text-red-400">*</span></label>
          <input className={inputCls} value={form.ip_wireguard} onChange={e => set('ip_wireguard', e.target.value)} placeholder="10.10.0.2" />
        </div>
        <div className="mt-2">
          <label className="text-xs text-[#5A5A6A] mb-1 block">Clave pública WireGuard</label>
          <input className={inputCls + ' font-mono text-xs'} value={form.wg_public_key || ''} onChange={e => set('wg_public_key', e.target.value)} placeholder="AUtoKud++xog7Kp9a4xD/..." />
        </div>
      </div>

      <div className="border-t border-[#EDE9E0] pt-3">
        <p className="text-xs font-semibold text-[#FFD700] mb-2 uppercase tracking-wide">Pagos</p>
        <div>
          <label className="text-xs text-[#5A5A6A] mb-1 block">Tiendas autorizadas (aparece en mensajes WhatsApp)</label>
          <textarea
            className={inputCls + ' resize-none'}
            rows={3}
            value={form.tiendas_pago || ''}
            onChange={e => set('tiendas_pago', e.target.value)}
            placeholder={"Bodega El Chino — Jr. Lima 123\nFarmacia San Pedro — Av. Principal 456"}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onClose} className="flex-1 py-2 text-sm border border-[#D8D2C5] rounded-xl text-[#5A5A6A] hover:text-[#1C1C1C]">Cancelar</button>
        <button type="submit" disabled={saving} className="flex-1 py-2 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1">
          <Save size={14} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}


function WireGuardModal({ zona, onClose, onRefresh }) {
  const [status, setStatus] = useState(null)
  const [pubkey, setPubkey] = useState(zona.wg_public_key || '')
  const [lanNet, setLanNet] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get(`/zonas/${zona.id}/wireguard-status`)
      .then(r => setStatus(r.data))
      .catch(() => setStatus(null))
  }, [zona.id])

  function copyVpsPubkey(key) {
    navigator.clipboard.writeText(key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleAddPeer() {
    if (!pubkey.trim()) return toast.error('Ingresa la clave pública del MikroTik')
    setLoading(true)
    try {
      const params = new URLSearchParams({ pubkey: pubkey.trim() })
      if (lanNet.trim()) params.append('lan_network', lanNet.trim())
      const { data } = await api.post(`/zonas/${zona.id}/wireguard/peer?${params}`)
      toast.success('Peer WireGuard agregado')
      onRefresh()
      setStatus(prev => ({ ...prev, config_mt: data }))
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al agregar peer')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemovePeer() {
    if (!confirm('¿Eliminar el peer WireGuard de esta zona?')) return
    setLoading(true)
    try {
      await api.delete(`/zonas/${zona.id}/wireguard/peer`)
      toast.success('Peer eliminado')
      setPubkey('')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar peer')
    } finally {
      setLoading(false)
    }
  }

  const VPS_PUBKEY = status?.vps_pubkey || zona.wg_public_key || ''
  const VPS_ENDPOINT = status?.vps_endpoint || '161.132.48.127:51820'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDE9E0] shrink-0">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[#FFD700]" />
            <h3 className="font-bold text-[#1C1C1C]">WireGuard — {zona.nombre}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#FAF7F0]"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {status && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Ping', ok: status.online },
                { label: 'SSH', ok: status.ssh_ok },
                { label: 'WG Peer', ok: status.wg_peer_online },
              ].map(({ label, ok }) => (
                <div key={label} className={`rounded-xl p-2.5 text-center border ${ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className={`text-sm font-bold ${ok ? 'text-green-600' : 'text-red-500'}`}>{ok ? '▲ UP' : '▼ DOWN'}</p>
                  <p className="text-xs text-[#5A5A6A] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          )}
          {status?.last_handshake && status.last_handshake !== 'Sin handshake' && (
            <div className="flex items-center gap-2 bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-xs">
              <Activity size={12} className="text-[#FFD700]" />
              <span className="text-[#5A5A6A]">Último handshake:</span>
              <span className="text-[#1C1C1C] font-medium">{status.last_handshake}</span>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-[#FFD700] uppercase tracking-wide mb-2">Pubkey del VPS (configurar en MikroTik)</p>
            <div className="flex items-center gap-2 bg-[#FAF7F0] rounded-xl px-3 py-2.5 border border-[#E5E0D5]">
              <code className="flex-1 text-xs text-[#1C1C1C] font-mono break-all">{VPS_PUBKEY}</code>
              <button
                onClick={() => copyVpsPubkey(VPS_PUBKEY)}
                className="shrink-0 p-1.5 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#EDE9E0] transition-colors"
                title="Copiar"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-[#9A9AAA] mt-1">
              Endpoint VPS: <code className="text-[#5A5A6A]">{VPS_ENDPOINT}</code> — IP asignada al peer: <code className="text-[#5A5A6A]">{zona.ip_wireguard}</code>
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-[#FFD700] uppercase tracking-wide mb-2">
              {zona.wg_public_key ? 'Peer configurado' : 'Agregar peer MikroTik'}
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-[#5A5A6A] mb-1 block">Clave pública del MikroTik</label>
                <input
                  className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-xs text-[#1C1C1C] font-mono placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700]"
                  value={pubkey}
                  onChange={e => setPubkey(e.target.value)}
                  placeholder="Pegar aquí la pubkey del MikroTik..."
                />
              </div>
              <div>
                <label className="text-xs text-[#5A5A6A] mb-1 block">Red LAN (opcional, se auto-deriva de IP LAN)</label>
                <input
                  className="w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-xs text-[#1C1C1C] font-mono placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700]"
                  value={lanNet}
                  onChange={e => setLanNet(e.target.value)}
                  placeholder="192.168.80.0/24"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAddPeer}
                  disabled={loading}
                  className="flex-1 py-2 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Shield size={14} /> {loading ? 'Aplicando...' : zona.wg_public_key ? 'Actualizar peer' : 'Agregar peer'}
                </button>
                {zona.wg_public_key && (
                  <button
                    onClick={handleRemovePeer}
                    disabled={loading}
                    className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-xl hover:bg-red-50 disabled:opacity-50"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-blue-600 mb-1.5">Configurar en MikroTik RouterOS v7</p>
            <code className="text-xs text-[#5A5A6A] leading-relaxed block whitespace-pre-wrap">{
`/interface wireguard add name=wg-tuxtell private-key="<TU_PRIVATE_KEY>"
/interface wireguard peers add \\
  interface=wg-tuxtell \\
  public-key="${VPS_PUBKEY}" \\
  endpoint-address=${VPS_ENDPOINT.split(':')[0]} \\
  endpoint-port=${VPS_ENDPOINT.split(':')[1] || '51820'} \\
  allowed-address=10.10.0.0/24 \\
  persistent-keepalive=25s
/ip address add address=${zona.ip_wireguard}/24 interface=wg-tuxtell`
            }</code>
          </div>
        </div>
      </div>
    </div>
  )
}

const QUICK_CMDS = [
  { label: 'Ping 8.8.8.8',      cmd: '/ping 8.8.8.8 count=4' },
  { label: 'PPPoE activos',      cmd: '/ppp active print' },
  { label: 'Interfaces',         cmd: '/interface print' },
  { label: 'IP address',         cmd: '/ip address print' },
  { label: 'Rutas',              cmd: '/ip route print' },
  { label: 'Recursos sistema',   cmd: '/system resource print' },
  { label: 'Logs recientes',     cmd: '/log print count=20' },
]

function TerminalModal({ zona, onClose }) {
  const [lines, setLines]         = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [cmdHist, setCmdHist]     = useState([])
  const [histIdx, setHistIdx]     = useState(-1)
  const outputRef                 = useRef(null)
  const inputRef                  = useRef(null)

  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [lines])

  async function run(cmd) {
    const c = cmd.trim()
    if (!c || loading) return
    setLoading(true)
    setCmdHist(h => [c, ...h.slice(0, 49)])
    setHistIdx(-1)
    setInput('')
    const ts = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    try {
      const { data } = await api.post(`/zonas/${zona.id}/exec`, { cmd: c })
      setLines(l => [...l, { cmd: c, output: data.output, ts, ok: data.ok }])
    } catch (err) {
      setLines(l => [...l, { cmd: c, output: err.response?.data?.detail || 'Error al ejecutar', ts, ok: false }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') { run(input); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(histIdx + 1, cmdHist.length - 1)
      setHistIdx(next); setInput(cmdHist[next] || '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.max(histIdx - 1, -1)
      setHistIdx(next); setInput(next === -1 ? '' : cmdHist[next])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-3">
      <div className="bg-[#0D1117] rounded-xl border border-[#374151] w-full max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }}>

        <div className="flex items-center justify-between px-4 py-3 border-b border-[#374151] shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-green-400"/>
            <span className="font-bold text-white text-sm">Terminal MikroTik</span>
            <span className="text-xs text-[#9CA3AF] font-mono bg-[#1F2937] px-2 py-0.5 rounded">{zona.nombre} · {zona.ip_wireguard}</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#9CA3AF] hover:text-white"><X size={15}/></button>
        </div>

        <div className="px-4 py-2 border-b border-[#1F2937] flex gap-1.5 flex-wrap shrink-0">
          {QUICK_CMDS.map(q => (
            <button
              key={q.label}
              onClick={() => run(q.cmd)}
              disabled={loading}
              className="text-xs px-2.5 py-1 bg-[#1F2937] border border-[#374151] text-[#9CA3AF] hover:text-[#FFD700] hover:border-[#FFD700]/40 rounded transition-colors disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>

        <div ref={outputRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 font-mono text-xs">
          {lines.length === 0 && (
            <p className="text-[#374151]">Listo. Usa un botón rápido o escribe un comando RouterOS.</p>
          )}
          {lines.map((item, i) => (
            <div key={i}>
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[#FFD700] shrink-0">›</span>
                <span className="text-white break-all">{item.cmd}</span>
                <span className="text-[#374151] text-xs ml-auto shrink-0">{item.ts}</span>
              </div>
              <pre className={`whitespace-pre-wrap pl-4 leading-relaxed ${item.ok ? 'text-green-300' : 'text-red-400'}`}>
                {item.output}
              </pre>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-[#9CA3AF]">
              <div className="w-3 h-3 border border-[#9CA3AF] border-t-transparent rounded-full animate-spin"/>
              <span>Ejecutando...</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[#1F2937] shrink-0">
          <div className="flex items-center gap-2 bg-[#111827] rounded-lg px-3 py-2.5 border border-[#374151] focus-within:border-green-500/40 transition-colors">
            <span className="text-green-400 font-mono text-sm shrink-0 select-none">$</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-white text-sm font-mono outline-none placeholder-[#374151]"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="/ping 10.0.0.1 count=4"
              disabled={loading}
              autoFocus
            />
          </div>
          <p className="text-xs text-[#374151] mt-1.5">↑ ↓ historial · Enter ejecutar</p>
        </div>
      </div>
    </div>
  )
}

function getZoneCode(nombre, id) {
  return `${nombre.slice(0, 2).toUpperCase()}-${String(id).padStart(3, '0')}`
}

function ZonaCard({ zona, onRefresh }) {
  const [wgStatus, setWgStatus] = useState(null)
  const [modalEdit, setModalEdit] = useState(false)
  const [modalWG, setModalWG] = useState(false)
  const [modalTerminal, setModalTerminal] = useState(false)

  useEffect(() => {
    api.get(`/zonas/${zona.id}/wireguard-status`)
      .then(r => setWgStatus(r.data))
      .catch(() => setWgStatus(null))
  }, [zona.id])

  const wgOnline = wgStatus?.online ?? null

  async function handleEdit(form) {
    await api.put(`/zonas/${zona.id}`, form)
    toast.success('Zona actualizada')
    onRefresh()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar zona "${zona.nombre}"?\nSolo es posible si no tiene clientes asignados.`)) return
    try {
      await api.delete(`/zonas/${zona.id}`)
      toast.success('Zona eliminada')
      onRefresh()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar')
    }
  }

  const pct = zona.total_clientes > 0
    ? Math.round((zona.clientes_activos / zona.total_clientes) * 100)
    : 0

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#EDE9E0]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="text-[10px] font-mono bg-[#FAF7F0] border border-[#E5E0D5] text-[#5A5A6A] px-2 py-0.5 rounded-lg shrink-0">
                {getZoneCode(zona.nombre, zona.id)}
              </span>
              <h3 className="font-bold text-[#1C1C1C] text-base truncate">{zona.nombre}</h3>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={handleDelete} className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-red-500 hover:bg-red-50 transition-colors" title="Eliminar zona">
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            {wgOnline === null ? (
              <span className="text-[10px] text-[#9A9AAA] font-mono">Verificando...</span>
            ) : wgOnline ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold bg-green-50 text-green-600 border border-green-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0"/> WIREGUARD UP
                {wgStatus?.ssh_ok && <span className="text-blue-500 ml-1">· SSH</span>}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold bg-red-50 text-red-500 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"/> WIREGUARD DOWN
              </span>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setModalWG(true)}
                className="flex items-center gap-1 text-xs text-[#9A9AAA] hover:text-[#FFD700] transition-colors"
                title="Gestionar WireGuard"
              >
                <Shield size={12} /> WG
              </button>
              <button
                onClick={() => setModalTerminal(true)}
                className="flex items-center gap-1 text-xs text-[#9A9AAA] hover:text-green-600 transition-colors"
                title="Terminal MikroTik"
              >
                <Terminal size={12} /> Terminal
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl p-2.5">
              <p className="text-2xl font-black text-[#1C1C1C]">{zona.total_clientes}</p>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-wide">Total</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-2.5">
              <p className="text-2xl font-black text-green-600">{zona.clientes_activos}</p>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-wide">Activos</p>
            </div>
            <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-xl p-2.5">
              <p className="text-2xl font-black text-[#1C1C1C]">{pct}%</p>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-wide">Pool</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-wide font-semibold">Pool Ocupación</p>
              <p className="text-[10px] text-[#5A5A6A]">{zona.clientes_activos}/{zona.total_clientes}</p>
            </div>
            <div className="h-1.5 bg-[#EDE9E0] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-red-500' : pct >= 50 ? 'bg-[#FFD700]' : 'bg-green-500'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-2 bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl p-3">
            <Router size={14} className="text-[#5A5A6A] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#9A9AAA]">MikroTik</p>
              <p className="text-sm text-[#1C1C1C] font-medium truncate">
                {zona.usuario_mikrotik ? `${zona.usuario_mikrotik}@` : ''}{zona.ip_lan || zona.router_mikrotik || '—'}
              </p>
            </div>
            {zona.ip_lan && <span className="text-xs text-[#5A5A6A] font-mono">{zona.ip_lan}</span>}
          </div>
          {zona.wg_public_key && (
            <div className="bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2">
              <p className="text-xs text-[#9A9AAA] mb-0.5">Clave pública WG</p>
              <p className="text-xs text-[#1C1C1C] font-mono truncate">{zona.wg_public_key}</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-0">
          <button
            onClick={() => setModalEdit(true)}
            className="w-full py-2 text-xs text-[#5A5A6A] hover:text-[#1C1C1C] border border-[#E5E0D5] hover:border-[#D8D2C5] rounded-xl transition-colors flex items-center justify-center gap-1.5 bg-[#FAF7F0] hover:bg-[#EDE9E0]"
          >
            <Edit size={12} /> Editar Zona
          </button>
        </div>
      </div>

      {modalEdit && (
        <Modal title={`Editar Zona — ${zona.nombre}`} onClose={() => setModalEdit(false)}>
          <ZonaForm
            initial={{
              nombre: zona.nombre,
              ip_lan: zona.ip_lan || '',
              usuario_mikrotik: zona.usuario_mikrotik || '',
              password_mikrotik: zona.password_mikrotik || '',
              ip_wireguard: zona.ip_wireguard,
              wg_public_key: zona.wg_public_key || '',
              router_mikrotik: zona.router_mikrotik || '',
              ip_router: zona.ip_router || '',
              descripcion: zona.descripcion || '',
              tiendas_pago: zona.tiendas_pago || '',
            }}
            onSave={handleEdit}
            onClose={() => setModalEdit(false)}
          />
        </Modal>
      )}

      {modalWG && (
        <WireGuardModal
          zona={zona}
          onClose={() => setModalWG(false)}
          onRefresh={() => { onRefresh(); setModalWG(false) }}
        />
      )}

      {modalTerminal && (
        <TerminalModal zona={zona} onClose={() => setModalTerminal(false)} />
      )}
    </>
  )
}

export default function Zonas() {
  const [zonas, setZonas] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalNueva, setModalNueva] = useState(false)

  function fetchZonas() {
    setLoading(true)
    api.get('/zonas').then(r => setZonas(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { fetchZonas() }, [])

  async function crearZona(form) {
    await api.post('/zonas', form)
    toast.success('Zona creada')
    fetchZonas()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">

      <div className="flex items-center gap-2 text-xs text-[#9A9AAA] font-mono uppercase tracking-widest">
        <span>Network</span>
        <span className="text-[#D8D2C5]">›</span>
        <span className="text-[#FFD700]">Zone_Management</span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1C1C1C]">Zonas y Equipos</h1>
          <p className="text-[#5A5A6A] text-sm">Gestión de infraestructura de red regional TUX-ISP</p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          className="flex items-center gap-2 bg-[#FFD700] text-[#1C1C1C] font-bold px-4 py-2 rounded-xl hover:bg-yellow-400 transition-colors text-sm shrink-0"
        >
          <Plus size={16} /> Nueva Zona
        </button>
      </div>

      {/* VPS Info */}
      <div className="bg-white rounded-2xl p-4 border border-[#E5E0D5] shadow-sm flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
          <Globe size={18} className="text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1C1C1C]">Servidor VPS Principal</p>
          <p className="text-xs text-[#5A5A6A] truncate">161.132.48.127 — WireGuard Hub — Tuxtell Network</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-green-600 shrink-0 font-bold bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          ONLINE
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {zonas.map(z => <ZonaCard key={z.id} zona={z} onRefresh={fetchZonas} />)}
        {zonas.length === 0 && (
          <div className="col-span-full text-center py-12 text-[#9A9AAA]">
            <Globe size={40} className="mx-auto mb-3 text-[#D8D2C5]" />
            <p>Sin zonas registradas</p>
            <button onClick={() => setModalNueva(true)} className="mt-3 text-[#FFD700] text-sm underline">
              Crear primera zona
            </button>
          </div>
        )}
      </div>

      {modalNueva && (
        <Modal title="Nueva Zona" onClose={() => setModalNueva(false)}>
          <ZonaForm
            initial={{ ...ZONA_EMPTY }}
            onSave={crearZona}
            onClose={() => setModalNueva(false)}
          />
        </Modal>
      )}
    </div>
  )
}
