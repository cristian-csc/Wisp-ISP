import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '@/theme/colors';

/** Modal de texto libre multi-línea, cross-platform (Alert.prompt es solo iOS). */
export function PromptModal({ visible, title, placeholder, onCancel, onSubmit, submitLabel = 'Enviar' }: {
  visible: boolean;
  title: string;
  placeholder?: string;
  onCancel: () => void;
  onSubmit: (texto: string) => Promise<void> | void;
  submitLabel?: string;
}) {
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (visible) setTexto(''); }, [visible]);

  async function submit() {
    if (!texto.trim()) return;
    setSaving(true);
    try {
      await onSubmit(texto.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          <TextInput
            style={s.input}
            value={texto}
            onChangeText={setTexto}
            placeholder={placeholder}
            placeholderTextColor={COLORS.placeholder}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            autoFocus
          />
          <View style={s.row}>
            <TouchableOpacity style={s.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={s.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn, (!texto.trim() || saving) && { opacity: 0.6 }]} onPress={submit} disabled={!texto.trim() || saving}>
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={s.submitText}>{submitLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,37,54,0.5)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 20 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: 12 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.dark, minHeight: 80 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: '#64748B', fontWeight: '700', fontSize: 13 },
  submitBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
});
