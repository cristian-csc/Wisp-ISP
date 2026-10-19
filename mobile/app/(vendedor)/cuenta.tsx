import { useSession } from '@/hooks/useSession';
import { CuentaScreen } from '@/components/CuentaScreen';

export default function VendedorCuentaScreen() {
  const { session } = useSession();
  const label = session?.role === 'vendedor_tienda' ? 'Atención al cliente' : 'Vendedor de campo';
  return <CuentaScreen rolLabel={label} rolIcon="people-outline" />;
}
