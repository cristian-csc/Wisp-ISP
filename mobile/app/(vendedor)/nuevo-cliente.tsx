import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClienteRegistroForm } from '@/components/ClienteRegistroForm';
import { VendedorNav } from '@/components/VendedorNav';

export default function VendedorNuevoClienteScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ClienteRegistroForm
        onDone={(nombre) => {
          Alert.alert(
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
