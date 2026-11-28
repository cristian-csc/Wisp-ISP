import { useEffect, useMemo, useState } from 'react';
import PageHeader from 'src/components/shared/PageHeader';
import SectionCard from 'src/components/shared/SectionCard';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import { Input } from 'src/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import { getReporteInstalaciones, type ReporteInstalaciones } from 'src/lib/pagos';

/** Primer día del mes actual y hoy, en formato YYYY-MM-DD. */
function rangoMesActual(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fmt(primero), hasta: fmt(hoy) };
}

function soles(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

const ReporteInstalaciones = () => {
  const inicial = useMemo(rangoMesActual, []);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [data, setData] = useState<ReporteInstalaciones | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getReporteInstalaciones(desde, hasta)
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData(null))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [desde, hasta]);

  const r = data?.resumen;

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <Input type="date" className="w-40" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
      <span className="text-sm text-muted-foreground">a</span>
      <Input type="date" className="w-40" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Ingresos por instalación"
        descripcion="Cobro único de instalación, aparte de la cuota mensual"
        icono="tabler:tool"
        volver={{ a: '/finanzas/reporte-caja', texto: 'Volver a reporte de caja' }}
      />

      <SectionCard
        titulo="Resumen del período"
        icono="tabler:cash"
        descripcion="Solo cuenta el costo de instalación cobrado, no las mensualidades."
        extra={filtros}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icono="tabler:cash" etiqueta="Cobrado por instalación" valor={soles(r?.total ?? 0)} tono="brand" />
          <StatCard icono="tabler:receipt" etiqueta="Instalaciones cobradas" valor={r?.cantidad ?? 0} tono="primary" />
          <StatCard icono="tabler:calculator" etiqueta="Promedio por instalación" valor={soles(r?.promedio ?? 0)} tono="primary" />
          <StatCard
            icono="tabler:alert-triangle"
            etiqueta="Activadas sin cobro"
            valor={r?.sin_cargo ?? 0}
            tono={r && r.sin_cargo > 0 ? 'error' : 'primary'}
            nota={
              r && r.activaciones_zonas_con_cobro > 0
                ? `de ${r.activaciones_zonas_con_cobro} activación${r.activaciones_zonas_con_cobro === 1 ? '' : 'es'} en zonas que cobran`
                : undefined
            }
          />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard titulo="Por zona" icono="tabler:map-pin" sinRelleno>
          <div className="overflow-x-auto px-5 pb-5">
            {cargando ? null : !data || data.por_zona.length === 0 ? (
              <EmptyState icono="tabler:map-off" titulo="Sin cobros de instalación en el período" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zona</TableHead>
                    <TableHead className="text-end">Cobradas</TableHead>
                    <TableHead className="text-end">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.por_zona.map((z) => (
                    <TableRow key={z.zona_id}>
                      <TableCell className="font-medium">{z.zona_nombre}</TableCell>
                      <TableCell className="text-end">{z.cantidad}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{soles(z.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SectionCard>

        <SectionCard titulo="Por técnico instalador" icono="tabler:tool" sinRelleno>
          <div className="overflow-x-auto px-5 pb-5">
            {cargando ? null : !data || data.por_tecnico.length === 0 ? (
              <EmptyState icono="tabler:user-off" titulo="Sin cobros de instalación en el período" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-end">Cobradas</TableHead>
                    <TableHead className="text-end">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.por_tecnico.map((t) => (
                    <TableRow key={t.tecnico_id ?? 'sin'}>
                      <TableCell className="font-medium">{t.tecnico_nombre}</TableCell>
                      <TableCell className="text-end">{t.cantidad}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{soles(t.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        titulo="Control de fugas"
        icono="tabler:alert-triangle"
        descripcion="Clientes activados en el período, de zonas que cobran, a los que no se les registró el costo de instalación."
        sinRelleno
      >
        <div className="overflow-x-auto px-5 pb-5">
          {cargando ? null : !data || data.fugas.length === 0 ? (
            <EmptyState
              icono="tabler:circle-check"
              titulo="Sin fugas"
              descripcion="Todas las activaciones de zonas que cobran tienen su costo de instalación registrado."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Activado</TableHead>
                  <TableHead className="text-end">Costo de la zona</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.fugas.map((f) => (
                  <TableRow key={f.cliente_id}>
                    <TableCell className="font-medium">{f.cliente_nombre}</TableCell>
                    <TableCell>{f.zona_nombre}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {f.fecha_activacion ? new Date(f.fecha_activacion).toLocaleDateString('es-PE') : '—'}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{soles(f.costo_zona)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default ReporteInstalaciones;
