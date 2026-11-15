import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Checkbox } from 'src/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  listPlanes, createPlan, updatePlan, deletePlan, verificarPlanes,
  perfilesDeZona, velocidadesDeRateLimit,
  type Plan, type TipoConexion, type VerificacionZona, type PerfilDeRouter,
} from 'src/lib/planes';
import { listZonas, type Zona } from 'src/lib/zonas';

const TIPO_LABEL: Record<TipoConexion, string> = {
  fibra_optica: 'Fibra óptica',
  inalambrico: 'Inalámbrico',
  satelital: 'Satelital (Starlink)',
};

const TIPO_BADGE: Record<TipoConexion, string> = {
  fibra_optica: 'bg-lightprimary text-primary',
  inalambrico: 'bg-lightinfo text-info',
  satelital: 'bg-lightsecondary text-secondary',
};

const vacio = {
  codigo: '',
  nombre: '',
  bajada: '',
  subida: '',
  precio: '',
  incluyeTv: false,
  tvIncluidas: '0',
  precioTvAdicional: '',
  tipoConexion: 'fibra_optica' as TipoConexion,
  costoProveedor: '',
};

const Planes = () => {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Plan | null>(null);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<Plan | null>(null);
  // Para traer el codigo del plan de los perfiles reales de un router, en vez
  // de escribirlo de memoria: el codigo ES el nombre del perfil, y una errata
  // ahi no da ningun error hasta que un cliente no puede conectarse.
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaPerfiles, setZonaPerfiles] = useState('');
  const [perfiles, setPerfiles] = useState<PerfilDeRouter[]>([]);
  const [cargandoPerfiles, setCargandoPerfiles] = useState(false);
  const [errorPerfiles, setErrorPerfiles] = useState<string | null>(null);

  async function reload() {
    setPlanes(await listPlanes());
  }

  useEffect(() => {
    reload();
    // Solo las zonas con tunel: sin el no hay forma de preguntarle al router.
    listZonas()
      .then((z) => setZonas(z.filter((x) => x.activo && x.ip_wireguard)))
      .catch(() => setZonas([]));
  }, []);

  function limpiarPerfiles() {
    setZonaPerfiles('');
    setPerfiles([]);
    setErrorPerfiles(null);
  }

  async function cargarPerfiles(zonaId: string) {
    setZonaPerfiles(zonaId);
    setPerfiles([]);
    setErrorPerfiles(null);
    if (!zonaId) return;
    setCargandoPerfiles(true);
    try {
      const r = await perfilesDeZona(Number(zonaId));
      setPerfiles(r.perfiles);
      if (r.perfiles.length === 0) {
        setErrorPerfiles('Ese router no tiene ningun perfil PPPoE configurado.');
      }
    } catch (err: any) {
      setErrorPerfiles(err?.response?.data?.detail ?? 'No se pudo leer el router.');
    } finally {
      setCargandoPerfiles(false);
    }
  }

  /** Al elegir un perfil, el codigo pasa a ser su nombre exacto y las
   *  velocidades las de su rate-limit, para que panel y router no puedan
   *  quedar diciendo cosas distintas. */
  function usarPerfil(nombre: string) {
    const perfil = perfiles.find((p) => p.nombre === nombre);
    if (!perfil) return;
    const vel = velocidadesDeRateLimit(perfil.rate_limit);
    setForm((f) => ({
      ...f,
      codigo: perfil.nombre,
      bajada: vel ? String(vel.bajada) : f.bajada,
      subida: vel ? String(vel.subida) : f.subida,
    }));
    if (!vel) {
      toast.info(
        perfil.rate_limit
          ? `El perfil limita a "${perfil.rate_limit}", que no es un simple subida/bajada: revise las velocidades a mano.`
          : 'Ese perfil no limita velocidad en el router: las velocidades quedan como las escriba.',
      );
    }
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(vacio);
    limpiarPerfiles();
    setError(null);
    setOpen(true);
  }

  function abrirEditar(p: Plan) {
    setEditando(p);
    limpiarPerfiles();
    setForm({
      codigo: p.codigo,
      nombre: p.nombre,
      bajada: String(p.bajada_mbps),
      subida: String(p.subida_mbps),
      precio: String(p.precio),
      incluyeTv: p.incluye_tv,
      tvIncluidas: String(p.tv_incluidas),
      precioTvAdicional: p.precio_tv_adicional != null ? String(p.precio_tv_adicional) : '',
      tipoConexion: p.tipo_conexion,
      costoProveedor: p.costo_proveedor != null ? String(p.costo_proveedor) : '',
    });
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    try {
      const input = {
        codigo: form.codigo,
        nombre: form.nombre,
        bajada_mbps: Number(form.bajada),
        subida_mbps: Number(form.subida),
        precio: Number(form.precio),
        incluye_tv: form.incluyeTv,
        tv_incluidas: form.incluyeTv ? Number(form.tvIncluidas) || 0 : 0,
        precio_tv_adicional: form.precioTvAdicional ? Number(form.precioTvAdicional) : undefined,
        tipo_conexion: form.tipoConexion,
        costo_proveedor: form.tipoConexion === 'satelital' && form.costoProveedor ? Number(form.costoProveedor) : undefined,
      };
      if (editando) {
        await updatePlan(editando.id, input);
      } else {
        await createPlan(input);
      }
      setOpen(false);
      reload();
      toast.success(editando ? 'Plan actualizado' : 'Plan creado');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar el plan');
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar() {
    if (!borrando) return;
    try {
      await deletePlan(borrando.id);
      reload();
      toast.success('Plan eliminado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar el plan');
    }
  }

  const [verificacion, setVerificacion] = useState<VerificacionZona[] | null>(null);
  const [comprobando, setComprobando] = useState(false);

  /** Pregunta a cada router qué perfiles tiene de verdad.
   *  No cambia nada: el sistema ya no escribe perfiles — la configuración de
   *  red es del router y esto solo avisa si el panel y el router no cuadran. */
  async function comprobarEnRouters() {
    if (comprobando) return;
    setComprobando(true);
    try {
      const r = await verificarPlanes();
      setVerificacion(r.zonas);
      const problemas = r.zonas.filter(
        (z) => z.sin_contacto || z.planes.some((p) => p.estado !== 'ok'),
      ).length;
      if (problemas === 0) {
        toast.success('Todos los routers coinciden con el panel');
      } else {
        toast.warning(`${problemas} zona(s) con diferencias`, {
          description: 'Revisa el detalle debajo del título.',
        });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo consultar a los routers');
    } finally {
      setComprobando(false);
    }
  }

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Planes</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={comprobarEnRouters} disabled={comprobando}>
            {comprobando ? 'Consultando los routers…' : 'Comprobar en los routers'}
          </Button>
          <Button onClick={abrirNuevo}>Nuevo plan</Button>
        </div>
      </div>

      {verificacion && (
        <div className="mb-5 flex flex-col gap-2">
          {verificacion.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ninguna zona tiene todavía túnel WireGuard configurado, así que no
              hay routers a los que preguntar.
            </p>
          )}
          {verificacion.map((z) => (
            <div key={z.zona} className="rounded-xl border border-ld p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <Icon
                  icon={z.sin_contacto ? 'tabler:plug-connected-x' : 'tabler:router'}
                  height={17}
                  className={z.sin_contacto ? 'text-error' : 'text-primary'}
                />
                <span className="text-sm font-semibold">{z.zona}</span>
                <span className="text-xs text-muted-foreground">{z.detalle}</span>
              </div>
              {!z.sin_contacto && (
                <div className="flex flex-wrap gap-1.5">
                  {z.planes.map((p) => (
                    <span
                      key={p.codigo}
                      title={p.detalle}
                      className={`rounded-md px-2 py-0.5 text-xs ${
                        p.estado === 'ok'
                          ? 'bg-lightsuccess text-success'
                          : p.estado === 'difiere'
                            ? 'bg-lightwarning text-warning'
                            : 'bg-lighterror text-error'
                      }`}
                    >
                      {p.codigo} · {p.estado === 'ok' ? 'correcto' : p.estado === 'difiere' ? p.detalle : 'no existe'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Velocidad</TableHead>
            <TableHead>Precio</TableHead>
            <TableHead>TV incluida</TableHead>
            <TableHead className="text-end">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {planes.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.codigo}</TableCell>
              <TableCell>{p.nombre}</TableCell>
              <TableCell>
                <Badge className={`${TIPO_BADGE[p.tipo_conexion]} rounded-md`}>{TIPO_LABEL[p.tipo_conexion]}</Badge>
              </TableCell>
              <TableCell>
                {p.bajada_mbps}M / {p.subida_mbps}M
              </TableCell>
              <TableCell>
                S/ {p.precio.toFixed(2)}
                {p.tipo_conexion === 'satelital' && p.costo_proveedor != null && (
                  <p className="text-xs text-success">ganancia S/ {(p.precio - p.costo_proveedor).toFixed(2)}</p>
                )}
              </TableCell>
              <TableCell>
                {p.incluye_tv ? (
                  <Badge className="bg-lightsuccess text-success">{p.tv_incluidas} TV incluida(s)</Badge>
                ) : (
                  <Badge className="bg-muted text-muted-foreground">No</Badge>
                )}
              </TableCell>
              <TableCell className="text-end">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => abrirEditar(p)}>
                    <Icon icon="tabler:pencil" height={18} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setBorrando(p)}>
                    <Icon icon="tabler:trash" height={18} className="text-error" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={editando ? 'Editar plan' : 'Nuevo plan'}
        subtitle="Velocidades, tarifa y televisión del plan"
        icon="tabler:stack-2"
        size="lg"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Guardar"
            submitForm="plan-form"
            submitting={guardando}
          />
        }
      >
        <form id="plan-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Tipo de conexión" icon="tabler:router">
            <FieldIcon icon="tabler:router">
              <Select
                value={form.tipoConexion}
                onValueChange={(v) => setForm({ ...form, tipoConexion: v as TipoConexion })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                  <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                  <SelectItem value="satelital">Satelital (Starlink)</SelectItem>
                </SelectContent>
              </Select>
            </FieldIcon>
          </FormField>

          <FormGrid>
            <FormSection title="Identificación del plan" icon="tabler:tag">
              <FormField
                label="Código"
                htmlFor="codigoPlan"
                required
                hint="Es el nombre exacto del perfil PPPoE en el MikroTik. Si no coincide, el cliente no conecta."
              >
                <FieldIcon icon="tabler:hash">
                  <Input
                    id="codigoPlan"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    required
                  />
                </FieldIcon>
              </FormField>

              {zonas.length > 0 && (
                <div className="rounded-xl border border-dashed border-border p-3">
                  <FormField
                    label="Traerlo de un router"
                    icon="tabler:cloud-download"
                    htmlFor="zonaPerfiles"
                    hint="Opcional. Evita erratas y copia también las velocidades."
                  >
                    <Select value={zonaPerfiles} onValueChange={cargarPerfiles}>
                      <SelectTrigger id="zonaPerfiles" className="w-full">
                        <SelectValue placeholder="Elegir zona…" />
                      </SelectTrigger>
                      <SelectContent>
                        {zonas.map((z) => (
                          <SelectItem key={z.id} value={String(z.id)}>
                            {z.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  {cargandoPerfiles && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon icon="tabler:loader-2" width={17} className="animate-spin" />
                      Leyendo los perfiles del router…
                    </div>
                  )}

                  {errorPerfiles && (
                    <p className="mt-3 text-sm text-error-text">{errorPerfiles}</p>
                  )}

                  {perfiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {perfiles.map((p) => (
                        <button
                          key={p.nombre}
                          type="button"
                          onClick={() => usarPerfil(p.nombre)}
                          className={
                            'rounded-lg border px-2.5 py-1 text-xs transition-colors ' +
                            (form.codigo === p.nombre
                              ? 'border-primary bg-lightprimary text-primary-text'
                              : 'border-border hover:bg-muted')
                          }
                        >
                          <span className="font-medium">{p.nombre}</span>
                          {p.rate_limit && (
                            <span className="ml-1.5 text-muted-foreground">{p.rate_limit}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <FormField label="Nombre" htmlFor="nombrePlan" required>
                <FieldIcon icon="tabler:stack-2">
                  <Input
                    id="nombrePlan"
                    value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    required
                  />
                </FieldIcon>
              </FormField>
            </FormSection>

            <FormSection title="Velocidad y tarifa" icon="tabler:gauge">
              <FormField label="Bajada (Mbps)" htmlFor="bajadaPlan" required>
                <Input
                  id="bajadaPlan"
                  type="number"
                  value={form.bajada}
                  onChange={(e) => setForm({ ...form, bajada: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Subida (Mbps)" htmlFor="subidaPlan" required>
                <Input
                  id="subidaPlan"
                  type="number"
                  value={form.subida}
                  onChange={(e) => setForm({ ...form, subida: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="Precio al cliente (S/)" htmlFor="precioPlan" required>
                <Input
                  id="precioPlan"
                  type="number"
                  step="0.01"
                  value={form.precio}
                  onChange={(e) => setForm({ ...form, precio: e.target.value })}
                  required
                />
              </FormField>
              {form.tipoConexion === 'satelital' && (
                <FormField
                  label="Lo que paga la empresa a Starlink (S/)"
                  htmlFor="costoProveedor"
                >
                  <Input
                    id="costoProveedor"
                    type="number"
                    step="0.01"
                    value={form.costoProveedor}
                    onChange={(e) => setForm({ ...form, costoProveedor: e.target.value })}
                  />
                  {form.precio && form.costoProveedor && (
                    <p className="mt-1.5 text-xs font-medium text-success-text">
                      Ganancia: S/ {(Number(form.precio) - Number(form.costoProveedor)).toFixed(2)}
                    </p>
                  )}
                </FormField>
              )}
            </FormSection>

            <FormSection title="Televisión" icon="tabler:device-tv">
              <label
                htmlFor="incluyeTv"
                className="transition-ui flex cursor-pointer items-center gap-3 rounded-xl border border-ld bg-card px-4 py-3 text-sm font-medium hover:border-primary/40 md:col-span-2"
              >
                <Checkbox
                  id="incluyeTv"
                  checked={form.incluyeTv}
                  onCheckedChange={(v) => setForm({ ...form, incluyeTv: !!v })}
                />
                Incluye TV
              </label>
              {form.incluyeTv && (
                <FormField label="TVs incluidas" htmlFor="tvIncluidas">
                  <Input
                    id="tvIncluidas"
                    type="number"
                    value={form.tvIncluidas}
                    onChange={(e) => setForm({ ...form, tvIncluidas: e.target.value })}
                  />
                </FormField>
              )}
              <FormField
                label="Precio por TV adicional (S/)"
                htmlFor="precioTvAdicional"
                hint="Déjalo vacío para usar la tarifa general del sistema."
              >
                <Input
                  id="precioTvAdicional"
                  type="number"
                  step="0.01"
                  value={form.precioTvAdicional}
                  onChange={(e) => setForm({ ...form, precioTvAdicional: e.target.value })}
                />
              </FormField>
            </FormSection>
          </FormGrid>

          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(v) => !v && setBorrando(null)}
        title="Eliminar plan"
        description={borrando ? `¿Eliminar el plan "${borrando.nombre}"? Esta acción no se puede deshacer.` : undefined}
        onConfirm={handleEliminar}
      />
    </CardBox>
  );
};

export default Planes;
