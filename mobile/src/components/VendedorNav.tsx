import { usePathname } from 'expo-router';
import { BarraInferior, PestanaBarra } from '@/components/BarraInferior';
import { useJornada } from '@/hooks/useJornada';

const CLIENTES: PestanaBarra = { id: 'clientes', label: 'Mis clientes', icon: 'people-outline', iconActive: 'people', path: '/(vendedor)' };
const REGISTRAR: PestanaBarra = { id: 'nuevo', label: 'Registrar', icon: 'person-add-outline', iconActive: 'person-add', path: '/(vendedor)/nuevo-cliente' };

export function VendedorNav() {
  const pathname = usePathname();
  const { jornada } = useJornada();

  const activa =
    pathname.includes('jornada')         ? 'jornada'
    : pathname.includes('nuevo-cliente') ? 'nuevo'
    : 'clientes';

  const JORNADA: PestanaBarra = {
    id: 'jornada',
    label: 'Jornada',
    icon: 'walk-outline',
    iconActive: 'walk',
    path: '/(vendedor)/jornada',
    enCurso: jornada?.estado === 'activa',
  };

  return (
    <BarraInferior
      izquierda={[JORNADA]}
      central={REGISTRAR}
      derecha={[CLIENTES]}
      activa={activa}
    />
  );
}
