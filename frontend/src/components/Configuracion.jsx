import { useEffect, useState } from 'react'
import { Server, Shield, Database, Plus, Edit, Trash2, X, Save, HardDrive, Download } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'

const inp = "w-full bg-[#FAF7F0] border border-[#E5E0D5] rounded-xl px-3 py-2 text-sm text-[#1C1C1C] placeholder-[#C8C2B5] focus:outline-none focus:border-[#FFD700] transition-colors"

const PLAN_EMPTY = { codigo: '', nombre: '', bajada_mbps: '', subida_mbps: '', precio: '' }

function PlanModal({ plan, onClose, onSaved }) {
  const [form, setForm] = useState(plan || PLAN_EMPTY)
  const [saving, setSaving] = useState(false)
  const editing = !!plan?.id

  async function guardar() {
    if (!form.codigo || !form.nombre || !form.bajada_mbps || !form.subida_mbps || !form.precio) {
      toast.error('Completa todos los campos')
      return
    }
    setSaving(true)
    try {
      const payload = {
        codigo: form.codigo.toUpperCase(),
        nombre: form.nombre,
        bajada_mbps: parseInt(form.bajada_mbps),
        subida_mbps: parseInt(form.subida_mbps),
        precio: parseFloat(form.precio),
      }
      if (editing) {
        await api.put(`/planes/${plan.id}`, payload)
        toast.success('Plan actualizado y sincronizado con MikroTik')
      } else {
        await api.post('/planes', payload)
        toast.success('Plan creado y sincronizado con MikroTik')
      }
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#1C1C1C]">{editing ? 'Editar Plan' : 'Nuevo Plan'}</h3>
          <button onClick={onClose} className="text-[#9A9AAA] hover:text-[#1C1C1C]"><X size={16}/></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Código *</label>
            <input className={inp} placeholder="PLAN05" value={form.codigo}
              onChange={e => setForm(f => ({...f, codigo: e.target.value}))}
              disabled={editing}/>
            {editing && <p className="text-xs text-[#9A9AAA] mt-1">El código no se puede cambiar</p>}
          </div>
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Nombre *</label>
            <input className={inp} placeholder="Básico 15M" value={form.nombre}
              onChange={e => setForm(f => ({...f, nombre: e.target.value}))}/>
          </div>
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Bajada (Mbps) *</label>
            <input type="number" className={inp} placeholder="15" value={form.bajada_mbps}
              onChange={e => setForm(f => ({...f, bajada_mbps: e.target.value}))}/>
          </div>
          <div>
            <label className="text-xs text-[#5A5A6A] mb-1 block">Subida (Mbps) *</label>
            <input type="number" className={inp} placeholder="6" value={form.subida_mbps}
              onChange={e => setForm(f => ({...f, subida_mbps: e.target.value}))}/>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-[#5A5A6A] mb-1 block">Precio S/ *</label>
            <input type="number" step="0.01" className={inp} placeholder="50.00" value={form.precio}
              onChange={e => setForm(f => ({...f, precio: e.target.value}))}/>
          </div>
        </div>

        <div className="bg-[#FAF7F0] rounded-xl p-3 border border-[#E5E0D5]">
          <p className="text-xs text-[#5A5A6A]">Rate-limit en MikroTik:</p>
          <p className="text-sm font-mono text-[#FFD700] mt-1">
            {form.bajada_mbps || '?'}M/{form.subida_mbps || '?'}M
          </p>
          <p className="text-xs text-[#9A9AAA] mt-1">Se aplicará en todos los MikroTiks activos</p>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-[#D8D2C5] rounded-xl text-[#5A5A6A] hover:text-[#1C1C1C]">
            Cancelar
          </button>
          <button onClick={guardar} disabled={saving}
            className="flex-1 py-2 text-sm bg-[#FFD700] text-[#1C1C1C] font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={14}/>{saving ? 'Sincronizando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Configuracion() {
  const [planes, setPlanes] = useState([])
  const [modal, setModal] = useState(null)
  const [pwd, setPwd] = useState({ actual: '', nueva: '', confirmar: '' })
  const [savingPwd, setSavingPwd] = useState(false)
  const [backups, setBackups] = useState([])
  const [loadingBackup, setLoadingBackup] = useState(false)

  function fetchPlanes() {
    api.get('/planes').then(r => setPlanes(r.data)).catch(() => {})
  }

  function fetchBackups() {
    api.get('/admin/backups').then(r => setBackups(r.data)).catch(() => {})
  }

  useEffect(() => { fetchPlanes(); fetchBackups() }, [])

  async function descargarBackup(filename) {
    try {
      const { data } = await api.get(`/admin/backups/download/${filename}`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Error al descargar el backup')
    }
  }

  async function hacerBackup() {
    setLoadingBackup(true)
    try {
      const { data } = await api.post('/admin/backup')
      toast.success(`Backup creado: ${data.filename} (${data.size_kb} KB)`)
      fetchBackups()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear backup')
    } finally {
      setLoadingBackup(false)
    }
  }

  async function eliminarPlan(plan) {
    if (!confirm(`¿Eliminar ${plan.nombre}? Esto también lo eliminará de todos los MikroTiks.`)) return
    try {
      await api.delete(`/planes/${plan.id}`)
      toast.success('Plan eliminado')
      fetchPlanes()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar')
    }
  }

  async function cambiarPassword(e) {
    e.preventDefault()
    if (pwd.nueva !== pwd.confirmar) { toast.error('Las contraseñas no coinciden'); return }
    if (pwd.nueva.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    setSavingPwd(true)
    try {
      await api.put('/auth/password', { password_actual: pwd.actual, password_nueva: pwd.nueva })
      toast.success('Contraseña actualizada')
      setPwd({ actual: '', nueva: '', confirmar: '' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar contraseña')
    } finally {
      setSavingPwd(false)
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-[#1C1C1C]">Configuración</h1>
        <p className="text-[#5A5A6A] text-sm">Ajustes del sistema TUX-ISP</p>
      </div>

      {/* Planes */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1C1C1C] flex items-center gap-2">
            <Database size={15} className="text-[#5A5A6A]"/> Planes de Internet
          </h2>
          <button onClick={() => setModal('nuevo')}
            className="flex items-center gap-1.5 bg-[#FFD700] text-[#1C1C1C] font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-yellow-400">
            <Plus size={13}/> Nuevo Plan
          </button>
        </div>

        <div className="space-y-2">
          {planes.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-[#FAF7F0] rounded-xl px-4 py-3 border border-[#E5E0D5]">
              <span className="text-[#1C1C1C] font-bold text-sm w-16 bg-[#FFD700]/20 text-center rounded-lg px-2 py-0.5">{p.codigo}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[#1C1C1C] text-sm font-medium">{p.nombre}</p>
                <p className="text-xs text-[#5A5A6A]">↓{p.bajada_mbps} Mbps / ↑{p.subida_mbps} Mbps</p>
              </div>
              <span className="text-[#1C1C1C] font-bold text-sm bg-[#FFD700] px-2 py-0.5 rounded-lg">S/ {p.precio}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setModal(p)}
                  className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#EDE9E0] transition-colors">
                  <Edit size={13}/>
                </button>
                <button onClick={() => eliminarPlan(p)}
                  className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-red-500 hover:bg-red-50 transition-colors">
                  <Trash2 size={13}/>
                </button>
              </div>
            </div>
          ))}
          {planes.length === 0 && (
            <p className="text-[#9A9AAA] text-sm text-center py-4">Sin planes registrados</p>
          )}
        </div>
      </div>

      {/* Backup */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#1C1C1C] flex items-center gap-2">
            <HardDrive size={15} className="text-[#5A5A6A]"/> Backup de Base de Datos
          </h2>
          <button
            onClick={hacerBackup}
            disabled={loadingBackup}
            className="flex items-center gap-1.5 bg-[#FFD700] text-[#1C1C1C] font-bold px-3 py-1.5 rounded-xl text-xs hover:bg-yellow-400 disabled:opacity-50"
          >
            {loadingBackup ? (
              <>
                <div className="w-3 h-3 border-2 border-[#1C1C1C]/30 border-t-[#1C1C1C] rounded-full animate-spin"/>
                Generando...
              </>
            ) : (
              <><Download size={13}/> Backup Ahora</>
            )}
          </button>
        </div>

        <div className="space-y-2">
          {backups.length === 0 ? (
            <p className="text-[#9A9AAA] text-sm text-center py-4">Sin backups registrados</p>
          ) : backups.map(b => (
            <div key={b.filename} className="flex items-center gap-3 bg-[#FAF7F0] rounded-xl px-4 py-3 border border-[#E5E0D5]">
              <div className="flex-1 min-w-0">
                <p className="text-[#1C1C1C] text-xs font-mono truncate">{b.filename}</p>
                <p className="text-xs text-[#5A5A6A] mt-0.5">
                  {new Date(b.created_at).toLocaleString('es-PE')} · {b.size_kb} KB
                </p>
              </div>
              <button
                onClick={() => descargarBackup(b.filename)}
                title="Descargar"
                className="p-1.5 rounded-lg text-[#9A9AAA] hover:text-[#1C1C1C] hover:bg-[#EDE9E0] transition-colors"
              >
                <Download size={14}/>
              </button>
            </div>
          ))}
        </div>

        <div className="bg-[#FAF7F0] rounded-xl p-3 border border-[#E5E0D5]">
          <p className="text-xs text-[#9A9AAA]">
            Se conservan los últimos 7 backups · Formato: <span className="font-mono">sql.gz</span> (restaurar con <span className="font-mono">gunzip | psql</span>)
          </p>
        </div>
      </div>

      {/* Sistema */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#1C1C1C] flex items-center gap-2"><Server size={15} className="text-[#5A5A6A]"/> Sistema</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Dominio', 'tuxtell.duckdns.org'],
            ['Backend', 'FastAPI + PostgreSQL'],
            ['Frontend', 'React + Vite + Tailwind'],
            ['Versión', '1.0.0'],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-[#9A9AAA]">{k}</p>
              <p className="text-[#1C1C1C] font-medium mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-white rounded-2xl border border-[#E5E0D5] shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[#1C1C1C] flex items-center gap-2"><Shield size={15} className="text-[#5A5A6A]"/> Cambiar Contraseña</h2>
        <form onSubmit={cambiarPassword} className="space-y-3">
          {[
            ['actual', 'Contraseña actual'],
            ['nueva', 'Nueva contraseña'],
            ['confirmar', 'Confirmar nueva contraseña'],
          ].map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-[#5A5A6A] mb-1 block">{label}</label>
              <input type="password" className={inp} value={pwd[k]}
                onChange={e => setPwd(p => ({...p, [k]: e.target.value}))}/>
            </div>
          ))}
          <button type="submit" disabled={savingPwd}
            className="bg-[#FFD700] text-[#1C1C1C] font-bold px-5 py-2 rounded-xl hover:bg-yellow-400 text-sm disabled:opacity-50">
            {savingPwd ? 'Actualizando...' : 'Actualizar Contraseña'}
          </button>
        </form>
      </div>

      {modal && (
        <PlanModal
          plan={modal === 'nuevo' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); fetchPlanes() }}
        />
      )}
    </div>
  )
}
