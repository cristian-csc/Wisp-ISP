import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import { Switch } from 'src/components/ui/switch';
import { Textarea } from 'src/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import { getZona, type Zona } from 'src/lib/zonas';
import {
  listGastos, createGasto, updateGasto, deleteGasto, getCategorias,
  type Gasto, type GastoInput,
} from 'src/lib/gastos';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];

const hoyDate = new Date();
const hoy = hoyDate.toISOString().split('T')[0];
const ANIOS = Array.from({ length: 4 }, (_, i) => String(hoyDate.getFullYear() - i));

const CATEGORIAS_SUGERIDAS = ['Internet/Uplink', 'Energía eléctrica', 'Alquiler', 'Mantenimiento', 'Combustible', 'Sueldos', 'Otros'];

const VACIO_FORM = {
  descripcion: '', monto: '', categoria: '', fecha: hoy,
  proveedor: '', numero_factura: '', es_recurrente: false, notas: '',
};

const GastoZonaDetail = () => {
  const navigate = useNavigate();
  const { zonaId } = useParams();
  const [searchParams] = useSearchParams();
  const esGeneral = zonaId === 'general';
  const zonaIdNum = esGeneral ? null : Number(zonaId);

  const [zona, setZona] = useState<Zona | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [mesSel, setMesSel] = useState(searchParams.get('mes')?.slice(5, 7) ?? String(hoyDate.getMonth() + 1).padStart(2, '0'));
  const [anioSel, setAnioSel] = useState(searchParams.get('mes')?.slice(0, 4) ?? String(hoyDate.getFullYear()));

  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [form, setForm] = useState(VACIO_FORM);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Gasto | null>(null);

  const mes = `${anioSel}-${mesSel}`;

  useEffect(() => {
    if (!esGeneral && zonaIdNum) getZona(zonaIdNum).then(setZona);
    getCategorias().then(setCategorias);
  }, [zonaIdNum, esGeneral]);

  async function reload() {
    const data = await listGastos({ mes, zona_id: esGeneral ? 0 : zonaIdNum! });
    setGastos(data.items);
  }

  useEffect(() => {
    reload();
  }, [mes, zonaIdNum, esGeneral]);

  const fijos = gastos.filter((g) => g.es_recurrente);
  const variables = gastos.filter((g) => !g.es_recurrente);
  const totalFijo = fijos.reduce((n, g) => n + g.monto, 0);
  const totalVariable = variables.reduce((n, g) => n + g.monto, 0);

  function abrirNuevo() {
    setEditando(null);
    setForm(VACIO_FORM);
    setError(null);
    setOpen(true);
  }

  function abrirEditar(g: Gasto) {
    setEditando(g);
    setForm({
      descripcion: g.descripcion,
      monto: String(g.monto),
      categoria: g.categoria,
      fecha: g.fecha,
      proveedor: g.proveedor ?? '',
      numero_factura: g.numero_factura ?? '',
      es_recurrente: g.es_recurrente,
      notas: g.notas ?? '',
    });
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: GastoInput = {
      descripcion: form.descripcion,
      monto: Number(form.monto),
      categoria: form.categoria || 'Otros',
      fecha: form.fecha,
      proveedor: form.proveedor || null,
      numero_factura: form.numero_factura || null,
      es_recurrente: form.es_recurrente,
      notas: form.notas || null,
      zona_id: esGeneral ? null : zonaIdNum,
    };
    try {
      if (editando) await updateGasto(editando.id, input);
      else await createGasto(input);
      setOpen(false);
      reload();
      toast.success(editando ? 'Gasto actualizado' : 'Gasto registrado');
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo guardar el gasto');
    }
  }

  async function handleEliminar() {
    if (!borrando) return;
    try {
      await deleteGasto(borrando.id);
      reload();
      toast.success('Gasto eliminado');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar el gasto');
    }
  }

  function TablaGastos({ items, vacio }: { items: Gasto[]; vacio: string }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descripción</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead className="text-end">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{vacio}</TableCell>
            </TableRow>
          )}
          {items.map((g) => (
            <TableRow key={g.id}>
              <TableCell className="max-w-xs truncate">{g.descripcion}</TableCell>
              <TableCell><Badge className="bg-lightprimary text-primary rounded-md">{g.categoria}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{g.proveedor ?? '—'}</TableCell>
              <TableCell className="text-sm">{g.fecha}</TableCell>
              <TableCell className="font-medium">S/ {g.monto.toFixed(2)}</TableCell>
              <TableCell className="text-end">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => abrirEditar(g)}>
                    <Icon icon="tabler:pencil" height={18} />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setBorrando(g)}>
                    <Icon icon="tabler:trash" height={18} className="text-error" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate('/gastos')}>
          <Icon icon="tabler:arrow-left" height={20} />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl truncate">{esGeneral ? 'General' : zona?.nombre ?? 'Cargando…'}</h1>
          <p className="text-sm text-muted-foreground">{esGeneral ? 'Gastos sin zona asignada' : 'Gastos de esta zona'}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Select value={mesSel} onValueChange={setMesSel}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={anioSel} onValueChange={setAnioSel}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ANIOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={abrirNuevo} className="whitespace-nowrap">Registrar gasto</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Fijos este mes</p>
          <p className="text-xl font-bold text-info">S/ {totalFijo.toFixed(2)}</p>
        </CardBox>
        <CardBox className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Variables / otros este mes</p>
          <p className="text-xl font-bold text-warning">S/ {totalVariable.toFixed(2)}</p>
        </CardBox>
      </div>

      <CardBox>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Gastos fijos</h3>
          <p className="text-xs text-muted-foreground">Se repiten solos cada mes hasta que registres uno nuevo con los mismos datos (ej. cambió el monto del proveedor).</p>
        </div>
        <TablaGastos items={fijos} vacio="No hay gastos fijos registrados para esta zona." />
      </CardBox>

      <CardBox>
        <h3 className="text-sm font-semibold mb-3">Gastos variables y otros</h3>
        <TablaGastos items={variables} vacio="No hay gastos variables registrados este mes." />
      </CardBox>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar gasto' : 'Registrar gasto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="descripcionGasto">Descripción</Label>
              <Input id="descripcionGasto" className="mt-2" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="montoGasto">Monto (S/)</Label>
                <Input id="montoGasto" type="number" step="0.01" className="mt-2" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required />
              </div>
              <div className="flex-1">
                <Label htmlFor="fechaGasto">Fecha</Label>
                <Input id="fechaGasto" type="date" className="mt-2" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label htmlFor="categoriaGasto">Categoría</Label>
              <Input
                id="categoriaGasto"
                className="mt-2"
                list="categorias-sugeridas"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                placeholder="Otros"
              />
              <datalist id="categorias-sugeridas">
                {[...new Set([...CATEGORIAS_SUGERIDAS, ...categorias])].map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="proveedorGasto">Proveedor (opcional)</Label>
                <Input id="proveedorGasto" className="mt-2" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
              </div>
              <div className="flex-1">
                <Label htmlFor="facturaGasto">N° de factura (opcional)</Label>
                <Input id="facturaGasto" className="mt-2" value={form.numero_factura} onChange={(e) => setForm({ ...form, numero_factura: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-ld px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Es un gasto fijo (recurrente)</p>
                <p className="text-xs text-muted-foreground">Se repetirá automáticamente cada mes sin volver a registrarlo.</p>
              </div>
              <Switch checked={form.es_recurrente} onCheckedChange={(v) => setForm({ ...form, es_recurrente: v })} />
            </div>
            <div>
              <Label htmlFor="notasGasto">Notas (opcional)</Label>
              <Textarea id="notasGasto" className="mt-2" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(v) => !v && setBorrando(null)}
        title="Eliminar gasto"
        description={borrando ? `¿Eliminar el gasto "${borrando.descripcion}"?` : undefined}
        onConfirm={handleEliminar}
      />
    </div>
  );
};

export default GastoZonaDetail;
