import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClienteRegistroForm } from '@/components/ClienteRegistroForm';
import { TecnicoNav } from '@/components/TecnicoNav';

export default function TecnicoNuevoClienteScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ClienteRegistroForm
        onDone={(nombre) => {
          Alert.alert(
            '✓ Cliente registrado',
            `${nombre} quedó pendiente de aprobación.`,
            [{ text: 'OK', onPress: () => router.replace('/(tecnico)') }],
          );
        }}
      />
      <TecnicoNav />
    </View>
  );
}
