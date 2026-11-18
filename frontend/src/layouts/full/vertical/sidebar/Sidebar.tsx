import { useEffect, useId, useState } from 'react';
import SimpleBar from 'simplebar-react';
import { Icon } from '@iconify/react';
import FullLogo from '../../shared/logo/FullLogo';
import { Link, useLocation } from 'react-router';
import { useMenu } from 'src/lib/useMenu';
import type { ChildItem, MenuItem } from './sidebaritems';
import { AMSidebar } from 'tailwind-sidebar';
import 'tailwind-sidebar/styles.css';

/** Alto del encabezado del sidebar, en píxeles. Lo comparten la cabecera y
 *  el alto que se le resta a la zona desplazable: si se cambia aquí, las dos
 *  siguen cuadrando. */
const ALTO_CABECERA = 72;

const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand';

const estaEn = (url: string | undefined, pathname: string) =>
  !!url && (pathname === url || pathname.startsWith(`${url}/`));

const claveDe = (grupo: MenuItem) => String(grupo.id ?? grupo.heading);

const Enlace = ({
  item,
  pathname,
  onClose,
  conIcono,
}: {
  item: ChildItem;
  pathname: string;
  onClose?: () => void;
  conIcono: boolean;
}) => {
  const activo = estaEn(item.url, pathname);
  return (
    <Link
      to={item.url ?? '#'}
      onClick={onClose}
      aria-current={activo ? 'page' : undefined}
      className={`transition-ui flex items-center gap-3 rounded-lg px-3 leading-tight ${FOCO} ${
        conIcono ? 'min-h-10 py-2 text-sm font-medium' : 'min-h-9 py-1.5 text-[13px]'
      } ${
        activo
          ? 'bg-brand font-semibold text-brand-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground-strong'
      }`}
    >
      {conIcono && <Icon icon={item.icon ?? 'solar:folder-linear'} width={20} className="shrink-0" />}
      <span className="min-w-0 flex-1">{item.name}</span>
    </Link>
  );
};

const GrupoMenu = ({
  grupo,
  abierto,
  alternar,
  pathname,
  onClose,
}: {
  grupo: MenuItem;
  abierto: boolean;
  alternar: () => void;
  pathname: string;
  onClose?: () => void;
}) => {
  const idLista = useId();
  const hijos = grupo.children ?? [];
  const contieneActivo = hijos.some((h) => estaEn(h.url, pathname));

  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={idLista}
        className={`transition-ui flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium ${FOCO} ${
          contieneActivo
            ? 'text-sidebar-foreground-strong'
            : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground-strong'
        }`}
      >
        <Icon
          icon={grupo.icon ?? 'solar:folder-linear'}
          width={20}
          className={`shrink-0 ${contieneActivo ? 'text-brand' : ''}`}
        />
        <span className="min-w-0 flex-1 truncate">{grupo.heading}</span>
        <Icon
          icon="tabler:chevron-down"
          width={16}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ease-out ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        id={idLista}
        inert={!abierto}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="ms-[21px] mt-0.5 flex flex-col gap-0.5 border-s border-sidebar-border ps-2.5">
            {hijos.map((h) => (
              <Enlace key={h.id ?? h.url} item={h} pathname={pathname} onClose={onClose} conIcono={false} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SidebarLayout = ({ onClose }: { onClose?: () => void }) => {
  const { pathname } = useLocation();
  const menu = useMenu();
  const [abierto, setAbierto] = useState<string | null>(null);

  // Al navegar queda abierto solo el grupo de la pantalla actual, como en un
  // acordeón: así el menú entra completo sin desplazarse.
  useEffect(() => {
    const actual = menu.find((g) => g.children?.some((h) => estaEn(h.url, pathname)));
    if (actual) setAbierto(claveDe(actual));
  }, [menu, pathname]);

  return (
    <AMSidebar
      collapsible="none"
      animation={true}
      showProfile={false}
      width={'270px'}
      showTrigger={false}
      mode="dark"
      className="fixed left-0 top-0 z-10 h-screen border-e border-sidebar-border bg-sidebar dark:border-sidebar-border dark:bg-sidebar"
    >
      <div
        className="brand-logo flex items-center overflow-hidden border-b border-sidebar-border px-6"
        style={{ height: ALTO_CABECERA }}
      >
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="WISP Control — ir al inicio"
        >
          <FullLogo ancho={96} className="shrink-0" />
          {/* Solo "Control": la palabra WISP ya la dice el propio logo. */}
          <span className="truncate text-[18px] font-bold leading-none tracking-tight text-brand">
            Control
          </span>
        </Link>
      </div>

      <SimpleBar style={{ height: `calc(100vh - ${ALTO_CABECERA}px)` }}>
        <nav aria-label="Menú principal" className="flex flex-col gap-1 px-3 py-4">
          {menu.map((grupo) => {
            const hijos = grupo.children ?? [];
            // Un grupo con un solo módulo no necesita plegarse: va directo.
            if (hijos.length === 1) {
              return (
                <Enlace key={claveDe(grupo)} item={hijos[0]} pathname={pathname} onClose={onClose} conIcono />
              );
            }
            const clave = claveDe(grupo);
            return (
              <GrupoMenu
                key={clave}
                grupo={grupo}
                abierto={abierto === clave}
                alternar={() => setAbierto((a) => (a === clave ? null : clave))}
                pathname={pathname}
                onClose={onClose}
              />
            );
          })}
        </nav>
      </SimpleBar>
    </AMSidebar>
  );
};

export default SidebarLayout;
