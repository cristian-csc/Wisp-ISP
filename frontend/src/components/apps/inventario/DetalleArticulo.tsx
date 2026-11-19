import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from 'src/components/ui/sheet';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import LoadingState from 'src/components/shared/LoadingState';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import ImprimirEtiquetas from './ImprimirEtiquetas';
import type { Etiqueta } from 'src/lib/etiquetas';
import { ROL_LABEL } from 'src/lib/permisos';
import { fechaHora, soles } from 'src/lib/formato';
import {
  ESTADO_ACTIVO,
  ajustarStock,
  cantidadConUnidad,
  etiquetarPorPieza,
  getArticulo,
  listActivos,
  palabraUnidad,
  type Activo,
  type DetalleArticulo as Detalle,
} from 'src/lib/inventario';
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
  const [piezas, setPiezas] = useState<Activo[] | null>(null);
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [imprimiendo, setImprimiendo] = useState<{ etiquetas: Etiqueta[]; copias: boolean } | null>(null);
  const [confirmarPieza, setConfirmarPieza] = useState(false);

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

  const porPieza = detalle?.articulo.id === articuloId && detalle?.articulo.controla_por_unidad;
  useEffect(() => {
    if (articuloId == null || !porPieza) {
      setPiezas(null);
      return;
    }
    let vigente = true;
    listActivos(articuloId)
      .then((ps) => vigente && setPiezas(ps))
      .catch(() => vigente && setPiezas([]));
    return () => {
      vigente = false;
    };
  }, [articuloId, porPieza, version]);

  useEffect(() => {
    setMarcadas(new Set());
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

  async function pasarAPieza() {
    if (!detalle) return;
    try {
      const nuevas = await etiquetarPorPieza(detalle.articulo.id);
      toast.success(`${nuevas.length} pieza${nuevas.length === 1 ? '' : 's'} con etiqueta`);
      onCambio();
      if (nuevas.length) setImprimiendo({ etiquetas: nuevas.map(etiquetaDe), copias: false });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo pasar a etiqueta por pieza');
    }
  }

  function etiquetaDe(p: Activo): Etiqueta {
    return { codigo: p.codigo, titulo: p.articulo_nombre, detalle: p.numero_serie ? `S/N ${p.numero_serie}` : null };
  }

  const vigentes = (piezas ?? []).filter((p) => p.estado === 'almacen' || p.estado === 'asignado');

  function imprimirPiezas() {
    const elegidas = marcadas.size ? (piezas ?? []).filter((p) => marcadas.has(p.id)) : vigentes;
    setImprimiendo({ etiquetas: elegidas.map(etiquetaDe), copias: false });
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
                <p className="mt-1.5 text-xs text-muted-foreground">{palabraUnidad(a, 2)}</p>
              </div>
            </div>

            {/* La etiqueta del material la puede imprimir cualquiera que vea el stock. */}
            {(
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
                {!a.controla_por_unidad && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setImprimiendo({
                        etiquetas: [{ codigo: a.codigo, titulo: a.nombre, detalle: [a.marca, a.modelo].filter(Boolean).join(' ') || a.categoria.nombre }],
                        copias: true,
                      })
                    }
                  >
                    <Icon icon="tabler:barcode" width={16} /> Etiqueta
                  </Button>
                )}
                {puedeGestionar && !a.controla_por_unidad && (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmarPieza(true)}>
                    <Icon icon="tabler:tags" width={16} /> Etiquetar cada pieza
                  </Button>
                )}
                {puedeAjustar && !a.controla_por_unidad && (
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

            {a.controla_por_unidad && (
              <section className="border-b border-ld px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Piezas con etiqueta{' '}
                    <span className="font-normal text-muted-foreground">
                      · {vigentes.length} en uso{piezas && piezas.length > vigentes.length ? `, ${piezas.length - vigentes.length} instaladas o de baja` : ''}
                    </span>
                  </h3>
                  <Button size="sm" variant="outline" onClick={imprimirPiezas} disabled={!piezas || (marcadas.size === 0 && vigentes.length === 0)}>
                    <Icon icon="tabler:printer" width={16} />
                    {marcadas.size ? `Imprimir ${marcadas.size}` : 'Imprimir etiquetas'}
                  </Button>
                </div>
                {piezas === null ? (
                  <LoadingState filas={2} />
                ) : piezas.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Aún no hay piezas: se crean al registrar una entrada.</p>
                ) : (
                  <ul className="mt-3 flex max-h-72 flex-col overflow-y-auto rounded-lg border border-ld">
                    {piezas.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 border-b border-ld px-3 py-2 last:border-0">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--brand)]"
                          aria-label={`Marcar ${p.codigo}`}
                          checked={marcadas.has(p.id)}
                          onChange={(e) =>
                            setMarcadas((m) => {
                              const n = new Set(m);
                              if (e.target.checked) n.add(p.id);
                              else n.delete(p.id);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-sm font-semibold">{p.codigo}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.numero_serie ? `S/N ${p.numero_serie}` : 'Sin número de serie'}
                            {p.persona && ` · ${p.persona.nombre}`}
                            {p.cliente_nombre && ` · ${p.cliente_nombre}`}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${ESTADO_ACTIVO[p.estado].clase}`}>
                          {ESTADO_ACTIVO[p.estado].texto}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
                      <span className="text-sm font-semibold tabular-nums">{cantidadConUnidad(cantidad, a)}</span>
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
                          {m.activo_codigo && <span className="font-mono text-xs text-muted-foreground">{m.activo_codigo}</span>}
                          {m.persona && <span className="text-sm text-muted-foreground">· {m.persona.nombre}</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {fechaHora(m.creado_en)} · registró {m.registrado_por.nombre}
                          {m.documento && <> · {m.documento}</>}
                        </p>
                        {m.cliente_id && (
                          <p className="mt-1 text-xs">
                            En{' '}
                            <Link to={`/clientes/${m.cliente_id}`} className="font-medium hover:underline">
                              {m.cliente_nombre}
                            </Link>
                          </p>
                        )}
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
      <ImprimirEtiquetas
        open={imprimiendo != null}
        onOpenChange={(o) => !o && setImprimiendo(null)}
        etiquetas={imprimiendo?.etiquetas ?? []}
        conCopias={imprimiendo?.copias}
        titulo={imprimiendo?.copias ? 'Etiqueta del material' : 'Etiquetas de las piezas'}
      />
      <ConfirmDialog
        open={confirmarPieza}
        onOpenChange={setConfirmarPieza}
        title="Etiquetar cada pieza"
        description={
          a
            ? `Se crea un código para cada una de las ${a.stock + a.en_personal} piezas de «${a.nombre}»: las del almacén y las que ya tiene el personal. Desde ahí se entregan y devuelven pasando la etiqueta. No se puede deshacer.`
            : undefined
        }
        confirmText="Crear etiquetas"
        loadingText="Creando…"
        tone="primary"
        icon="tabler:tags"
        onConfirm={pasarAPieza}
      />
    </Sheet>
  );
};

export default DetalleArticulo;
