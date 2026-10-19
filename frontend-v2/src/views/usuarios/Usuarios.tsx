import { useEffect, useState, type FormEvent } from 'react';
import CardBox from 'src/components/shared/CardBox';
import { Badge } from 'src/components/ui/badge';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Label } from 'src/components/ui/label';
import { Switch } from 'src/components/ui/switch';
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
import { listUsuarios, createUsuario, updateUsuario } from 'src/lib/usuarios';
import type { Usuario } from 'src/lib/api';

const ROL_LABEL: Record<Usuario['rol'], string> = {
  super_admin: 'Desarrollador',
  admin: 'Administrador',
  subadmin: 'Sub-administrador',
  tecnico: 'Técnico',
  vendedor_campo: 'Vendedor de campo',
  vendedor_tienda: 'Atención al cliente',
};

// super_admin no se ofrece aquí a propósito — es un rol de infraestructura
// que se asigna a mano (ver PUT /auth/usuarios/{id}), no algo que cualquier
// admin deba poder autoasignarle a otro usuario desde este formulario.
// subadmin tampoco se ofrece — quedó confirmado como un rol sin uso real,
// ningún flujo de negocio lo necesita.
const ROLES: Usuario['rol'][] = ['admin', 'tecnico', 'vendedor_campo', 'vendedor_tienda'];

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Usuario['rol'] | ''>('');
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setUsuarios(await listUsuarios());
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rol) {
      setError('Selecciona un rol.');
      return;
    }
    try {
      await createUsuario({ nombre, email, password, rol });
      setOpen(false);
      setNombre('');
      setEmail('');
      setPassword('');
      setRol('');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'No se pudo crear el usuario');
    }
  }

  async function toggleActivo(u: Usuario) {
    await updateUsuario(u.id, { activo: !u.activo });
    reload();
  }

  return (
    <CardBox>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        <Button onClick={() => setOpen(true)}>Crear usuario</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Activo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.nombre}</TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge className="bg-lightprimary text-primary rounded-md">{ROL_LABEL[u.rol]}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={u.activo} onCheckedChange={() => toggleActivo(u)} />
                  <span className="text-sm text-muted-foreground">{u.activo ? 'Activo' : 'Desactivado'}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="nombreUsuario">Nombre</Label>
              <Input id="nombreUsuario" className="mt-2" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="emailUsuario">Correo</Label>
              <Input id="emailUsuario" type="email" className="mt-2" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="passwordUsuario">Contraseña</Label>
              <Input id="passwordUsuario" type="password" className="mt-2" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={rol} onValueChange={(v) => setRol(v as Usuario['rol'])}>
                <SelectTrigger className="w-full mt-2">
                  <SelectValue placeholder="Selecciona un rol" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROL_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </CardBox>
  );
};

export default Usuarios;
