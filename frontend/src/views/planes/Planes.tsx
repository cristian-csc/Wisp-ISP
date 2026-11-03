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
import { listPlanes, createPlan, updatePlan, deletePlan, type Plan, type TipoConexion } from 'src/lib/planes';

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

  async function reload() {
    setPlanes(await listPlanes());
  }

  useEffect(() => {
    reload();
  }, []);

  function abrirNuevo() {
    setEditando(null);
    setForm(vacio);
    setError(null);
    setOpen(true);
  }

  function abrirEditar(p: Plan) {
    setEditando(p);
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

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Planes</h2>
        <Button onClick={abrirNuevo}>Nuevo plan</Button>
      </div>

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
              <FormField label="Código" htmlFor="codigoPlan" required>
                <FieldIcon icon="tabler:hash">
                  <Input
                    id="codigoPlan"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    required
                  />
                </FieldIcon>
              </FormField>
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
