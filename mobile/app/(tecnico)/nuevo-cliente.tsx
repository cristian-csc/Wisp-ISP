import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ClienteRegistroForm } from '@/components/ClienteRegistroForm';

export default function TecnicoNuevoClienteScreen() {
  const router = useRouter();
  return (
    <ClienteRegistroForm
      onDone={(nombre) => {
        Alert.alert(
          '✓ Cliente registrado',
          `${nombre} quedó pendiente de aprobación.`,
          [{ text: 'OK', onPress: () => router.replace('/(tecnico)') }],
        );
      }}
    />
  );
}
