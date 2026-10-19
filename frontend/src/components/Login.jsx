import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import toast from 'react-hot-toast'

function PinguinoLogo({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cuerpo principal negro */}
      <ellipse cx="50" cy="72" rx="30" ry="36" fill="#1a1a2e"/>
      {/* Panza blanca */}
      <ellipse cx="50" cy="78" rx="17" ry="24" fill="#F0F0F0"/>
      {/* Cabeza */}
      <ellipse cx="50" cy="34" rx="22" ry="22" fill="#1a1a2e"/>
      {/* Cara blanca */}
      <ellipse cx="50" cy="36" rx="13" ry="13" fill="#F0F0F0"/>
      {/* Ojo izquierdo */}
      <circle cx="44" cy="31" r="4" fill="#1a1a2e"/>
      <circle cx="45.2" cy="30" r="1.5" fill="white"/>
      {/* Ojo derecho */}
      <circle cx="56" cy="31" r="4" fill="#1a1a2e"/>
      <circle cx="57.2" cy="30" r="1.5" fill="white"/>
      {/* Pico */}
      <ellipse cx="50" cy="40" rx="6" ry="4" fill="#FFD700"/>
      {/* Ala izquierda */}
      <ellipse cx="22" cy="72" rx="9" ry="22" fill="#1a1a2e" transform="rotate(-10 22 72)"/>
      {/* Ala derecha */}
      <ellipse cx="78" cy="72" rx="9" ry="22" fill="#1a1a2e" transform="rotate(10 78 72)"/>
      {/* Pie izquierdo */}
      <ellipse cx="40" cy="108" rx="10" ry="5" fill="#FFD700" transform="rotate(-10 40 108)"/>
      {/* Pie derecho */}
      <ellipse cx="60" cy="108" rx="10" ry="5" fill="#FFD700" transform="rotate(10 60 108)"/>
      {/* Brillo antena/cabeza */}
      <circle cx="62" cy="18" r="4" fill="#FFD700" opacity="0.9"/>
      <circle cx="62" cy="18" r="2" fill="white" opacity="0.6"/>
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const form = new URLSearchParams()
      form.append('username', email)
      form.append('password', password)
      const { data } = await api.post('/auth/login', form)
      localStorage.setItem('token', data.access_token)
      navigate('/dashboard')
    } catch {
      toast.error('Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Fondo decorativo: círculos de red */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full border border-[#FFD700]/5 animate-pulse"/>
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full border border-[#FFD700]/5 -translate-x-16 -translate-y-16"/>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full border border-[#FFD700]/5"/>
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full border border-[#FFD700]/5 translate-x-12 translate-y-12"/>
        {/* Puntos de red */}
        {[
          [10,20],[85,15],[5,70],[92,65],[50,5],[20,85],[80,80],[35,50],
        ].map(([x,y], i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-[#FFD700]/20"
            style={{ left:`${x}%`, top:`${y}%` }}
          />
        ))}
        {/* Líneas conectoras decorativas */}
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <line x1="10%" y1="20%" x2="50%" y2="5%" stroke="#FFD700" strokeWidth="1"/>
          <line x1="50%" y1="5%" x2="85%" y2="15%" stroke="#FFD700" strokeWidth="1"/>
          <line x1="5%" y1="70%" x2="20%" y2="85%" stroke="#FFD700" strokeWidth="1"/>
          <line x1="80%" y1="80%" x2="92%" y2="65%" stroke="#FFD700" strokeWidth="1"/>
          <line x1="35%" y1="50%" x2="10%" y2="20%" stroke="#FFD700" strokeWidth="1"/>
          <line x1="35%" y1="50%" x2="85%" y2="15%" stroke="#FFD700" strokeWidth="1"/>
        </svg>
      </div>

      {/* Card principal */}
      <div className="w-full max-w-sm relative z-10">

        {/* Logo y marca */}
        <div className="text-center mb-6">
          {/* Pingüino con glow */}
          <div className="inline-flex items-center justify-center relative mb-4">
            <div className="absolute inset-0 bg-[#FFD700]/20 rounded-full blur-2xl scale-150"/>
            <div className="relative bg-gradient-to-b from-[#1F2937] to-[#111827] rounded-full p-4 border border-[#374151] shadow-xl">
              <PinguinoLogo size={72}/>
            </div>
          </div>

          {/* Nombre */}
          <h1 className="text-3xl font-black tracking-tight">
            <span className="text-[#FFD700]">TUX</span>
            <span className="text-white">TELL</span>
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#374151]"/>
            <p className="text-[#9CA3AF] text-xs uppercase tracking-widest px-2">Sistema ISP</p>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#374151]"/>
          </div>
        </div>

        {/* Formulario */}
        <div className="bg-[#1F2937] rounded-2xl border border-[#374151] shadow-2xl overflow-hidden">
          {/* Banner superior */}
          <div className="h-1 bg-gradient-to-r from-[#FFD700]/0 via-[#FFD700] to-[#FFD700]/0"/>

          <form onSubmit={handleSubmit} className="p-6 space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">
                Correo electrónico
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#111827] border border-[#374151] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/20 transition-all placeholder-[#4B5563]"
                  placeholder="usuario@tuxtell.net"
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#111827] border border-[#374151] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FFD700] focus:ring-1 focus:ring-[#FFD700]/20 transition-all"
                placeholder="••••••••"
                autoComplete="off"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-[#FFD700] rounded-xl transition-all group-hover:from-yellow-300 group-hover:to-yellow-400"/>
              <div className="relative flex items-center justify-center gap-2 py-3 font-black text-[#111827] text-sm tracking-wide">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#111827]/30 border-t-[#111827] rounded-full animate-spin"/>
                    Ingresando...
                  </>
                ) : (
                  'INGRESAR AL SISTEMA'
                )}
              </div>
            </button>
          </form>

          {/* Footer del card */}
          <div className="px-6 pb-5">
            <div className="border-t border-[#374151] pt-4 flex items-center justify-between">
              <span className="text-xs text-[#4B5563]">tuxtell.net</span>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                <span className="text-xs text-green-400 font-medium">Sistema activo</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#4B5563] mt-4">
          tuxtell.net
        </p>
      </div>
    </div>
  )
}
