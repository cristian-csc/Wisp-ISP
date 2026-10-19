import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Users, CheckCircle, Ban, Wallet, Wifi } from 'lucide-react'
import api from '../api/client'

function useClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return time.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function StatCard({ icon: Icon, label, value, badge, badgeColor = '#22C55E', iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-[#E5E0D5] shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        {badge && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: badgeColor, background: badgeColor + '18' }}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-[#9A9AAA] text-[10px] uppercase tracking-widest font-semibold mb-1">{label}</p>
      <p className="text-3xl font-black text-[#1C1C1C] leading-none">{value}</p>
    </div>
  )
}

function ZonaCard({ zona }) {
  const [wg, setWg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/zonas/${zona.id}/wireguard-status`)
      .then(r => setWg(r.data))
      .catch(() => setWg(null))
      .finally(() => setLoading(false))
  }, [zona.id])

  const isUp = !loading && wg?.online

  return (
    <div className="bg-white rounded-xl border border-[#E5E0D5] p-3.5 flex items-center gap-3">
      <div className="w-8 h-8 bg-[#FAF7F0] border border-[#E5E0D5] rounded-lg flex items-center justify-center shrink-0">
        <Wifi size={15} className="text-[#C8C2B5]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[#1C1C1C] leading-tight">{zona.nombre}</p>
        <p className="text-xs text-[#9A9AAA]">WireGuard {isUp ? 'Active' : loading ? '...' : 'Inactive'}</p>
      </div>
      <span className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${
        loading ? 'bg-[#FAF7F0] text-[#9A9AAA] border-[#E5E0D5]'
        : isUp ? 'bg-green-50 text-green-600 border-green-200'
        : 'bg-red-50 text-red-500 border-red-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-[#C8C2B5]' : isUp ? 'bg-green-500' : 'bg-red-500'}`}/>
        {loading ? '—' : isUp ? 'UP' : 'DOWN'}
      </span>
    </div>
  )
}

const TIPO_BADGE = {
  activacion: { bg: 'bg-green-50 text-green-600 border-green-200', dot: 'bg-green-500', label: 'ACTIVE' },
  corte:      { bg: 'bg-red-50 text-red-500 border-red-200',       dot: 'bg-red-500',   label: 'CORTE' },
  pago:       { bg: 'bg-yellow-50 text-yellow-600 border-yellow-200', dot: 'bg-yellow-500', label: 'PAGO' },
  nota:       { bg: 'bg-gray-50 text-gray-500 border-gray-200',    dot: 'bg-gray-400',  label: 'NOTA' },
}

export default function Dashboard() {
  const clock = useClock()
  const [stats, setStats]     = useState(null)
  const [grafica, setGrafica] = useState([])
  const [actividad, setActividad] = useState([])
  const [zonas, setZonas]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/stats'),
      api.get('/dashboard/ingresos-mensual'),
      api.get('/dashboard/ultimas-activaciones'),
      api.get('/zonas'),
    ]).then(([s, g, a, z]) => {
      setStats(s.data)
      setGrafica(g.data.slice(-6))
      setActividad(a.data)
      setZonas(z.data.filter(z => z.activo !== false))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#FFD700] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const balance = (stats?.ingresos_mes_actual || 0) - (stats?.gastos_mes_actual || 0)
  const activosPct = stats?.total_clientes > 0
    ? Math.round((stats.clientes_activos / stats.total_clientes) * 100)
    : 0
  const balanceTrend = stats?.ingresos_mes_anterior > 0
    ? (((stats.ingresos_mes_actual - stats.ingresos_mes_anterior) / stats.ingresos_mes_anterior) * 100).toFixed(1)
    : null

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-[#1C1C1C]">Red en Tiempo Real</h1>
          <p className="text-[#9A9AAA] text-sm mt-0.5">Resumen operacional de TUX-ISP para el día de hoy.</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E5E0D5] rounded-xl px-4 py-2 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-bold text-[#1C1C1C]">Sistema Online: {clock}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users} label="Total Clientes" value={stats?.total_clientes ?? 0}
          badge={`↑${activosPct}%`} iconBg="#F0FDF4" iconColor="#22C55E"
        />
        <StatCard
          icon={CheckCircle} label="Activos" value={stats?.clientes_activos ?? 0}
          iconBg="#EFF6FF" iconColor="#3B82F6"
        />
        <StatCard
          icon={Ban} label="Suspendidos" value={stats?.clientes_suspendidos ?? 0}
          iconBg="#FEF2F2" iconColor="#EF4444"
        />
        <StatCard
          icon={Wallet} label="Balance mes"
          value={`S/ ${balance.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`}
          badge={balanceTrend ? `↑${Math.abs(balanceTrend)}%` : null}
          badgeColor="#22C55E" iconBg="#FFFBEA" iconColor="#D97706"
        />
      </div>

      {/* Chart + Zonas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Line Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E0D5] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-[#1C1C1C]">Ingresos vs Gastos</h2>
            <div className="flex items-center gap-4 text-xs text-[#9A9AAA]">
              <span className="flex items-center gap-1.5">
                <span className="w-5 h-0.5 bg-yellow-400 inline-block rounded" />
                Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 inline-block border-t-2 border-dashed border-red-400" />
                Gastos
              </span>
            </div>
          </div>
          <p className="text-xs text-[#C8C2B5] mb-4">Comparativa semestral de flujo de caja</p>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={grafica} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EBE0" />
              <XAxis dataKey="nombre_mes" tick={{ fill: '#9A9AAA', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9A9AAA', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E0D5', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#1C1C1C', fontWeight: 700 }}
                itemStyle={{ color: '#5A5A6A' }}
              />
              <Line type="monotone" dataKey="ingresos" stroke="#FFD700" strokeWidth={2.5} dot={false} name="Ingresos" />
              <Line type="monotone" dataKey="gastos" stroke="#EF4444" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Gastos" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Estado de Zonas */}
        <div className="bg-white rounded-2xl border border-[#E5E0D5] p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#1C1C1C] mb-4">Estado de Zonas</h2>
          <div className="space-y-2.5">
            {zonas.length === 0 && (
              <p className="text-[#9A9AAA] text-sm text-center py-6">Sin zonas registradas</p>
            )}
            {zonas.map(z => <ZonaCard key={z.id} zona={z} />)}
          </div>
        </div>
      </div>

      {/* Últimas Activaciones */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#1C1C1C]">Últimas Activaciones</h2>
          <span className="text-xs font-semibold text-[#FFD700]">Sistema Online: {clock}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EDE9E0]">
                {['Cliente', 'Plan', 'IP Address', 'Zona', 'Estado'].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-[10px] font-semibold text-[#9A9AAA] uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actividad.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-[#9A9AAA] py-10 text-sm">Sin actividad reciente</td></tr>
              ) : (
                actividad.slice(0, 8).map(item => {
                  const initials = (item.cliente_nombre || '??').slice(0, 2).toUpperCase()
                  const badge = TIPO_BADGE[item.tipo] || TIPO_BADGE.nota
                  return (
                    <tr key={item.id} className="border-b border-[#F5F0E8] hover:bg-[#FAF7F0] transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#FFD700] flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-black text-[#1C1C1C]">{initials}</span>
                          </div>
                          <span className="font-medium text-[#1C1C1C] truncate max-w-[120px]">{item.cliente_nombre || '—'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs bg-[#FAF7F0] text-[#5A5A6A] border border-[#E5E0D5] px-2 py-0.5 rounded-md font-semibold">
                          {item.tipo?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#9A9AAA] text-xs">—</td>
                      <td className="py-3 px-3 text-[#5A5A6A] text-sm">—</td>
                      <td className="py-3 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${badge.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
