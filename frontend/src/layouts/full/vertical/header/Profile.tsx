import { Icon } from '@iconify/react';
import * as profileData from './data';
import { Link, useNavigate } from 'react-router';
import profileimg from 'src/assets/images/profile/user-1.jpg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'src/components/ui/dropdown-menu';
import { Button } from 'src/components/ui/button';
import { logout } from 'src/lib/api';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { ROL_LABEL } from 'src/lib/permisos';

const Profile = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="transition-ui flex shrink-0 items-center gap-2.5 rounded-full py-1 ps-1 pe-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <img
            src={profileimg}
            alt="perfil"
            height="34"
            width="34"
            className="rounded-full ring-2 ring-lightprimary"
          />
          {/* Nombre y rol solo donde hay sitio: en móvil queda el avatar */}
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block truncate text-sm font-semibold leading-tight">
              {user?.nombre ?? '—'}
            </span>
            <span className="block truncate text-xs leading-tight text-muted-foreground">
              {user ? ROL_LABEL[user.rol] : ''}
            </span>
          </span>
          <Icon
            icon="tabler:chevron-down"
            width={16}
            className="hidden shrink-0 text-muted-foreground sm:block"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
        {/* Identidad, para que quede claro con qué cuenta se está trabajando */}
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
          <img src={profileimg} alt="" height="38" width="38" className="rounded-full" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user?.nombre ?? '—'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user ? ROL_LABEL[user.rol] : ''}
            </p>
          </div>
        </div>

        <div className="my-1.5">
          {profileData.profileDD.map((items, index) => (
            <DropdownMenuItem
              key={index}
              asChild
              className="group/link transition-ui cursor-pointer rounded-lg px-3 py-2 hover:bg-lightprimary"
            >
              <Link to={items.url} className="flex items-center gap-3">
                <Icon
                  icon={items.icon}
                  width={18}
                  className="text-muted-foreground group-hover/link:text-primary"
                />
                <span className="text-sm group-hover/link:text-primary">{items.title}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator className="my-1.5" />

        <Button variant="outline" className="w-full rounded-lg" onClick={handleLogout}>
          <Icon icon="tabler:logout" width={16} className="me-1.5" />
          Cerrar sesión
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default Profile;
