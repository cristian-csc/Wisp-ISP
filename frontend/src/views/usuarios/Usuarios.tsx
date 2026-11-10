import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Switch } from 'src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
  FormSection,
} from 'src/components/shared/form';
import {
  listUsuarios,
  createUsuario,
  updateUsuario,
  eliminarUsuario,
  restablecerPassword,
} from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';
import { ROL_LABEL } from 'src/lib/permisos';

// super_admin no se ofrece aquí a propósito — es un rol de infraestructura
// que se asigna a mano (ver PUT /auth/usuarios/{id}), no algo que cualquier
// admin deba poder autoasignarle a otro usuario desde este formulario.
// subadmin tampoco se ofrece — quedó confirmado como un rol sin uso real,
// ningún flujo de negocio lo necesita.
const ROLES: Usuario['rol'][] = ['admin', 'tecnico', 'vendedor_campo', 'vendedor_tienda'];

function antiguedad(fechaIngreso: string | null): string | null {
  if (!fechaIngreso) return null;
  const inicio = new Date(fechaIngreso);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return 'menos de 1 mes';
  if (meses < 12) return `${meses} mes${meses !== 1 ? 'es' : ''}`;
  const anios = Math.floor(meses / 12);
  return `${anios} año${anios !== 1 ? 's' : ''}`;
}

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Usuario['rol'] | ''>('');
  const [telefono, setTelefono] = useState('');
  const [dni, setDni] = useState('');
  const [direccion, setDireccion] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState<Usuario | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eRol, setERol] = useState<Usuario['rol']>('tecnico');
  const [eTelefono, setETelefono] = useState('');
  const [eDni, setEDni] = useState('');
  const [eDireccion, setEDireccion] = useState('');
  const [eFechaIngreso, setEFechaIngreso] = useState('');

  const [eliminando, setEliminando] = useState<Usuario | null>(null);

  // Restablecer la contraseña de otra persona (cuando la olvidó).
  const [restableciendo, setRestableciendo] = useState<Usuario | null>(null);
  const [rPassword, setRPassword] = useState('');
  const [rError, setRError] = useState<string | null>(null);
  const [rGuardando, setRGuardando] = useState(false);

  async function reload() {
    setUsuarios(await listUsuarios());
  }

  useEffect(() => {
    reload();
  }, []);

  function resetForm() {
    setNombre(''); setEmail(''); setPassword(''); setRol('');
    setTelefono(''); setDni(''); setDireccion(''); setFechaIngreso('');
    setError(null);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rol) {
      setError('Selecciona un rol.');
      return;
    }
    try {
      await createUsuario({
        nombre, email, password, rol,
        telefono: telefono || undefined,
        dni: dni || undefined,
        direccion: direccion || undefined,
        fecha_ingreso: fechaIngreso || undefined,
      });
      setOpen(false);
      resetForm();
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear el usuario');
    }
  }

  async function toggleActivo(u: Usuario) {
    await updateUsuario(u.id, { activo: !u.activo });
    reload();
  }

  function abrirEditar(u: Usuario) {
    setEditando(u);
    setENombre(u.nombre);
    setERol(u.rol);
    setETelefono(u.telefono ?? '');
    setEDni(u.dni ?? '');
    setEDireccion(u.direccion ?? '');
    setEFechaIngreso(u.fecha_ingreso ?? '');
  }

  async function handleGuardarFicha() {
    if (!editando) return;
    if (!eNombre.trim()) {
      toast.error('El nombre no puede quedar vacío.');
      return;
    }
    await updateUsuario(editando.id, {
      nombre: eNombre.trim(),
      rol: eRol,
      telefono: eTelefono || undefined,
      dni: eDni || undefined,
      direccion: eDireccion || undefined,
      fecha_ingreso: eFechaIngreso || undefined,
    });
    setEditando(null);
    reload();
  }

  function abrirRestablecer(u: Usuario) {
    setRestableciendo(u);
    setRPassword('');
    setRError(null);
  }

  async function handleRestablecer(e: FormEvent) {
    e.preventDefault();
    if (!restableciendo || rGuardando) return;
    if (rPassword.length < 8) {
      setRError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setRGuardando(true);
    setRError(null);
    try {
      await restablecerPassword(restableciendo.id, rPassword);
      toast.success(`Contraseña cambiada a ${restableciendo.nombre}`, {
        description: 'Dísela en persona y pídele que la cambie al entrar.',
      });
      setRestableciendo(null);
      setRPassword('');
    } catch (err: any) {
      setRError(err?.response?.data?.detail ?? 'No se pudo cambiar la contraseña');
    } finally {
      setRGuardando(false);
    }
  }

  async function handleEliminar() {
    if (!eliminando) return;
    try {
      await eliminarUsuario(eliminando.id);
      toast.success(`${eliminando.nombre} eliminado`);
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar el usuario');
    }
  }

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <Button onClick={() => setOpen(true)}>Crear usuario</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Antigüedad</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead className="text-end">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                {u.nombre}
                <p className="text-xs text-muted-foreground font-normal">{u.email}</p>
              </TableCell>
              <TableCell className="text-sm">
                <p>{u.telefono ?? '—'}</p>
                <p className="text-xs text-muted-foreground">DNI {u.dni ?? '—'}</p>
              </TableCell>
              <TableCell>
                <Badge className="bg-lightprimary text-primary rounded-md">{ROL_LABEL[u.rol]}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {antiguedad(u.fecha_ingreso) ?? '—'}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={u.activo} onCheckedChange={() => toggleActivo(u)} />
                  <span className="text-sm text-muted-foreground">{u.activo ? 'Activo' : 'Desactivado'}</span>
                </div>
              </TableCell>
              <TableCell className="text-end">
                <Button variant="ghost" size="icon" onClick={() => abrirEditar(u)} title="Editar ficha">
                  <Icon icon="tabler:pencil" height={18} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => abrirRestablecer(u)}
                  title="Restablecer contraseña"
                >
                  <Icon icon="tabler:key" height={18} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEliminando(u)} title="Eliminar">
                  <Icon icon="tabler:trash" height={18} className="text-error" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) resetForm();
          setOpen(o);
        }}
        title="Crear usuario"
        subtitle="Da de alta a una persona del equipo"
        icon="tabler:user-plus"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Crear"
            submitIcon="tabler:user-plus"
            submitForm="usuario-create-form"
          />
        }
      >
        <form id="usuario-create-form" onSubmit={handleCreate} className="flex flex-col gap-5">
          <FormGrid>
            <FormSection title="Datos de la cuenta" icon="tabler:lock">
              <FormField label="Nombre" htmlFor="nombreUsuario" required>
                <FieldIcon icon="tabler:user">
                  <Input
                    id="nombreUsuario"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                  />
                </FieldIcon>
              </FormField>
              {/* Es con lo que la persona entra al sistema. La convención de
                  la empresa es nombre.apellido@wispfibra.com, aunque el buzón
                  no exista: así no choca con las cuentas de los clientes. */}
              <FormField
                label="Correo"
                htmlFor="emailUsuario"
                required
                hint="Con esto entrará al sistema. Usa nombre.apellido@wispfibra.com"
              >
                <FieldIcon icon="tabler:mail">
                  <Input
                    id="emailUsuario"
                    type="email"
                    autoComplete="off"
                    placeholder="nombre.apellido@wispfibra.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </FieldIcon>
              </FormField>
              <FormField label="Contraseña" htmlFor="passwordUsuario" required>
                <FieldIcon icon="tabler:key">
                  <Input
                    id="passwordUsuario"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </FieldIcon>
              </FormField>
              <FormField label="Rol" htmlFor="rolUsuario">
                <FieldIcon icon="tabler:shield-check">
                  <Select value={rol} onValueChange={(v) => setRol(v as Usuario['rol'])}>
                    <SelectTrigger id="rolUsuario" className="w-full">
                      <SelectValue placeholder="Selecciona un rol" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROL_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldIcon>
              </FormField>
            </FormSection>

            <FormSection title="Datos personales" icon="tabler:id-badge-2">
              <FormField label="Teléfono" htmlFor="telUsuario">
                <FieldIcon icon="tabler:phone">
                  <Input
                    id="telUsuario"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </FieldIcon>
              </FormField>
              <FormField label="DNI" htmlFor="dniUsuario">
                <FieldIcon icon="tabler:id">
                  <Input id="dniUsuario" value={dni} onChange={(e) => setDni(e.target.value)} />
                </FieldIcon>
              </FormField>
              <FormField label="Fecha de ingreso" htmlFor="fechaIngresoUsuario">
                <Input
                  id="fechaIngresoUsuario"
                  type="date"
                  value={fechaIngreso}
                  onChange={(e) => setFechaIngreso(e.target.value)}
                />
              </FormField>
              <FormField label="Dirección" htmlFor="dirUsuario">
                <FieldIcon icon="tabler:map-2">
                  <Input
                    id="dirUsuario"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
                </FieldIcon>
              </FormField>
            </FormSection>
          </FormGrid>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      {/* Editar ficha */}
      <FormDialog
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        title={`Ficha de ${editando?.nombre ?? ''}`}
        subtitle="Nombre, rol y datos personales"
        icon="tabler:id-badge-2"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setEditando(null)}
            submitLabel="Guardar"
            onSubmit={handleGuardarFicha}
          />
        }
      >
        <FormGrid>
          <FormField
            label="Nombre completo"
            icon="tabler:user"
            htmlFor="eNombre"
            required
            wide
            hint="Es el nombre que sale en los recibos y en el historial, como quien cobró o registró."
          >
            <FieldIcon icon="tabler:user">
              <Input id="eNombre" value={eNombre} onChange={(e) => setENombre(e.target.value)} />
            </FieldIcon>
          </FormField>

          <FormField label="Rol" icon="tabler:shield-check" htmlFor="eRol" wide>
            <FieldIcon icon="tabler:shield-check">
              <Select value={eRol} onValueChange={(v) => setERol(v as Usuario['rol'])}>
                <SelectTrigger id="eRol" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROL_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldIcon>
          </FormField>

          <FormField label="Teléfono" icon="tabler:phone" htmlFor="eTel">
            <FieldIcon icon="tabler:phone">
              <Input id="eTel" value={eTelefono} onChange={(e) => setETelefono(e.target.value)} />
            </FieldIcon>
          </FormField>
          <FormField label="DNI" icon="tabler:id" htmlFor="eDni">
            <FieldIcon icon="tabler:id">
              <Input id="eDni" value={eDni} onChange={(e) => setEDni(e.target.value)} />
            </FieldIcon>
          </FormField>
          <FormField label="Fecha de ingreso" icon="tabler:calendar" htmlFor="eFecha">
            <Input
              id="eFecha"
              type="date"
              value={eFechaIngreso}
              onChange={(e) => setEFechaIngreso(e.target.value)}
            />
          </FormField>
          <FormField label="Dirección" icon="tabler:map-2" htmlFor="eDir">
            <FieldIcon icon="tabler:map-2">
              <Input id="eDir" value={eDireccion} onChange={(e) => setEDireccion(e.target.value)} />
            </FieldIcon>
          </FormField>
        </FormGrid>
      </FormDialog>

      <FormDialog
        open={!!restableciendo}
        onOpenChange={(o) => !o && setRestableciendo(null)}
        title="Restablecer contraseña"
        subtitle={restableciendo ? `Para ${restableciendo.nombre} · ${restableciendo.email}` : undefined}
        icon="tabler:key"
        footer={
          <FormActions
            onCancel={() => setRestableciendo(null)}
            submitLabel={rGuardando ? 'Cambiando…' : 'Cambiar contraseña'}
            submitIcon="tabler:key"
            submitForm="usuario-reset-form"
          />
        }
      >
        <form id="usuario-reset-form" onSubmit={handleRestablecer} className="flex flex-col gap-5">
          <FormCallout icon="tabler:info-circle">
            Para cuando alguien olvidó su contraseña. No puedes ver la anterior:
            esta la reemplaza. Dísela en persona y pídele que la cambie desde su
            perfil al entrar.
          </FormCallout>
          <FormField
            label="Contraseña nueva"
            htmlFor="rPassword"
            required
            hint="Mínimo 8 caracteres"
            error={rError}
          >
            <FieldIcon icon="tabler:key">
              <Input
                id="rPassword"
                type="text"
                autoComplete="off"
                value={rPassword}
                onChange={(e) => setRPassword(e.target.value)}
                required
              />
            </FieldIcon>
          </FormField>
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!eliminando}
        onOpenChange={(o) => !o && setEliminando(null)}
        title="Eliminar usuario"
        description={eliminando ? `¿Eliminar a "${eliminando.nombre}"? Esta acción no se puede deshacer. Si tiene historial real (clientes, pagos, averías, etc.), el sistema lo va a bloquear.` : undefined}
        onConfirm={handleEliminar}
      />
    </CardBox>
  );
};

export default Usuarios;
