import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Pestanas from 'src/components/shared/Pestanas';
import Pagination from 'src/components/shared/Pagination';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'src/components/ui/table';
import RegistrarMovimiento from 'src/components/apps/inventario/RegistrarMovimiento';
import { CantidadMovimiento, TipoMovimientoEtiqueta } from 'src/components/apps/inventario/piezas';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { useMisModulos } from 'src/lib/modulos';
import { ROL_LABEL } from 'src/lib/permisos';
import { fecha } from 'src/lib/formato';
import {
  TIPO_MOVIMIENTO,
  listArticulos,
  listMovimientos,
  listPersonal,
  palabraUnidad,
  permisosInventario,
  type Articulo,
  type PaginaMovimientos,
  type PersonaConMaterial,
  type TipoMovimiento,
} from 'src/lib/inventario';

const TODOS = 'todos';

const PLURAL: Record<TipoMovimiento, string> = {
  entrada: 'Entradas',
  asignacion: 'Entregas',
  devolucion: 'Devoluciones',
  consumo: 'Consumos',
  salida: 'Salidas',
  ajuste: 'Ajustes',
};

const PESTANAS = [
  { valor: TODOS, etiqueta: 'Todos' },
  ...(Object.keys(PLURAL) as TipoMovimiento[]).map((t) => ({ valor: t, etiqueta: PLURAL[t], icono: TIPO_MOVIMIENTO[t].icono })),
];

function hora(valor: string): string {
  return new Date(valor).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const Movimientos = () => {
  const { user } = useCurrentUser();
  const { modulos } = useMisModulos();
  const permisos = permisosInventario(modulos, user?.rol);
  const [params, setParams] = useSearchParams();

  const tipo = params.get('tipo') ?? TODOS;
  const persona = params.get('persona') ?? TODOS;
  const articulo = params.get('material') ?? TODOS;
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const pagina = Number(params.get('pagina') ?? 1);

  const [datos, setDatos] = useState<PaginaMovimientos | null>(null);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [personal, setPersonal] = useState<PersonaConMaterial[]>([]);
  const [registrando, setRegistrando] = useState(false);

  function filtrar(cambio: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambio)) {
      if (!v || v === TODOS) p.delete(k);
      else p.set(k, v);
    }
    if (!('pagina' in cambio)) p.delete('pagina');
    setParams(p, { replace: true });
  }

  const cargar = useCallback(() => {
    setDatos(null);
    listMovimientos({
      tipo: tipo === TODOS ? undefined : tipo,
      persona_id: persona === TODOS ? undefined : Number(persona),
      articulo_id: articulo === TODOS ? undefined : Number(articulo),
      desde: desde || undefined,
      hasta: hasta || undefined,
      page: pagina,
      per_page: 25,
    })
      .then(setDatos)
      .catch(() => setDatos({ total: 0, page: 1, pages: 1, items: [] }));
  }, [tipo, persona, articulo, desde, hasta, pagina]);

  const cargarCatalogos = useCallback(() => {
    listArticulos({ incluir_inactivos: true }).then(setArticulos).catch(() => {});
    listPersonal().then(setPersonal).catch(() => {});
  }, []);

  useEffect(cargar, [cargar]);
  useEffect(cargarCatalogos, [cargarCatalogos]);

  const hayFiltros = persona !== TODOS || articulo !== TODOS || !!desde || !!hasta;
  let diaAnterior = '';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Entradas y salidas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada movimiento del almacén: qué, cuánto, a quién, quién lo registró y a qué hora.
          </p>
        </div>
        {permisos.gestionar && (
          <Button onClick={() => setRegistrando(true)} disabled={!articulos.length}>
            <Icon icon="tabler:arrows-exchange" width={17} /> Registrar movimiento
          </Button>
        )}
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Select value={persona} onValueChange={(v) => filtrar({ persona: v })}>
              <SelectTrigger className="w-full" aria-label="Persona">
                <SelectValue placeholder="Todo el personal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todo el personal</SelectItem>
                {personal.map((p) => (
                  <SelectItem key={p.persona.id} value={String(p.persona.id)}>
                    {p.persona.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={articulo} onValueChange={(v) => filtrar({ material: v })}>
              <SelectTrigger className="w-full" aria-label="Material">
                <SelectValue placeholder="Todos los materiales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos los materiales</SelectItem>
                {articulos.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="Desde" value={desde} max={hasta || undefined} onChange={(e) => filtrar({ desde: e.target.value })} />
              <span className="text-sm text-muted-foreground">a</span>
              <Input type="date" aria-label="Hasta" value={hasta} min={desde || undefined} onChange={(e) => filtrar({ hasta: e.target.value })} />
            </div>
            {hayFiltros && (
              <div className="flex items-center">
                <Button variant="ghost" size="sm" onClick={() => filtrar({ persona: '', material: '', desde: '', hasta: '' })}>
                  <Icon icon="tabler:x" width={15} /> Quitar filtros
                </Button>
              </div>
            )}
          </div>
          <Pestanas pestanas={PESTANAS} valor={tipo} onChange={(v) => filtrar({ tipo: v })} label="Tipo de movimiento" />
        </div>

        {datos === null ? (
          <LoadingState filas={8} />
        ) : datos.items.length === 0 ? (
          <EmptyState
            icono="tabler:arrows-exchange"
            titulo={hayFiltros || tipo !== TODOS ? 'Ningún movimiento con estos filtros' : 'Todavía no hay movimientos'}
            descripcion={
              hayFiltros || tipo !== TODOS
                ? 'Cambia el tipo, la persona o las fechas.'
                : 'Aparecen aquí al registrar entradas al almacén o entregas al personal.'
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Hora</TableHead>
                <TableHead>Movimiento</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-end">Cantidad</TableHead>
                <TableHead className="hidden text-end sm:table-cell">Almacén</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead className="hidden xl:table-cell">Registró</TableHead>
                <TableHead className="hidden 2xl:table-cell">Nota</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos.items.flatMap((m) => {
                const dia = fecha(m.creado_en);
                const filas = [];
                if (dia !== diaAnterior) {
                  diaAnterior = dia;
                  filas.push(
                    <TableRow key={`dia-${m.id}`} className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-surface-2 py-2 text-xs font-medium text-muted-foreground">
                        {new Date(m.creado_en).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </TableCell>
                    </TableRow>,
                  );
                }
                filas.push(
                  <TableRow key={m.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{hora(m.creado_en)}</TableCell>
                    <TableCell>
                      <TipoMovimientoEtiqueta tipo={m.tipo} />
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-48 truncate font-medium" title={m.articulo_nombre}>{m.articulo_nombre}</span>
                      {m.motivo && <span className="block max-w-48 truncate text-xs text-muted-foreground 2xl:hidden" title={m.motivo}>{m.motivo}</span>}
                      <span className="block font-mono text-xs text-muted-foreground">{m.articulo_codigo}</span>
                    </TableCell>
                    <TableCell className="text-end">
                      <CantidadMovimiento m={m} />{' '}
                      <span className="text-xs text-muted-foreground">{palabraUnidad(m.unidad, m.cantidad)}</span>
                    </TableCell>
                    <TableCell className="hidden text-end tabular-nums text-muted-foreground sm:table-cell">{m.stock_resultante}</TableCell>
                    <TableCell>
                      {m.persona ? (
                        <span className="block min-w-0">
                          <span className="block max-w-40 truncate text-sm">{m.persona.nombre}</span>
                          <span className="block text-xs text-muted-foreground">{ROL_LABEL[m.persona.rol] ?? m.persona.rol}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Almacén</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm xl:table-cell">{m.registrado_por.nombre}</TableCell>
                    <TableCell className="hidden max-w-56 2xl:table-cell">
                      <span className="block truncate text-sm text-muted-foreground" title={[m.documento, m.motivo].filter(Boolean).join(' · ')}>
                        {m.cliente_id ? (
                          <Link to={`/clientes/${m.cliente_id}`} className="text-foreground underline-offset-4 hover:underline">
                            {m.cliente_nombre}
                          </Link>
                        ) : null}
                        {[m.documento, m.motivo].filter(Boolean).join(' · ') || (m.cliente_id ? '' : '—')}
                      </span>
                    </TableCell>
                  </TableRow>,
                );
                return filas;
              })}
            </TableBody>
          </Table>
        )}
        {datos && datos.items.length > 0 && (
          <div className="border-t border-ld px-5">
            <Pagination
              pagina={datos.page}
              totalPaginas={datos.pages}
              onCambiar={(p) => filtrar({ pagina: String(p) })}
              resumen={`${datos.total} movimiento${datos.total === 1 ? '' : 's'}`}
            />
          </div>
        )}
      </CardBox>

      <RegistrarMovimiento
        open={registrando}
        onOpenChange={setRegistrando}
        articulos={articulos}
        personal={personal}
        onRegistrado={() => {
          cargar();
          cargarCatalogos();
        }}
      />
    </div>
  );
};

export default Movimientos;
