import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { FormActions, FormCallout, FormDialog, FormField } from 'src/components/shared/form';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  crearModuloPadre,
  editarModuloPadre,
  eliminarModuloPadre,
  listModulosPadre,
  moverModuloAPadre,
  ordenarModulosPadre,
  refrescarMisModulos,
  type ModuloPadre,
} from 'src/lib/modulos';

const ICONOS = [
  { valor: 'solar:home-2-linear', nombre: 'Inicio' },
  { valor: 'solar:users-group-rounded-linear', nombre: 'Personas' },
  { valor: 'solar:global-linear', nombre: 'Red' },
  { valor: 'solar:clipboard-list-linear', nombre: 'Tareas' },
  { valor: 'solar:wallet-2-linear', nombre: 'Dinero' },
  { valor: 'solar:settings-linear', nombre: 'Ajustes' },
  { valor: 'solar:chart-2-linear', nombre: 'Reportes' },
  { valor: 'solar:box-linear', nombre: 'Inventario' },
  { valor: 'solar:map-point-linear', nombre: 'Mapa' },
  { valor: 'solar:shield-user-linear', nombre: 'Seguridad' },
  { valor: 'solar:document-text-linear', nombre: 'Documentos' },
  { valor: 'solar:folder-linear', nombre: 'Carpeta' },
];

const mensajeDe = (err: any, porDefecto: string): string => {
  const detalle = err?.response?.data?.detail;
  return typeof detalle === 'string' ? detalle : porDefecto;
};

const ModulosPadrePantalla = () => {
  const [padres, setPadres] = useState<ModuloPadre[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [editando, setEditando] = useState<ModuloPadre | 'nuevo' | null>(null);
  const [fNombre, setFNombre] = useState('');
  const [fIcono, setFIcono] = useState(ICONOS[0].valor);
  const [fError, setFError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<ModuloPadre | null>(null);

  const cargar = useCallback(async () => {
    setFallo(false);
    try {
      setPadres(await listModulosPadre());
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirNuevo() {
    setFNombre('');
    setFIcono(ICONOS[0].valor);
    setFError(null);
    setEditando('nuevo');
  }

  function abrirEditar(p: ModuloPadre) {
    setFNombre(p.nombre);
    setFIcono(p.icono ?? ICONOS[0].valor);
    setFError(null);
    setEditando(p);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setGuardando(true);
    setFError(null);
    try {
      if (editando === 'nuevo') {
        await crearModuloPadre({ nombre: fNombre, icono: fIcono });
        toast.success(`Grupo ${fNombre.trim()} creado`);
      } else if (editando) {
        await editarModuloPadre(editando.id, { nombre: fNombre, icono: fIcono });
        toast.success('Grupo guardado');
      }
      setEditando(null);
      await cargar();
      refrescarMisModulos();
    } catch (err) {
      setFError(mensajeDe(err, 'No se guardó el grupo. Revisa los datos e inténtalo otra vez.'));
    } finally {
      setGuardando(false);
    }
  }

  async function mover(indice: number, paso: -1 | 1) {
    if (guardando) return;
    const nuevo = [...padres];
    const [p] = nuevo.splice(indice, 1);
    nuevo.splice(indice + paso, 0, p);
    setPadres(nuevo);
    setGuardando(true);
    try {
      await ordenarModulosPadre(nuevo.map((x) => x.id));
      refrescarMisModulos();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se guardó el orden. Inténtalo otra vez.'));
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarGrupo(moduloId: number, nombre: string, padreId: number) {
    setGuardando(true);
    try {
      await moverModuloAPadre(moduloId, padreId);
      toast.success(`${nombre} movido a ${padres.find((p) => p.id === padreId)?.nombre}`);
      await cargar();
      refrescarMisModulos();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se pudo mover el módulo.'));
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar() {
    if (!eliminando) return;
    try {
      await eliminarModuloPadre(eliminando.id);
      toast.success(`Grupo ${eliminando.nombre} eliminado`);
      await cargar();
      refrescarMisModulos();
    } catch (err) {
      toast.error(mensajeDe(err, 'No se pudo eliminar el grupo.'));
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
        <p className="text-sm text-muted-foreground">No se pudieron cargar los grupos. Revisa tu conexión y vuelve a intentarlo.</p>
        <Button onClick={() => { setCargando(true); cargar(); }}>Volver a cargar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Módulos padre</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Los grupos del menú lateral. Cada módulo pertenece a uno, y un grupo solo aparece si la persona tiene alguno de sus módulos.
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <Icon icon="tabler:plus" width={18} />
          Nuevo grupo
        </Button>
      </div>

      <CardBox className="!p-2">
        <ul className="divide-y divide-border">
          {padres.map((p, i) => {
            const abierto = expandido === p.id;
            return (
              <li key={p.id}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                    <Icon icon={p.icono ?? 'solar:folder-linear'} width={20} />
                  </span>
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setExpandido(abierto ? null : p.id)}
                    className="flex min-h-11 min-w-0 flex-[1_1_60%] cursor-pointer items-center gap-2 rounded-md px-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.modulos.length} {p.modulos.length === 1 ? 'módulo' : 'módulos'}
                      </span>
                    </span>
                    <Icon
                      icon="tabler:chevron-down"
                      width={18}
                      aria-hidden="true"
                      className={`shrink-0 text-muted-foreground transition-transform duration-200 ease-out ${abierto ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div className="ms-auto flex shrink-0 items-center">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Subir ${p.nombre}`} disabled={guardando || i === 0} onClick={() => mover(i, -1)}>
                      <Icon icon="tabler:arrow-up" width={18} />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Bajar ${p.nombre}`} disabled={guardando || i === padres.length - 1} onClick={() => mover(i, 1)}>
                      <Icon icon="tabler:arrow-down" width={18} />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Editar ${p.nombre}`} onClick={() => abrirEditar(p)}>
                      <Icon icon="tabler:pencil" width={18} />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Eliminar ${p.nombre}`} onClick={() => setEliminando(p)}>
                      <Icon icon="tabler:trash" width={18} />
                    </Button>
                  </div>
                </div>

                {abierto && (
                  <div className="px-2 pb-3 sm:ps-[58px]">
                    {p.modulos.length === 0 ? (
                      <p className="py-2 text-sm text-muted-foreground">
                        Este grupo está vacío. Mueve aquí un módulo desde otro grupo.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {p.modulos.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                            <Icon icon={m.icono ?? 'tabler:circle'} width={18} className="shrink-0" />
                            <span className="min-w-0 flex-1 text-sm">{m.nombre}</span>
                            <Select
                              value={String(p.id)}
                              disabled={guardando}
                              onValueChange={(v) => cambiarGrupo(m.id, m.nombre, Number(v))}
                            >
                              <SelectTrigger aria-label={`Grupo de ${m.nombre}`} className="h-9 w-full sm:w-48">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {padres.map((x) => (
                                  <SelectItem key={x.id} value={String(x.id)}>
                                    {x.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardBox>

      <FormDialog
        open={!!editando}
        onOpenChange={(a) => !a && setEditando(null)}
        title={editando === 'nuevo' ? 'Nuevo grupo' : 'Editar grupo'}
        icon="tabler:folder"
        size="sm"
        footer={
          <FormActions
            onCancel={() => setEditando(null)}
            submitLabel={editando === 'nuevo' ? 'Crear grupo' : 'Guardar'}
            submitForm="padre-form"
          />
        }
      >
        <form id="padre-form" onSubmit={guardar} className="flex flex-col gap-4">
          <FormField label="Nombre" htmlFor="padreNombre" required>
            <Input
              id="padreNombre"
              value={fNombre}
              minLength={3}
              maxLength={60}
              required
              placeholder="Ej. Reportes"
              onChange={(e) => setFNombre(e.target.value)}
            />
          </FormField>
          <FormField label="Icono" htmlFor="padreIcono">
            <Select value={fIcono} onValueChange={setFIcono}>
              <SelectTrigger id="padreIcono" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICONOS.map((i) => (
                  <SelectItem key={i.valor} value={i.valor}>
                    <span className="flex items-center gap-2">
                      <Icon icon={i.valor} width={18} />
                      {i.nombre}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {fError && <FormCallout tone="error">{fError}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!eliminando}
        onOpenChange={(a) => !a && setEliminando(null)}
        title="Eliminar grupo"
        description={
          eliminando
            ? eliminando.modulos.length > 0
              ? `"${eliminando.nombre}" tiene ${eliminando.modulos.length} módulo(s). Muévelos a otro grupo antes de eliminarlo.`
              : `¿Eliminar el grupo "${eliminando.nombre}"?`
            : undefined
        }
        onConfirm={confirmarEliminar}
      />
    </div>
  );
};

export default ModulosPadrePantalla;
