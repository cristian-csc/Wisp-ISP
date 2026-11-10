import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
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
import { listZonas, createZona, deleteZona, type Zona } from 'src/lib/zonas';
import { getMe, type Usuario } from 'src/lib/api';
import { puedeAccion } from 'src/lib/permisos';

const Zonas = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ipWireguard, setIpWireguard] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<Zona | null>(null);

  const puedeGestionar = puedeAccion('zonas.gestionar', currentUser?.rol);
  /** Atención al cliente entra aquí a consultar cobertura: ve las zonas y sus
   *  clientes, no la configuración de la red. */
  const veRed = puedeAccion('zonas.verRed', currentUser?.rol);

  async function reload() {
    setZonas(await listZonas());
  }

  useEffect(() => {
    reload();
    getMe().then(setCurrentUser).catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Si se deja vacía se omite, para que la columna quede nula y no
      // con una cadena vacía que parezca un valor configurado.
      await createZona({ nombre, ip_wireguard: ipWireguard.trim() || undefined });
      setOpen(false);
      setNombre('');
      setIpWireguard('');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear la zona');
    }
  }

  async function handleBorrar() {
    if (!borrando) return;
    try {
      await deleteZona(borrando.id);
      toast.success(`Zona "${borrando.nombre}" eliminada`);
      setBorrando(null);
      reload();
    } catch (err: any) {
      // El servidor explica por qué se negó (normalmente: tiene clientes
      // asignados y dice cuántos). Se muestra tal cual.
      toast.error(err?.response?.data?.detail ?? 'No se pudo eliminar la zona');
      setBorrando(null);
    }
  }

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Zonas</h2>
        {puedeGestionar && <Button onClick={() => setOpen(true)}>Agregar zona</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            {/* La red por dentro solo para quien la administra; el backend
                tampoco manda estos campos a los demás roles. */}
            {veRed && <TableHead>IP WireGuard</TableHead>}
            {veRed && <TableHead>Router MikroTik</TableHead>}
            <TableHead>Clientes</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-end">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zonas.length === 0 && (
            <TableRow>
              <TableCell colSpan={veRed ? 6 : 4} className="text-center py-8 text-muted-foreground">
                No hay zonas registradas.
              </TableCell>
            </TableRow>
          )}
          {zonas.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="font-medium">{z.nombre}</TableCell>
              {veRed && <TableCell>{z.ip_wireguard}</TableCell>}
              {veRed && <TableCell>{z.router_mikrotik ?? '—'}</TableCell>}
              <TableCell>
                {z.clientes_activos} / {z.total_clientes}
              </TableCell>
              <TableCell>
                <Badge className={z.activo ? 'bg-lightsuccess text-success' : 'bg-muted text-muted-foreground'}>
                  {z.activo ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell className="text-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate(`/zonas/${z.id}`)}
                  title="Ver la zona"
                >
                  <Icon icon="tabler:eye" height={18} />
                </Button>
                {puedeGestionar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setBorrando(z)}
                    title="Eliminar zona"
                  >
                    <Icon icon="tabler:trash" height={18} className="text-error" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="Agregar zona"
        subtitle="Registra una nueva zona de cobertura"
        icon="tabler:map-pin-plus"
        size="md"
        footer={
          <FormActions
            onCancel={() => setOpen(false)}
            submitLabel="Guardar"
            submitForm="zona-create-form"
          />
        }
      >
        <form id="zona-create-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormGrid>
            <FormField label="Nombre" icon="tabler:map-pin" htmlFor="nombreZona" required>
              <FieldIcon icon="tabler:map-pin">
                <Input
                  id="nombreZona"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </FieldIcon>
            </FormField>
            <FormField
              label="IP WireGuard"
              icon="tabler:shield-lock"
              htmlFor="ipWg"
              hint="Opcional. Déjala vacía si el router todavía no está instalado: se completa después desde la zona."
            >
              <FieldIcon icon="tabler:network">
                <Input
                  id="ipWg"
                  placeholder="10.10.0.5"
                  value={ipWireguard}
                  onChange={(e) => setIpWireguard(e.target.value)}
                />
              </FieldIcon>
            </FormField>
          </FormGrid>
          {error && <FormCallout tone="error">{error}</FormCallout>}
        </form>
      </FormDialog>

      <ConfirmDialog
        open={!!borrando}
        onOpenChange={(o) => !o && setBorrando(null)}
        title="Eliminar zona"
        description={
          borrando
            ? `¿Eliminar la zona "${borrando.nombre}"? Se van con ella sus mufas y cajas NAP, y no se puede deshacer. Si tiene clientes asignados, el sistema no te va a dejar.`
            : undefined
        }
        onConfirm={handleBorrar}
      />
    </CardBox>
  );
};

export default Zonas;
