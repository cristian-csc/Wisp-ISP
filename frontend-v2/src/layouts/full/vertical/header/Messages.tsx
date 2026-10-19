import { Icon } from '@iconify/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';

// Todavía no hay un sistema de notificaciones real en el backend — se deja
// el mismo shell visual de la plantilla (campana + dropdown) pero con
// estado vacío en vez de datos de demo inventados.
const Messages = () => {
  return (
    <div className="relative group/menu px-4 sm:px-15 ">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="relative">
            <span className="relative after:absolute after:w-10 after:h-10 after:rounded-full hover:text-primary after:-top-1/2 hover:after:bg-lightprimary text-foreground dark:text-muted-foreground rounded-full flex justify-center items-center cursor-pointer group-hover/menu:after:bg-lightprimary group-hover/menu:!text-primary">
              <Icon icon="tabler:bell-ringing" height={20} />
            </span>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-screen sm:w-[300px] py-6 rounded-sm border border-ld">
          <div className="flex items-center px-6 justify-between">
            <h3 className="mb-0 text-lg font-semibold text-ld">Notificaciones</h3>
          </div>

          <div className="flex items-center justify-center py-10 px-6">
            <p className="text-sm text-muted-foreground">No hay notificaciones nuevas.</p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default Messages;
