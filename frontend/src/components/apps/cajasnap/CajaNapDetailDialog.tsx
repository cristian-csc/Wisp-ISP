import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from 'src/components/ui/dialog';
import { Button } from 'src/components/ui/button';
import { Input } from 'src/components/ui/input';
import ConfirmDialog from 'src/components/shared/ConfirmDialog';
import LoadingState from 'src/components/shared/LoadingState';
import OcupacionBarra from './OcupacionBarra';
import {
  ampliarCajaNap,
  getCajaNap,
  getEstadoPppoeCaja,
  marcarBorne,
  resumenBornes,
  setCodigoPrecinto,
  type Borne,
  type CajaNap,
  type EstadoPppoeBorne,
} from 'src/lib/cajasnap';
import { getPppoeStatus } from 'src/lib/clientes';
import { getZona } from 'src/lib/zonas';
import { fecha } from 'src/lib/formato';
import { cn } from 'src/lib/utils';

interface Props {
  cajaId: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

const ESTADO_TEXTO: Record<Borne['estado'], string> = { libre: 'Libre', ocupado: 'Ocupado', danado: 'Dañado' };

/** Un puerto del frente de la caja. Ocupado lleva el conector SC/APC verde
 *  (el color real de los conectores APC); libre es el hueco vacío; dañado va
 *  en rojo con una cruz. El punto de arriba es el estado en el MikroTik, y
 *  solo aparece después de consultarlo. */
const Puerto = ({
  b,
  elegido,
  estado,
  onClick,
}: {
  b: Borne;
  elegido: boolean;
  estado?: EstadoPppoeBorne;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={elegido}
    aria-label={`Borne ${b.numero}: ${ESTADO_TEXTO[b.estado]}${b.cliente ? `, ${b.cliente.nombre}` : ''}`}
    className="group flex flex-col items-center gap-1.5 outline-none"
  >
    <span
      className={cn(
        'relative grid size-12 place-items-center rounded-xl bg-[#0b0c0f] ring-1 ring-white/10 transition-[box-shadow,transform] duration-150 group-active:scale-95',
        'group-focus-visible:ring-2 group-focus-visible:ring-white/60',
        elegido && 'ring-2 ring-brand ring-offset-2 ring-offset-[#1a1c21]',
        !elegido && '[@media(hover:hover)]:group-hover:ring-white/30',
      )}
    >
      {b.estado === 'ocupado' && (
        <span className="grid size-7 place-items-center rounded-md bg-[#1f9d55] shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]">
          <span className="size-2 rounded-full bg-white/90" />
        </span>
      )}
      {b.estado === 'libre' && <span className="size-5 rounded-full border-2 border-dashed border-white/30" />}
      {b.estado === 'danado' && (
        <span className="grid size-7 place-items-center rounded-md bg-[#e5484d]/20 text-[#ff8a8d]">
          <Icon icon="tabler:x" width={16} />
        </span>
      )}
      {estado && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-1 -top-1 size-3 rounded-full ring-2 ring-[#1a1c21]',
            estado.error ? 'bg-[#e5484d]' : estado.conectado ? 'bg-[#46d17f]' : 'bg-zinc-500',
          )}
        />
      )}
    </span>
    <span className={cn('text-[11px] font-semibold tabular-nums', elegido ? 'text-brand' : 'text-zinc-400')}>{b.numero}</span>
  </button>
);

const Dato = ({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) => (
  <div className="bg-card px-4 py-3">
    <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
    <dd className="mt-0.5 text-sm font-medium tabular-nums">{children}</dd>
  </div>
);

const EstadoRed = ({ estado }: { estado?: EstadoPppoeBorne }) => {
  if (!estado) return <span className="text-xs text-muted-foreground">Sin consultar</span>;
  if (estado.error) return <span className="text-xs font-medium text-error-text">{estado.error}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', estado.conectado ? 'text-success-text' : 'text-muted-foreground')}>
      <span className={cn('size-1.5 rounded-full', estado.conectado ? 'bg-success-solid' : 'bg-muted-foreground')} />
      {estado.conectado ? 'En línea' : 'Desconectado'}
    </span>
  );
};

/** La caja por dentro: el frente con sus puertos a la izquierda y, a la
 *  derecha, lo que hay en el puerto elegido. Sin elegir nada, la lista de
 *  abonados. Nada cambia de estado con un clic suelto: marcar dañado o
 *  reparado es un botón aparte. */
const CajaNapDetailDialog = ({ cajaId, onOpenChange, onChanged }: Props) => {
  const [caja, setCaja] = useState<CajaNap | null>(null);
  const [zonaNombre, setZonaNombre] = useState<string | null>(null);
  const [elegidoId, setElegidoId] = useState<number | null>(null);
  const [estados, setEstados] = useState<Record<number, EstadoPppoeBorne>>({});
  const [consultando, setConsultando] = useState(false);
  const [consultandoUno, setConsultandoUno] = useState(false);
  const [precinto, setPrecinto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmarAmpliar, setConfirmarAmpliar] = useState(false);

  async function recargar(avisar = true) {
    if (!cajaId) return;
    const c = await getCajaNap(cajaId);
    setCaja(c);
    if (avisar) onChanged?.();
    return c;
  }

  useEffect(() => {
    setEstados({});
    setElegidoId(null);
    setZonaNombre(null);
    if (!cajaId) {
      setCaja(null);
      return;
    }
    recargar(false).then((c) => c && getZona(c.zona_id).then((z) => setZonaNombre(z.nombre)).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cajaId]);

  const bornes = useMemo(() => [...(caja?.bornes ?? [])].sort((a, b) => a.numero - b.numero), [caja]);
  const elegido = bornes.find((b) => b.id === elegidoId) ?? null;
  const r = resumenBornes(caja ? [caja] : []);
  const abonados = bornes.filter((b) => b.estado === 'ocupado' && b.cliente);
  const sinPrecinto = abonados.filter((b) => !b.codigo_precinto).length;
  const enLinea = Object.values(estados).filter((e) => e.conectado && !e.error).length;
  const consultados = Object.keys(estados).length > 0;
  const columnas = bornes.length <= 8 ? 4 : 8;

  useEffect(() => {
    setPrecinto(elegido?.codigo_precinto ?? '');
  }, [elegido?.id, elegido?.codigo_precinto]);

  async function consultarTodos() {
    if (!caja) return;
    setConsultando(true);
    try {
      const lista = await getEstadoPppoeCaja(caja.id);
      setEstados(Object.fromEntries(lista.map((e) => [e.borne_id, e])));
      const online = lista.filter((e) => e.conectado && !e.error).length;
      toast.message(`${online} de ${lista.length} abonados en línea`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo consultar el router de la zona');
    } finally {
      setConsultando(false);
    }
  }

  async function consultarUno(b: Borne) {
    if (!b.cliente) return;
    setConsultandoUno(true);
    try {
      const s = await getPppoeStatus(b.cliente.id);
      setEstados((m) => ({ ...m, [b.id]: { borne_id: b.id, cliente_id: b.cliente!.id, ...s } }));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo consultar el router');
    } finally {
      setConsultandoUno(false);
    }
  }

  async function guardarPrecinto(b: Borne) {
    setGuardando(true);
    try {
      await setCodigoPrecinto(b.id, precinto.trim() || null);
      toast.success(precinto.trim() ? `Precinto ${precinto.trim()} guardado` : 'Precinto quitado');
      await recargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo guardar el precinto');
    } finally {
      setGuardando(false);
    }
  }

  async function alternarDanado(b: Borne) {
    try {
      await marcarBorne(b.id, b.estado !== 'danado');
      toast.success(b.estado === 'danado' ? `Borne ${b.numero} reparado: vuelve a estar libre` : `Borne ${b.numero} marcado como dañado`);
      await recargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo cambiar el borne');
    }
  }

  async function ampliar() {
    if (!caja) return;
    const nueva = caja.capacidad_bornes >= 16 ? 32 : 16;
    try {
      await ampliarCajaNap(caja.id, nueva);
      toast.success(`La caja ahora tiene ${nueva} bornes`);
      await recargar();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'No se pudo ampliar la caja');
    }
  }

  const proxima = caja && caja.capacidad_bornes < 32 ? (caja.capacidad_bornes >= 16 ? 32 : 16) : null;

  return (
    <>
      <Dialog open={!!cajaId} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(92vh,760px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          {/* Encabezado */}
          <header className="shrink-0 border-b border-ld px-6 pb-4 pt-5 pr-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-xl font-semibold leading-tight">{caja?.codigo ?? 'Cargando…'}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {caja
                    ? [zonaNombre, caja.mufa_codigo ? `mufa ${caja.mufa_codigo}` : 'sin mufa', caja.descripcion].filter(Boolean).join(' · ')
                    : 'Bornes, abonados y estado en el router'}
                </DialogDescription>
              </div>
              {caja && (
                <div className="flex flex-wrap items-center gap-2">
                  {caja.lat != null && caja.lng != null && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`https://www.google.com/maps?q=${caja.lat},${caja.lng}`} target="_blank" rel="noreferrer">
                        <Icon icon="tabler:map-pin" width={15} /> Mapa
                      </a>
                    </Button>
                  )}
                  {proxima && (
                    <Button variant="ghost" size="sm" onClick={() => setConfirmarAmpliar(true)}>
                      <Icon icon="tabler:layout-grid-add" width={15} /> Ampliar a {proxima}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={consultarTodos} disabled={consultando || abonados.length === 0}>
                    <Icon icon={consultando ? 'tabler:loader-2' : 'tabler:router'} width={15} className={consultando ? 'animate-spin' : undefined} />
                    {consultando ? 'Consultando…' : 'Consultar router'}
                  </Button>
                </div>
              )}
            </div>
            {caja && (
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm tabular-nums">
                <span>
                  <span className="text-lg font-semibold">{r.libres}</span> <span className="text-muted-foreground">libres</span>
                </span>
                <span>
                  <span className="text-lg font-semibold">{r.ocupados}</span> <span className="text-muted-foreground">con cliente</span>
                </span>
                {r.danados > 0 && (
                  <span className="text-error-text">
                    <span className="text-lg font-semibold">{r.danados}</span> dañado{r.danados === 1 ? '' : 's'}
                  </span>
                )}
                {consultados && (
                  <span className="text-success-text">
                    <span className="text-lg font-semibold">{enLinea}</span> en línea
                  </span>
                )}
                <OcupacionBarra r={r} className="min-w-32 flex-1" />
                <span className="text-muted-foreground">{r.pct}% ocupada</span>
              </div>
            )}
          </header>

          {!caja ? (
            <LoadingState filas={5} />
          ) : (
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:overflow-hidden">
              {/* Frente de la caja */}
              <section aria-label="Frente de la caja" className="flex flex-col gap-4 border-ld bg-surface-2 p-5 lg:overflow-y-auto lg:border-r">
                <div className="rounded-2xl bg-[#1a1c21] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.2),0_8px_24px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/40 dark:ring-white/10">
                  <div className="mb-4 flex items-center justify-between text-[11px] font-medium tracking-wide text-zinc-400">
                    <span className="font-mono">{caja.codigo}</span>
                    <span>{caja.capacidad_bornes} bornes</span>
                  </div>
                  <div className="grid justify-items-center gap-x-2 gap-y-4" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
                    {bornes.map((b) => (
                      <Puerto
                        key={b.id}
                        b={b}
                        elegido={b.id === elegidoId}
                        estado={estados[b.id]}
                        onClick={() => setElegidoId((id) => (id === b.id ? null : b.id))}
                      />
                    ))}
                  </div>
                </div>
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Leyenda">
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-[3px] bg-[#1f9d55]" /> Con cliente
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full border-2 border-dashed border-muted-foreground/60" /> Libre
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="size-3 rounded-[3px] bg-error-solid" /> Dañado
                  </li>
                  {consultados && (
                    <li className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-success-solid" /> En línea
                    </li>
                  )}
                </ul>
                <p className="text-xs text-muted-foreground">Toca un borne para ver quién está conectado, su precinto y su estado.</p>

                <dl className="mt-auto grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ld bg-border">
                  <Dato etiqueta="Zona">{zonaNombre ?? '—'}</Dato>
                  <Dato etiqueta="Mufa de origen">{caja.mufa_codigo ?? '—'}</Dato>
                  <Dato etiqueta="Capacidad">
                    {caja.capacidad_bornes} bornes{proxima ? <span className="font-normal text-muted-foreground"> · ampliable a {proxima}</span> : null}
                  </Dato>
                  <Dato etiqueta="Precintos">
                    {abonados.length === 0 ? '—' : sinPrecinto ? <span className="text-warning-text">{sinPrecinto} por registrar</span> : 'Todos registrados'}
                  </Dato>
                  <div className="col-span-2 bg-card px-4 py-3">
                    <dt className="text-xs text-muted-foreground">Ubicación</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums">
                      {caja.lat != null && caja.lng != null ? `${caja.lat.toFixed(5)}, ${caja.lng.toFixed(5)}` : 'Sin coordenadas: se registran desde la ficha de la zona'}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Inspector */}
              <section aria-live="polite" className="min-h-0 p-6 lg:overflow-y-auto">
                {!elegido ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base font-semibold">Abonados de la caja</h3>
                      {sinPrecinto > 0 && (
                        <span className="rounded-md bg-lightwarning px-2 py-0.5 text-xs font-medium text-warning-text">
                          {sinPrecinto} sin precinto
                        </span>
                      )}
                    </div>
                    {abonados.length === 0 ? (
                      <div className="mt-10 flex flex-col items-center gap-2 text-center">
                        <span className="grid size-12 place-items-center rounded-2xl bg-muted">
                          <Icon icon="tabler:plug" width={24} className="text-muted-foreground" />
                        </span>
                        <p className="font-medium">Todavía no hay clientes en esta caja</p>
                        <p className="max-w-xs text-sm text-muted-foreground">Al instalar un cliente y elegir esta caja, su borne aparece aquí.</p>
                      </div>
                    ) : (
                      <ul className="mt-3 overflow-hidden rounded-xl border border-ld">
                        {abonados.map((b) => (
                          <li key={b.id} className="border-b border-ld last:border-0">
                            <button
                              type="button"
                              onClick={() => setElegidoId(b.id)}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-xs font-semibold tabular-nums text-background">
                                {b.numero}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{b.cliente!.nombre}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {b.cliente!.plan?.nombre ?? 'Sin plan'}
                                  {b.cliente!.metros_cable != null && ` · ${b.cliente!.metros_cable} m de cable`}
                                </span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <EstadoRed estado={estados[b.id]} />
                                {!b.codigo_precinto && <span className="text-[11px] font-medium text-warning-text">Falta precinto</span>}
                              </span>
                              <Icon icon="tabler:chevron-right" width={16} className="shrink-0 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-5">
                    <button
                      type="button"
                      onClick={() => setElegidoId(null)}
                      className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <Icon icon="tabler:arrow-left" width={15} /> Todos los abonados
                    </button>

                    <div className="flex items-start gap-4">
                      <span
                        className={cn(
                          'grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-semibold tabular-nums',
                          elegido.estado === 'ocupado' && 'bg-foreground text-background',
                          elegido.estado === 'libre' && 'border-2 border-dashed border-ld text-muted-foreground',
                          elegido.estado === 'danado' && 'bg-lighterror text-error-text',
                        )}
                      >
                        {elegido.numero}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">Borne {elegido.numero} · {ESTADO_TEXTO[elegido.estado]}</p>
                        <h3 className="mt-0.5 truncate text-lg font-semibold leading-tight">
                          {elegido.cliente ? elegido.cliente.nombre : elegido.estado === 'libre' ? 'Listo para instalar' : 'Fuera de servicio'}
                        </h3>
                        {elegido.cliente && (
                          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">Usuario PPPoE {elegido.cliente.usuario_pppoe}</p>
                        )}
                      </div>
                    </div>

                    {elegido.estado === 'ocupado' && elegido.cliente ? (
                      <>
                        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-ld bg-border">
                          <Dato etiqueta="Plan">{elegido.cliente.plan?.nombre ?? '—'}</Dato>
                          <Dato etiqueta="Instalado">{fecha(elegido.cliente.fecha_instalacion)}</Dato>
                          <Dato etiqueta="Cable drop">{elegido.cliente.metros_cable != null ? `${elegido.cliente.metros_cable} m` : '—'}</Dato>
                          <Dato etiqueta="Potencia óptica">
                            {elegido.potencia_optica_dbm != null ? `${elegido.potencia_optica_dbm} dBm` : '—'}
                          </Dato>
                        </dl>

                        <div className="rounded-xl border border-ld p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">En el router</p>
                              <div className="mt-1">
                                <EstadoRed estado={estados[elegido.id]} />
                              </div>
                              {estados[elegido.id]?.conectado && (
                                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                                  {[estados[elegido.id].uptime && `conectado hace ${estados[elegido.id].uptime}`, estados[elegido.id].ip_remota].filter(Boolean).join(' · ')}
                                </p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => consultarUno(elegido)} disabled={consultandoUno}>
                              <Icon icon={consultandoUno ? 'tabler:loader-2' : 'tabler:refresh'} width={15} className={consultandoUno ? 'animate-spin' : undefined} />
                              {consultandoUno ? 'Consultando…' : 'Consultar'}
                            </Button>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="precinto-borne" className="text-sm font-medium">
                            Código de precinto
                          </label>
                          <p className="text-xs text-muted-foreground">El número del precinto físico amarrado al drop de este cliente.</p>
                          <form
                            className="mt-2 flex gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              guardarPrecinto(elegido);
                            }}
                          >
                            <Input
                              id="precinto-borne"
                              value={precinto}
                              onChange={(e) => setPrecinto(e.target.value)}
                              placeholder="Ej.: PR-12267"
                              className="font-mono"
                              aria-invalid={!elegido.codigo_precinto && !precinto.trim() ? true : undefined}
                            />
                            <Button type="submit" disabled={guardando || precinto.trim() === (elegido.codigo_precinto ?? '')}>
                              {guardando ? 'Guardando…' : 'Guardar'}
                            </Button>
                          </form>
                          {!elegido.codigo_precinto && <p className="mt-1.5 text-xs font-medium text-warning-text">Este abonado todavía no tiene precinto registrado.</p>}
                        </div>

                        <Button variant="outline" asChild className="w-fit">
                          <Link to={`/clientes/${elegido.cliente.id}`}>
                            Abrir la ficha del cliente <Icon icon="tabler:arrow-up-right" width={15} />
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-xl border border-ld p-5">
                        <p className="text-sm text-muted-foreground">
                          {elegido.estado === 'libre'
                            ? 'Este borne está disponible. Se ocupa solo cuando un técnico instala un cliente en esta caja.'
                            : 'No se puede asignar a ningún cliente hasta que se repare. Cuando quede bien, márcalo como reparado y vuelve a estar libre.'}
                        </p>
                        <Button
                          variant={elegido.estado === 'danado' ? 'default' : 'outline'}
                          size="sm"
                          className="mt-4"
                          onClick={() => alternarDanado(elegido)}
                        >
                          <Icon icon={elegido.estado === 'danado' ? 'tabler:tool' : 'tabler:plug-x'} width={15} />
                          {elegido.estado === 'danado' ? 'Marcar como reparado' : 'Marcar como dañado'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmarAmpliar}
        onOpenChange={setConfirmarAmpliar}
        title={`Ampliar a ${proxima ?? ''} bornes`}
        description={caja ? `La caja ${caja.codigo} pasa de ${caja.capacidad_bornes} a ${proxima} bornes. Hazlo cuando el splitter físico ya esté cambiado.` : undefined}
        confirmText="Ampliar"
        loadingText="Ampliando…"
        tone="primary"
        icon="tabler:layout-grid-add"
        onConfirm={ampliar}
      />
    </>
  );
};

export default CajaNapDetailDialog;
