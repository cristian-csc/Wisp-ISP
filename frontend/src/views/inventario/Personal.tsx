import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import CardBox from 'src/components/shared/CardBox';
import Pestanas from 'src/components/shared/Pestanas';
import SearchInput from 'src/components/shared/SearchInput';
import EmptyState from 'src/components/shared/EmptyState';
import LoadingState from 'src/components/shared/LoadingState';
import { Button } from 'src/components/ui/button';
import RegistrarMovimiento, { type InicialMovimiento } from 'src/components/apps/inventario/RegistrarMovimiento';
import { iniciales } from 'src/components/apps/inventario/piezas';
import { useCurrentUser } from 'src/lib/useCurrentUser';
import { useMisModulos } from 'src/lib/modulos';
import { ROL_LABEL } from 'src/lib/permisos';
import { fechaHora } from 'src/lib/formato';
import {
  cantidadConUnidad,
  listArticulos,
  listPersonal,
  permisosInventario,
  type Articulo,
  type PersonaConMaterial,
} from 'src/lib/inventario';

type Filtro = 'todos' | 'tecnico' | 'vendedor_campo' | 'con_material';

/** Cuánto hace del último movimiento, en palabras. */
function haceCuanto(valor: string | null): string {
  if (!valor) return 'sin movimientos';
  const dias = Math.floor((Date.now() - new Date(valor).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fechaHora(valor);
}

const Personal = () => {
  const { user } = useCurrentUser();
  const { modulos } = useMisModulos();
  const permisos = permisosInventario(modulos, user?.rol);
  const [personal, setPersonal] = useState<PersonaConMaterial[] | null>(null);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [moviendo, setMoviendo] = useState<InicialMovimiento | null>(null);

  const cargar = useCallback(() => {
    listPersonal().then(setPersonal).catch(() => setPersonal([]));
    listArticulos().then(setArticulos).catch(() => {});
  }, []);

  useEffect(cargar, [cargar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (personal ?? []).filter(
      (p) =>
        (filtro === 'todos' ||
          (filtro === 'con_material' ? p.unidades > 0 : p.persona.rol === filtro)) &&
        (!q || p.persona.nombre.toLowerCase().includes(q)),
    );
  }, [personal, filtro, busqueda]);

  const cuenta = (f: Filtro) =>
    (personal ?? []).filter((p) => (f === 'todos' ? true : f === 'con_material' ? p.unidades > 0 : p.persona.rol === f)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">Material del personal</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que tiene a su cargo cada técnico y vendedora, y desde cuándo.
          </p>
        </div>
        {permisos.gestionar && (
          <Button onClick={() => setMoviendo({ tipo: 'asignacion' })} disabled={!articulos.length}>
            <Icon icon="tabler:user-share" width={17} /> Entregar material
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <Pestanas
          className="md:flex-1"
          label="Filtrar personal"
          valor={filtro}
          onChange={setFiltro}
          pestanas={[
            { valor: 'todos', etiqueta: 'Todos', cuenta: cuenta('todos') },
            { valor: 'con_material', etiqueta: 'Con material', cuenta: cuenta('con_material') },
            { valor: 'tecnico', etiqueta: 'Técnicos', cuenta: cuenta('tecnico') },
            { valor: 'vendedor_campo', etiqueta: 'Vendedoras', cuenta: cuenta('vendedor_campo') },
          ]}
        />
        <SearchInput value={busqueda} onChange={setBusqueda} placeholder="Buscar persona" className="md:w-64" />
      </div>

      {personal === null ? (
        <CardBox className="!p-0">
          <LoadingState filas={5} />
        </CardBox>
      ) : visibles.length === 0 ? (
        <CardBox className="!p-0">
          <EmptyState
            icono="tabler:users"
            titulo={personal.length === 0 ? 'No hay técnicos ni vendedoras' : 'Nadie coincide con el filtro'}
            descripcion={personal.length === 0 ? 'Créalos en Usuarios para poder entregarles material.' : undefined}
          />
        </CardBox>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibles.map((p) => (
            <CardBox key={p.persona.id} className="gap-0 overflow-hidden !p-0">
              <div className="flex items-start gap-3 px-5 pb-4 pt-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
                  {iniciales(p.persona.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.persona.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {ROL_LABEL[p.persona.rol] ?? p.persona.rol}
                    {!p.persona.activo && ' · desactivado'}
                    {p.persona.telefono && (
                      <>
                        {' · '}
                        <a href={`tel:${p.persona.telefono}`} className="tabular-nums hover:text-foreground">
                          {p.persona.telefono}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-semibold leading-none tabular-nums">{p.unidades.toLocaleString('es-PE')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">en mano</p>
                </div>
              </div>

              <div className="border-t border-ld px-5 py-3">
                {p.material.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">No tiene material a su cargo.</p>
                ) : (
                  <ul className="flex flex-col">
                    {p.material.slice(0, 6).map((m) => (
                      <li key={m.articulo_id} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{m.nombre}</span>
                          {m.piezas.length > 0 && (
                            <span className="block truncate font-mono text-[11px] text-muted-foreground" title={m.piezas.join(', ')}>
                              {m.piezas.join(' · ')}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">{cantidadConUnidad(m.cantidad, m)}</span>
                      </li>
                    ))}
                    {p.material.length > 6 && (
                      <li className="pt-1 text-xs text-muted-foreground">y {p.material.length - 6} materiales más</li>
                    )}
                  </ul>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-ld bg-surface-2 px-5 py-3">
                <Link
                  to={`/inventario/movimientos?persona=${p.persona.id}`}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Último movimiento: {haceCuanto(p.ultimo_movimiento)}
                </Link>
                {permisos.gestionar && (
                  <div className="flex gap-1">
                    {p.persona.activo && (
                      <Button size="sm" variant="outline" onClick={() => setMoviendo({ tipo: 'asignacion', persona_id: p.persona.id })}>
                        Entregar
                      </Button>
                    )}
                    {p.unidades > 0 && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setMoviendo({ tipo: 'devolucion', persona_id: p.persona.id })}>
                          Devolución
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setMoviendo({ tipo: 'consumo', persona_id: p.persona.id })}>
                          Consumo
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardBox>
          ))}
        </div>
      )}

      <RegistrarMovimiento
        open={moviendo != null}
        onOpenChange={(o) => !o && setMoviendo(null)}
        articulos={articulos}
        personal={personal ?? []}
        inicial={moviendo ?? undefined}
        onRegistrado={cargar}
      />
    </div>
  );
};

export default Personal;
