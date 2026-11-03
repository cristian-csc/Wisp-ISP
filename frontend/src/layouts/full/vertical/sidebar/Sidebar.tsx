import SidebarContent from './sidebaritems';
import SimpleBar from 'simplebar-react';
import { Icon } from '@iconify/react';
import FullLogo from '../../shared/logo/FullLogo';
import { Link, useLocation } from 'react-router';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeVer } from 'src/lib/permisos';
import { AMLogo, AMMenu, AMMenuItem, AMSidebar, AMSubmenu } from 'tailwind-sidebar';
import 'tailwind-sidebar/styles.css';

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
      {/* Logo: compacto, para que el peso visual lo lleve la navegación.
          El eslogan usa el color de texto del sidebar — antes era `text-dark`,
          que sobre el sidebar oscuro quedaba invisible. */}
      {/* Encabezado compacto: el logo manda, pero el bloque se mantiene en
          torno a 195px para dejarle el resto de la altura a la navegación.
          Los márgenes van al contenedor; el <AMLogo> trae relleno propio y
          por eso el logo lleva un margen negativo arriba. */}
      <div className="brand-logo flex flex-col items-center overflow-hidden px-6 pb-7 pt-5">
        <AMLogo component={Link} href="/dashboard" img="">
          <FullLogo ancho={200} className="-mb-5" />
        </AMLogo>
        <p className="mt-2 text-[18px] font-bold leading-none tracking-tight text-sidebar-foreground-strong">
          WISP <span className="text-brand">Control</span>
        </p>
        <p className="mt-2 text-[13px] leading-none tracking-wide text-sidebar-foreground">
          Internet para todos
        </p>
      </div>

      {/* Sidebar items */}
      <SimpleBar className="h-[calc(100vh-196px)]">
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
