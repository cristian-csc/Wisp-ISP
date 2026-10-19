import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Search, Wifi, WifiOff, Trash2, FileText, RefreshCw, ChevronDown } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

const ESTADO_COLORS = {
  activo:     'bg-green-50 text-green-600 border border-green-200',
  suspendido: 'bg-red-50 text-red-500 border border-red-200',
  anulado:    'bg-[#FAF7F0] text-[#5A5A6A] border border-[#E5E0D5]',
}

const ESTADO_DOT = {
  activo:     'bg-green-500',
  suspendido: 'bg-red-500',
  anulado:    'bg-[#C8C2B5]',
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
]

function getInitials(nombre) {
  const parts = nombre.trim().split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return nombre.slice(0, 2).toUpperCase()
}

function getAvatarColor(nombre) {
  let sum = 0
  for (let i = 0; i < nombre.length; i++) sum += nombre.charCodeAt(i)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function formatFecha(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  } catch {
    return dateStr
  }
}

function timeSince(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  if (seconds < 60) return 'Hace un momento'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Hace ${minutes} minuto${minutes !== 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  return `Hace ${hours} hora${hours !== 1 ? 's' : ''}`
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [total, setTotal]       = useState(0)
  const [pages, setPages]       = useState(1)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [zonaFiltro, setZonaFiltro]   = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [zonas, setZonas]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [dashStats, setDashStats] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  useEffect(() => {
    api.get('/zonas').then(r => setZonas(r.data)).catch(() => {})
    api.get('/dashboard/stats').then(r => setDashStats(r.data)).catch(() => {})
  }, [])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: PER_PAGE }
      if (search)       params.search  = search
      if (zonaFiltro)   params.zona_id = zonaFiltro
      if (estadoFiltro) params.estado  = estadoFiltro
      const { data } = await api.get('/clientes', { params })
      setClientes(data.items)
      setTotal(data.total)
      setPages(data.pages)
      setLastUpdate(new Date())
    } finally {
      setLoading(false)
    }
  }, [page, search, zonaFiltro, estadoFiltro])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  async function toggleEstado(cliente) {
    try {
      if (cliente.estado === 'activo') {
        await api.post(`/clientes/${cliente.id}/cortar`)
        toast.success('Servicio cortado')
      } else {
        await api.post(`/clientes/${cliente.id}/reactivar`)
        toast.success('Servicio reactivado')
      }
      fetchClientes()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  async function eliminar(id, nombre) {
    if (!confirm(`¿Eliminar cliente "${nombre}"?\nSe borrarán también sus pagos e historial.`)) return
    try {
      await api.delete(`/clientes/${id}`)
      toast.success('Cliente eliminado')
      fetchClientes()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar cliente')
    }
  }

  const PER_PAGE = 20
  const startItem = ((page - 1) * PER_PAGE) + 1
  const endItem   = Math.min(page * PER_PAGE, total)

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-[#1C1C1C]">Gestión de Clientes</h1>
        <p className="text-[#5A5A6A] text-sm mt-0.5">Administración técnica y control de estados del parque de suscriptores.</p>
      </div>

      {/* Stat cards */}
      {dashStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-[#E5E0D5] shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#3B82F6" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Total Clientes</p>
              <p className="text-3xl font-black text-[#1C1C1C] leading-none mt-0.5">{dashStats.total_clientes}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#22C55E" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Activos</p>
              <p className="text-3xl font-black text-green-600 leading-none mt-0.5">{dashStats.clientes_activos}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-red-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-[#9A9AAA] uppercase tracking-widest font-semibold">Suspendidos</p>
              <p className="text-3xl font-black text-red-500 leading-none mt-0.5">{dashStats.clientes_suspendidos}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C8C2B5]" />
          <input
            type="text"
            placeholder="Buscar nombre, usuario, IP..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full bg-white border border-[#E5E0D5] rounded-xl pl-9 pr-3 py-2 text-sm text-[#1C1C1C] placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700] transition-colors"
          />
        </div>

        <div className="relative">
          <select
            value={zonaFiltro}
            onChange={e => { setZonaFiltro(e.target.value); setPage(1) }}
            className="appearance-none bg-white border border-[#E5E0D5] rounded-xl pl-3 pr-8 py-2 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700] cursor-pointer"
          >
            <option value="">Todas las Zonas</option>
            {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A9AAA] pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={estadoFiltro}
            onChange={e => { setEstadoFiltro(e.target.value); setPage(1) }}
            className="appearance-none bg-white border border-[#E5E0D5] rounded-xl pl-3 pr-8 py-2 text-sm text-[#1C1C1C] focus:outline-none focus:border-[#FFD700] cursor-pointer"
          >
            <option value="">Todos los Estados</option>
            <option value="activo">Activo</option>
            <option value="suspendido">Suspendido</option>
            <option value="anulado">Anulado</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A9AAA] pointer-events-none" />
        </div>

        <button
          onClick={fetchClientes}
          className="p-2 rounded-xl text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#EDE9E0] border border-[#E5E0D5] transition-colors"
          title="Actualizar"
        >
          <RefreshCw size={15} />
        </button>

        <span className="text-xs text-[#9A9AAA] ml-auto hidden sm:block">
          Actualizado: {timeSince(lastUpdate)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EDE9E0] bg-[#FAFAF8]">
                {['Nombre / ID', 'Usuario PPPoE', 'IP Asignada', 'Zona', 'Fecha Inst.', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#9A9AAA] uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#9A9AAA]">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
                      Cargando...
                    </div>
                  </td>
                </tr>
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#9A9AAA]">
                    <p>Sin resultados</p>
                    {(search || zonaFiltro || estadoFiltro) && (
                      <button
                        onClick={() => { setSearch(''); setZonaFiltro(''); setEstadoFiltro(''); setPage(1) }}
                        className="mt-2 text-[#FFD700] text-xs underline"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : clientes.map(c => {
                const initials  = getInitials(c.nombre)
                const avatarCls = getAvatarColor(c.nombre)
                const dotCls    = ESTADO_DOT[c.estado] || ESTADO_DOT.anulado
                const badgeCls  = ESTADO_COLORS[c.estado] || ESTADO_COLORS.anulado
                return (
                  <tr key={c.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarCls}`}>
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-[#1C1C1C]">{c.nombre}</p>
                          <p className="text-[10px] text-[#9A9AAA] font-mono">#TUX-{String(c.id).padStart(4, '0')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[#1C1C1C] font-mono text-xs font-medium">{c.usuario_pppoe}</p>
                      <p className="text-[#9A9AAA] text-xs">{c.telefono || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[#5A5A6A] font-mono text-xs bg-[#FAF7F0] border border-[#E5E0D5] px-2 py-0.5 rounded-lg">
                        {c.ip_estatica || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.zona?.nombre ? (
                        <span className="text-xs bg-[#FAF7F0] text-[#5A5A6A] border border-[#E5E0D5] px-2 py-1 rounded-lg font-medium">
                          {c.zona.nombre}
                        </span>
                      ) : <span className="text-[#D8D2C5] text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[#5A5A6A] text-xs">{formatFecha(c.fecha_instalacion)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${badgeCls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleEstado(c)}
                          title={c.estado === 'activo' ? 'Cortar servicio' : 'Reactivar servicio'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.estado === 'activo'
                              ? 'text-[#9A9AAA] hover:text-red-500 hover:bg-red-50'
                              : 'text-[#9A9AAA] hover:text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {c.estado === 'activo' ? <WifiOff size={14} /> : <Wifi size={14} />}
                        </button>
                        <Link
                          to={`/clientes/${c.id}`}
                          className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="Ver detalle"
                        >
                          <FileText size={14} />
                        </Link>
                        <button
                          onClick={() => eliminar(c.id, c.nombre)}
                          className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar cliente"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(pages > 1 || total > 0) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#EDE9E0]">
            <span className="text-xs text-[#9A9AAA]">
              Mostrando {startItem}–{endItem} de <span className="text-[#1C1C1C] font-semibold">{total}</span> clientes registrados
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 disabled:cursor-not-allowed bg-white transition-colors"
              >
                Anterior
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                  const p = i + Math.max(1, page - 2)
                  if (p > pages) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs rounded-lg font-medium transition-colors ${
                        p === page
                          ? 'bg-[#FFD700] text-[#1C1C1C]'
                          : 'text-[#5A5A6A] hover:bg-[#EDE9E0]'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages || pages === 0}
                className="px-4 py-1.5 text-xs rounded-lg border border-[#E5E0D5] text-[#5A5A6A] hover:text-[#1C1C1C] disabled:opacity-30 disabled:cursor-not-allowed bg-white transition-colors font-medium"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
