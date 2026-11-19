import { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from 'src/components/ui/sheet';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import LoadingState from 'src/components/shared/LoadingState';
import { ROL_LABEL } from 'src/lib/permisos';
import { fechaHora, soles } from 'src/lib/formato';
import { ajustarStock, cantidadConUnidad, getArticulo, palabraUnidad, type DetalleArticulo as Detalle } from 'src/lib/inventario';
import { BarraStock, CantidadMovimiento, EstadoStockBadge, TipoMovimientoEtiqueta, iniciales } from './piezas';
import type { InicialMovimiento } from './RegistrarMovimiento';

interface Props {
  articuloId: number | null;
  onClose: () => void;
  /** Cambia cada vez que se registra algo, para volver a leer el detalle. */
  version: number;
  puedeGestionar: boolean;
  puedeAjustar: boolean;
  onMover: (inicial: InicialMovimiento) => void;
  onEditar: () => void;
  onCambio: () => void;
}

const DetalleArticulo = ({ articuloId, onClose, version, puedeGestionar, puedeAjustar, onMover, onEditar, onCambio }: Props) => {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [contado, setContado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (articuloId == null) return;
    let vigente = true;
    getArticulo(articuloId)
      .then((d) => vigente && setDetalle(d))
      .catch(() => vigente && setDetalle(null));
    return () => {
      vigente = false;
    };
  }, [articuloId, version]);

  useEffect(() => {
    setAjustando(false);
    setContado('');
    setMotivo('');
    if (articuloId == null) setDetalle(null);
  }, [articuloId]);

  async function guardarAjuste() {
    if (!detalle) return;
    setGuardando(true);
    try {
      const m = await ajustarStock(detalle.articulo.id, Number(contado), motivo.trim());
      toast.success(`Stock corregido a ${m.stock_resultante} (${m.cantidad > 0 ? '+' : ''}${m.cantidad})`);
      setAjustando(false);
      setContado('');
      setMotivo('');
      onCambio();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo ajustar el stock');
    } finally {
      setGuardando(false);
    }
  }

  const a = detalle?.articulo;
  const cargado = a && a.id === articuloId;

  return (
    <Sheet open={articuloId != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {!cargado ? (
          <>
            <SheetTitle className="sr-only">Material</SheetTitle>
            <SheetDescription className="sr-only">Cargando el detalle</SheetDescription>
            <LoadingState />
          </>
        ) : (
          <>
            <header className="border-b border-ld px-6 pb-5 pt-6 pr-12">
              <p className="font-mono text-xs text-muted-foreground">{a.codigo}</p>
              <SheetTitle className="mt-1 text-xl font-semibold leading-tight">{a.nombre}</SheetTitle>
              <SheetDescription className="mt-1 text-sm text-muted-foreground">
                {[a.categoria.nombre, a.marca, a.modelo].filter(Boolean).join(' · ')}
              </SheetDescription>
              {!a.activo && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  <Icon icon="tabler:archive" width={13} /> Archivado
                </p>
              )}
            </header>

            <div className="grid grid-cols-3 gap-px border-b border-ld bg-border [&>*]:bg-card">
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground">En almacén</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{a.stock.toLocaleString('es-PE')}</p>
                <div className="mt-2">
                  <BarraStock stock={a.stock} minimo={a.stock_minimo} estado={a.estado} />
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground">Mínimo</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{a.stock_minimo.toLocaleString('es-PE')}</p>
                <div className="mt-1.5">
                  <EstadoStockBadge estado={a.estado} />
                </div>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground">Con el personal</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{a.en_personal.toLocaleString('es-PE')}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{palabraUnidad(a.unidad, 2)}</p>
              </div>
            </div>

            {(puedeGestionar || puedeAjustar) && (
              <div className="flex flex-wrap gap-2 border-b border-ld px-6 py-4">
                {puedeGestionar && (
                  <>
                    <Button size="sm" onClick={() => onMover({ tipo: 'asignacion', articulo_id: a.id })} disabled={a.stock === 0 || !a.activo}>
                      <Icon icon="tabler:user-share" width={16} /> Entregar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onMover({ tipo: 'entrada', articulo_id: a.id })} disabled={!a.activo}>
                      <Icon icon="tabler:arrow-bar-to-down" width={16} /> Entrada
                    </Button>
                    <Button size="sm" variant="outline" onClick={onEditar}>
                      <Icon icon="tabler:pencil" width={16} /> Editar
                    </Button>
                  </>
                )}
                {puedeAjustar && (
                  <Button size="sm" variant="ghost" onClick={() => setAjustando((v) => !v)} aria-expanded={ajustando}>
                    <Icon icon="tabler:adjustments" width={16} /> Ajustar por conteo
                  </Button>
                )}
              </div>
            )}

            {ajustando && (
              <div className="flex flex-col gap-3 border-b border-ld bg-surface-2 px-6 py-4">
                <p className="text-sm">
                  ¿Cuántos contaste en el almacén? El sistema dice <span className="font-semibold tabular-nums">{a.stock}</span>.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label="Cantidad contada"
                    placeholder="Contados"
                    value={contado}
                    onChange={(e) => setContado(e.target.value)}
                    className="tabular-nums sm:w-32"
                  />
                  <Input
                    aria-label="Motivo del ajuste"
                    placeholder="Motivo: conteo de fin de mes, merma…"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={255}
                  />
                </div>
                {contado !== '' && Number(contado) !== a.stock && (
                  <p className="text-xs text-muted-foreground">
                    Diferencia:{' '}
                    <span className="font-medium tabular-nums text-foreground">
                      {Number(contado) - a.stock > 0 ? '+' : ''}
                      {Number(contado) - a.stock}
                    </span>
                  </p>
                )}
                <div>
                  <Button
                    size="sm"
                    onClick={guardarAjuste}
                    disabled={guardando || contado === '' || Number(contado) < 0 || Number(contado) === a.stock || motivo.trim().length < 3}
                  >
                    Guardar ajuste
                  </Button>
                </div>
              </div>
            )}

            <section className="border-b border-ld px-6 py-5">
              <h3 className="text-sm font-semibold">Quién lo tiene</h3>
              {detalle.en_manos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nadie del personal tiene este material ahora.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {detalle.en_manos.map(({ persona, cantidad }) => (
                    <li key={persona.id} className="flex items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">
                        {iniciales(persona.nombre)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{persona.nombre}</span>
                        <span className="block text-xs text-muted-foreground">{ROL_LABEL[persona.rol] ?? persona.rol}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{cantidadConUnidad(cantidad, a.unidad)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Últimos movimientos</h3>
              {detalle.movimientos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Todavía no tiene movimientos.</p>
              ) : (
                <ol className="mt-3 flex flex-col">
                  {detalle.movimientos.map((m) => (
                    <li key={m.id} className="flex gap-3 border-b border-ld py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <TipoMovimientoEtiqueta tipo={m.tipo} />
                          {m.persona && <span className="text-sm text-muted-foreground">· {m.persona.nombre}</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fechaHora(m.creado_en)} · registró {m.registrado_por.nombre}
                          {m.documento && <> · {m.documento}</>}
                        </p>
                        {m.motivo && <p className="mt-1 text-xs text-foreground/80">{m.motivo}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <CantidadMovimiento m={m} />
                        <p className="text-xs tabular-nums text-muted-foreground">almacén {m.stock_resultante}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {a.costo_unitario != null && (
              <p className="mt-auto border-t border-ld px-6 py-4 text-xs text-muted-foreground">
                Costo por unidad {soles(a.costo_unitario)} · en almacén vale {soles(a.costo_unitario * a.stock)}
                {a.ubicacion && <> · {a.ubicacion}</>}
              </p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default DetalleArticulo;
