import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Cifra from 'src/components/shared/Cifra';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Switch } from 'src/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'src/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'src/components/ui/tooltip';
import RegistrarMovimiento, { type InicialMovimiento } from 'src/components/apps/inventario/RegistrarMovimiento';
import ArticuloDialog from 'src/components/apps/inventario/ArticuloDialog';
import DetalleArticulo from 'src/components/apps/inventario/DetalleArticulo';
import { BarraStock, EstadoStockBadge } from 'src/components/apps/inventario/piezas';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { useMisModulos } from 'src/lib/modulos';
import { soles } from 'src/lib/formato';
import {
  getResumenInventario,
  listArticulos,
  listCategorias,
  listPersonal,
  palabraUnidad,
  permisosInventario,
  type Articulo,
  type Categoria,
  type PersonaConMaterial,
  type ResumenInventario,
} from 'src/lib/inventario';

const Stock = () => {
  const { user } = useCurrentUser();
  const { modulos } = useMisModulos();
  const permisos = permisosInventario(modulos, user?.rol);

  const [articulos, setArticulos] = useState<Articulo[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [personal, setPersonal] = useState<PersonaConMaterial[]>([]);
  const [resumen, setResumen] = useState<ResumenInventario | null>(null);
  const [categoria, setCategoria] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [verArchivados, setVerArchivados] = useState(false);

  const [moviendo, setMoviendo] = useState<InicialMovimiento | null>(null);
  const [editando, setEditando] = useState<Articulo | null | 'nuevo'>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  const recargar = useCallback(() => {
    listArticulos({ incluir_inactivos: verArchivados }).then(setArticulos).catch(() => setArticulos([]));
    getResumenInventario().then(setResumen).catch(() => {});
    listPersonal().then(setPersonal).catch(() => setPersonal([]));
    setVersion((v) => v + 1);
  }, [verArchivados]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  useEffect(() => {
    listCategorias().then(setCategorias).catch(() => {});
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (articulos ?? []).filter(
      (a) =>
        (categoria === 'todas' || String(a.categoria_id) === categoria) &&
        (!soloAlertas || a.estado !== 'ok') &&
        (!q || [a.nombre, a.codigo, a.marca, a.modelo].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [articulos, categoria, busqueda, soloAlertas]);

  const pestanas = useMemo(() => {
    const cuenta = (id?: number) => (articulos ?? []).filter((a) => id == null || a.categoria_id === id).length;
    return [
      { valor: 'todas', etiqueta: 'Todo', cuenta: cuenta() },
      ...categorias.map((c) => ({ valor: String(c.id), etiqueta: c.nombre, cuenta: cuenta(c.id) })),
    ];
  }, [articulos, categorias]);

  const alertas = (resumen?.sin_stock ?? 0) + (resumen?.bajo_minimo ?? 0);
  const articuloAbierto = articulos?.find((a) => a.id === abierto) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Stock de materiales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Equipos de red, cableado, fibra y herramientas: lo que hay en almacén y lo que tiene el personal.
          </p>
        </div>
        {permisos.gestionar && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditando('nuevo')}>
              <Icon icon="tabler:plus" width={17} /> Nuevo material
            </Button>
            <Button onClick={() => setMoviendo({})} disabled={!articulos?.length}>
              <Icon icon="tabler:arrows-exchange" width={17} /> Registrar movimiento
            </Button>
          </div>
        )}
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Cifra etiqueta="Materiales" valor={resumen?.articulos ?? '—'} nota={`${categorias.length} categorías`} />
          <Cifra
            etiqueta="Por reponer"
            valor={resumen ? alertas : '—'}
            nota={resumen ? `${resumen.sin_stock} sin stock · ${resumen.bajo_minimo} en el mínimo` : undefined}
          />
          <Cifra
            etiqueta="Con el personal"
            valor={resumen?.unidades_en_personal.toLocaleString('es-PE') ?? '—'}
            nota={resumen ? `unidades en manos de ${resumen.personas_con_material} persona${resumen.personas_con_material === 1 ? '' : 's'}` : undefined}
            to="/inventario/personal"
          />
          <Cifra
            etiqueta="Valor en almacén"
            valor={resumen ? soles(resumen.valor_almacen, true) : '—'}
            nota={resumen ? `${resumen.movimientos_hoy} movimiento${resumen.movimientos_hoy === 1 ? '' : 's'} hoy` : undefined}
            to="/inventario/movimientos"
          />
        </div>
      </CardBox>

      {alertas > 0 && !soloAlertas && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ld bg-card px-4 py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-lightwarning text-warning-text">
            <Icon icon="tabler:alert-triangle" width={18} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {alertas} material{alertas === 1 ? '' : 'es'} en el mínimo o sin stock.
            </span>{' '}
            <span className="text-muted-foreground">Conviene reponerlos antes de la próxima instalación.</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => setSoloAlertas(true)}>
            Ver cuáles
          </Button>
        </div>
      )}

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código o marca" className="md:max-w-sm md:flex-1" />
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={soloAlertas} onCheckedChange={setSoloAlertas} aria-label="Solo por reponer" />
                Solo por reponer
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={verArchivados} onCheckedChange={setVerArchivados} aria-label="Ver archivados" />
                Archivados
              </label>
            </div>
          </div>
          <Pestanas pestanas={pestanas} valor={categoria} onChange={setCategoria} label="Categoría" />
        </div>

        {articulos === null ? (
          <LoadingState filas={6} />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono="tabler:package"
            titulo={articulos.length === 0 ? 'Aún no hay materiales' : 'Nada coincide con el filtro'}
            descripcion={
              articulos.length === 0
                ? 'Registra el primero: un switch, un rollo de cable UTP, conectores SC/APC…'
                : 'Prueba con otra categoría o quita «Solo por reponer».'
            }
            accion={
              articulos.length === 0 && permisos.gestionar ? (
                <Button onClick={() => setEditando('nuevo')}>
                  <Icon icon="tabler:plus" width={17} /> Nuevo material
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoría</TableHead>
                  <TableHead className="text-end">En almacén</TableHead>
                  <TableHead className="hidden text-end sm:table-cell">Mínimo</TableHead>
                  <TableHead className="hidden text-end md:table-cell">Con el personal</TableHead>
                  <TableHead>Estado</TableHead>
                  {permisos.gestionar && <TableHead className="text-end"><span className="sr-only">Acciones</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((a) => (
                  <TableRow key={a.id} className={`cursor-pointer ${a.activo ? '' : 'opacity-60'}`} onClick={() => setAbierto(a.id)}>
                    <TableCell>
                      <button type="button" className="block min-w-0 text-left" onClick={() => setAbierto(a.id)}>
                        <span className="block truncate font-medium">{a.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{a.codigo}</span>
                          {(a.marca || a.modelo) && <> · {[a.marca, a.modelo].filter(Boolean).join(' ')}</>}
                        </span>
                      </button>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{a.categoria.nombre}</TableCell>
                    <TableCell className="text-end">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="tabular-nums">
                          <span className="font-semibold">{a.stock.toLocaleString('es-PE')}</span>{' '}
                          <span className="text-xs text-muted-foreground">{palabraUnidad(a.unidad, a.stock)}</span>
                        </span>
                        <BarraStock stock={a.stock} minimo={a.stock_minimo} estado={a.estado} />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-end tabular-nums text-muted-foreground sm:table-cell">{a.stock_minimo.toLocaleString('es-PE')}</TableCell>
                    <TableCell className="hidden text-end tabular-nums md:table-cell">
                      {a.en_personal > 0 ? a.en_personal.toLocaleString('es-PE') : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <EstadoStockBadge estado={a.estado} />
                    </TableCell>
                    {permisos.gestionar && (
                      <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Entregar ${a.nombre}`}
                                disabled={a.stock === 0 || !a.activo}
                                onClick={() => setMoviendo({ tipo: 'asignacion', articulo_id: a.id })}
                              >
                                <Icon icon="tabler:user-share" height={18} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Entregar al personal</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Entrada de ${a.nombre}`}
                                disabled={!a.activo}
                                onClick={() => setMoviendo({ tipo: 'entrada', articulo_id: a.id })}
                              >
                                <Icon icon="tabler:arrow-bar-to-down" height={18} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Registrar entrada</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
        {articulos && visibles.length > 0 && (
          <p className="border-t border-ld px-5 py-3 text-sm text-muted-foreground">
            {visibles.length} de {articulos.length} materiales ·{' '}
            <Link to="/inventario/movimientos" className="font-medium text-foreground underline-offset-4 hover:underline">
              ver entradas y salidas
            </Link>
          </p>
        )}
      </CardBox>

      <RegistrarMovimiento
        open={moviendo != null}
        onOpenChange={(o) => !o && setMoviendo(null)}
        articulos={articulos ?? []}
        personal={personal}
        inicial={moviendo ?? undefined}
        onRegistrado={recargar}
      />
      <ArticuloDialog
        open={editando != null}
        onOpenChange={(o) => !o && setEditando(null)}
        categorias={categorias}
        articulo={editando === 'nuevo' ? null : editando}
        onGuardado={recargar}
      />
      <DetalleArticulo
        articuloId={abierto}
        onClose={() => setAbierto(null)}
        version={version}
        puedeGestionar={permisos.gestionar}
        puedeAjustar={permisos.ajustar}
        onMover={(inicial) => setMoviendo(inicial)}
        onEditar={() => articuloAbierto && setEditando(articuloAbierto)}
        onCambio={recargar}
      />
    </div>
  );
};

export default Stock;
