import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, UserPlus, Globe, MessageCircle,
  Settings, LogOut, Wifi, DollarSign, TrendingDown, X,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clientes',      icon: Users,           label: 'Clientes',   end: true },
  { to: '/clientes/nuevo', icon: UserPlus,       label: 'Registrar' },
  { to: '/zonas',         icon: Globe,           label: 'Zonas' },
  { to: '/pagos',         icon: DollarSign,      label: 'Pagos' },
  { to: '/gastos',        icon: TrendingDown,    label: 'Gastos' },
  { to: '/whatsapp',      icon: MessageCircle,   label: 'WhatsApp' },
  { to: '/configuracion', icon: Settings,        label: 'Config' },
]

export default function Sidebar({ onClose }) {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <aside className="w-56 h-full bg-[#EDE9E0] border-r border-[#D8D2C5] flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#D8D2C5]">
        <div className="w-9 h-9 rounded-xl bg-[#FFD700] flex items-center justify-center shrink-0">
          <Wifi size={18} className="text-[#1C1C1C]" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[#1C1C1C] font-black text-sm leading-tight tracking-wider">TUX-ISP</p>
          <p className="text-[#9A9AAA] text-[9px] uppercase tracking-widest font-semibold mt-0.5">
            Network Management
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded text-[#9A9AAA] hover:text-[#1C1C1C] lg:hidden">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#FFD700] text-[#1C1C1C] shadow-sm'
                  : 'text-[#5A5A6A] hover:bg-[#D8D2C5]/60 hover:text-[#1C1C1C]'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer user */}
      <div className="px-3 pb-4 pt-3 border-t border-[#D8D2C5]">
        <div className="flex items-center gap-3 px-1 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#FFD700] flex items-center justify-center shrink-0">
            <span className="text-xs font-black text-[#1C1C1C]">A</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#1C1C1C] leading-tight truncate">Admin Panel</p>
            <p className="text-[10px] text-[#9A9AAA]">ISP Operator</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-[#5A5A6A] hover:bg-red-50 hover:text-red-500 transition-all"
        >
          <LogOut size={15} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  )
}
