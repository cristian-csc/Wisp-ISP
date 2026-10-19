import SidebarContent from './sidebaritems';
import SimpleBar from 'simplebar-react';
import { Icon } from '@iconify/react';
import FullLogo from '../../shared/logo/FullLogo';
import { Link, useLocation } from 'react-router';
import { useTheme } from 'src/components/provider/theme-provider';
import { useCurrentUser } from 'src/lib/useCurrentUser';
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

// super_admin ve todo lo que ve admin (es un superset, no un rol aparte que
// haya que listar en cada item de sidebaritems.ts) — misma regla que
// require_roles() en el backend.
function puedeVer(roles: string[] | undefined, rol?: string): boolean {
  if (!roles) return true;
  if (!rol) return false;
  if (roles.includes(rol)) return true;
  return rol === 'super_admin' && roles.includes('admin');
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
        <div className="mb-1" key={item.heading}>
          <AMMenu
            subHeading={item.heading}
            ClassName="hide-menu leading-21 text-sidebar-foreground font-bold uppercase text-xs dark:text-sidebar-foreground"
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
      ? `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground !hover:bg-transparent ${
          isSelected ? '!bg-transparent !text-primary' : ''
        }`
      : `mt-0.5 text-sidebar-foreground dark:text-sidebar-foreground`;

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
          <span className="truncate flex-1">{item.title || item.name}</span>
        </AMMenuItem>
      </div>
    );
  });
};

const SidebarLayout = ({ onClose }: { onClose?: () => void }) => {
  const location = useLocation();
  const pathname = location.pathname;
  const { theme } = useTheme();
  const { user } = useCurrentUser();

  const sidebarMode = theme === 'light' || theme === 'dark' ? theme : undefined;
  const visibleContent = filterByRole(SidebarContent, user?.rol);

  return (
    <AMSidebar
      collapsible="none"
      animation={true}
      showProfile={false}
      width={'270px'}
      showTrigger={false}
      mode={sidebarMode}
      className="fixed left-0 top-0 border border-border dark:border-border bg-sidebar dark:bg-sidebar z-10 h-screen"
    >
      {/* Logo */}
      <div className="px-6 flex items-center brand-logo overflow-hidden">
        <AMLogo component={Link} href="/dashboard" img="">
          <FullLogo />
        </AMLogo>
      </div>

      {/* Sidebar items */}
      <SimpleBar className="h-[calc(100vh-100px)]">
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
