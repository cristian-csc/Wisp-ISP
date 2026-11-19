export interface ChildItem {
  id?: number | string;
  name?: string;
  icon?: string;
  children?: ChildItem[];
  url?: string;
  disabled?: boolean;
  roles?: string[];
}

export interface MenuItem {
  heading?: string;
  name?: string;
  icon?: string;
  id?: number | string;
  children?: ChildItem[];
  url?: string;
  disabled?: boolean;
  roles?: string[];
}

import { uniqueId } from 'lodash';

// Navegación real del sistema WISP — reemplaza el contenido de demo de la
// plantilla (Notes/Blog/eCommerce/etc.) por las secciones que existen de
// verdad en el backend (ver fase backend v2). `roles` filtra qué ve
// cada rol — si se omite, lo ven todos los roles autenticados.
const SidebarContent: MenuItem[] = [
  {
    heading: 'Principal',
    children: [
      {
        name: 'Dashboard',
        icon: 'solar:widget-2-linear',
        id: uniqueId(),
        url: '/dashboard',
      },
    ],
  },
  {
    heading: 'Clientes',
    children: [
      {
        name: 'Clientes Fibra',
        icon: 'solar:users-group-rounded-linear',
        id: uniqueId(),
        url: '/clientes/fibra',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Clientes Inalámbricos',
        icon: 'solar:wi-fi-router-minimalistic-linear',
        id: uniqueId(),
        url: '/clientes/inalambricos',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Clientes Satelital',
        icon: 'solar:satellite-linear',
        id: uniqueId(),
        url: '/clientes-satelital',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Pendientes de aprobación',
        icon: 'solar:clock-circle-linear',
        id: uniqueId(),
        url: '/clientes/pendientes',
        roles: ['admin'],
      },
    ],
  },
  {
    heading: 'Red',
    children: [
      {
        name: 'Zonas',
        icon: 'solar:map-point-linear',
        id: uniqueId(),
        url: '/zonas',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Cajas NAP',
        icon: 'solar:box-linear',
        id: uniqueId(),
        url: '/cajas-nap',
        roles: ['admin'],
      },
    ],
  },
  {
    heading: 'Inventario',
    children: [
      {
        name: 'Stock de materiales',
        icon: 'solar:box-minimalistic-linear',
        id: uniqueId(),
        url: '/inventario',
        roles: ['admin'],
      },
      {
        name: 'Entradas y salidas',
        icon: 'solar:transfer-vertical-linear',
        id: uniqueId(),
        url: '/inventario/movimientos',
        roles: ['admin'],
      },
      {
        name: 'Material del personal',
        icon: 'solar:users-group-two-rounded-linear',
        id: uniqueId(),
        url: '/inventario/personal',
        roles: ['admin'],
      },
      {
        name: 'Inventario de ONUs',
        icon: 'solar:cpu-bolt-linear',
        id: uniqueId(),
        url: '/onus',
        roles: ['admin', 'atencion_cliente'],
      },
    ],
  },
  {
    heading: 'Operaciones',
    children: [
      {
        name: 'Averías',
        icon: 'solar:danger-triangle-linear',
        id: uniqueId(),
        url: '/averias',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Órdenes de retiro',
        icon: 'solar:box-minimalistic-linear',
        id: uniqueId(),
        url: '/ordenes-retiro',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Seguimiento de vendedoras',
        icon: 'solar:routing-2-linear',
        id: uniqueId(),
        url: '/jornadas',
        roles: ['admin'],
      },
    ],
  },
  {
    heading: 'Finanzas',
    children: [
      {
        name: 'Pagos',
        icon: 'solar:banknote-2-linear',
        id: uniqueId(),
        url: '/pagos',
        roles: ['admin', 'atencion_cliente'],
      },
      {
        name: 'Gastos',
        icon: 'solar:wallet-money-linear',
        id: uniqueId(),
        url: '/gastos',
        roles: ['admin'],
      },
      {
        name: 'Reporte de Caja',
        icon: 'solar:chart-2-linear',
        id: uniqueId(),
        url: '/finanzas/reporte-caja',
        roles: ['admin'],
      },
    ],
  },
  {
    heading: 'Administración',
    children: [
      {
        name: 'Usuarios',
        icon: 'solar:user-circle-linear',
        id: uniqueId(),
        url: '/usuarios',
        roles: ['admin'],
      },
      {
        name: 'Planes',
        icon: 'solar:document-text-linear',
        id: uniqueId(),
        url: '/planes',
        roles: ['admin'],
      },
      {
        name: 'WhatsApp',
        icon: 'solar:chat-round-linear',
        id: uniqueId(),
        url: '/configuracion/whatsapp',
        roles: ['admin'],
      },
      {
        name: 'Roles y módulos',
        icon: 'solar:shield-user-linear',
        id: uniqueId(),
        url: '/configuracion/roles',
        roles: ['admin'],
      },
      {
        name: 'Módulos padre',
        icon: 'solar:folder-with-files-linear',
        id: uniqueId(),
        url: '/configuracion/modulos-padre',
        roles: ['admin'],
      },
    ],
  },
];

export default SidebarContent;
