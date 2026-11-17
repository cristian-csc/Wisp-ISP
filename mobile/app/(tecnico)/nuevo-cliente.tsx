import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClienteRegistroForm } from '@/components/ClienteRegistroForm';
import { TecnicoNav } from '@/components/TecnicoNav';
import { alerta } from '@/components/Aviso';

export default function TecnicoNuevoClienteScreen() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ClienteRegistroForm
        onDone={(nombre) => {
          alerta(
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
