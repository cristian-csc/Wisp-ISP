import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'src/components/ui/dialog';
import { Label } from 'src/components/ui/label';
import { Input } from 'src/components/ui/input';
import { Textarea } from 'src/components/ui/textarea';
import { Button } from 'src/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import { createCliente, listZonas, listPlanes, type Zona, type Plan } from 'src/lib/clientes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

const ClienteCreateDialog = ({ open, onOpenChange, onCreated }: Props) => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [zonaId, setZonaId] = useState<string>('');
  const [planId, setPlanId] = useState<string>('');
  const [cantidadTv, setCantidadTv] = useState('0');
  const [notas, setNotas] = useState('');
  const [tipoConexion, setTipoConexion] = useState<'fibra_optica' | 'inalambrico'>('fibra_optica');

  useEffect(() => {
    if (open) {
      listZonas().then(setZonas);
      listPlanes().then((all) => setPlanes(all.filter((p) => p.tipo_conexion !== 'satelital')));
    }
  }, [open]);

  function resetForm() {
    setNombre('');
    setDni('');
    setTelefono('');
    setDireccion('');
    setZonaId('');
    setPlanId('');
    setCantidadTv('0');
    setNotas('');
    setTipoConexion('fibra_optica');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!zonaId || !planId) {
      setError('Selecciona zona y plan.');
      return;
    }
    setLoading(true);
    try {
      const cliente = await createCliente({
        nombre,
        dni,
        telefono: telefono || undefined,
        direccion: direccion || undefined,
        zona_id: Number(zonaId),
        plan_id: Number(planId),
        cantidad_tv: Number(cantidadTv) || 0,
        tipo_conexion: tipoConexion,
        notas: notas || undefined,
      });
      resetForm();
      onOpenChange(false);
      onCreated?.();
      toast.success('Cliente registrado');
      navigate(`/clientes/${cliente.id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'No se pudo registrar el cliente');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar cliente</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Queda pendiente de aprobación — el usuario y clave PPPoE se generan automáticamente a
          partir del DNI.
        </p>

        <form id="cliente-create-form" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="mb-2 block">
                <Label htmlFor="nombre">Nombre completo</Label>
              </div>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <div className="mb-2 block">
                <Label htmlFor="dni">DNI</Label>
              </div>
              <Input
                id="dni"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
                maxLength={8}
                pattern="\d{8}"
                required
              />
            </div>
            <div>
              <div className="mb-2 block">
                <Label htmlFor="telefono">Teléfono / WhatsApp</Label>
              </div>
              <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 block">
                <Label htmlFor="cantidadTv">Cantidad de TV</Label>
              </div>
              <Input
                id="cantidadTv"
                type="number"
                min={0}
                value={cantidadTv}
                onChange={(e) => setCantidadTv(e.target.value)}
              />
            </div>
            <div>
              <div className="mb-2 block">
                <Label>Tipo de conexión</Label>
              </div>
              <Select value={tipoConexion} onValueChange={(v) => setTipoConexion(v as 'fibra_optica' | 'inalambrico')}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fibra_optica">Fibra óptica</SelectItem>
                  <SelectItem value="inalambrico">Inalámbrico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 block">
                <Label>Zona</Label>
              </div>
              <Select value={zonaId} onValueChange={setZonaId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona una zona" />
                </SelectTrigger>
                <SelectContent>
                  {zonas.map((z) => (
                    <SelectItem key={z.id} value={String(z.id)}>
                      {z.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 block">
                <Label>Plan</Label>
              </div>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {planes.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nombre} — S/ {p.precio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 block">
                <Label htmlFor="direccion">Dirección</Label>
              </div>
              <Input id="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <div className="mb-2 block">
                <Label htmlFor="notas">Notas</Label>
              </div>
              <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-error mt-4">{error}</p>}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="cliente-create-form" disabled={loading}>
            {loading ? 'Guardando…' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClienteCreateDialog;
