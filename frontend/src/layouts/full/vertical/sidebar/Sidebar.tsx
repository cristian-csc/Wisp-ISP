import SidebarContent from './sidebaritems';
import SimpleBar from 'simplebar-react';
import { Icon } from '@iconify/react';
import FullLogo from '../../shared/logo/FullLogo';
import { Link, useLocation } from 'react-router';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeVer } from 'src/lib/permisos';
import { AMMenu, AMMenuItem, AMSidebar, AMSubmenu } from 'tailwind-sidebar';
import 'tailwind-sidebar/styles.css';

/** Alto del encabezado del sidebar, en píxeles. Lo comparten la cabecera y
 *  el alto que se le resta a la zona desplazable: si se cambia aquí, las dos
 *  siguen cuadrando. */
const ALTO_CABECERA = 72;

interface SidebarItemType {
  heading?: string
  id?: number | string
  name?: string
  title?: string
  icon?: string
  url?: string
  children?: SidebarItemType[]
  disabled?: boolean
  roles?: string[]
}

function filterByRole(items: SidebarItemType[], rol?: string): SidebarItemType[] {
  return items
    .filter((item) => puedeVer(item.roles, rol))
    .map((item) => (item.children ? { ...item, children: filterByRole(item.children, rol) } : item))
    .filter((item) => !item.children || item.children.length > 0 || item.url);
}

const renderSidebarItems = (
  items: SidebarItemType[],
  currentPath: string,
  onClose?: () => void,
  isSubItem: boolean = false,
) => {
  return items.map((item) => {
    const isSelected = currentPath === item?.url;
    const IconComp = item.icon || null;

    const iconElement = IconComp ? (
      <Icon icon={IconComp} height={21} width={21} />
    ) : (
      <Icon icon={'ri:checkbox-blank-circle-line'} height={9} width={9} />
    );

    if (item.heading) {
      return (
        <div className="mb-1 mt-5 first:mt-0" key={item.heading}>
          <AMMenu
            subHeading={item.heading}
            ClassName="hide-menu leading-21 text-sidebar-foreground/60 font-semibold uppercase text-[10px] tracking-[0.14em] dark:text-sidebar-foreground/60"
          />
        </div>
      );
    }

    if (item.children?.length) {
      return (
        <AMSubmenu
          key={item.id}
          icon={iconElement}
          title={item.name}
          ClassName="mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground"
        >
          {renderSidebarItems(item.children, currentPath, onClose, true)}
        </AMSubmenu>
      );
    }

    const linkTarget = item.url?.startsWith('https') ? '_blank' : '_self';

    const itemClassNames = isSubItem
      ? `transition-ui mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground ${
          isSelected ? '!bg-transparent !font-semibold !text-brand' : 'hover:!text-sidebar-foreground-strong'
        }`
      : `transition-ui mt-1 rounded-lg text-sidebar-foreground dark:text-sidebar-foreground ${
          isSelected
            ? '!bg-brand !font-semibold !text-brand-foreground shadow-sm'
            : 'hover:!bg-sidebar-hover hover:!text-sidebar-foreground-strong'
        }`;

    return (
      <div onClick={onClose} key={item.id}>
        <AMMenuItem
          icon={iconElement}
          isSelected={isSelected}
          link={item.url || undefined}
          target={linkTarget}
          disabled={item.disabled}
          component={Link}
          className={`${itemClassNames}`}
        >
          <span className="flex-1 whitespace-normal leading-tight">{item.title || item.name}</span>
        </AMMenuItem>
      </div>
    );
  });
};

const SidebarLayout = ({ onClose }: { onClose?: () => void }) => {
  const location = useLocation();
  const pathname = location.pathname;
  const { user } = useCurrentUser();

  // El sidebar es azul oscuro en los dos temas (identidad WISP), así que la
  // librería va siempre en su modo oscuro; los colores exactos los ponen los
  // tokens --sidebar / --sidebar-hover, que sí cambian con el tema.
  const sidebarMode = 'dark' as const;
  const visibleContent = filterByRole(SidebarContent, user?.rol);

  return (
    <AMSidebar
      collapsible="none"
      animation={true}
      showProfile={false}
      width={'270px'}
      showTrigger={false}
      mode={sidebarMode}
      className="fixed left-0 top-0 z-10 h-screen border-e border-sidebar-border bg-sidebar dark:border-sidebar-border dark:bg-sidebar"
    >
      {/* Encabezado en horizontal: el logo a la izquierda y la marca al lado.
          Antes iba en columna y ocupaba ~195px de alto; así baja a ALTO_CABECERA
          y esa diferencia se la queda la navegación, que es lo que se usa. */}
      {/* px-6 igual que la lista de abajo, para que el logo y los iconos del
          menú arranquen en la misma línea vertical. */}
      <div
        className="brand-logo flex items-center overflow-hidden border-b border-sidebar-border px-6"
        style={{ height: ALTO_CABECERA }}
      >
        {/* Enlace directo en lugar de <AMLogo>: ese componente de la librería
            impone un contenedor de 253px de ancho y 50px de alto mínimo, que
            en una fila horizontal desborda (por eso antes hacía falta un
            margen negativo). Va al mismo sitio y con el mismo logo. */}
        <Link
          to="/dashboard"
          className="flex min-w-0 items-center gap-2.5"
          aria-label="WISP Control — ir al inicio"
        >
          <FullLogo ancho={96} className="shrink-0" />
          {/* Solo "Control": la palabra WISP ya la dice el propio logo, y
              repetirla al lado era decir dos veces lo mismo. */}
          <span className="truncate text-[18px] font-bold leading-none tracking-tight text-brand">
            Control
          </span>
        </Link>
      </div>

      {/* Sidebar items — la altura se descuenta de la cabecera, por eso las
          dos salen de la misma constante y no de un número suelto. */}
      <SimpleBar style={{ height: `calc(100vh - ${ALTO_CABECERA}px)` }}>
        <div className="px-6 pb-10">
          {visibleContent.map((section, index) => (
            <div key={index}>
              {renderSidebarItems(
                [
                  ...(section.heading ? [{ heading: section.heading }] : []),
                  ...(section.children || []),
                ],
                pathname,
                onClose,
              )}
            </div>
          ))}
        </div>
      </SimpleBar>
    </AMSidebar>
  );
};

export default SidebarLayout;
