import SidebarContent from 'src/layouts/full/vertical/sidebar/sidebaritems';

/** Cómo se le dice a cada rol en pantalla. Vive acá para que el recibo, el
 *  panel y la ficha del usuario digan todos lo mismo. */
export const ROL_LABEL: Record<string, string> = {
  super_admin: 'Desarrollador',
  admin: 'Administrador',
  subadmin: 'Sub-administrador',
  tecnico: 'Técnico',
  vendedor_campo: 'Vendedor de campo',
  vendedor_tienda: 'Atención al cliente',
};

/** super_admin ve todo lo que ve admin (es un superset, no un rol aparte que
 * haya que listar en cada item de sidebaritems.ts) — misma regla que
 * require_roles() en el backend. */
export function puedeVer(roles: string[] | undefined, rol?: string): boolean {
  if (!roles) return true;
  if (!rol) return false;
  if (roles.includes(rol)) return true;
  return rol === 'super_admin' && roles.includes('admin');
}

type ItemConRoles = { url?: string; roles?: string[]; children?: ItemConRoles[] };

function recolectar(items: ItemConRoles[], acc: Map<string, string[] | undefined>) {
  for (const item of items) {
    if (item.url) acc.set(item.url, item.roles);
    if (item.children) recolectar(item.children, acc);
  }
  return acc;
}

const ROLES_POR_URL = recolectar(SidebarContent as ItemConRoles[], new Map());

/** ¿Este rol tiene permitida la página del menú que vive en `url`?
 * El dashboard enlaza a otros módulos, y no debe ofrecer atajos a pantallas
 * que el menú le esconde a ese rol — la lista de roles sale del propio menú
 * para que no haya dos fuentes de verdad. */
export function puedeVerUrl(url: string, rol?: string): boolean {
  return puedeVer(ROLES_POR_URL.get(url), rol);
}
