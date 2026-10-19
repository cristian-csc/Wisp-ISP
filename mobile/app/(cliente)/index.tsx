import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Animated, Easing, TouchableOpacity, Linking,
} from 'react-native';
import { useSession } from '@/hooks/useSession';
import { getMiCuenta, MiCuenta } from '@/services/api';
import { COLORS } from '@/theme/colors';

function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}


function PulseDot({ activo }: { activo: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!activo) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1.8, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale,   { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [activo]);

  if (!activo) return <View style={[s.dot, s.dotRed]} />;
  return (
    <View style={s.dotWrap}>
      <Animated.View style={[s.dotRing, { transform: [{ scale }], opacity }]} />
      <View style={[s.dot, s.dotGreen]} />
    </View>
  );
}

function DiasBar({ dias }: { dias: number | null }) {
  if (dias === null) return null;
  const color = dias < 0 ? '#DC2626' : dias <= 7 ? '#D97706' : '#059669';
  const label = dias < 0
    ? `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
    : dias === 0 ? 'Vence hoy'
    : `${dias} día${dias !== 1 ? 's' : ''} restantes`;
  const icon = dias < 0 ? '⚠️' : dias <= 7 ? '⏰' : '✅';
  const pct = Math.max(0, Math.min(1, (30 - Math.max(0, -dias)) / 30));

  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>{icon} {label}</Text>
        {dias > 0 && <Text style={{ fontSize: 12, color: color, fontWeight: '700' }}>{Math.round(pct * 100)}%</Text>}
      </View>
      <View style={s.progressBg}>
        <View style={[s.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function MiCuentaScreen() {
  const { session } = useSession();
  const [cuenta, setCuenta] = useState<MiCuenta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try { setCuenta(await getMiCuenta()); } catch {}
    finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  }, []);

  useEffect(() => { load(); }, []);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  const activo    = cuenta?.estado === 'activo';
  const suspendido = cuenta?.estado === 'suspendido';
  const nombre    = session?.nombre ?? cuenta?.nombre ?? 'Cliente';
  const inicial   = nombre[0].toUpperCase();
  const dias = cuenta?.fecha_vencimiento
    ? Math.ceil((new Date(cuenta.fecha_vencimiento).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Animated.ScrollView
      style={[s.container, { opacity: fadeAnim }]}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={activo ? '#34D399' : '#F87171'} />}
    >
      {/* ── HERO ─────────────────────────────────────────────── */}
      <View style={[s.hero, activo ? s.heroGreen : s.heroRed]}>
        {/* Decorative circles */}
        <View style={[s.deco, { width: 220, height: 220, top: -60, right: -60, opacity: 0.12 }]} />
        <View style={[s.deco, { width: 140, height: 140, bottom: -40, left: -30, opacity: 0.08 }]} />
        <View style={[s.deco, { width: 80,  height: 80,  top: 20, left: 30, opacity: 0.1 }]} />

        {/* Greeting */}
        <Text style={s.heroGreeting}>Hola,</Text>

        {/* Avatar */}
        <View style={s.heroBubble}>
          <Text style={s.heroBubbleText}>{inicial}</Text>
        </View>

        <Text style={s.heroName} numberOfLines={1}>{nombre}</Text>

        {/* Status */}
        <View style={s.heroStatusRow}>
          <PulseDot activo={activo} />
          <Text style={s.heroStatus}>
            {activo ? 'SERVICIO ACTIVO' : suspendido ? 'SERVICIO CORTADO' : 'ANULADO'}
          </Text>
        </View>

        {/* Plan badge */}
        {cuenta?.plan && (
          <View style={s.heroPlanBadge}>
            <Text style={s.heroPlanIcon}>📡</Text>
            <Text style={s.heroPlanText}>{cuenta.plan.nombre}</Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, marginTop: -16 }}>

        {/* ── QUICK STATS ────────────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderTopColor: '#6366F1' }]}>
            <Text style={[s.statNum, { color: '#6366F1' }]}>
              {dias !== null ? (dias < 0 ? '0' : String(dias)) : '—'}
            </Text>
            <Text style={s.statLabel}>Días{'\n'}restantes</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: COLORS.primary }]}>
            <Text style={[s.statNum, { color: COLORS.primary }]}>
              {cuenta?.plan ? `S/${cuenta.plan.precio.toFixed(0)}` : '—'}
            </Text>
            <Text style={s.statLabel}>Mensua-{'\n'}lidad</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: activo ? '#10B981' : '#EF4444' }]}>
            <Text style={[s.statNum, { color: activo ? '#10B981' : '#EF4444', fontSize: 18 }]}>
              {activo ? '✓' : '✕'}
            </Text>
            <Text style={s.statLabel}>Estado{'\n'}actual</Text>
          </View>
        </View>

        {/* ── FACTURACIÓN ────────────────────────────────────── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>FACTURACIÓN</Text>
            <View style={[s.cardBadge, { backgroundColor: activo ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)' }]}>
              <Text style={[s.cardBadgeText, { color: activo ? '#059669' : '#DC2626' }]}>
                {activo ? 'Al día' : 'Vencido'}
              </Text>
            </View>
          </View>

          {cuenta?.plan && (
            <View style={s.montoRow}>
              <View>
                <Text style={s.montoLabel}>Mensualidad</Text>
                <Text style={s.montoSub}>Plan {cuenta.plan.nombre}</Text>
              </View>
              <Text style={s.montoValor}>S/ {cuenta.plan.precio.toFixed(2)}</Text>
            </View>
          )}

          <DiasBar dias={dias} />

          {dias !== null && (
            <View style={[s.venceRow, dias < 0 ? s.venceRojo : dias <= 7 ? s.venceOrange : s.venceGreen]}>
              <Text style={[s.venceText, { color: dias < 0 ? '#DC2626' : dias <= 7 ? '#D97706' : '#059669' }]}>
                {dias < 0
                  ? `Vencido el ${fmt(cuenta?.fecha_vencimiento)} — contáctanos`
                  : `Próximo pago: ${fmt(cuenta?.fecha_vencimiento)}`}
              </Text>
            </View>
          )}
        </View>

        {/* ── CONEXIÓN ────────────────────────────────────────── */}
        {cuenta?.plan && (
          <View style={s.card}>
            <Text style={s.cardTitle}>MI CONEXIÓN</Text>
            <View style={s.connRow}>
              <View style={s.connIcon}>
                <Text style={{ fontSize: 28 }}>📶</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={s.connPlan}>{cuenta.plan.nombre}</Text>
                <Text style={s.connSub}>
                  {activo ? 'Conexión estable y funcionando' : 'Servicio suspendido temporalmente'}
                </Text>
              </View>
              <View style={[s.connStatus, { backgroundColor: activo ? '#DCFCE7' : '#FEE2E2' }]}>
                <Text style={{ fontSize: 16 }}>{activo ? '🟢' : '🔴'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── MIS DATOS ───────────────────────────────────────── */}
        {cuenta && (
          <View style={s.card}>
            <Text style={s.cardTitle}>MIS DATOS</Text>
            {[
              { icon: '📅', l: 'Instalación', v: fmt(cuenta.fecha_instalacion) },
              { icon: '📱', l: 'Teléfono',    v: cuenta.telefono ?? '—'        },
              { icon: '📍', l: 'Dirección',   v: cuenta.direccion ?? '—'       },
            ].map(({ icon, l, v }) => (
              <View key={l} style={s.fila}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 15 }}>{icon}</Text>
                  <Text style={s.filaLabel}>{l}</Text>
                </View>
                <Text style={s.filaValue} numberOfLines={1}>{v}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── AYUDA ───────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.card, { backgroundColor: COLORS.dark, borderColor: '#334155' }]}
          onPress={() => Linking.openURL('https://wa.me/51990807069')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ fontSize: 28 }}>🛟</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#F1F5F9', fontWeight: '800', fontSize: 14 }}>¿Problemas con tu servicio?</Text>
              <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>Toca aquí para escribirnos por WhatsApp</Text>
            </View>
            <View style={s.helpBadge}>
              <Text style={{ color: COLORS.secondary, fontWeight: '900', fontSize: 11 }}>SOPORTE</Text>
            </View>
          </View>
        </TouchableOpacity>

      </View>
    </Animated.ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  /* Hero */
  hero: {
    paddingTop: 28, paddingBottom: 40, paddingHorizontal: 24,
    alignItems: 'center', overflow: 'hidden',
  },
  heroGreen: { backgroundColor: '#059669' },
  heroRed:   { backgroundColor: '#DC2626' },
  deco: { position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF' },

  heroGreeting: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '600', marginBottom: 14, letterSpacing: 0.5 },

  heroBubble: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  heroBubbleText: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },
  heroName: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', opacity: 0.9, marginBottom: 12, textAlign: 'center' },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  heroStatus: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },

  dotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: 'rgba(255,255,255,0.9)', position: 'absolute' },
  dotRed:   { backgroundColor: 'rgba(255,255,255,0.5)' },
  dotRing: {
    position: 'absolute', width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)',
  },

  heroPlanBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7,
  },
  heroPlanIcon: { fontSize: 14 },
  heroPlanText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  /* Quick stats */
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statNum: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
  statLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', textAlign: 'center', lineHeight: 14 },

  /* Cards */
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1,
    borderColor: '#E2E8F0', padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 2 },
  cardBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  cardBadgeText: { fontSize: 11, fontWeight: '700' },

  montoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  montoLabel: { fontSize: 15, color: '#64748B', fontWeight: '600' },
  montoSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  montoValor: { fontSize: 30, fontWeight: '900', color: '#1E293B' },

  progressBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },

  venceRow: { borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 12 },
  venceRojo:   { backgroundColor: 'rgba(220,38,38,0.06)',  borderColor: 'rgba(220,38,38,0.2)'  },
  venceOrange: { backgroundColor: 'rgba(217,119,6,0.06)',  borderColor: 'rgba(217,119,6,0.2)'  },
  venceGreen:  { backgroundColor: 'rgba(5,150,105,0.06)',  borderColor: 'rgba(5,150,105,0.2)'  },
  venceText: { fontSize: 12, fontWeight: '700' },

  connRow: { flexDirection: 'row', alignItems: 'center' },
  connIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  connPlan: { fontSize: 15, fontWeight: '800', color: '#1E293B' },
  connSub: { fontSize: 12, color: '#64748B', marginTop: 3 },
  connStatus: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },

  fila: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  filaLabel: { color: '#64748B', fontSize: 13 },
  filaValue: { color: '#1E293B', fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },

  helpBadge: {
    backgroundColor: 'rgba(73,190,255,0.15)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(73,190,255,0.3)',
  },
});
