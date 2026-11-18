import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getCliente, getCajasNap, getOnus, completarDatosInstalacion,
  subirEvidenciaInstalacion,
  type CajaNap, type Onu, type Borne, type ClienteDetalle,
} from '@/services/api';
import { elegirFoto } from '@/services/fotos';
import { SelectorCajaNap } from '@/components/SelectorCajaNap';
import { SelectorOnu } from '@/components/SelectorOnu';
import { alerta } from '@/components/Aviso';
import { COLORS } from '@/theme/colors';

/**
 * Completar la ficha de un cliente al que le faltan datos.
 *
 * Es la otra mitad del cliente migrado. Entró al sistema sin caja, sin borne
 * y sin equipo porque nadie los anotó cuando se instaló hace años, y el flujo
 * de instalación no sirve para arreglarlo: solo corre sobre clientes que
 * están esperando al técnico, y éste ya quedó activo.
 *
 * Va aquí, dentro de la avería, y no en una lista de pendientes aparte, por
 * una razón práctica: el técnico ya está parado en la casa, con el cliente
 * delante y la caja a diez metros. El dato le sale gratis en este momento y
 * le cuesta un viaje en cualquier otro. Una lista de deberes voluntarios no
 * compite con las órdenes del día — se construye y no la abre nadie.
 *
 * Si al cliente no le falta nada, no se pinta nada.
 */
export function CompletarFicha({
  clienteId,
  onListo,
}: {
  clienteId: number;
  onListo?: () => void;
}) {
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [cajas, setCajas] = useState<CajaNap[]>([]);
  const [onus, setOnus] = useState<Onu[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [cajaId, setCajaId] = useState<number | null>(null);
  const [borneNum, setBorneNum] = useState<number | null>(null);
  const [onuId, setOnuId] = useState<number | null>(null);
  const [fotoFachada, setFotoFachada] = useState<string | null>(null);
  const [fotoCaja, setFotoCaja] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const c = await getCliente(clienteId);
      setCliente(c);
      // El inventario solo hace falta si de verdad hay algo que completar:
      // en la mayoría de las averías esto no se pinta y no vale la pena
      // gastar dos llamadas más.
      if (c.faltan_datos) {
        const [cj, o] = await Promise.all([
          getCajasNap(),
          getOnus({ estado: 'asignado_tecnico' }),
        ]);
        const deSuZona = cj.filter((x) => x.zona_id === c.zona?.id);
        setCajas(deSuZona.length ? deSuZona : cj);
        setOnus(o);
      }
    } catch {
      // Silencio a propósito: esto es un extra dentro de otra pantalla. Si
      // falla, el técnico sigue resolviendo su avería, que es a lo que vino.
    }
  }, [clienteId]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!cliente) return null;

  const faltanDatos = cliente.faltan_datos === true;
  const sinFotos = cliente.sin_fotos === true;
  if (!faltanDatos && !sinFotos) return null;

  const cajaElegida = cajas.find((c) => c.id === cajaId) ?? null;
  const bornes: Borne[] = cajaElegida?.bornes ?? [];

  const pendientes = [
    faltanDatos ? 'la caja, el borne y el equipo' : null,
    sinFotos ? 'las fotos' : null,
  ].filter(Boolean).join(' y ');

  async function guardar() {
    const hayPlanta = cajaId != null || onuId != null;
    const hayFotos = fotoFachada != null || fotoCaja != null;
    if (!hayPlanta && !hayFotos) {
      alerta('Nada que guardar', 'Registra al menos un dato o una foto.');
      return;
    }
    // La caja y el borne van juntos: el borne 3 existe en todas las cajas,
    // solo significa algo junto a la suya.
    if ((cajaId == null) !== (borneNum == null)) {
      alerta(
        'Falta el borne',
        cajaId != null
          ? 'Elegiste la caja pero no el borne. Marca en cuál está conectado.'
          : 'Elegiste un borne sin su caja.',
      );
      return;
    }

    setGuardando(true);
    try {
      if (hayPlanta) {
        await completarDatosInstalacion(clienteId, {
          caja_nap_id: cajaId,
          numero_borne: borneNum,
          onu_id: onuId,
        });
      }
      // Las fotos van después y aparte: si una falla, lo de planta ya quedó
      // guardado y no se pierde el viaje.
      if (fotoFachada) {
        await subirEvidenciaInstalacion(clienteId, fotoFachada, 'Fachada de la vivienda (cliente migrado)');
      }
      if (fotoCaja) {
        await subirEvidenciaInstalacion(clienteId, fotoCaja, 'Caja NAP — precinto y puerto usado (cliente migrado)');
      }
      alerta('Ficha actualizada', 'Gracias — este cliente ya tiene sus datos registrados.');
      setAbierto(false);
      setCajaId(null);
      setBorneNum(null);
      setOnuId(null);
      setFotoFachada(null);
      setFotoCaja(null);
      await cargar();
      onListo?.();
    } catch (e: any) {
      alerta('No se pudo guardar', e?.message ?? 'Revisa los datos e inténtalo otra vez.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={s.tarjeta}>
      <View style={s.cabeceraFila}>
        <Ionicons name="time-outline" size={20} color={COLORS.brandStrong} />
        <View style={{ flex: 1 }}>
          <Text style={s.titulo}>Ficha incompleta</Text>
          <Text style={s.texto}>
            {'Es un cliente del sistema anterior: le faltan ' + pendientes +
              '. Ya que estás acá, puedes registrarlo ahora.'}
          </Text>
        </View>
      </View>

      {!abierto && (
        <TouchableOpacity style={s.botonAbrir} onPress={() => setAbierto(true)} activeOpacity={0.85}>
          <Ionicons name="create-outline" size={17} color={COLORS.brandForeground} />
          <Text style={s.botonAbrirTexto}>Completar datos</Text>
        </TouchableOpacity>
      )}

      {abierto && (
        <View style={s.formulario}>
          {faltanDatos && (
            <>
              <Text style={s.rotulo}>CAJA NAP</Text>
              <SelectorCajaNap
                cajas={cajas}
                valor={cajaId}
                onChange={(id) => { setCajaId(id); setBorneNum(null); }}
              />

              {cajaElegida && (
                <>
                  <Text style={s.rotulo}>BORNE</Text>
                  <View style={s.bornesGrid}>
                    {bornes.map((b) => {
                      // Un borne ocupado por otro no se puede elegir, pero el
                      // que ya es de este cliente sí: puede que el dato esté
                      // bien y solo falte el equipo.
                      const suyo = b.cliente_id === clienteId;
                      const libre = b.estado === 'libre' || suyo;
                      const activo = borneNum === b.numero;
                      return (
                        <TouchableOpacity
                          key={b.id}
                          disabled={!libre}
                          onPress={() => setBorneNum(b.numero)}
                          style={[
                            s.borne,
                            !libre && s.borneBloqueado,
                            activo && s.borneActivo,
                          ]}
                        >
                          <Text style={[s.borneNum, activo && { color: COLORS.white }]}>
                            {b.numero}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={s.rotulo}>EQUIPO INSTALADO</Text>
              <SelectorOnu
                onus={onus}
                valor={onuId}
                onChange={setOnuId}
                placeholder="Elegir equipo"
                vacio="No tienes equipos en tu inventario. Escanea el que tiene puesto desde Órdenes → Escanear."
              />
            </>
          )}

          <Text style={s.rotulo}>FOTOS</Text>
          <BotonFoto
            uri={fotoFachada}
            etiqueta="Fachada de la vivienda"
            onPress={async () => {
              const uri = await elegirFoto('Fachada de la vivienda');
              if (uri) setFotoFachada(uri);
            }}
          />
          <BotonFoto
            uri={fotoCaja}
            etiqueta="Caja NAP con el puerto usado"
            onPress={async () => {
              const uri = await elegirFoto('Caja NAP');
              if (uri) setFotoCaja(uri);
            }}
          />

          <View style={s.acciones}>
            <TouchableOpacity
              style={s.botonCancelar}
              onPress={() => setAbierto(false)}
              disabled={guardando}
            >
              <Text style={s.botonCancelarTexto}>Ahora no</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.botonGuardar, guardando && { opacity: 0.6 }]}
              onPress={guardar}
              disabled={guardando}
              activeOpacity={0.85}
            >
              {guardando
                ? <ActivityIndicator color={COLORS.brandForeground} />
                : <Text style={s.botonGuardarTexto}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function BotonFoto({
  uri, etiqueta, onPress,
}: {
  uri: string | null;
  etiqueta: string;
  onPress: () => void;
}) {
  return (
    <>
      <TouchableOpacity style={[s.fotoBtn, uri && s.fotoBtnHecha]} onPress={onPress}>
        <Ionicons
          name={uri ? 'checkmark-circle' : 'camera-outline'}
          size={19}
          color={uri ? COLORS.success : COLORS.mutedForeground}
        />
        <Text style={[s.fotoBtnTexto, uri && { color: COLORS.success }]}>
          {uri ? etiqueta + ' — tocar para repetir' : etiqueta}
        </Text>
      </TouchableOpacity>
      {uri && <Image source={{ uri }} style={s.fotoPreview} />}
    </>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    backgroundColor: COLORS.lightbrand,
    borderWidth: 1, borderColor: COLORS.brandStrong,
    borderRadius: 16, padding: 14, marginBottom: 16,
  },
  cabeceraFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  titulo: { fontSize: 15, fontWeight: '800', color: COLORS.dark, marginBottom: 3 },
  texto: { fontSize: 13, color: COLORS.dark, lineHeight: 18 },

  botonAbrir: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: COLORS.brand, borderRadius: 12,
    paddingVertical: 12, marginTop: 13,
  },
  botonAbrirTexto: { color: COLORS.brandForeground, fontWeight: '800', fontSize: 14 },

  formulario: {
    marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: COLORS.brandStrong,
  },
  rotulo: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1,
    color: COLORS.dark, marginTop: 6, marginBottom: 2,
  },

  bornesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14, marginTop: 6 },
  borne: {
    width: 42, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  borneBloqueado: { opacity: 0.35 },
  borneActivo: { backgroundColor: COLORS.brandStrong, borderColor: COLORS.brandStrong },
  borneNum: { fontSize: 14, fontWeight: '800', color: COLORS.dark },

  fotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 12,
    backgroundColor: COLORS.card, marginTop: 8,
  },
  fotoBtnHecha: { borderColor: COLORS.success },
  fotoBtnTexto: { flex: 1, fontSize: 13.5, color: COLORS.mutedForeground, fontWeight: '600' },
  fotoPreview: { width: '100%', height: 150, borderRadius: 12, marginTop: 8 },

  acciones: { flexDirection: 'row', gap: 10, marginTop: 18 },
  botonCancelar: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  botonCancelarTexto: { fontSize: 14, fontWeight: '700', color: COLORS.mutedForeground },
  botonGuardar: {
    flex: 2, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.dark,
  },
  botonGuardarTexto: { fontSize: 14, fontWeight: '800', color: COLORS.onDark },
});
