import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, Modal, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMisPagos, getMiCuenta, Pago } from '@/services/api';
import { COLORS } from '@/theme/colors';

const METODO_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  efectivo: 'cash-outline', transferencia: 'swap-horizontal-outline', deposito: 'business-outline', tarjeta: 'card-outline',
};
const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', yape: 'Yape', plin: 'Plin', transferencia: 'Transferencia', deposito: 'Depósito', otro: 'Otro',
};
const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(d: string) { const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function formatMes(mes: string) { const [y,m]=mes.split('-'); return `${MESES[parseInt(m,10)]} ${y}`; }

function textoRecibo(item: Pago, nombreCliente: string) {
  return [
    'WISP — Internet para todos',
    'Comprobante de pago',
    '--------------------------------',
    `Folio: #${item.id}`,
    `Fecha de emisión: ${fmt(item.fecha_pago)}`,
    `Cliente: ${nombreCliente}`,
    `Mes pagado: ${formatMes(item.mes_pagado)}`,
    `Método de pago: ${METODO_LABEL[item.metodo_pago] ?? item.metodo_pago}`,
    item.numero_operacion ? `N° operación: ${item.numero_operacion}` : null,
    '--------------------------------',
    `TOTAL PAGADO: S/ ${item.monto.toFixed(2)}`,
    '',
    '¡Gracias por su pago!',
    'Comprobante interno — no es boleta ni factura electrónica (SUNAT)',
  ].filter(Boolean).join('\n');
}

function ReciboModal({ item, nombreCliente, onClose }: { item: Pago | null; nombreCliente: string; onClose: () => void }) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.ticket}>
          <Text style={s.ticketTitle}>WISP</Text>
          <Text style={s.ticketSub}>Comprobante de pago</Text>
          <View style={s.ticketDivider} />
          <Text style={s.ticketLine}>Folio: #{item.id}</Text>
          <Text style={s.ticketLine}>Fecha de emisión: {fmt(item.fecha_pago)}</Text>
          <View style={s.ticketDivider} />
          <Text style={s.ticketLine}>Cliente: {nombreCliente}</Text>
          <Text style={s.ticketLine}>Mes pagado: {formatMes(item.mes_pagado)}</Text>
          <Text style={s.ticketLine}>Método: {METODO_LABEL[item.metodo_pago] ?? item.metodo_pago}</Text>
          {item.numero_operacion && <Text style={s.ticketLine}>N° operación: {item.numero_operacion}</Text>}
          <View style={s.ticketDivider} />
          <Text style={s.ticketTotal}>TOTAL PAGADO: S/ {item.monto.toFixed(2)}</Text>
          <View style={s.ticketDivider} />
          <Text style={s.ticketFooter}>¡Gracias por su pago!</Text>
          <Text style={s.ticketFooterSmall}>Comprobante interno — no es boleta ni factura electrónica (SUNAT)</Text>

          <View style={s.ticketBtnRow}>
            <TouchableOpacity style={s.ticketBtn} onPress={() => Share.share({ message: textoRecibo(item, nombreCliente) })}>
              <Ionicons name="share-social-outline" size={16} color={COLORS.primary} />
              <Text style={s.ticketBtnText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ticketBtn, s.ticketBtnCerrar]} onPress={onClose}>
              <Text style={[s.ticketBtnText, { color: COLORS.white }]}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PagoCard({ item, onVerRecibo }: { item: Pago; onVerRecibo: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onVerRecibo} activeOpacity={0.8}>
      <View style={s.cardLeft}>
        <View style={s.iconCircle}>
          <Ionicons name={METODO_ICON[item.metodo_pago] ?? 'wallet-outline'} size={20} color={COLORS.primary} />
        </View>
        <View style={{ marginLeft: 12 }}>
          <Text style={s.mes}>{formatMes(item.mes_pagado)}</Text>
          <Text style={s.fecha}>Pagado {fmt(item.fecha_pago)}</Text>
          <Text style={s.metodo}>{item.metodo_pago.charAt(0).toUpperCase()+item.metodo_pago.slice(1)}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.monto}>S/ {item.monto.toFixed(2)}</Text>
        <View style={s.pagadoBadge}>
          <Ionicons name="checkmark-circle" size={11} color="#059669" />
          <Text style={s.pagadoText}>Pagado</Text>
        </View>
        {item.numero_operacion && <Text style={s.ref}>N° operación: {item.numero_operacion}</Text>}
        <Text style={s.verRecibo}>Ver recibo</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function MisPagosScreen() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nombreCliente, setNombreCliente] = useState('');
  const [reciboSeleccionado, setReciboSeleccionado] = useState<Pago | null>(null);

  const load = useCallback(async (p=1) => {
    try {
      const data = await getMisPagos(p);
      setPagos(p===1 ? data.items : prev=>[...prev,...data.items]);
      setTotalPages(data.pages);
      setPage(p);
    } catch {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    load(1);
    getMiCuenta().then((c) => setNombreCliente(c.nombre)).catch(() => {});
  }, []);

  if (loading) return <ActivityIndicator style={{ flex:1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <>
    <FlatList
      style={s.container}
      data={pagos}
      keyExtractor={i=>String(i.id)}
      renderItem={({item})=><PagoCard item={item} onVerRecibo={() => setReciboSeleccionado(item)}/>}
      contentContainerStyle={{ padding:16, paddingBottom:40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load(1);}} tintColor={COLORS.primary}/>}
      onEndReached={()=>{if(page<totalPages&&!loadingMore){setLoadingMore(true);load(page+1);}}}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={pagos.length>0
        ? <Text style={s.total}>{pagos.length} pago{pagos.length!==1?'s':''} registrado{pagos.length!==1?'s':''}</Text>
        : null}
      ListEmptyComponent={
        <View style={s.empty}>
          <Ionicons name="file-tray-outline" size={44} color="#CBD5E1" />
          <Text style={s.emptyText}>Sin pagos registrados</Text>
        </View>
      }
      ListFooterComponent={loadingMore?<ActivityIndicator color={COLORS.primary} style={{marginTop:12}}/>:null}
    />
    <ReciboModal item={reciboSeleccionado} nombreCliente={nombreCliente} onClose={() => setReciboSeleccionado(null)} />
    </>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8FAFC' },
  total: { color:'#94A3B8', fontSize:12, marginBottom:12, letterSpacing:0.5 },
  card: { backgroundColor:'#FFFFFF', borderRadius:14, borderWidth:1, borderColor:'#E2E8F0', padding:14, marginBottom:10, flexDirection:'row', justifyContent:'space-between', alignItems:'center', shadowColor:'#000', shadowOpacity:0.04, shadowRadius:6, elevation:1 },
  cardLeft: { flexDirection:'row', alignItems:'center', flex:1 },
  iconCircle: { width:44, height:44, borderRadius:22, backgroundColor:'#F1F5F9', alignItems:'center', justifyContent:'center' },
  mes: { fontSize:15, fontWeight:'700', color:'#1E293B' },
  fecha: { fontSize:12, color:'#94A3B8', marginTop:2 },
  metodo: { fontSize:12, color:'#64748B', marginTop:2 },
  monto: { fontSize:18, fontWeight:'900', color:'#059669' },
  pagadoBadge: { flexDirection:'row', alignItems:'center', gap:3, backgroundColor:'rgba(16,185,129,0.1)', borderRadius:8, paddingHorizontal:7, paddingVertical:3, marginTop:4 },
  pagadoText: { fontSize:11, color:'#059669', fontWeight:'700' },
  ref: { fontSize:11, color:'#94A3B8', marginTop:4 },
  verRecibo: { fontSize:11, color: COLORS.primary, fontWeight:'700', marginTop:6 },
  empty: { alignItems:'center', marginTop:80 },
  emptyText: { color:'#94A3B8', marginTop:12, fontSize:15 },

  modalBg: { flex:1, backgroundColor:'rgba(15,23,42,0.55)', justifyContent:'center', alignItems:'center', padding:24 },
  ticket: { backgroundColor:'#FFFFFF', borderRadius:16, padding:20, width:'100%', maxWidth:340 },
  ticketTitle: { fontSize:16, fontWeight:'900', color:'#1E293B', textAlign:'center' },
  ticketSub: { fontSize:12, color:'#64748B', textAlign:'center', marginTop:2, marginBottom:10 },
  ticketDivider: { borderTopWidth:1, borderTopColor:'#E2E8F0', borderStyle:'dashed', marginVertical:8 },
  ticketLine: { fontSize:13, color:'#334155', marginBottom:3 },
  ticketTotal: { fontSize:14, fontWeight:'900', color:'#1E293B', textAlign:'center' },
  ticketFooter: { fontSize:12, color:'#334155', textAlign:'center', marginTop:4 },
  ticketFooterSmall: { fontSize:10, color:'#94A3B8', textAlign:'center', marginTop:6 },
  ticketBtnRow: { flexDirection:'row', gap:10, marginTop:18 },
  ticketBtn: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, borderRadius:10, paddingVertical:11, borderWidth:1, borderColor: COLORS.primary },
  ticketBtnCerrar: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  ticketBtnText: { fontSize:13, fontWeight:'700', color: COLORS.primary },
});
