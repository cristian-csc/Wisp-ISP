import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Switch, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { crearCliente, subirFotoFachada, getZonas, getPlanes, consultarDocumento} from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { UbicacionPickerModal } from './UbicacionPickerModal';
import { COLORS } from '@/theme/colors';

type Opcion = { id: number; nombre: string; precio?: number };
type Coords = { lat: number; lng: number };

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={f.label}>
      {text}{required ? <Text style={{ color: COLORS.error }}> *</Text> : null}
    </Text>
  );
}

function Input({ label, value, onChange, placeholder, keyboard = 'default', required = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboard?: any; required?: boolean;
}) {
  return (
    <View style={f.campo}>
      <Label text={label} required={required} />
      <TextInput
        style={f.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.placeholder}
        keyboardType={keyboard}
        autoCapitalize="none"
      />
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View style={f.section}>
      <View style={f.sectionHeader}>
        <Ionicons name={icon} size={16} color={COLORS.primary} />
        <Text style={f.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PlanChip({ plan, selected, onSelect }: { plan: Opcion; selected: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity style={[f.planChip, selected && f.planChipActive]} onPress={onSelect}>
      <Text style={[f.planNombre, selected && f.planNombreActive]}>{plan.nombre}</Text>
      {plan.precio !== undefined && (
        <Text style={[f.planPrecio, selected && { color: COLORS.primaryEmphasis }]}>S/ {plan.precio.toFixed(0)}/mes</Text>
      )}
    </TouchableOpacity>
  );
}

/** Formulario de captación de cliente — usado por admin, técnico y vendedor
 * de campo. El backend deriva usuario/clave PPPoE del DNI y el cliente queda
 * `pendiente_aprobacion` hasta que un administrador lo apruebe. El negocio
 * es exclusivamente fibra óptica, así que no hay opción de conexión inalámbrica. */
export function ClienteRegistroForm({ onDone }: { onDone: (nombre: string) => void }) {
  const { session } = useSession();
  // Solo campo (técnico/vendedor_campo) está físicamente en la vivienda al
  // registrar — a ellos sí se les exige la foto. Oficina/tienda registra por
  // teléfono, no puede tomarla; queda pendiente hasta que el técnico instale.
  const fotoObligatoria = session?.role === 'tecnico' || session?.role === 'vendedor_campo';

  const [zonas,  setZonas]  = useState<Opcion[]>([]);
  const [planes, setPlanes] = useState<Opcion[]>([]);
  const [saving, setSaving] = useState(false);

  const [tipoDoc,   setTipoDoc]   = useState<'dni' | 'ruc'>('dni');
  const [nombre,    setNombre]    = useState('');
  const [dni,       setDni]       = useState('');
  const [ruc,       setRuc]       = useState('');
  const [responsable, setResponsable] = useState('');
  // Aviso de la consulta automatica: nunca bloquea el registro
  const [avisoDni,  setAvisoDni]  = useState<string | null>(null);
  const [avisoRuc,  setAvisoRuc]  = useState<string | null>(null);
  const [buscando,  setBuscando]  = useState<'dni' | 'ruc' | null>(null);
  // Si el nombre lo trajo la consulta, al cambiar el documento se reemplaza.
  // Si lo escribio el vendedor, se respeta y no se pisa.
  const [nombreAuto, setNombreAuto] = useState(false);
  const [responsableAuto, setResponsableAuto] = useState(false);
  const [telefono,  setTelefono]  = useState('');
  const [direccion, setDireccion] = useState('');

  const [zonaId, setZonaId] = useState<number | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);

  const [tieneTV, setTieneTV] = useState(false);
  const [notas, setNotas] = useState('');

  const [coords, setCoords] = useState<Coords | null>(null);
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  useEffect(() => {
    getZonas().then(setZonas).catch(() => {});
    getPlanes().then(setPlanes).catch(() => {});
  }, []);

  async function tomarFoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso necesario', 'Activa el permiso de cámara para tomar la foto de la fachada.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setFotoUri(result.assets[0].uri);
    }
  }

  /** Al completar el documento se busca el nombre. Si falla, se escribe el
   *  motivo y el campo queda para llenarlo a mano: el registro no se detiene. */
  async function buscarNombre(tipo: 'dni' | 'ruc', numero: string) {
    const poner = tipo === 'dni' ? setAvisoDni : setAvisoRuc;
    setBuscando(tipo);
    poner('Buscando el nombre…');
    try {
      const r = await consultarDocumento(tipo, numero);
      // Se sobrescribe solo lo que puso una consulta anterior: si el vendedor
      // escribio el nombre a mano, se queda como lo dejo. Y si el documento
      // cambio y el nuevo no se encontro, se limpia en vez de dejarlo desfasado.
      const alResponsable = tipo === 'dni' && tipoDoc === 'ruc';
      const ponerNombre = alResponsable ? setResponsable : setNombre;
      const marcarAuto = alResponsable ? setResponsableAuto : setNombreAuto;
      const eraAuto = alResponsable ? responsableAuto : nombreAuto;
      const valorActual = alResponsable ? responsable : nombre;

      if (r.encontrado && r.nombre) {
        const traido = r.nombre;
        if (eraAuto || !valorActual.trim()) {
          ponerNombre(traido);
          marcarAuto(true);
        }
      } else if (eraAuto) {
        ponerNombre('');
        marcarAuto(false);
      }
      poner(
        r.origen === 'sistema'
          ? r.motivo
          : r.encontrado
            ? 'Nombre traído automáticamente' + (r.uso?.aviso ? ` · quedan ${r.uso.restantes} consultas` : '')
            : r.motivo ?? 'No se pudo consultar',
      );
    } catch {
      poner('No se pudo consultar. Escribe el nombre a mano.');
    } finally {
      setBuscando(null);
    }
  }

  async function guardar() {
    const esEmpresa = tipoDoc === 'ruc';

    if (!nombre.trim() || !dni.trim() || !zonaId || !planId) {
      Alert.alert(
        'Campos requeridos',
        esEmpresa
          ? 'Completa: Razón social, DNI del responsable, Zona y Plan.'
          : 'Completa: Nombre, DNI, Zona y Plan.',
      );
      return;
    }
    if (dni.trim().length !== 8) {
      Alert.alert('DNI inválido', 'El DNI debe tener 8 dígitos.');
      return;
    }
    if (esEmpresa) {
      if (!/^(10|15|17|20)\d{9}$/.test(ruc.trim())) {
        Alert.alert('RUC inválido', 'El RUC debe tener 11 dígitos y empezar en 10, 15, 17 o 20.');
        return;
      }
      if (!responsable.trim()) {
        Alert.alert('Falta el responsable', 'Indica quién es el responsable del servicio en la empresa.');
        return;
      }
    }
    if (fotoObligatoria && !fotoUri) {
      Alert.alert('Falta la foto de la fachada', 'Como estás en campo, tienes que tomar la foto de la vivienda antes de registrar al cliente.');
      return;
    }
    setSaving(true);
    try {
      const { cliente } = await crearCliente({
        nombre:          nombre.trim(),
        tipo_documento:  tipoDoc,
        dni:             dni.trim(),
        ruc:             esEmpresa ? ruc.trim() : null,
        responsable_nombre: esEmpresa ? responsable.trim() : null,
        telefono:        telefono.trim() || null,
        telefono_whatsapp: telefono.trim() || null,
        direccion:       direccion.trim() || null,
        lat:             coords?.lat ?? null,
        lng:             coords?.lng ?? null,
        zona_id:         zonaId,
        plan_id:         planId,
        cantidad_tv:     tieneTV ? 1 : 0,
        tipo_conexion:   'fibra_optica',
        notas:           notas.trim() || null,
      });

      if (fotoUri) {
        try {
          await subirFotoFachada(cliente.id, fotoUri);
        } catch {
          Alert.alert('Cliente registrado', 'El cliente se guardó, pero la foto de la fachada no se pudo subir. Puedes intentarlo más tarde desde el detalle del cliente.');
        }
      }

      onDone(nombre.trim());
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo registrar el cliente');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={f.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Section title={tipoDoc === 'ruc' ? 'DATOS DE LA EMPRESA' : 'DATOS PERSONALES'} icon={tipoDoc === 'ruc' ? 'business-outline' : 'person-outline'}>
        {/* Tipo de cliente: cambia los campos que se piden debajo */}
        <View style={f.campo}>
          <Label text="Tipo de cliente" />
          <View style={f.tipoFila}>
            {([
              { v: 'dni' as const, etiqueta: 'Persona', icono: 'person-outline' as const },
              { v: 'ruc' as const, etiqueta: 'Empresa', icono: 'business-outline' as const },
            ]).map((op) => (
              <TouchableOpacity
                key={op.v}
                style={[f.tipoChip, tipoDoc === op.v && f.tipoChipActive]}
                onPress={() => setTipoDoc(op.v)}
                accessibilityRole="button"
                accessibilityState={{ selected: tipoDoc === op.v }}
              >
                <Ionicons
                  name={op.icono}
                  size={16}
                  color={tipoDoc === op.v ? '#fff' : COLORS.primary}
                />
                <Text style={[f.tipoChipText, tipoDoc === op.v && f.tipoChipTextActive]}>
                  {op.etiqueta}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input
          label={tipoDoc === 'ruc' ? 'Razón social' : 'Nombre completo'}
          value={nombre}
          onChange={(v) => { setNombre(v); setNombreAuto(false); }}
          placeholder={tipoDoc === 'ruc' ? 'Transportes del Sur S.A.C.' : undefined}
          required
        />

        {tipoDoc === 'ruc' && (
          <>
            <Input
              label="RUC"
              value={ruc}
              onChange={(v) => {
                const n = v.replace(/\D/g, '');
                setRuc(n);
                setAvisoRuc(null);
                if (n.length === 11) void buscarNombre('ruc', n);
              }}
              placeholder="11 dígitos"
              keyboard="numeric"
              required
            />
            {avisoRuc ? <Text style={f.avisoConsulta}>{avisoRuc}</Text> : null}
            <Input
              label="Responsable del servicio"
              value={responsable}
              onChange={(v) => { setResponsable(v); setResponsableAuto(false); }}
              placeholder="Gerente o persona de contacto"
              required
            />
          </>
        )}

        <View style={f.row}>
          <View style={{ flex: 1 }}>
            <Input
              label={tipoDoc === 'ruc' ? 'DNI del responsable' : 'DNI'}
              value={dni}
              onChange={(v) => {
                const n = v.replace(/\D/g, '');
                setDni(n);
                setAvisoDni(null);
                if (n.length === 8) void buscarNombre('dni', n);
              }}
              placeholder="8 dígitos"
              keyboard="numeric"
              required
            />
            {avisoDni ? <Text style={f.avisoConsulta}>{avisoDni}</Text> : null}
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Input label="WhatsApp / Teléfono" value={telefono} onChange={setTelefono} keyboard="phone-pad" />
          </View>
        </View>
        <Input label="Dirección" value={direccion} onChange={setDireccion} />
        <View style={f.pinHint}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 6, marginTop: 1 }} />
          <Text style={f.pinHintText}>
            {tipoDoc === 'ruc'
              ? 'El usuario y contraseña PPPoE se generan con el DNI del responsable, no con el RUC. El cliente queda pendiente de aprobación por un administrador.'
              : 'El usuario y contraseña PPPoE se generan automáticamente con el DNI. El cliente queda pendiente de aprobación por un administrador.'}
          </Text>
        </View>
      </Section>

      <Section title="UBICACIÓN Y FACHADA" icon="location-outline">
        {!fotoObligatoria && (
          <View style={f.pinHint}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={{ marginRight: 6, marginTop: 1 }} />
            <Text style={f.pinHintText}>Como registras por teléfono, la foto es opcional — el técnico la tomará al ir a instalar si todavía falta.</Text>
          </View>
        )}
        <TouchableOpacity style={[f.captureBtn, coords && f.captureBtnDone, !fotoObligatoria && { marginTop: 10 }]} onPress={() => setMapaAbierto(true)}>
          <Ionicons name={coords ? 'checkmark-circle' : 'map-outline'} size={19} color={coords ? COLORS.success : COLORS.primary} />
          <Text style={[f.captureBtnText, coords && { color: COLORS.success }]}>
            {coords ? `Ubicación marcada (${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}) — tocar para ajustar` : 'Marcar ubicación en el mapa'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[f.captureBtn, fotoUri && f.captureBtnDone, { marginTop: 10 }]} onPress={tomarFoto}>
          <Ionicons name={fotoUri ? 'checkmark-circle' : 'camera-outline'} size={19} color={fotoUri ? COLORS.success : COLORS.primary} />
          <Text style={[f.captureBtnText, fotoUri && { color: COLORS.success }]}>
            {fotoUri ? 'Foto de la fachada tomada — tocar para repetir' : `Tomar foto de la fachada${fotoObligatoria ? ' *' : ' (opcional)'}`}
          </Text>
        </TouchableOpacity>
        {fotoUri && <Image source={{ uri: fotoUri }} style={f.fotoPreview} />}
      </Section>

      <Section title="ZONA Y PLAN" icon="list-outline">
        <Label text="Zona" required />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, marginTop: 6 }}>
          {zonas.map(z => (
            <TouchableOpacity
              key={z.id}
              style={[f.zonaChip, zonaId === z.id && f.zonaChipActive]}
              onPress={() => setZonaId(z.id)}
            >
              <Text style={[f.zonaChipText, zonaId === z.id && f.zonaChipTextActive]}>{z.nombre}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Label text="Plan" required />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          {planes.map(p => (
            <PlanChip key={p.id} plan={p} selected={planId === p.id} onSelect={() => setPlanId(p.id)} />
          ))}
        </ScrollView>
      </Section>

      <Section title="SERVICIOS ADICIONALES" icon="tv-outline">
        <View style={f.switchRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="tv-outline" size={18} color={COLORS.dark} />
            <View>
              <Text style={f.switchLabel}>Servicio de TV</Text>
              <Text style={f.switchSub}>Incluye televisión</Text>
            </View>
          </View>
          <Switch
            value={tieneTV}
            onValueChange={setTieneTV}
            trackColor={{ true: COLORS.primary, false: COLORS.border }}
            thumbColor={COLORS.white}
          />
        </View>
      </Section>

      <Section title="NOTAS" icon="document-text-outline">
        <TextInput
          style={[f.input, f.textArea]}
          value={notas}
          onChangeText={setNotas}
          placeholder="Observaciones, referencia de ubicación..."
          placeholderTextColor={COLORS.placeholder}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </Section>

      <TouchableOpacity style={[f.guardarBtn, saving && f.guardarDisabled]} onPress={guardar} disabled={saving}>
        {saving
          ? <ActivityIndicator color={COLORS.white} />
          : (
            <>
              <Ionicons name="checkmark-circle-outline" size={19} color={COLORS.white} />
              <Text style={f.guardarText}>Registrar Cliente</Text>
            </>
          )}
      </TouchableOpacity>

      <UbicacionPickerModal
        visible={mapaAbierto}
        coordsIniciales={coords}
        onCancel={() => setMapaAbierto(false)}
        onConfirm={(c) => { setCoords(c); setMapaAbierto(false); }}
      />
    </ScrollView>
  );
}

const f = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  section: { backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.primary, letterSpacing: 1.5 },

  campo: { marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.dark },
  textArea: { minHeight: 80, paddingTop: 12 },

  captureBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: COLORS.background },
  captureBtnDone: { borderStyle: 'solid', borderColor: COLORS.success, backgroundColor: COLORS.lightsuccess },
  captureBtnText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.primary },
  fotoPreview: { width: '100%', height: 160, borderRadius: 12, marginTop: 10, backgroundColor: COLORS.muted },

  avisoConsulta: {
    fontSize: 12,
    color: COLORS.placeholder,
    marginTop: -8,
    marginBottom: 12,
  },
  tipoFila: {
    flexDirection: 'row',
    gap: 10,
  },
  tipoChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  tipoChipActive: {
    backgroundColor: COLORS.primary,
  },
  tipoChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  tipoChipTextActive: {
    color: '#fff',
  },
  zonaChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: COLORS.background },
  zonaChipActive: { borderColor: COLORS.info, backgroundColor: COLORS.lightinfo },
  zonaChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  zonaChipTextActive: { color: COLORS.info, fontWeight: '700' },

  planChip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10, minWidth: 100, backgroundColor: COLORS.background, alignItems: 'center' },
  planChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.lightprimary },
  planNombre: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  planNombreActive: { color: COLORS.primaryEmphasis },
  planPrecio: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  pinHint: { flexDirection: 'row', backgroundColor: COLORS.lightprimary, borderWidth: 1, borderColor: 'rgba(93,135,255,0.25)', borderRadius: 10, padding: 12, marginTop: 4 },
  pinHintText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18 },

  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  switchSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  guardarBtn: { flexDirection: 'row', gap: 8, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  guardarDisabled: { opacity: 0.7 },
  guardarText: { fontSize: 15, fontWeight: '900', color: COLORS.white, letterSpacing: 0.5 },
});
