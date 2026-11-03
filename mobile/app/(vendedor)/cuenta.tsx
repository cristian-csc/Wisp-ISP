import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes } from '@/services/api';
import { CuentaScreen } from '@/components/CuentaScreen';
import { VendedorNav } from '@/components/VendedorNav';
import { COLORS } from '@/theme/colors';

export default function VendedorCuentaScreen() {
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);
  const [activos, setActivos] = useState<number | null>(null);

  const load = useCallback(() => {
    getClientes({ per_page: 1 }).then((d) => setTotal(d.total)).catch(() => {});
    getClientes({ per_page: 1, estado: 'activo' }).then((d) => setActivos(d.total)).catch(() => {});
  }, []);

  useFocusEffect(load);

  return (
    <View style={{ flex: 1 }}>
      <CuentaScreen rolLabel="Vendedor de campo" rolIcon="people-outline">
        <TouchableOpacity style={s.statCard} onPress={() => router.push('/(vendedor)' as any)} activeOpacity={0.8}>
          <View style={s.statIcon}>
            <Ionicons name="person-add-outline" size={20} color={COLORS.info} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statValue}>{total ?? '—'} <Text style={s.statValueSub}>registrados · {activos ?? '—'} activos</Text></Text>
            <Text style={s.statLabel}>Clientes que has captado</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.mutedForeground} />
        </TouchableOpacity>
      </CuentaScreen>
      <VendedorNav />
    </View>
  );
}

const s = StyleSheet.create({
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 14, marginHorizontal: 20, marginTop: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  statIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lightinfo, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: COLORS.dark },
  statValueSub: { fontSize: 12, fontWeight: '600', color: COLORS.mutedForeground },
  statLabel: { fontSize: 12, color: COLORS.mutedForeground, fontWeight: '600', marginTop: 1 },
});
