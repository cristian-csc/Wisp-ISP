import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { FieldIcon, FormField, FormGrid } from 'src/components/shared/form';
import { getMe, updateMiPerfil, cambiarPassword, type Usuario } from 'src/lib/api';
import { ROL_LABEL } from 'src/lib/permisos';

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
  return resto > 0 ? `${anios} año${anios !== 1 ? 's' : ''}, ${resto} mes${resto !== 1 ? 'es' : ''}` : `${anios} año${anios !== 1 ? 's' : ''}`;
}

function initials(nombre: string) {
  return nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

const Perfil = () => {
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
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Encabezado */}
      <CardBox className="p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary to-secondary px-6 py-6 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20 text-white text-xl font-bold border-2 border-white/40">
            {initials(usuario.nombre)}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{usuario.nombre}</h1>
            <p className="text-sm text-white/80">{usuario.email}</p>
          </div>
          <Badge className="ml-auto bg-white/20 text-white rounded-md border-0">
            {ROL_LABEL[usuario.rol]}
          </Badge>
        </div>
      </CardBox>

      {/* Datos de registro — solo lectura */}
      <CardBox className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Icon icon="tabler:id-badge-2" height={16} />
          Datos de registro
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Estos datos solo los puede corregir un administrador desde "Usuarios".
        </p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">DNI</p>
            <p className="font-medium">{usuario.dni ?? 'Sin registrar'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Con nosotros desde</p>
            <p className="font-medium">{antiguedad(usuario.fecha_ingreso)}</p>
          </div>
        </div>
      </CardBox>

      {/* Datos de contacto — autoservicio */}
      <CardBox className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Icon icon="tabler:address-book" height={16} />
          Mis datos de contacto
        </h3>
        <FormGrid>
          <FormField label="Teléfono" icon="tabler:phone" htmlFor="perfilTel">
            <FieldIcon icon="tabler:phone">
              <Input
                id="perfilTel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </FieldIcon>
          </FormField>
          <FormField label="Dirección" icon="tabler:map-2" htmlFor="perfilDir">
            <FieldIcon icon="tabler:map-2">
              <Input
                id="perfilDir"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
              />
            </FieldIcon>
          </FormField>
        </FormGrid>
        <div className="mt-5 flex justify-end">
          <Button onClick={handleGuardarPerfil} disabled={guardandoPerfil} className="gap-2">
            <Icon
              icon={guardandoPerfil ? 'tabler:loader-2' : 'tabler:device-floppy'}
              width={17}
              className={guardandoPerfil ? 'animate-spin' : ''}
            />
            {guardandoPerfil ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </CardBox>

      {/* Cambiar contraseña */}
      <CardBox className="p-6">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Icon icon="tabler:key" height={16} />
          Cambiar contraseña
        </h3>
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-3">
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
          <FormField
            label="Confirmar contraseña nueva"
            icon="tabler:check"
            htmlFor="pwConfirmar"
          >
            <FieldIcon icon="tabler:check">
              <Input
                id="pwConfirmar"
                type="password"
                value={passwordConfirmar}
                onChange={(e) => setPasswordConfirmar(e.target.value)}
              />
            </FieldIcon>
          </FormField>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            variant="lighterror"
            onClick={handleCambiarPassword}
            disabled={guardandoPassword || !passwordActual || !passwordNueva}
          >
            {guardandoPassword ? 'Cambiando…' : 'Cambiar contraseña'}
          </Button>
        </div>
      </CardBox>
    </div>
  );
};

export default Perfil;
