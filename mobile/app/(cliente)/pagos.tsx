import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { getMisPagos, Pago } from '@/services/api';
import { COLORS } from '@/theme/colors';

const METODO_ICON: Record<string, string> = {
  efectivo: '💵', transferencia: '🏦', deposito: '🏧', tarjeta: '💳',
};
const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(d: string) { const [y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function formatMes(mes: string) { const [y,m]=mes.split('-'); return `${MESES[parseInt(m,10)]} ${y}`; }

function PagoCard({ item }: { item: Pago }) {
  return (
    <View style={s.card}>
      <View style={s.cardLeft}>
        <View style={s.iconCircle}>
          <Text style={{ fontSize: 20 }}>{METODO_ICON[item.metodo_pago] ?? '💰'}</Text>
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
          <Text style={s.pagadoText}>✓ Pagado</Text>
        </View>
        {item.numero_operacion && <Text style={s.ref}>N° operación: {item.numero_operacion}</Text>}
      </View>
    </View>
  );
}

export default function MisPagosScreen() {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (p=1) => {
    try {
      const data = await getMisPagos(p);
      setPagos(p===1 ? data.items : prev=>[...prev,...data.items]);
      setTotalPages(data.pages);
      setPage(p);
    } catch {}
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, []);

  useEffect(() => { load(1); }, []);

  if (loading) return <ActivityIndicator style={{ flex:1, backgroundColor: COLORS.background }} color={COLORS.primary} size="large" />;

  return (
    <FlatList
      style={s.container}
      data={pagos}
      keyExtractor={i=>String(i.id)}
      renderItem={({item})=><PagoCard item={item}/>}
      contentContainerStyle={{ padding:16, paddingBottom:40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load(1);}} tintColor={COLORS.primary}/>}
      onEndReached={()=>{if(page<totalPages&&!loadingMore){setLoadingMore(true);load(page+1);}}}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={pagos.length>0
        ? <Text style={s.total}>{pagos.length} pago{pagos.length!==1?'s':''} registrado{pagos.length!==1?'s':''}</Text>
        : null}
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={{fontSize:48}}>📭</Text>
          <Text style={s.emptyText}>Sin pagos registrados</Text>
        </View>
      }
      ListFooterComponent={loadingMore?<ActivityIndicator color={COLORS.primary} style={{marginTop:12}}/>:null}
    />
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
  pagadoBadge: { backgroundColor:'rgba(16,185,129,0.1)', borderRadius:8, paddingHorizontal:7, paddingVertical:3, marginTop:4 },
  pagadoText: { fontSize:11, color:'#059669', fontWeight:'700' },
  ref: { fontSize:11, color:'#94A3B8', marginTop:4 },
  empty: { alignItems:'center', marginTop:80 },
  emptyText: { color:'#94A3B8', marginTop:12, fontSize:15 },
});
