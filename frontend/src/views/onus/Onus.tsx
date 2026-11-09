import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
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
  FieldIcon,
  FormActions,
  FormCallout,
  FormDialog,
  FormField,
  FormGrid,
} from 'src/components/shared/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import { listOnus, createOnu, asignarOnu, marcarOnu, deleteOnu, detectarMarca, type Onu } from 'src/lib/onus';
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
  en_almacen: 'bg-lightinfo text-info',
  asignado_tecnico: 'bg-lightwarning text-warning',
  instalado: 'bg-lightsuccess text-success',
  danado: 'bg-lighterror text-error',
  perdido: 'bg-muted text-muted-foreground',
};

const Onus = () => {
  const { user } = useCurrentUser();
  /** Consultar el inventario lo puede hacer también atención al cliente;
   *  dar de alta, asignar o borrar equipos es de almacén. */
  const puedeGestionar = puedeAccion('onus.gestionar', user?.rol);
  const [onus, setOnus] = useState<Onu[]>([]);
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

  async function reload() {
    setOnus(await listOnus());
  }

  useEffect(() => {
    reload();
    listUsuarios().then((all) => setTecnicos(all.filter((u) => u.rol === 'tecnico')));
  }, []);

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

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Inventario de ONUs</h2>
        {/* Atención al cliente consulta el inventario para saber si hay
            equipo disponible; darlo de alta o darlo de baja es de almacén. */}
        {puedeGestionar && <Button onClick={() => setOpenCreate(true)}>Registrar ONU</Button>}
      </div>

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
          {onus.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                No hay ONUs registradas.
              </TableCell>
            </TableRow>
          )}
          {onus.map((o) => (
            <TableRow key={o.id}>
              <TableCell className="font-medium">{o.numero_serie}</TableCell>
              <TableCell className="font-mono text-xs">{o.mac ?? '—'}</TableCell>
              <TableCell>{o.marca ?? '—'}</TableCell>
              <TableCell>{o.wifi_version ?? '—'}</TableCell>
              <TableCell>
                {o.cliente ? (
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{o.cliente.nombre}</p>
                    <p className="text-xs text-muted-foreground truncate">{o.cliente.zona?.nombre ?? '—'}</p>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge className={`${ESTADO_BADGE[o.estado]} rounded-md`}>{ESTADO_LABEL[o.estado]}</Badge>
              </TableCell>
              <TableCell className="text-end">
                <TooltipProvider>
                  <div className="flex justify-end gap-1">
                    {puedeGestionar && o.estado === 'en_almacen' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setAsignando(o)}>
                            <Icon icon="tabler:user-plus" height={18} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Asignar a técnico</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {puedeGestionar && o.estado !== 'danado' && o.estado !== 'instalado' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => handleMarcar(o, 'danado')}>
                            <Icon icon="tabler:alert-triangle" height={18} className="text-error" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Marcar dañada</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {puedeGestionar && o.estado !== 'instalado' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setBorrando(o)}>
                            <Icon icon="tabler:trash" height={18} className="text-error" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Eliminar del inventario</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
    </CardBox>
  );
};

export default Onus;
