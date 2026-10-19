import { useEffect, useState } from 'react';
import CardBox from 'src/components/shared/CardBox';
import { Icon } from '@iconify/react';
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
import {
  getReporteCaja, getReporteMensualZonas,
  type ReporteCaja, type ReporteZona,
} from 'src/lib/pagos';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];

const ROL_LABEL: Record<string, string> = {
  super_admin: 'Desarrollador',
  admin: 'Administrador',
  subadmin: 'Sub-administrador',
  tecnico: 'Técnico',
  vendedor_campo: 'Vendedor de campo',
  vendedor_tienda: 'Atención al cliente',
};

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl">Reporte de Caja</h1>
        <p className="text-sm text-muted-foreground">Corte de caja diario y recaudación mensual por zona</p>
      </div>

      {/* ── Corte de caja diario ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Corte de caja del día</h2>
        <div className="flex gap-2">
          <Input type="date" className="w-44" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <Select value={zonaDia} onValueChange={setZonaDia}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las zonas</SelectItem>
              {zonas.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CardBox className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon icon="tabler:cash" height={22} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total recaudado</p>
              <p className="text-xl font-bold">S/ {(caja?.total ?? 0).toFixed(2)}</p>
            </div>
          </div>
        </CardBox>
        <CardBox className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon icon="tabler:receipt" height={22} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagos registrados</p>
              <p className="text-xl font-bold">{caja?.cantidad_pagos ?? 0}</p>
            </div>
          </div>
        </CardBox>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CardBox>
          <h3 className="text-sm font-semibold mb-4">Por método de pago</h3>
          {(!caja || caja.por_metodo.length === 0) && (
            <p className="text-sm text-muted-foreground">Sin pagos este día.</p>
          )}
          {caja?.por_metodo.map((m) => (
            <BarraFila
              key={m.metodo}
              label={METODO_LABEL[m.metodo] ?? capitalizar(m.metodo)}
              sublabel={`${m.cantidad} pago${m.cantidad === 1 ? '' : 's'}`}
              valor={m.total}
              max={maxMetodo}
              color={METODO_COLOR[m.metodo] ?? 'bg-muted-foreground'}
            />
          ))}
        </CardBox>

        <CardBox>
          <h3 className="text-sm font-semibold mb-4">Quién cobró</h3>
          {(!caja || caja.por_usuario.length === 0) && (
            <p className="text-sm text-muted-foreground">Sin pagos este día.</p>
          )}
          {caja?.por_usuario.map((u) => (
            <BarraFila
              key={u.usuario_id ?? 0}
              label={u.nombre}
              sublabel={u.rol ? ROL_LABEL[u.rol] ?? u.rol : undefined}
              valor={u.total}
              max={maxUsuario}
              color="bg-secondary"
            />
          ))}
        </CardBox>
      </div>

      <CardBox>
        <h3 className="text-sm font-semibold mb-3">Detalle del día</h3>
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
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin pagos registrados este día.</TableCell>
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
      </CardBox>

      {/* ── Recaudación mensual por zona ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
        <h2 className="text-lg font-semibold">Recaudación mensual por zona</h2>
        <div className="flex gap-2">
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
        </div>
      </div>

      <CardBox>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold">Total del mes: S/ {totalMesZonas.toFixed(2)}</h3>
        </div>
        {porZona.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos registrados este mes.</p>}
        {porZona.map((z) => (
          <BarraFila
            key={z.zona_id}
            label={z.zona_nombre}
            sublabel={`${z.cantidad_pagos} pagos · ${z.clientes_distintos} clientes`}
            valor={z.total}
            max={maxZona}
            color="bg-primary"
          />
        ))}
      </CardBox>
    </div>
  );
};

export default ReporteCajaView;
