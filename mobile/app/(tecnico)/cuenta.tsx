import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getClientes } from '@/services/api';
import { CuentaScreen } from '@/components/CuentaScreen';
import { TecnicoNav } from '@/components/TecnicoNav';
import { COLORS } from '@/theme/colors';

export default function TecnicoCuentaScreen() {
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);

  const load = useCallback(() => {
    getClientes({ solo_mis_instalaciones: true, per_page: 1 })
      .then((d) => setTotal(d.total))
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
      </CuentaScreen>
      <TecnicoNav />
    </View>
  );
}

const s = StyleSheet.create({
  statCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.card, borderRadius: 14, marginHorizontal: 20, marginTop: 16, padding: 14, borderWidth: 1, borderColor: COLORS.border },
  statIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lightsuccess, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '900', color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.mutedForeground, fontWeight: '600' },
});
