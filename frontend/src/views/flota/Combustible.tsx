import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@iconify/react';
import PageHeader from 'src/components/shared/PageHeader';
import CardBox from 'src/components/shared/CardBox';
import SectionCard from 'src/components/shared/SectionCard';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import FotoRemota from 'src/components/shared/FotoRemota';
import { Button } from 'src/components/ui/button';
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
import {
  getReporteCombustible,
  listRecargas,
  eliminarRecarga,
  getRecargaFotoBlobUrl,
  type ReporteUnidad,
  type Recarga,
} from 'src/lib/flota';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' }, { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' }, { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' }, { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
];
const hoy = new Date();
const ANIOS = Array.from({ length: 4 }, (_, i) => String(hoy.getFullYear() - i));

function fechaCorta(iso: string) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

const Combustible = () => {
  const [mesSel, setMesSel] = useState(String(hoy.getMonth() + 1).padStart(2, '0'));
  const [anioSel, setAnioSel] = useState(String(hoy.getFullYear()));
  const mes = `${anioSel}-${mesSel}`;

  const [reporte, setReporte] = useState<ReporteUnidad[]>([]);
  const [recargas, setRecargas] = useState<Recarga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<number | null>(null); // unidad_id o null = todas
  const [aBorrar, setABorrar] = useState<Recarga | null>(null);

  function cargar() {
    setCargando(true);
    Promise.all([
      getReporteCombustible(mes),
      listRecargas({ mes, per_page: 100 }),
    ])
      .then(([rep, pag]) => {
        setReporte(rep);
        setRecargas(pag.items);
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
    setFiltro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  const totalMes = useMemo(() => reporte.reduce((s, r) => s + r.total, 0), [reporte]);
  const detalle = filtro == null ? recargas : recargas.filter((r) => r.unidad_id === filtro);

  async function borrar() {
    if (!aBorrar) return;
    try {
      await eliminarRecarga(aBorrar.id);
      toast.success('Recarga eliminada');
      cargar();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'No se pudo eliminar');
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Combustible"
        descripcion="Cuánto gasta cada unidad en combustible, con la foto del surtidor y la boleta."
        icono="solar:gas-station-linear"
        acciones={
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
                {ANIOS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {cargando ? (
        <LoadingState />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Total del mes */}
          <CardBox className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total del mes</p>
              <p className="text-3xl font-bold">S/ {totalMes.toFixed(2)}</p>
            </div>
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-lightprimary text-primary-text">
              <Icon icon="solar:gas-station-linear" width={26} />
            </span>
          </CardBox>

          {/* Reporte por unidad */}
          {reporte.length === 0 ? (
            <EmptyState
              icono="solar:gas-station-linear"
              titulo="Sin recargas este mes"
              descripcion="Cuando el personal cargue combustible desde la app, aparecerá aquí el gasto por unidad."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reporte.map((r) => {
                const activo = filtro === r.unidad_id;
                return (
                  <CardBox
                    key={r.unidad_id}
                    onClick={() => setFiltro(activo ? null : r.unidad_id)}
                    className={`cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${activo ? 'ring-2 ring-primary' : ''}`}
                  >
                    <div className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                      <Icon icon="tabler:car" height={13} />
                      {[r.marca, r.modelo].filter(Boolean).join(' · ') || 'Unidad'}
                    </div>
                    <h3 className="mb-1 text-lg font-bold tracking-wide">{r.placa}</h3>
                    <p className="text-2xl font-bold">S/ {r.total.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.recargas} {r.recargas === 1 ? 'recarga' : 'recargas'} este mes
                    </p>
                  </CardBox>
                );
              })}
            </div>
          )}

          {/* Detalle */}
          {recargas.length > 0 && (
            <SectionCard
              titulo="Detalle de recargas"
              descripcion={filtro != null ? 'Filtrado por la unidad seleccionada' : 'Todas las recargas del mes'}
              sinRelleno
              extra={
                filtro != null ? (
                  <Button variant="outline" size="sm" onClick={() => setFiltro(null)}>
                    <Icon icon="tabler:x" width={16} /> Ver todas
                  </Button>
                ) : undefined
              }
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead>Registró</TableHead>
                      <TableHead>Surtidor</TableHead>
                      <TableHead>Boleta</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalle.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{fechaCorta(r.fecha)}</TableCell>
                        <TableCell className="font-semibold">{r.unidad_placa ?? `#${r.unidad_id}`}</TableCell>
                        <TableCell className="whitespace-nowrap font-semibold">S/ {r.monto.toFixed(2)}</TableCell>
                        <TableCell className="text-muted-foreground">{r.registrado_por_nombre ?? '—'}</TableCell>
                        <TableCell>
                          <FotoRemota
                            cargar={r.tiene_foto_surtidor ? () => getRecargaFotoBlobUrl(r.id, 'surtidor') : null}
                            clave={`${r.id}-s`}
                            alt="Foto del surtidor"
                            ampliable
                            className="h-12 w-16 rounded-md"
                          />
                        </TableCell>
                        <TableCell>
                          <FotoRemota
                            cargar={r.tiene_foto_boleta ? () => getRecargaFotoBlobUrl(r.id, 'boleta') : null}
                            clave={`${r.id}-b`}
                            alt="Foto de la boleta"
                            ampliable
                            className="h-12 w-16 rounded-md"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setABorrar(r)}
                            aria-label="Eliminar recarga"
                            className="text-error-text hover:text-error-text"
                          >
                            <Icon icon="tabler:trash" width={17} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={(o) => !o && setABorrar(null)}
        title="¿Eliminar esta recarga?"
        description="Se borra el registro y sus dos fotos. Esta acción no se puede deshacer."
        onConfirm={borrar}
      />
    </div>
  );
};

export default Combustible;
