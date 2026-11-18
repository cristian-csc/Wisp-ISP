import { usePathname } from 'expo-router';
import { BarraInferior, PestanaBarra } from '@/components/BarraInferior';

const AVERIAS: PestanaBarra = { id: 'averias', label: 'Averías', icon: 'build-outline', iconActive: 'build', path: '/(tecnico)/averias' };
const RETIROS: PestanaBarra = { id: 'retiros', label: 'Retiros', icon: 'arrow-undo-outline', iconActive: 'arrow-undo', path: '/(tecnico)/retiros' };
const ORDENES: PestanaBarra = { id: 'ordenes', label: 'Órdenes', icon: 'reader-outline', iconActive: 'reader', path: '/(tecnico)' };
const INVENTARIO: PestanaBarra = { id: 'inventario', label: 'Inventario', icon: 'cube-outline', iconActive: 'cube', path: '/(tecnico)/inventario' };
const REGISTRAR: PestanaBarra = { id: 'nuevo', label: 'Registrar', icon: 'person-add-outline', iconActive: 'person-add', path: '/(tecnico)/nuevo-cliente' };

export function TecnicoNav() {
  const pathname = usePathname();

  const activa =
    pathname.includes('averias')         ? 'averias'
    : pathname.includes('retiros')       ? 'retiros'
    : pathname.includes('inventario')    ? 'inventario'
    : pathname.includes('nuevo-cliente') ? 'nuevo'
    : 'ordenes';

  return (
    <BarraInferior
      izquierda={[AVERIAS, RETIROS]}
      central={ORDENES}
      derecha={[INVENTARIO, REGISTRAR]}
      activa={activa}
    />
  );
}
