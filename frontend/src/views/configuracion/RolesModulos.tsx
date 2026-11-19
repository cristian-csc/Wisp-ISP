import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { FormActions, FormCallout, FormDialog, FormField } from 'src/components/shared/form';
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
import { useCurrentUser } from 'src/lib/useCurrentUser';
import {
  cambiarModuloDeRol,
  crearRol,
  editarRol,
  eliminarRol,
  listModulosConfigurables,
  listRolesConfigurables,
  ordenarModulosDeRol,
  refrescarMisModulos,
  type ModuloConfigurable,
  type PerfilBase,
  type RolConfigurable,
} from 'src/lib/modulos';

const TIPOS_DE_CUENTA: { valor: PerfilBase; nombre: string; ayuda: string }[] = [
  { valor: 'atencion_cliente', nombre: 'Oficina', ayuda: 'Trabaja en el panel: clientes, pagos, zonas y reportes.' },
  { valor: 'tecnico', nombre: 'Técnico de campo', ayuda: 'Usa la app y solo ve las zonas que tiene asignadas.' },
  { valor: 'vendedor_campo', nombre: 'Ventas en campo', ayuda: 'Usa la app para registrar clientes durante su jornada.' },
];

type Grupo = { id: number; nombre: string; activos: ModuloConfigurable[]; inactivos: ModuloConfigurable[] };

const asignacionDe = (modulo: ModuloConfigurable, rolId: number) =>
  modulo.asignaciones.find((a) => a.rol_id === rolId);

const mensajeDe = (err: any, porDefecto: string): string => {
  const detalle = err?.response?.data?.detail;
  return typeof detalle === 'string' ? detalle : porDefecto;
};

function gruposDelRol(modulos: ModuloConfigurable[], rolId: number): Grupo[] {
  const grupos = new Map<number, Grupo>();
  for (const modulo of modulos) {
    if (modulo.plataforma !== 'panel') continue;
    const grupo = grupos.get(modulo.modulo_padre_id) ?? { id: modulo.modulo_padre_id, nombre: modulo.grupo, activos: [], inactivos: [] };
    (asignacionDe(modulo, rolId) ? grupo.activos : grupo.inactivos).push(modulo);
    grupos.set(modulo.modulo_padre_id, grupo);
  }
  for (const grupo of grupos.values()) {
    grupo.activos.sort((a, b) => asignacionDe(a, rolId)!.orden - asignacionDe(b, rolId)!.orden);
  }
  return [...grupos.values()];
}

const RolesModulos = () => {
  const { user } = useCurrentUser();
  const [roles, setRoles] = useState<RolConfigurable[]>([]);
  const [modulos, setModulos] = useState<ModuloConfigurable[]>([]);
  const [rolId, setRolId] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [dialogo, setDialogo] = useState<'crear' | 'editar' | null>(null);
  const [fNombre, setFNombre] = useState('');
  const [fDescripcion, setFDescripcion] = useState('');
  const [fTipo, setFTipo] = useState<PerfilBase>('atencion_cliente');
  const [fError, setFError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  /** Un solo grupo abierto a la vez: la lista completa no cabía en pantalla. */
  const [grupoAbierto, setGrupoAbierto] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setFallo(false);
    try {
      const [listaRoles, listaModulos] = await Promise.all([
        listRolesConfigurables(),
        listModulosConfigurables(),
      ]);
      // El cliente no entra al panel: su app se configura aparte.
      const delPanel = listaRoles.filter((r) => r.clave !== 'cliente');
      setRoles(delPanel);
      setModulos(listaModulos);
      setRolId((actual) => actual ?? delPanel[0]?.id ?? null);
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const rol = roles.find((r) => r.id === rolId) ?? null;
  const grupos = useMemo(() => (rolId ? gruposDelRol(modulos, rolId) : []), [modulos, rolId]);
  const totalDelPanel = modulos.filter((m) => m.plataforma === 'panel').length;

  const cuantosTiene = (id: number) =>
    modulos.filter((m) => m.plataforma === 'panel' && asignacionDe(m, id)).length;

  /** Si el cambio es del rol de quien está aquí, su menú se actualiza ya. */
  const alGuardar = () => {
    if (rol && rol.id === user?.rol_id) refrescarMisModulos();
  };

  function abrirCrear() {
    setFNombre('');
    setFDescripcion('');
    setFTipo('atencion_cliente');
    setFError(null);
    setDialogo('crear');
  }

  function abrirEditar() {
    setFNombre(rol?.nombre ?? '');
    setFDescripcion(rol?.descripcion ?? '');
    setFError(null);
    setDialogo('editar');
  }

  async function guardarRol(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setFError(null);
    try {
      if (dialogo === 'crear') {
        const nuevo = await crearRol({ nombre: fNombre, descripcion: fDescripcion, perfil_base: fTipo });
        await cargar();
        setRolId(nuevo.id);
        toast.success(`Rol ${nuevo.nombre} creado`, { description: 'Ahora elige sus módulos.' });
      } else if (rol) {
        await editarRol(rol.id, { ...(rol.es_sistema ? {} : { nombre: fNombre }), descripcion: fDescripcion });
        await cargar();
        toast.success('Rol guardado');
      }
      setDialogo(null);
    } catch (err) {
      setFError(mensajeDe(err, 'No se guardó el rol. Revisa los datos e inténtalo otra vez.'));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!rol) return;
    try {
      await eliminarRol(rol.id);
      toast.success(`Rol ${rol.nombre} eliminado`);
      setRolId(null);
      await cargar();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se pudo eliminar el rol.'));
    }
  }

  async function cambiar(modulo: ModuloConfigurable, activo: boolean) {
    if (!rol || guardando) return;
    const ultimo = Math.max(0, ...modulos.flatMap((m) => m.asignaciones.filter((a) => a.rol_id === rol.id).map((a) => a.orden)));
    setModulos((lista) =>
      lista.map((m) => {
        if (m.id !== modulo.id) return m;
        const otras = m.asignaciones.filter((a) => a.rol_id !== rol.id);
        return {
          ...m,
          asignaciones: activo
            ? [...otras, { rol_id: rol.id, orden: ultimo + 1, es_central: false }]
            : otras,
        };
      }),
    );
    setGuardando(true);
    try {
      await cambiarModuloDeRol(rol.id, modulo.id, activo);
      toast.success(activo ? `${modulo.nombre} agregado a ${rol.nombre}` : `${modulo.nombre} quitado de ${rol.nombre}`);
      alGuardar();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se guardó el cambio. Inténtalo otra vez.'));
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function mover(grupo: Grupo, indice: number, paso: -1 | 1) {
    if (!rol || guardando) return;
    const reordenados = [...grupo.activos];
    const [modulo] = reordenados.splice(indice, 1);
    reordenados.splice(indice + paso, 0, modulo);

    const ids = grupos.flatMap((g) => (g.id === grupo.id ? reordenados : g.activos).map((m) => m.id));
    const posicion = new Map(ids.map((id, i) => [id, i + 1]));
    setModulos((lista) =>
      lista.map((m) => ({
        ...m,
        asignaciones: m.asignaciones.map((a) =>
          a.rol_id === rol.id && posicion.has(m.id) ? { ...a, orden: posicion.get(m.id)! } : a,
        ),
      })),
    );
    setGuardando(true);
    try {
      await ordenarModulosDeRol(rol.id, ids);
      alGuardar();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se guardó el orden. Inténtalo otra vez.'));
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Icon icon="tabler:loader-2" width={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (fallo) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">No se pudieron cargar los roles. Revisa tu conexión y vuelve a intentarlo.</p>
        <Button onClick={() => { setCargando(true); cargar(); }}>Volver a cargar</Button>
      </div>
    );
  }

  const fila = (modulo: ModuloConfigurable, grupo: Grupo, indice: number) => {
    const activo = !!asignacionDe(modulo, rolId!);
    const fijo = modulo.roles_fijos.includes(rolId!);
    const disponible = modulo.roles_disponibles.includes(rolId!);
    const nota = fijo ? 'Siempre visible' : !disponible ? 'No disponible para este tipo de rol' : null;

    return (
      <li key={modulo.id} className="flex min-h-11 items-center gap-2.5 py-1">
        <Icon icon={modulo.icono ?? 'tabler:circle'} width={18} className={`shrink-0 ${activo ? '' : 'opacity-50'}`} />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${activo ? '' : 'text-muted-foreground'}`}>{modulo.nombre}</span>
          {nota && <span className="block text-xs text-muted-foreground">{nota}</span>}
        </span>
        {activo && grupo.activos.length > 1 && (
          <span className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Subir ${modulo.nombre}`}
              disabled={guardando || indice === 0}
              onClick={() => mover(grupo, indice, -1)}
            >
              <Icon icon="tabler:arrow-up" width={18} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Bajar ${modulo.nombre}`}
              disabled={guardando || indice === grupo.activos.length - 1}
              onClick={() => mover(grupo, indice, 1)}
            >
              <Icon icon="tabler:arrow-down" width={18} />
            </Button>
          </span>
        )}
        <Switch
          checked={activo}
          disabled={guardando || fijo || !disponible}
          aria-label={`${activo ? 'Quitar' : 'Dar'} ${modulo.nombre} a ${rol?.nombre}`}
          onCheckedChange={(valor) => cambiar(modulo, valor)}
        />
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Roles y módulos</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Elige qué puede usar cada rol. El acceso cambia al momento y el menú se actualiza al recargar la página.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/configuracion/modulos-padre">Organizar grupos</Link>
          </Button>
          <Button onClick={abrirCrear}>
            <Icon icon="tabler:plus" width={18} />
            Nuevo rol
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Roles" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {roles.map((r) => {
            const elegido = r.id === rolId;
            const cuentas = r.cuentas_activas ?? 0;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={elegido}
                onClick={() => setRolId(r.id)}
                className={`transition-ui rounded-xl border p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  elegido ? 'border-primary bg-lightprimary' : 'border-ld bg-card hover:bg-muted'
                }`}
              >
                <span className="block text-sm font-semibold">{r.nombre}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {cuantosTiene(r.id)} de {totalDelPanel} módulos, {cuentas} {cuentas === 1 ? 'cuenta' : 'cuentas'}
                </span>
              </button>
            );
          })}
        </nav>

        <CardBox className="min-w-0">
          {rol && (
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{rol.nombre}</h2>
                {rol.descripcion && <p className="text-sm text-muted-foreground">{rol.descripcion}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="outline" size="sm" onClick={abrirEditar}>
                  Editar
                </Button>
                {!rol.es_sistema && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEliminando(true)}>
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          )}
          <div className="mt-3 divide-y divide-border border-y border-border">
            {grupos.map((grupo) => {
              const abierto = (grupoAbierto ?? grupos[0]?.id) === grupo.id;
              const total = grupo.activos.length + grupo.inactivos.length;
              return (
                <section key={grupo.id} aria-label={grupo.nombre}>
                  <h3>
                    <button
                      type="button"
                      aria-expanded={abierto}
                      onClick={() => setGrupoAbierto(abierto ? -1 : grupo.id)}
                      className="flex min-h-11 w-full cursor-pointer items-center gap-2 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="min-w-0 flex-1 truncate">{grupo.nombre}</span>
                      <span className="shrink-0 text-xs font-normal text-muted-foreground">
                        {grupo.activos.length} de {total}
                      </span>
                      <Icon
                        icon="tabler:chevron-down"
                        width={18}
                        aria-hidden="true"
                        className={`shrink-0 text-muted-foreground transition-transform duration-200 ease-out ${abierto ? 'rotate-180' : ''}`}
                      />
                    </button>
                  </h3>
                  {abierto && (
                    <ul className="divide-y divide-border pb-2">
                      {grupo.activos.map((m, i) => fila(m, grupo, i))}
                      {grupo.inactivos.map((m, i) => fila(m, grupo, i))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </CardBox>
      </div>

      <FormDialog
        open={!!dialogo}
        onOpenChange={(abierto) => !abierto && setDialogo(null)}
        title={dialogo === 'crear' ? 'Nuevo rol' : `Editar ${rol?.nombre ?? 'rol'}`}
        subtitle={dialogo === 'crear' ? 'Después eliges sus módulos' : undefined}
        icon="tabler:shield-plus"
        footer={
          <FormActions
            onCancel={() => setDialogo(null)}
            submitLabel={dialogo === 'crear' ? 'Crear rol' : 'Guardar'}
            submitForm="rol-form"
          />
        }
      >
        <form id="rol-form" onSubmit={guardarRol} className="flex flex-col gap-4">
          <FormField
            label="Nombre"
            htmlFor="rolNombre"
            required
            hint={dialogo === 'editar' && rol?.es_sistema ? 'El nombre de un rol del sistema no se cambia.' : undefined}
          >
            <Input
              id="rolNombre"
              value={fNombre}
              maxLength={60}
              minLength={3}
              required
              disabled={dialogo === 'editar' && rol?.es_sistema}
              placeholder="Ej. Contabilidad"
              onChange={(e) => setFNombre(e.target.value)}
            />
          </FormField>
          <FormField label="Descripción" htmlFor="rolDescripcion">
            <Input
              id="rolDescripcion"
              value={fDescripcion}
              maxLength={255}
              placeholder="Para qué sirve este rol"
              onChange={(e) => setFDescripcion(e.target.value)}
            />
          </FormField>
          {dialogo === 'crear' && (
            <FormField
              label="Tipo de cuenta"
              htmlFor="rolTipo"
              required
              hint={TIPOS_DE_CUENTA.find((t) => t.valor === fTipo)?.ayuda}
            >
              <Select value={fTipo} onValueChange={(v) => setFTipo(v as PerfilBase)}>
                <SelectTrigger id="rolTipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DE_CUENTA.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {fError && <FormCallout tone="error">{fError}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={eliminando}
        onOpenChange={setEliminando}
        title="Eliminar rol"
        description={rol ? `¿Eliminar el rol "${rol.nombre}"? Si todavía tiene cuentas, el sistema no lo permitirá.` : undefined}
        onConfirm={confirmarEliminar}
      />
    </div>
  );
};

export default RolesModulos;
