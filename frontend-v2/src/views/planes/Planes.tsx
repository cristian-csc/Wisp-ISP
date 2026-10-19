import { useEffect, useState, type FormEvent } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label>Tipo de conexión</Label>
              <Select value={form.tipoConexion} onValueChange={(v) => setForm({ ...form, tipoConexion: v as TipoConexion })}>
                <SelectTrigger className="w-full mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                  <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                  <SelectItem value="satelital">Satelital (Starlink)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="codigoPlan">Código</Label>
                <Input id="codigoPlan" className="mt-2" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="nombrePlan">Nombre</Label>
                <Input id="nombrePlan" className="mt-2" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="bajadaPlan">Bajada (Mbps)</Label>
                <Input id="bajadaPlan" type="number" className="mt-2" value={form.bajada} onChange={(e) => setForm({ ...form, bajada: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="subidaPlan">Subida (Mbps)</Label>
                <Input id="subidaPlan" type="number" className="mt-2" value={form.subida} onChange={(e) => setForm({ ...form, subida: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="precioPlan">Precio al cliente (S/)</Label>
                <Input id="precioPlan" type="number" step="0.01" className="mt-2" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required />
              </div>
              {form.tipoConexion === 'satelital' && (
                <div>
                  <Label htmlFor="costoProveedor">Lo que paga la empresa a Starlink (S/)</Label>
                  <Input id="costoProveedor" type="number" step="0.01" className="mt-2" value={form.costoProveedor} onChange={(e) => setForm({ ...form, costoProveedor: e.target.value })} />
                  {form.precio && form.costoProveedor && (
                    <p className="text-xs text-success mt-1">
                      Ganancia: S/ {(Number(form.precio) - Number(form.costoProveedor)).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {form.incluyeTv && (
                <div>
                  <Label htmlFor="tvIncluidas">TVs incluidas</Label>
                  <Input id="tvIncluidas" type="number" className="mt-2" value={form.tvIncluidas} onChange={(e) => setForm({ ...form, tvIncluidas: e.target.value })} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="incluyeTv" checked={form.incluyeTv} onCheckedChange={(v) => setForm({ ...form, incluyeTv: !!v })} />
              <Label htmlFor="incluyeTv" className="font-normal cursor-pointer">Incluye TV</Label>
            </div>
            <div>
              <Label htmlFor="precioTvAdicional">Precio por TV adicional (S/)</Label>
              <Input
                id="precioTvAdicional"
                type="number"
                step="0.01"
                className="mt-2"
                value={form.precioTvAdicional}
                onChange={(e) => setForm({ ...form, precioTvAdicional: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Déjalo vacío para usar la tarifa general del sistema.
              </p>
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
