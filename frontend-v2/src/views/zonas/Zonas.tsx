import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
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
import { listZonas, createZona, type Zona } from 'src/lib/zonas';
import { getMe, type Usuario } from 'src/lib/api';

const Zonas = () => {
  const navigate = useNavigate();
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [ipWireguard, setIpWireguard] = useState('');
  const [error, setError] = useState<string | null>(null);

  const esSuperAdmin = currentUser?.rol === 'super_admin';

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
      await createZona({ nombre, ip_wireguard: ipWireguard });
      setOpen(false);
      setNombre('');
      setIpWireguard('');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear la zona');
    }
  }

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Zonas</h2>
        {esSuperAdmin && <Button onClick={() => setOpen(true)}>Agregar zona</Button>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>IP WireGuard</TableHead>
            <TableHead>Router MikroTik</TableHead>
            <TableHead>Clientes</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-end">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zonas.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                No hay zonas registradas.
              </TableCell>
            </TableRow>
          )}
          {zonas.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="font-medium">{z.nombre}</TableCell>
              <TableCell>{z.ip_wireguard}</TableCell>
              <TableCell>{z.router_mikrotik ?? '—'}</TableCell>
              <TableCell>
                {z.clientes_activos} / {z.total_clientes}
              </TableCell>
              <TableCell>
                <Badge className={z.activo ? 'bg-lightsuccess text-success' : 'bg-muted text-muted-foreground'}>
                  {z.activo ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell className="text-end">
                <Button variant="ghost" size="icon" onClick={() => navigate(`/zonas/${z.id}`)}>
                  <Icon icon="tabler:eye" height={18} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar zona</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="nombreZona">Nombre</Label>
              <Input id="nombreZona" className="mt-2" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="ipWg">IP WireGuard</Label>
              <Input
                id="ipWg"
                className="mt-2"
                placeholder="10.10.0.5"
                value={ipWireguard}
                onChange={(e) => setIpWireguard(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CardBox>
  );
};

export default Zonas;
