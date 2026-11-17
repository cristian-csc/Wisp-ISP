import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClienteRegistroForm } from '@/components/ClienteRegistroForm';
import { VendedorNav } from '@/components/VendedorNav';
import { alerta } from '@/components/Aviso';

export default function VendedorNuevoClienteScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ClienteRegistroForm
        onDone={(nombre) => {
          alerta(
            '✓ Cliente registrado',
            `${nombre} quedó pendiente de aprobación.`,
            [{ text: 'OK', onPress: () => router.replace('/(vendedor)') }],
          );
        }}
      />
      <VendedorNav />
    </View>
  );
}
