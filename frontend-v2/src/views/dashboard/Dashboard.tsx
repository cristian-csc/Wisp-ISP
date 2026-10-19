import { useEffect, useState } from 'react';
import CardBox from 'src/components/shared/CardBox';
import { getMe, type Usuario } from 'src/lib/api';

const ROLE_LABEL: Record<Usuario['rol'], string> = {
  super_admin: 'Desarrollador',
  admin: 'Administrador',
  subadmin: 'Sub-administrador',
  tecnico: 'Técnico',
  vendedor_campo: 'Vendedor de campo',
  vendedor_tienda: 'Atención al cliente',
};

const Dashboard = () => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    getMe().then(setUsuario).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="text-2xl mb-6">
        Bienvenido{usuario ? `, ${usuario.nombre}` : ''}
      </h1>
      <CardBox className="max-w-md">
        <p className="text-muted-foreground">
          Rol: <span className="text-foreground font-medium">{usuario ? ROLE_LABEL[usuario.rol] : '—'}</span>
        </p>
      </CardBox>
    </div>
  );
};

export default Dashboard;
