import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import PageHeader from 'src/components/shared/PageHeader';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeAccion } from 'src/lib/permisos';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';
import {
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
} from 'src/components/shared/form';
import { listOnus, createOnu, asignarOnu, marcarOnu, deleteOnu, detectarMarca, type EstadoOnu, type Onu } from 'src/lib/onus';
import { listUsuarios } from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';

const ESTADO_LABEL: Record<Onu['estado'], string> = {
  en_almacen: 'En almacén',
  asignado_tecnico: 'Asignada a técnico',
  instalado: 'Instalada',
  danado: 'Dañada',
  perdido: 'Perdida',
};

const ESTADO_BADGE: Record<Onu['estado'], string> = {
  en_almacen: 'bg-lightinfo text-info-text',
  asignado_tecnico: 'bg-lightwarning text-warning-text',
  instalado: 'bg-lightsuccess text-success-text',
  danado: 'bg-lighterror text-error-text',
  perdido: 'bg-muted text-muted-foreground',
};

/** Resumen por estado: superficie blanca (la tarjeta) y solo el recuadro del
 *  icono lleva el tinte semántico suave; el verde/rojo significan algo aquí
 *  porque representan el estado real del equipo. */
const RESUMEN: { estado: EstadoOnu; icono: string; tile: string }[] = [
  { estado: 'en_almacen', icono: 'tabler:building-warehouse', tile: 'bg-lightinfo text-info-text' },
  { estado: 'asignado_tecnico', icono: 'tabler:user-check', tile: 'bg-lightwarning text-warning-text' },
  { estado: 'instalado', icono: 'tabler:circle-check', tile: 'bg-lightsuccess text-success-text' },
  { estado: 'danado', icono: 'tabler:alert-triangle', tile: 'bg-lighterror text-error-text' },
  { estado: 'perdido', icono: 'tabler:help-circle', tile: 'bg-muted text-muted-foreground' },
];

const Onus = () => {
  const { user } = useCurrentUser();
  /** Consultar el inventario lo puede hacer también atención al cliente;
   *  dar de alta, asignar o borrar equipos es de almacén. */
  const puedeGestionar = puedeAccion('onus.gestionar', user?.rol);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [openCreate, setOpenCreate] = useState(false);
  const [asignando, setAsignando] = useState<Onu | null>(null);
  const [tecnicoSel, setTecnicoSel] = useState('');
  const [serie, setSerie] = useState('');
  const [mac, setMac] = useState('');
  const [marca, setMarca] = useState('');
  const [serieConfirmada, setSerieConfirmada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Onu | null>(null);
  const macInputRef = useRef<HTMLInputElement>(null);
  // Filtros solo de pantalla: no tocan el backend, filtran lo ya cargado.
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<EstadoOnu | null>(null);

  async function reload() {
    setCargando(true);
    try {
      setOnus(await listOnus());
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    reload();
    // La lista de técnicos solo la recibe quien puede asignar equipos.
    listUsuarios().then((all) => setTecnicos(all.filter((u) => u.rol === 'tecnico'))).catch(() => setTecnicos([]));
  }, []);

  const conteos = useMemo(() => {
    const c: Record<EstadoOnu, number> = {
      en_almacen: 0,
      asignado_tecnico: 0,
      instalado: 0,
      danado: 0,
      perdido: 0,
    };
    for (const o of onus) c[o.estado] += 1;
    return c;
  }, [onus]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return onus.filter((o) => {
      if (filtroEstado && o.estado !== filtroEstado) return false;
      if (!q) return true;
      return (
        o.numero_serie.toLowerCase().includes(q) ||
        (o.mac ?? '').toLowerCase().includes(q) ||
        (o.marca ?? '').toLowerCase().includes(q) ||
        (o.cliente?.nombre ?? '').toLowerCase().includes(q) ||
        (o.cliente?.zona?.nombre ?? '').toLowerCase().includes(q)
      );
    });
  }, [onus, busqueda, filtroEstado]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createOnu({ numero_serie: serie, mac: mac || undefined, marca: marca || undefined });
      setOpenCreate(false);
      setSerie('');
      setMac('');
      setMarca('');
      setSerieConfirmada(false);
      reload();
      toast.success('ONU registrada');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo registrar la ONU');
    }
  }

  function handleSerieChange(valor: string) {
    setSerie(valor);
    setSerieConfirmada(false);
    const detectada = detectarMarca(valor);
    if (detectada) setMarca(detectada);
  }

  // El lector de código de barras USB (NETUM) escribe el texto escaneado y
  // termina enviando un Enter, igual que si lo tipeara una persona y diera
  // "Intro". Lo usamos para confirmar la serie y saltar directo a MAC.
  function handleSerieKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!serie.trim()) return;
    const detectada = detectarMarca(serie);
    if (detectada) setMarca(detectada);
    setSerieConfirmada(true);
    macInputRef.current?.focus();
  }

  async function handleAsignar() {
    if (!asignando || !tecnicoSel) return;
    try {
      await asignarOnu(asignando.id, Number(tecnicoSel));
      setAsignando(null);
      setTecnicoSel('');
      reload();
      toast.success('ONU asignada al técnico');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo asignar la ONU');
    }
  }

  async function handleMarcar(onu: Onu, estado: Onu['estado']) {
    try {
      await marcarOnu(onu.id, estado);
      reload();
      toast.success(estado === 'danado' ? 'ONU marcada como dañada' : 'ONU actualizada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo actualizar la ONU');
    }
  }

  async function handleEliminar() {
    if (!borrando) return;
    try {
      await deleteOnu(borrando.id);
      reload();
      toast.success('ONU eliminada del inventario');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la ONU');
    }
  }

  const hayFiltro = busqueda.trim() !== '' || filtroEstado !== null;

  return (
    <div>
      <PageHeader
        titulo="Equipos (ONUs)"
        descripcion="Inventario y control de ONUs de la red de fibra"
        icono="tabler:router"
        acciones={
          /* Atención al cliente consulta el inventario para saber si hay
             equipo disponible; darlo de alta o darlo de baja es de almacén. */
          puedeGestionar ? (
            <Button onClick={() => setOpenCreate(true)}>
              <Icon icon="tabler:plus" height={18} />
              Registrar ONU
            </Button>
          ) : undefined
        }
      />

      {/* Resumen por estado. Cada tarjeta filtra la tabla (solo en pantalla). */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <button
          type="button"
          onClick={() => setFiltroEstado(null)}
          className="text-left"
          aria-pressed={filtroEstado === null}
        >
          <CardBox
            className={`transition-ui card-hover h-full p-4 ${
              filtroEstado === null ? 'ring-2 ring-primary' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lightbrand text-brand-strong dark:text-brand">
                <Icon icon="tabler:stack-2" width={20} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-semibold leading-tight">{onus.length}</p>
              </div>
            </div>
          </CardBox>
        </button>

        {RESUMEN.map((r) => {
          const activo = filtroEstado === r.estado;
          return (
            <button
              key={r.estado}
              type="button"
              onClick={() => setFiltroEstado(activo ? null : r.estado)}
              className="text-left"
              aria-pressed={activo}
            >
              <CardBox className={`transition-ui card-hover h-full p-4 ${activo ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${r.tile}`}>
                    <Icon icon={r.icono} width={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">{ESTADO_LABEL[r.estado]}</p>
                    <p className="text-xl font-semibold leading-tight">{conteos[r.estado]}</p>
                  </div>
                </div>
              </CardBox>
            </button>
          );
        })}
      </div>

      <CardBox className="p-0">
        {/* Barra de herramientas: búsqueda en pantalla por serie, MAC, marca,
            cliente o zona. No consulta al backend. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-ld p-4">
          <SearchInput
            value={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar por serie, MAC, marca o cliente…"
            className="w-full sm:max-w-sm"
          />
          <div className="ms-auto flex items-center gap-2 text-sm text-muted-foreground">
            {filtroEstado && (
              <Badge className={`${ESTADO_BADGE[filtroEstado]} rounded-md`}>{ESTADO_LABEL[filtroEstado]}</Badge>
            )}
            <span>
              {visibles.length} {visibles.length === 1 ? 'equipo' : 'equipos'}
            </span>
          </div>
        </div>

        {cargando ? (
          <LoadingState filas={5} />
        ) : onus.length === 0 ? (
          <EmptyState
            icono="tabler:router-off"
            titulo="No hay ONUs registradas"
            descripcion="Registra el primer equipo para empezar a controlar el inventario de la red."
            accion={
              puedeGestionar ? (
                <Button onClick={() => setOpenCreate(true)}>
                  <Icon icon="tabler:plus" height={18} />
                  Registrar ONU
                </Button>
              ) : undefined
            }
          />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono="tabler:search"
            titulo="Sin resultados"
            descripcion="Ningún equipo coincide con la búsqueda o el estado seleccionado."
            accion={
              hayFiltro ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setBusqueda('');
                    setFiltroEstado(null);
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serie</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>WiFi</TableHead>
                  <TableHead>Cliente / Zona</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-end">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((o) => {
                  const puedeAsignar = puedeGestionar && o.estado === 'en_almacen';
                  const puedeDanar = puedeGestionar && o.estado !== 'danado' && o.estado !== 'instalado';
                  const puedeBorrar = puedeGestionar && o.estado !== 'instalado';
                  const hayAcciones = puedeAsignar || puedeDanar || puedeBorrar;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium whitespace-nowrap">{o.numero_serie}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{o.mac ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.marca ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{o.wifi_version ?? '—'}</TableCell>
                      <TableCell>
                        {o.cliente ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{o.cliente.nombre}</p>
                            <p className="truncate text-xs text-muted-foreground">{o.cliente.zona?.nombre ?? '—'}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${ESTADO_BADGE[o.estado]} rounded-md`}>{ESTADO_LABEL[o.estado]}</Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        {hayAcciones ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" title="Acciones" className="size-8">
                                <Icon icon="tabler:dots-vertical" height={17} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {puedeAsignar && (
                                <DropdownMenuItem onClick={() => setAsignando(o)}>
                                  <Icon icon="tabler:user-plus" height={16} />
                                  Asignar a técnico
                                </DropdownMenuItem>
                              )}
                              {puedeDanar && (
                                <DropdownMenuItem onClick={() => handleMarcar(o, 'danado')}>
                                  <Icon icon="tabler:alert-triangle" height={16} />
                                  Marcar dañada
                                </DropdownMenuItem>
                              )}
                              {puedeBorrar && (
                                <>
                                  {(puedeAsignar || puedeDanar) && <DropdownMenuSeparator />}
                                  <DropdownMenuItem
                                    onClick={() => setBorrando(o)}
                                    className="text-error focus:text-error"
                                  >
                                    <Icon icon="tabler:trash" height={16} />
                                    Eliminar del inventario
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardBox>

      <FormDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        title="Registrar ONU"
        subtitle="Agrega un equipo al inventario"
        icon="tabler:device-nfc"
        size="md"
        footer={
          <FormActions
            onCancel={() => {
              setOpenCreate(false);
              setSerie('');
              setMac('');
              setMarca('');
              setSerieConfirmada(false);
            }}
            submitLabel="Guardar"
            submitForm="onu-create-form"
          />
        }
      >
        <form id="onu-create-form" onSubmit={handleCreate} className="flex flex-col gap-5">
          <FormGrid>
            <FormField
              label="Número de serie (GPON)"
              icon="tabler:barcode"
              htmlFor="serie"
              required
              wide
              hint="Escanéala con el lector USB o escríbela y presiona Enter."
            >
              <div className="relative">
                <Input
                  id="serie"
                  autoFocus
                  className={serieConfirmada ? 'pr-9' : ''}
                  value={serie}
                  onChange={(e) => handleSerieChange(e.target.value)}
                  onKeyDown={handleSerieKeyDown}
                  required
                />
                {serieConfirmada && (
                  <Icon
                    icon="tabler:circle-check-filled"
                    height={18}
                    className="text-success absolute right-2.5 top-1/2 -translate-y-1/2"
                  />
                )}
              </div>
            </FormField>

            <FormField label="MAC" icon="tabler:network" htmlFor="mac">
              <FieldIcon icon="tabler:network">
                <Input id="mac" ref={macInputRef} value={mac} onChange={(e) => setMac(e.target.value)} />
              </FieldIcon>
            </FormField>

            <FormField label="Marca" icon="tabler:tag" htmlFor="marca">
              <FieldIcon icon="tabler:tag">
                <Input
                  id="marca"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  placeholder="Se detecta sola al escanear la serie"
                />
              </FieldIcon>
            </FormField>
          </FormGrid>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      <FormDialog
        open={!!asignando}
        onOpenChange={(o) => !o && setAsignando(null)}
        title={`Asignar ONU ${asignando?.numero_serie ?? ''}`}
        subtitle="Entrega el equipo a un técnico"
        icon="tabler:user-check"
        tone="primary"
        size="md"
        footer={
          <FormActions
            onCancel={() => setAsignando(null)}
            submitLabel="Asignar"
            submitIcon="tabler:user-check"
            onSubmit={handleAsignar}
            disabled={!tecnicoSel}
          />
        }
      >
        <FormField label="Técnico" icon="tabler:tool">
          <FieldIcon icon="tabler:tool">
            <Select value={tecnicoSel} onValueChange={setTecnicoSel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona un técnico" />
              </SelectTrigger>
              <SelectContent>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldIcon>
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(v) => !v && setBorrando(null)}
        title="Eliminar ONU"
        description={borrando ? `¿Eliminar la ONU "${borrando.numero_serie}" del inventario?` : undefined}
        onConfirm={handleEliminar}
      />
    </div>
  );
};

export default Onus;
