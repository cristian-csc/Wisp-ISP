import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import SectionCard from 'src/components/shared/SectionCard';
import StatCard from 'src/components/shared/StatCard';
import EmptyState from 'src/components/shared/EmptyState';
import { Input } from 'src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'src/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'src/components/ui/table';
import { listZonas, type Zona } from 'src/lib/zonas';
import { ROL_LABEL } from 'src/lib/permisos';
import BotonDescargarReporte from 'src/components/shared/BotonDescargarReporte';
import {
  getReporteCaja, getReporteMensualZonas,
  descargarReporteCaja, descargarReporteZonas,
  type ReporteCaja, type ReporteZona,
} from 'src/lib/pagos';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  transferencia: 'Transferencia',
};

const METODO_COLOR: Record<string, string> = {
  efectivo: 'bg-success',
  yape: 'bg-secondary',
  plin: 'bg-info',
  transferencia: 'bg-primary',
};

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BarraFila({ label, sublabel, valor, max, color }: {
  label: string; sublabel?: string; valor: number; max: number; color: string;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
        <span className="font-medium truncate">
          {label}
          {sublabel && <span className="text-xs text-muted-foreground ml-1.5">{sublabel}</span>}
        </span>
        <span className="font-semibold whitespace-nowrap">S/ {valor.toFixed(2)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const hoy = new Date();
const hoyStr = hoy.toISOString().split('T')[0];

const ReporteCajaView = () => {
  const [zonas, setZonas] = useState<Zona[]>([]);

  const [fecha, setFecha] = useState(hoyStr);
  const [zonaDia, setZonaDia] = useState('todas');
  const [caja, setCaja] = useState<ReporteCaja | null>(null);

  const [mesSel, setMesSel] = useState(String(hoy.getMonth() + 1).padStart(2, '0'));
  const [anioSel, setAnioSel] = useState(String(hoy.getFullYear()));
  const [porZona, setPorZona] = useState<ReporteZona[]>([]);

  useEffect(() => {
    listZonas().then(setZonas);
  }, []);

  useEffect(() => {
    getReporteCaja(fecha, zonaDia === 'todas' ? undefined : Number(zonaDia)).then(setCaja);
  }, [fecha, zonaDia]);

  useEffect(() => {
    getReporteMensualZonas(`${anioSel}-${mesSel}`).then(setPorZona);
  }, [mesSel, anioSel]);

  const maxMetodo = Math.max(1, ...(caja?.por_metodo.map((m) => m.total) ?? [0]));
  const maxUsuario = Math.max(1, ...(caja?.por_usuario.map((u) => u.total) ?? [0]));
  const maxZona = Math.max(1, ...porZona.map((z) => z.total));
  const totalMesZonas = porZona.reduce((n, z) => n + z.total, 0);

  const fechaLarga = new Date(`${fecha}T00:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lightprimary">
          <Icon icon="tabler:report-money" width={22} className="text-primary" />
        </span>
        <div>
          <h1 className="text-2xl">Reporte de Caja</h1>
          <p className="text-sm text-muted-foreground">Corte de caja diario y recaudación mensual por zona</p>
        </div>
      </div>

      {/* ── Corte de caja diario ── */}
      <SectionCard
        titulo="Corte de caja del día"
        icono="tabler:cash-banknote"
        descripcion={capitalizar(fechaLarga)}
        extra={
          <>
            <Input type="date" className="w-44" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <Select value={zonaDia} onValueChange={setZonaDia}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las zonas</SelectItem>
                {zonas.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            <BotonDescargarReporte
              titulo="Corte de caja de este día"
              onDescargar={(formato) =>
                descargarReporteCaja(formato, fecha, zonaDia === 'todas' ? undefined : Number(zonaDia))
              }
            />
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <StatCard icono="tabler:cash" etiqueta="Total recaudado" valor={`S/ ${(caja?.total ?? 0).toFixed(2)}`} tono="success" />
          <StatCard icono="tabler:receipt" etiqueta="Pagos registrados" valor={caja?.cantidad_pagos ?? 0} tono="primary" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Por método de pago</h4>
            {(!caja || caja.por_metodo.length === 0) ? (
              <EmptyState icono="tabler:credit-card-off" titulo="Sin pagos este día" />
            ) : (
              caja.por_metodo.map((m) => (
                <BarraFila
                  key={m.metodo}
                  label={METODO_LABEL[m.metodo] ?? capitalizar(m.metodo)}
                  sublabel={`${m.cantidad} pago${m.cantidad === 1 ? '' : 's'}`}
                  valor={m.total}
                  max={maxMetodo}
                  color={METODO_COLOR[m.metodo] ?? 'bg-muted-foreground'}
                />
              ))
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Quién cobró</h4>
            {(!caja || caja.por_usuario.length === 0) ? (
              <EmptyState icono="tabler:user-off" titulo="Sin pagos este día" />
            ) : (
              caja.por_usuario.map((u) => (
                <BarraFila
                  key={u.usuario_id ?? 0}
                  label={u.nombre}
                  sublabel={u.rol ? ROL_LABEL[u.rol] ?? u.rol : undefined}
                  valor={u.total}
                  max={maxUsuario}
                  color="bg-secondary"
                />
              ))
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard titulo="Detalle del día" icono="tabler:list-details" sinRelleno>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hora</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Zona</TableHead>
              <TableHead>Método</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Registrado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!caja || caja.pagos.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EmptyState icono="tabler:receipt-off" titulo="Sin pagos registrados este día" />
                </TableCell>
              </TableRow>
            )}
            {caja?.pagos.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">{p.hora ? new Date(p.hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                <TableCell className="text-sm">{p.cliente_nombre ?? `#${p.cliente_id}`}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.zona_nombre ?? '—'}</TableCell>
                <TableCell className="text-sm">{METODO_LABEL[p.metodo_pago] ?? capitalizar(p.metodo_pago)}</TableCell>
                <TableCell className="text-sm font-medium">S/ {p.monto.toFixed(2)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.registrado_por ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      {/* ── Recaudación mensual por zona ── */}
      <SectionCard
        titulo="Recaudación mensual por zona"
        icono="tabler:chart-bar"
        descripcion={`Total del mes: S/ ${totalMesZonas.toFixed(2)}`}
        extra={
          <>
            <Select value={mesSel} onValueChange={setMesSel}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={anioSel} onValueChange={setAnioSel}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 4 }, (_, i) => String(hoy.getFullYear() - i)).map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <BotonDescargarReporte
              titulo="Recaudación del mes por zona"
              onDescargar={(formato) => descargarReporteZonas(formato, `${anioSel}-${mesSel}`)}
            />
          </>
        }
      >
        {porZona.length === 0 ? (
          <EmptyState icono="tabler:map-off" titulo="Sin pagos registrados este mes" />
        ) : (
          porZona.map((z) => (
            <BarraFila
              key={z.zona_id}
              label={z.zona_nombre}
              sublabel={`${z.cantidad_pagos} pagos · ${z.clientes_distintos} clientes`}
              valor={z.total}
              max={maxZona}
              color="bg-primary"
            />
          ))
        )}
      </SectionCard>
    </div>
  );
};

export default ReporteCajaView;
