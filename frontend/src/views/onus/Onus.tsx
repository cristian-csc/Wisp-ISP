import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Cifra from 'src/components/shared/Cifra';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'src/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'src/components/ui/table';
import RegistrarOnu from 'src/components/apps/onus/RegistrarOnu';
import DetalleOnu from 'src/components/apps/onus/DetalleOnu';
import { DondeEsta, EstadoOnuChip } from 'src/components/apps/onus/piezasOnu';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { puedeVerUrl } from 'src/lib/permisos';
import { listPersonal } from 'src/lib/inventario';
import type { Usuario } from 'src/lib/api';
import { listOnus, macValida, type EstadoOnu, type Onu } from 'src/lib/onus';

const TODOS = 'todos';
type Filtro = 'todos' | EstadoOnu | 'revisar';

/** Registro de ONUs: cada equipo por su serie y dónde está ahora. Lo que le
 *  pasó a cada una está en su ficha, no aquí: esta lista responde «¿qué hay
 *  y dónde?».
 *
 *  La misma pantalla vive en dos lugares. En Red es solo para consultar; en
 *  Inventario (`gestion`) se registran, entregan y marcan. El servidor hace
 *  la misma distinción por módulo, así que esconder los botones no es lo
 *  único que lo impide. */
const Onus = ({ gestion = false }: { gestion?: boolean }) => {
  const { user } = useCurrentUser();
  const puedeGestionar = gestion;
  const veGestion = !gestion && puedeVerUrl('/inventario/onus', user?.rol);
  const [params, setParams] = useSearchParams();
  const [onus, setOnus] = useState<Onu[] | null>(null);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);

  const filtro = (params.get('ver') as Filtro) || 'todos';
  const tecnicoSel = params.get('tecnico') ?? TODOS;
  const marcaSel = params.get('marca') ?? TODOS;

  const cargar = useCallback(() => {
    listOnus().then(setOnus).catch(() => setOnus([]));
  }, []);

  useEffect(() => {
    cargar();
    // A quién se le puede entregar: solo hace falta donde se gestiona.
    if (gestion) {
      listPersonal()
        .then((ps) =>
          setTecnicos(
            ps
              .filter((p) => p.persona.rol === 'tecnico')
              .map((p) => ({ id: p.persona.id, nombre: p.persona.nombre, rol: 'tecnico', activo: p.persona.activo }) as Usuario),
          ),
        )
        .catch(() => setTecnicos([]));
    }
  }, [cargar, gestion]);

  function filtrar(cambio: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambio)) {
      if (!v || v === TODOS) p.delete(k);
      else p.set(k, v);
    }
    setParams(p, { replace: true });
  }

  const lista = onus ?? [];
  /** MAC que aparecen en más de una ONU: datos viejos por revisar. */
  const macRepetidas = useMemo(() => {
    const vistas = new Map<string, number>();
    for (const o of lista) if (o.mac) vistas.set(o.mac, (vistas.get(o.mac) ?? 0) + 1);
    return new Set([...vistas].filter(([, n]) => n > 1).map(([m]) => m));
  }, [lista]);
  const porRevisar = (o: Onu) => !macValida(o.mac) || (!!o.mac && macRepetidas.has(o.mac));

  /** Para filtrar basta con los técnicos que tienen o tuvieron alguna ONU. */
  const tecnicosConOnus = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of lista) if (o.tecnico) m.set(o.tecnico.id, o.tecnico.nombre);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [lista]);

  const marcas = useMemo(() => [...new Set(lista.map((o) => o.marca).filter(Boolean) as string[])].sort(), [lista]);
  const conTecnicos = useMemo(() => {
    const m = new Map<number, { nombre: string; n: number }>();
    for (const o of lista) {
      if (o.estado === 'asignado_tecnico' && o.tecnico) m.set(o.tecnico.id, { nombre: o.tecnico.nombre, n: (m.get(o.tecnico.id)?.n ?? 0) + 1 });
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [lista]);

  const delAlcance = lista.filter(
    (o) => (tecnicoSel === TODOS || String(o.tecnico?.id) === tecnicoSel) && (marcaSel === TODOS || o.marca === marcaSel),
  );
  const cuenta = (f: Filtro) =>
    delAlcance.filter((o) => (f === 'todos' ? true : f === 'revisar' ? porRevisar(o) : o.estado === f)).length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase().replace(/[:\-\s]/g, '');
    return delAlcance.filter((o) => {
      if (filtro === 'revisar' ? !porRevisar(o) : filtro !== 'todos' && o.estado !== filtro) return false;
      if (!q) return true;
      return [o.numero_serie, o.mac?.replace(/:/g, ''), o.cliente?.nombre, o.tecnico?.nombre, o.marca].some((t) =>
        t?.toLowerCase().replace(/\s/g, '').includes(q),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delAlcance, filtro, busqueda, macRepetidas]);

  const total = (e: EstadoOnu) => lista.filter((o) => o.estado === e).length;
  const fuera = total('danado') + total('perdido');
  const hayFiltros = !!busqueda.trim() || filtro !== 'todos' || tecnicoSel !== TODOS || marcaSel !== TODOS;
  const onuAbierta = lista.find((o) => o.id === abierta) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">ONUs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {gestion
              ? 'Registra, entrega a los técnicos y sigue el recorrido de cada equipo.'
              : 'Consulta dónde está cada equipo: en almacén, con qué técnico o en qué cliente.'}
          </p>
        </div>
        {puedeGestionar && (
          <Button onClick={() => setRegistrando(true)}>
            <Icon icon="tabler:plus" width={17} /> Registrar ONU
          </Button>
        )}
        {veGestion && (
          <Button variant="outline" asChild>
            <Link to="/inventario/onus">
              <Icon icon="solar:box-linear" width={17} /> Gestionar en Inventario
            </Link>
          </Button>
        )}
      </div>

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:bg-card">
          <Cifra
            etiqueta="En almacén"
            icono="solar:box-linear"
            tono="marca"
            valor={onus ? total('en_almacen') : '—'}
            nota="Listas para entregar"
          />
          <Cifra
            etiqueta="Con técnicos"
            icono="solar:users-group-two-rounded-linear"
            valor={onus ? total('asignado_tecnico') : '—'}
            nota={conTecnicos.length ? conTecnicos.slice(0, 2).map(([, t]) => `${t.nombre} ${t.n}`).join(' · ') : 'Nadie tiene ONUs ahora'}
          />
          <Cifra
            etiqueta="Instaladas"
            icono="solar:home-wifi-linear"
            tono="ok"
            valor={onus ? total('instalado') : '—'}
            progreso={onus ? { valor: total('instalado'), total: lista.length } : null}
            nota={onus ? `de ${lista.length} registradas` : undefined}
          />
          <Cifra
            etiqueta="Dañadas o perdidas"
            icono="solar:danger-triangle-linear"
            tono={fuera ? 'peligro' : 'neutro'}
            valor={onus ? fuera : '—'}
            nota={onus ? `${total('danado')} dañadas · ${total('perdido')} perdidas` : undefined}
          />
        </div>
      </CardBox>

      {onus && cuenta('revisar') > 0 && filtro !== 'revisar' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ld bg-card px-4 py-3">
          <span className="grid size-8 place-items-center rounded-lg bg-lightwarning text-warning-text">
            <Icon icon="tabler:alert-triangle" width={18} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">
              {cuenta('revisar')} ONU{cuenta('revisar') === 1 ? '' : 's'} con la MAC mal cargada o repetida.
            </span>{' '}
            <span className="text-muted-foreground">
              Se registraron antes de que se validara; conviene corregirlas{gestion ? '' : ' desde Inventario'}.
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={() => filtrar({ ver: 'revisar' })}>
            Ver cuáles
          </Button>
        </div>
      )}

      <CardBox className="gap-0 overflow-hidden !p-0">
        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Serie, MAC, cliente o técnico" className="lg:w-80" />
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              {tecnicosConOnus.length > 0 && (
                <Select value={tecnicoSel} onValueChange={(v) => filtrar({ tecnico: v })}>
                  <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Técnico">
                    <Icon icon="tabler:user" width={16} className="text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos los técnicos</SelectItem>
                    {tecnicosConOnus.map(([id, nombre]) => (
                      <SelectItem key={id} value={String(id)}>
                        {nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {marcas.length > 1 && (
                <Select value={marcaSel} onValueChange={(v) => filtrar({ marca: v })}>
                  <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Marca">
                    <Icon icon="tabler:tag" width={16} className="text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todas las marcas</SelectItem>
                    {marcas.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <Pestanas
            label="Estado"
            valor={filtro}
            onChange={(v) => filtrar({ ver: v })}
            pestanas={[
              { valor: 'todos', etiqueta: 'Todas', cuenta: cuenta('todos') },
              { valor: 'en_almacen', etiqueta: 'En almacén', cuenta: cuenta('en_almacen') },
              { valor: 'asignado_tecnico', etiqueta: 'Con técnico', cuenta: cuenta('asignado_tecnico'), punto: 'bg-brand' },
              { valor: 'instalado', etiqueta: 'Instaladas', cuenta: cuenta('instalado'), punto: 'bg-success-solid' },
              { valor: 'danado', etiqueta: 'Dañadas', cuenta: cuenta('danado'), punto: 'bg-error-solid' },
              { valor: 'perdido', etiqueta: 'Perdidas', cuenta: cuenta('perdido'), punto: 'bg-foreground' },
              ...(cuenta('revisar') ? [{ valor: 'revisar' as Filtro, etiqueta: 'Por revisar', cuenta: cuenta('revisar'), punto: 'bg-warning-solid' }] : []),
            ]}
          />
        </div>

        {onus === null ? (
          <LoadingState filas={8} />
        ) : visibles.length === 0 ? (
          <EmptyState
            icono="tabler:router-off"
            titulo={lista.length === 0 ? 'Aún no hay ONUs registradas' : 'Ninguna ONU coincide'}
            descripcion={
              lista.length === 0
                ? gestion
                  ? 'Registra la primera escaneando su número de serie.'
                  : 'Las ONUs se registran en Inventario › ONUs.'
                : 'Prueba con otra búsqueda o quita los filtros.'
            }
            accion={
              lista.length === 0 && puedeGestionar ? (
                <Button onClick={() => setRegistrando(true)}>
                  <Icon icon="tabler:plus" width={17} /> Registrar ONU
                </Button>
              ) : hayFiltros ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setBusqueda('');
                    filtrar({ ver: '', tecnico: '', marca: '' });
                  }}
                >
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serie</TableHead>
                <TableHead className="hidden md:table-cell">MAC</TableHead>
                <TableHead>Dónde está</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => setAbierta(o.id)}>
                  <TableCell>
                    <button type="button" className="block text-left" onClick={() => setAbierta(o.id)}>
                      <span className="block font-mono text-sm font-semibold tracking-wide">{o.numero_serie}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[o.marca, o.wifi_version === 'wifi6' ? 'WiFi 6' : o.wifi_version === 'wifi5' ? 'WiFi 5' : null].filter(Boolean).join(' · ') || 'Sin marca'}
                      </span>
                    </button>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {o.mac ? (
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-xs">{o.mac}</span>
                        {porRevisar(o) && (
                          <span className="rounded bg-lightwarning px-1.5 py-px text-[11px] font-medium text-warning-text">
                            {macValida(o.mac) ? 'repetida' : 'no válida'}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-56">
                    <DondeEsta onu={o} />
                  </TableCell>
                  <TableCell>
                    <EstadoOnuChip estado={o.estado} />
                  </TableCell>
                  <TableCell>
                    <Icon icon="tabler:chevron-right" width={16} className="text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {onus && visibles.length > 0 && (
          <p className="border-t border-ld px-5 py-3 text-sm text-muted-foreground">
            {visibles.length} de {lista.length} ONUs · toca una para ver su recorrido
          </p>
        )}
      </CardBox>

      <RegistrarOnu open={registrando} onOpenChange={setRegistrando} onRegistrada={cargar} />
      <DetalleOnu
        onu={onuAbierta}
        onClose={() => setAbierta(null)}
        puedeGestionar={puedeGestionar}
        tecnicos={tecnicos}
        macRepetida={!!onuAbierta?.mac && macRepetidas.has(onuAbierta.mac)}
        onCambio={() => cargar()}
      />
    </div>
  );
};

export default Onus;
