import { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { registrarPago } from '@/services/api';

const METODOS = [
  { id: 'efectivo',       label: 'Efectivo',      icon: '💵' },
  { id: 'transferencia',  label: 'Transferencia', icon: '🏦' },
  { id: 'deposito',       label: 'Depósito',      icon: '🏧' },
  { id: 'tarjeta',        label: 'Tarjeta',       icon: '💳' },
];

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function hoyISO() {
  return new Date().toISOString().split('T')[0];
}
function mesLabel(m: string) {
  const [y, mo] = m.split('-');
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${MESES[parseInt(mo, 10) - 1]} ${y}`;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clienteId: number;
  clienteNombre: string;
  montoSugerido: number;
};

export function ModalPago({ visible, onClose, onSuccess, clienteId, clienteNombre, montoSugerido }: Props) {
  const [mes,      setMes]      = useState(mesActual());
  const [monto,    setMonto]    = useState(String(montoSugerido));
  const [fecha,    setFecha]    = useState(hoyISO());
  const [metodo,   setMetodo]   = useState('efectivo');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [saving,   setSaving]   = useState(false);

  // Navegar entre meses
  function cambiarMes(delta: number) {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  async function guardar() {
    const n = parseFloat(monto);
    if (!monto || isNaN(n) || n <= 0) { Alert.alert('Monto inválido', 'Ingresa un monto mayor a 0.'); return; }
    if (!fecha.match(/^\d{4}-\d{2}-\d{2}$/)) { Alert.alert('Fecha inválida', 'Formato: AAAA-MM-DD'); return; }
    setSaving(true);
    try {
      await registrarPago({ cliente_id: clienteId, monto: n, mes_pagado: mes, fecha_pago: fecha, metodo_pago: metodo, numero_operacion: numeroOperacion.trim() || undefined });
      Alert.alert('✓ Pago registrado', `Pago de S/ ${n.toFixed(2)} registrado para ${mesLabel(mes)}.`, [
        { text: 'OK', onPress: () => { onSuccess(); onClose(); } },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el pago');
    } finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Título */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>Registrar Pago</Text>
              <Text style={s.sub} numberOfLines={1}>{clienteNombre}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Mes */}
            <Text style={s.label}>MES A PAGAR</Text>
            <View style={s.mesRow}>
              <TouchableOpacity style={s.mesArrow} onPress={() => cambiarMes(-1)}>
                <Text style={s.mesArrowText}>‹</Text>
              </TouchableOpacity>
              <View style={s.mesBadge}>
                <Text style={s.mesText}>{mesLabel(mes)}</Text>
              </View>
              <TouchableOpacity style={s.mesArrow} onPress={() => cambiarMes(1)}>
                <Text style={s.mesArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Monto */}
            <Text style={s.label}>MONTO (S/)</Text>
            <View style={s.montoWrap}>
              <Text style={s.montoPrefix}>S/</Text>
              <TextInput
                style={s.montoInput}
                value={monto}
                onChangeText={setMonto}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor="#CBD5E1"
              />
            </View>

            {/* Fecha */}
            <Text style={s.label}>FECHA DE PAGO</Text>
            <TextInput
              style={s.input}
              value={fecha}
              onChangeText={setFecha}
              placeholder="AAAA-MM-DD"
              placeholderTextColor="#CBD5E1"
              keyboardType="numeric"
            />

            {/* Método */}
            <Text style={s.label}>MÉTODO DE PAGO</Text>
            <View style={s.metodosGrid}>
              {METODOS.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[s.metodoBtn, metodo === m.id && s.metodoBtnActive]}
                  onPress={() => setMetodo(m.id)}
                >
                  <Text style={s.metodoIcon}>{m.icon}</Text>
                  <Text style={[s.metodoLabel, metodo === m.id && s.metodoLabelActive]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Número de operación */}
            <Text style={s.label}>NÚMERO DE OPERACIÓN <Text style={{ color: '#CBD5E1' }}>(opcional)</Text></Text>
            <TextInput
              style={s.input}
              value={numeroOperacion}
              onChangeText={(t) => setNumeroOperacion(t.toUpperCase())}
              autoCapitalize="characters"
              placeholderTextColor="#CBD5E1"
            />

            {/* Botón */}
            <TouchableOpacity style={[s.btn, saving && s.btnDisabled]} onPress={guardar} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={s.btnText}>✓  Registrar Pago</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, maxHeight: '85%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '900', color: '#1E293B' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 2, maxWidth: 220 },
  closeBtn: { padding: 6 },
  closeText: { fontSize: 18, color: '#94A3B8' },

  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1E293B' },

  mesRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mesArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  mesArrowText: { fontSize: 22, color: '#475569', fontWeight: '700' },
  mesBadge: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  mesText: { fontSize: 16, fontWeight: '700', color: '#1E293B' },

  montoWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14 },
  montoPrefix: { fontSize: 18, fontWeight: '700', color: '#64748B', marginRight: 6 },
  montoInput: { flex: 1, paddingVertical: 12, fontSize: 22, fontWeight: '900', color: '#1E293B' },

  metodosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metodoBtn: { flex: 1, minWidth: '45%', borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: '#F8FAFC' },
  metodoBtnActive: { borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.06)' },
  metodoIcon: { fontSize: 22, marginBottom: 4 },
  metodoLabel: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  metodoLabelActive: { color: '#059669' },

  btn: { backgroundColor: '#059669', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, letterSpacing: 0.5 },
});
