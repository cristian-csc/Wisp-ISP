import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { FieldIcon, FormField, FormSection } from 'src/components/shared/form';
import { getMe, updateMiPerfil, cambiarPassword, type Usuario } from 'src/lib/api';
import { nombreDeRol } from 'src/lib/permisos';

/**
 * Los datos de la propia cuenta: lo que se puede corregir solo y lo que no.
 *
 * Vive aparte de la pantalla porque se usa en dos sitios —la ventana que abre
 * el menú de la esquina y la página /perfil— y la lógica de guardar no debe
 * existir dos veces: el día que cambie una regla, cambia en los dos.
 */

function antiguedad(fechaIngreso: string | null): string {
  if (!fechaIngreso) return 'Sin registrar';
  const inicio = new Date(fechaIngreso);
  const hoy = new Date();
  let meses = (hoy.getFullYear() - inicio.getFullYear()) * 12 + (hoy.getMonth() - inicio.getMonth());
  if (hoy.getDate() < inicio.getDate()) meses -= 1;
  if (meses < 1) return 'Menos de 1 mes';
  if (meses < 12) return `${meses} mes${meses !== 1 ? 'es' : ''}`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto > 0
    ? `${anios} año${anios !== 1 ? 's' : ''}, ${resto} mes${resto !== 1 ? 'es' : ''}`
    : `${anios} año${anios !== 1 ? 's' : ''}`;
}

function iniciales(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

interface Props {
  /** La tarjeta de identidad de arriba. En una ventana sobra: su propia
   *  cabecera ya dice de quién es la cuenta. */
  conCabecera?: boolean;
}

const PerfilFormulario = ({ conCabecera = true }: Props) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmar, setPasswordConfirmar] = useState('');
  const [guardandoPassword, setGuardandoPassword] = useState(false);

  function reload() {
    getMe()
      .then((u) => {
        setUsuario(u);
        setTelefono(u.telefono ?? '');
        setDireccion(u.direccion ?? '');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleGuardarPerfil() {
    setGuardandoPerfil(true);
    try {
      await updateMiPerfil({ telefono: telefono || undefined, direccion: direccion || undefined });
      toast.success('Datos actualizados');
      reload();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo guardar');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function handleCambiarPassword() {
    if (passwordNueva.length < 8) {
      toast.error('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      toast.error('La confirmación no coincide con la contraseña nueva.');
      return;
    }
    setGuardandoPassword(true);
    try {
      await cambiarPassword(passwordActual, passwordNueva);
      toast.success('Contraseña actualizada');
      setPasswordActual('');
      setPasswordNueva('');
      setPasswordConfirmar('');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo cambiar la contraseña');
    } finally {
      setGuardandoPassword(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!usuario) return <p className="text-sm text-error">No se pudo cargar tu perfil.</p>;

  return (
    <div className="flex flex-col gap-4">
      {conCabecera && (
        <div className="flex items-center gap-4 rounded-xl bg-sidebar px-6 py-5">
          <span className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-brand/50 bg-sidebar-hover text-xl font-bold text-sidebar-foreground-strong">
            {iniciales(usuario.nombre)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-sidebar-foreground-strong">
              {usuario.nombre}
            </h1>
            <p className="truncate text-sm text-sidebar-foreground">{usuario.email}</p>
          </div>
          <Badge className="ml-auto rounded-md border-0 bg-brand text-brand-foreground">
            {nombreDeRol(usuario)}
          </Badge>
        </div>
      )}

      <FormSection title="Datos de registro" icon="tabler:id-badge-2" hint="Solo lectura">
        <p className="text-xs text-muted-foreground md:col-span-2">
          Estos datos solo los puede corregir un administrador desde «Usuarios».
        </p>
        <div>
          <p className="text-xs text-muted-foreground">DNI</p>
          <p className="text-sm font-medium">{usuario.dni ?? 'Sin registrar'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Con nosotros desde</p>
          <p className="text-sm font-medium">{antiguedad(usuario.fecha_ingreso)}</p>
        </div>
      </FormSection>

      <FormSection title="Mis datos de contacto" icon="tabler:address-book">
        <FormField label="Teléfono" icon="tabler:phone" htmlFor="perfilTel">
          <FieldIcon icon="tabler:phone">
            <Input id="perfilTel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </FieldIcon>
        </FormField>
        <FormField label="Dirección" icon="tabler:map-2" htmlFor="perfilDir">
          <FieldIcon icon="tabler:map-2">
            <Input id="perfilDir" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FieldIcon>
        </FormField>
        <div className="flex justify-end md:col-span-2">
          <Button onClick={handleGuardarPerfil} disabled={guardandoPerfil} className="gap-2">
            <Icon
              icon={guardandoPerfil ? 'tabler:loader-2' : 'tabler:device-floppy'}
              width={17}
              className={guardandoPerfil ? 'animate-spin' : ''}
            />
            {guardandoPerfil ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </FormSection>

      {/* Cada bloque guarda lo suyo con su propio botón: son dos operaciones
          distintas contra el servidor y juntarlas en un único «Guardar» haría
          creer que cambiar el teléfono también cambia la contraseña. */}
      <FormSection title="Cambiar contraseña" icon="tabler:key">
        <FormField label="Contraseña actual" icon="tabler:key" htmlFor="pwActual">
          <FieldIcon icon="tabler:key">
            <Input
              id="pwActual"
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
            />
          </FieldIcon>
        </FormField>
        <FormField label="Contraseña nueva" icon="tabler:key-off" htmlFor="pwNueva">
          <FieldIcon icon="tabler:key-off">
            <Input
              id="pwNueva"
              type="password"
              value={passwordNueva}
              onChange={(e) => setPasswordNueva(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </FieldIcon>
        </FormField>
        <FormField label="Confirmar contraseña nueva" icon="tabler:check" htmlFor="pwConfirmar">
          <FieldIcon icon="tabler:check">
            <Input
              id="pwConfirmar"
              type="password"
              value={passwordConfirmar}
              onChange={(e) => setPasswordConfirmar(e.target.value)}
            />
          </FieldIcon>
        </FormField>
        <div className="flex justify-end md:col-span-2">
          <Button
            variant="lighterror"
            onClick={handleCambiarPassword}
            disabled={guardandoPassword || !passwordActual || !passwordNueva}
          >
            {guardandoPassword ? 'Cambiando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </FormSection>
    </div>
  );
};

export default PerfilFormulario;
