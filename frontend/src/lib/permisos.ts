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

/** Permisos por acción, no solo por pantalla.
 *
 *  Ver una pantalla y poder cambiar cosas en ella son dos cosas distintas:
 *  Atención al cliente entra a Zonas para consultar la cobertura, pero no
 *  crea zonas ni ve la configuración del túnel. Esta tabla es el único sitio
 *  donde se decide eso en el panel; el backend lo vuelve a comprobar por su
 *  cuenta (esconder un botón no es seguridad).
 *
 *  `super_admin` no hace falta listarlo cuando ya está `admin`: lo añade
 *  `puedeAccion`, igual que hace `require_roles()` en el backend. */
export const ACCIONES = {
  /** Crear, editar o borrar zonas; reubicar el servidor; agregar mufas. */
  'zonas.gestionar': ['admin'],
  /** Ver la red por dentro: IP de WireGuard, router MikroTik, peers, claves. */
  'zonas.verRed': ['admin', 'subadmin'],
  /** Asignar o quitar técnicos de una zona. */
  'zonas.asignarTecnicos': ['admin'],
  /** Dar de alta, asignar o borrar equipos del inventario. */
  'onus.gestionar': ['admin', 'subadmin'],
  /** Asignar técnico a una avería, editarla o cerrarla. */
  'averias.gestionar': ['admin', 'subadmin'],
  /** Borrar un pago ya registrado. */
  'pagos.borrar': ['admin', 'subadmin'],
  /** Cifras de toda la empresa: gastos, márgenes, ingresos históricos. */
  'finanzas.verGlobal': ['admin', 'subadmin'],
} as const;

export type Accion = keyof typeof ACCIONES;

export function puedeAccion(accion: Accion, rol?: string): boolean {
  if (!rol) return false;
  const permitidos: readonly string[] = ACCIONES[accion];
  if (permitidos.includes(rol)) return true;
  return rol === 'super_admin' && permitidos.includes('admin');
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

/** Páginas que no están en el menú porque se llega a ellas desde otra:
 *  la ficha de un cliente, el detalle de una zona, etc. Cada una hereda los
 *  permisos de la sección a la que pertenece. */
const SECCION_DE_RUTA: { patron: RegExp; seccion: string | null }[] = [
  { patron: /^\/perfil$/, seccion: null },                       // null = cualquiera con sesión
  { patron: /^\/dashboard$/, seccion: null },
  { patron: /^\/clientes-satelital(\/.*)?$/, seccion: '/clientes-satelital' },
  { patron: /^\/clientes\/pendientes$/, seccion: '/clientes/pendientes' },
  { patron: /^\/clientes\/fibra$/, seccion: '/clientes/fibra' },
  { patron: /^\/clientes\/inalambricos$/, seccion: '/clientes/inalambricos' },
  // La ficha de un cliente y el listado heredado: valen para quien ve clientes.
  { patron: /^\/clientes(\/.*)?$/, seccion: '/clientes/fibra' },
  { patron: /^\/zonas(\/.*)?$/, seccion: '/zonas' },
  { patron: /^\/cajas-nap(\/.*)?$/, seccion: '/cajas-nap' },
  { patron: /^\/onus(\/.*)?$/, seccion: '/onus' },
  { patron: /^\/averias(\/.*)?$/, seccion: '/averias' },
  { patron: /^\/ordenes-retiro(\/.*)?$/, seccion: '/ordenes-retiro' },
  { patron: /^\/gastos(\/.*)?$/, seccion: '/gastos' },
  { patron: /^\/pagos(\/.*)?$/, seccion: '/pagos' },
  { patron: /^\/finanzas\/reporte-caja$/, seccion: '/finanzas/reporte-caja' },
  { patron: /^\/configuracion\/whatsapp$/, seccion: '/configuracion/whatsapp' },
  { patron: /^\/usuarios(\/.*)?$/, seccion: '/usuarios' },
  { patron: /^\/planes(\/.*)?$/, seccion: '/planes' },
  { patron: /^\/jornadas(\/.*)?$/, seccion: '/jornadas' },
];

/** ¿Este rol puede abrir esta dirección?
 *
 *  Se usa para proteger las rutas del panel: hasta ahora el menú escondía las
 *  opciones, pero escribiendo la dirección a mano la pantalla se abría igual.
 *  Una dirección desconocida se niega por defecto — es preferible que una
 *  pantalla nueva empiece cerrada y haya que abrirla a propósito. */
export function puedeAbrirRuta(pathname: string, rol?: string): boolean {
  if (!rol) return false;
  const limpio = pathname.replace(/\/+$/, '') || '/';
  if (limpio === '/' || limpio === '/login') return true;
  const encontrada = SECCION_DE_RUTA.find((r) => r.patron.test(limpio));
  if (!encontrada) return false;
  if (encontrada.seccion === null) return true;
  return puedeVerUrl(encontrada.seccion, rol);
}
