import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@iconify/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';
import { getMe } from 'src/lib/api';
import { listNotificaciones, type Notificacion } from 'src/lib/notificaciones';

const PUEDE_VER_NOTIFICACIONES = ['admin', 'atencion_cliente'];

const TIPO_ICONO: Record<Notificacion['tipo'], string> = {
  pendiente_aprobacion: 'tabler:clock-exclamation',
  instalado: 'tabler:circle-check',
  no_instalado: 'tabler:calendar-exclamation',
  averia_demorada: 'tabler:alert-triangle',
  jornada_iniciada: 'tabler:walk',
  whatsapp_desconectado: 'tabler:brand-whatsapp',
};

const TIPO_COLOR: Record<Notificacion['tipo'], string> = {
  pendiente_aprobacion: 'bg-lightwarning text-warning',
  instalado: 'bg-lightsuccess text-success',
  no_instalado: 'bg-lightwarning text-warning',
  averia_demorada: 'bg-lighterror text-error',
  jornada_iniciada: 'bg-lightinfo text-info',
  whatsapp_desconectado: 'bg-lighterror text-error',
};

function tiempoRelativo(fecha: string): string {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const horas = Math.floor(diffMs / 3_600_000);
  if (horas < 1) return 'hace un momento';
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias !== 1 ? 's' : ''}`;
}

const Messages = () => {
  const navigate = useNavigate();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [habilitado, setHabilitado] = useState(false);

  useEffect(() => {
    getMe()
      .then((u) => setHabilitado(PUEDE_VER_NOTIFICACIONES.includes(u.rol)))
      .catch(() => setHabilitado(false));
  }, []);

  useEffect(() => {
    if (!habilitado) return;
    function cargar() {
      listNotificaciones().then(setNotificaciones).catch(() => {});
    }
    cargar();
    const interval = setInterval(cargar, 30_000);
    return () => clearInterval(interval);
  }, [habilitado]);

  return (
    <div className="relative group/menu px-4 sm:px-15 ">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="relative">
            <span className="relative after:absolute after:w-10 after:h-10 after:rounded-full hover:text-primary after:-top-1/2 hover:after:bg-lightprimary text-foreground dark:text-muted-foreground rounded-full flex justify-center items-center cursor-pointer group-hover/menu:after:bg-lightprimary group-hover/menu:!text-primary">
              <Icon icon="tabler:bell-ringing" height={20} />
              {notificaciones.length > 0 && (
                <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white">
                  {notificaciones.length > 9 ? '9+' : notificaciones.length}
                </span>
              )}
            </span>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-screen sm:w-[340px] py-4 rounded-sm border border-ld">
          <div className="flex items-center px-6 justify-between mb-2">
            <h3 className="mb-0 text-lg font-semibold text-ld">Notificaciones</h3>
          </div>

          {notificaciones.length === 0 ? (
            <div className="flex items-center justify-center py-10 px-6">
              <p className="text-sm text-muted-foreground">No hay notificaciones nuevas.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notificaciones.map((n, i) => (
                <button
                  key={`${n.tipo}-${n.url}-${i}`}
                  type="button"
                  onClick={() => navigate(n.url)}
                  className="flex w-full items-start gap-3 px-6 py-2.5 text-left hover:bg-primary/5"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TIPO_COLOR[n.tipo]}`}>
                    <Icon icon={TIPO_ICONO[n.tipo]} height={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ld truncate">{n.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{n.detalle}</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">{tiempoRelativo(n.fecha)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default Messages;
