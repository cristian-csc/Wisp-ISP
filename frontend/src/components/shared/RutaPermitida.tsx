import { Navigate, useLocation } from 'react-router';
import { Icon } from '@iconify/react';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeAbrirRuta } from 'src/lib/permisos';

/** Deja pasar solo si el rol del usuario tiene permitida esta dirección.
 *
 *  Antes el menú escondía las opciones, pero escribiendo la dirección a mano
 *  la pantalla se abría igual. Esto es comodidad y claridad, no seguridad:
 *  quien protege los datos de verdad es el backend, que vuelve a comprobar el
 *  rol en cada petición. Aquí lo que se evita es que alguien llegue a una
 *  pantalla rota, vacía o que no le corresponde. */
const RutaPermitida = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useCurrentUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Icon icon="tabler:loader-2" width={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sin usuario es sesión caída: que lo resuelva el login, no esta pantalla.
  if (!user) return <Navigate to="/login" replace />;

  if (!puedeAbrirRuta(location.pathname, user.rol)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-lightwarning text-warning">
          <Icon icon="tabler:lock" width={28} />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Esta sección no es para tu cuenta</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Tu usuario no tiene acceso a esta parte del sistema. Si crees que deberías
            tenerlo, pídeselo al administrador.
          </p>
        </div>
        <a
          href="/app/dashboard"
          className="transition-ui mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primaryemphasis"
        >
          <Icon icon="tabler:arrow-left" width={16} />
          Volver al inicio
        </a>
      </div>
    );
  }

  return <>{children}</>;
};

export default RutaPermitida;
