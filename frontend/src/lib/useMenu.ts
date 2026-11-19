import { useMemo } from 'react';
import SidebarContent, { type MenuItem } from 'src/layouts/full/vertical/sidebar/sidebaritems';
import { puedeVer } from './permisos';
import { useCurrentUser } from './useCurrentUser';
import { useMisModulos, type MiModulo } from './modulos';

function menuDesdeModulos(modulos: MiModulo[]): MenuItem[] {
  const grupos = new Map<number, MenuItem>();
  for (const m of modulos) {
    if (!m.ruta) continue;
    const grupo = grupos.get(m.grupo_id) ?? {
      id: m.grupo_id,
      heading: m.grupo,
      icon: m.grupo_icono ?? undefined,
      children: [],
    };
    grupo.children!.push({ id: m.clave, name: m.nombre, icon: m.icono ?? undefined, url: m.ruta });
    grupos.set(m.grupo_id, grupo);
  }
  return [...grupos.values()];
}

function menuEscrito(items: MenuItem[], rol?: string): MenuItem[] {
  return items
    .map((item) => ({ ...item, children: item.children?.filter((c) => puedeVer(c.roles, rol)) }))
    .filter((item) => item.children?.length);
}

/** El menú de esta sesión. Sale de los módulos del rol; si el servidor no
 *  responde, usa la lista escrita para que nadie se quede sin navegación. */
export function useMenu(): MenuItem[] {
  const { user } = useCurrentUser();
  const { modulos, cargando, fallo } = useMisModulos();

  return useMemo(() => {
    if (cargando) return [];
    return fallo ? menuEscrito(SidebarContent, user?.rol) : menuDesdeModulos(modulos);
  }, [modulos, cargando, fallo, user?.rol]);
}
