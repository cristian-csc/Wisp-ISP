import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes } from '@/services/api';
import { CuentaScreen } from '@/components/CuentaScreen';
import { COLORS } from '@/theme/colors';

export default function TecnicoCuentaScreen() {
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);
  // Instalar y registrar son dos trabajos distintos: un técnico puede dar de
  // alta a un cliente que instala otro, y al revés. Por eso van dos cuentas.
  const [registrados, setRegistrados] = useState<number | null>(null);

  const load = useCallback(() => {
    getClientes({ solo_mis_instalaciones: true, per_page: 1 })
      .then((d) => setTotal(d.total))
      .catch(() => {});
    getClientes({ solo_mis_registros: true, per_page: 1 })
      .then((d) => setRegistrados(d.total))
      .catch(() => {});
  }, []);

  useFocusEffect(load);

  return (
    <View style={{ flex: 1 }}>
      <CuentaScreen rolLabel="Técnico" rolIcon="build-outline">
        <TouchableOpacity style={s.statCard} onPress={() => router.push('/(tecnico)/instalaciones' as any)} activeOpacity={0.8}>
          <View style={s.statIcon}>
            <Ionicons name="checkmark-done-outline" size={20} color={COLORS.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statValue}>{total ?? '—'}</Text>
            <Text style={s.statLabel}>Instalaciones realizadas</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity
          style={s.statCard}
          onPress={() => router.push('/(tecnico)/instalaciones?modo=registros' as any)}
          activeOpacity={0.8}
        >
          <View style={[s.statIcon, { backgroundColor: COLORS.muted }]}>
            <Ionicons name="person-add-outline" size={20} color={COLORS.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statValue}>{registrados ?? '—'}</Text>
            <Text style={s.statLabel}>Clientes que registraste</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.mutedForeground} />
        </TouchableOpacity>

        <TouchableOpacity style={s.statCard} onPress={() => router.push('/(tecnico)/combustible' as any)} activeOpacity={0.8}>
          <View style={[s.statIcon, { backgroundColor: COLORS.lightbrand }]}>
            <Ionicons name="car-outline" size={20} color={COLORS.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statValue}>Cargar combustible</Text>
            <Text style={s.statLabel}>Registrar una carga con sus fotos</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.mutedForeground} />
        </TouchableOpacity>
      </CuentaScreen>
    </View>
  );
}

const s = StyleSheet.create({
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 14, marginHorizontal: 20, marginTop: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  statIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lightsuccess, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.mutedForeground, fontWeight: '600' },
});
